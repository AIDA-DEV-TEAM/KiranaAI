import os
import google.generativeai as genai
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import text
from .. import database, models
from dotenv import load_dotenv

load_dotenv()

router = APIRouter(prefix="/chat", tags=["chat"])

# Configure Gemini
api_key = os.getenv("GEMINI_API_KEY")
if not api_key:
    print("Warning: GEMINI_API_KEY not found in environment variables")

SYSTEM_PROMPT = """
You are a Kirana shop assistant.
Schema:
- products(id, name, category, price, stock, shelf_position)
- sales(id, product_id, quantity, total_amount, timestamp)

Task: Convert natural language to SQL. Return ONLY the SQL.
- General Q -> Answer normally (prefix "ANSWER:").
- Data Q -> "SELECT ..."
- Restock -> "UPDATE products SET stock = stock + [qty] WHERE name LIKE '%[name]%'"
- Sale -> "INSERT INTO sales ...; UPDATE products SET stock = stock - [qty] ..." (Check stock >= qty)

Examples:
"How much rice?" -> SELECT stock FROM products WHERE name LIKE '%rice%'
"Sold 5 Milk" -> INSERT INTO sales ...; UPDATE products ...
"""

genai.configure(api_key=api_key)
model = genai.GenerativeModel('gemini-2.5-flash', system_instruction=SYSTEM_PROMPT)

def get_db():
    db = database.SessionLocal()
    try:
        yield db
    finally:
        db.close()

@router.post("/", response_model=models.ChatResponse)
async def chat(request: models.ChatRequest, db: Session = Depends(get_db)):
    if not api_key:
        raise HTTPException(status_code=500, detail="Gemini API key not configured")
    
    # Convert history to Gemini format
    history = []
    for msg in request.history:
        role = "user" if msg.role == "user" else "model"
        history.append({"role": role, "parts": [msg.content]})

    chat_session = model.start_chat(history=history)
    
    prompt = f"User: {request.message}\n"
    
    try:
        response = chat_session.send_message(prompt)
        text_response = response.text.strip()
        
        if text_response.startswith("ANSWER:"):
            return {"response": text_response.replace("ANSWER:", "").strip()}
        
        # Remove "SQL:" prefix if present
        if text_response.upper().startswith("SQL:"):
            text_response = text_response[4:].strip()

        # Handle SELECT queries
        if text_response.upper().startswith("SELECT"):
            # Execute SQL
            try:
                queries = [q.strip() for q in text_response.split(';') if q.strip()]
                data_str = ""
                
                for query in queries:
                    result = db.execute(text(query))
                    rows = result.fetchall()
                    
                    if not rows:
                        data_str += f"Query: {query}\nResult: No data found.\n\n"
                        continue
                        
                    data_str += f"Query: {query}\nResult:\n"
                    for row in rows:
                        data_str += str(row) + "\n"
                    data_str += "\n"
                
                if not data_str.strip():
                     return {"response": "No data found for your request.", "sql_query": text_response}

                # Ask Gemini to format the answer
                answer_prompt = f"""
                User Question: {request.message}
                SQL Queries Executed: {text_response}
                Data Retrieved:
                {data_str}
                
                Based on the data above, answer the user's question in a natural, helpful way. 
                If it's a list of items, YOU MUST FORMAT IT AS A MARKDOWN TABLE.
                If it's a single value (like price or stock), state it in a full sentence (e.g. "The price of Sugar is ₹45").
                Use Markdown for all formatting (bold, italics, code blocks).
                """
                
                final_response = chat_session.send_message(answer_prompt)
                return {"response": final_response.text.strip(), "sql_query": text_response}
            except Exception as e:
                return {"response": f"Error executing query: {str(e)}", "sql_query": text_response}
        
        # Handle INSERT/UPDATE queries
        if text_response.upper().startswith("INSERT") or text_response.upper().startswith("UPDATE"):
            try:
                # Split multiple queries by semicolon
                queries = [q.strip() for q in text_response.split(';') if q.strip()]
                
                total_rows_affected = 0
                for query in queries:
                    result = db.execute(text(query))
                    total_rows_affected += result.rowcount
                
                if total_rows_affected == 0:
                    db.rollback()
                    return {
                        "response": "Transaction failed. Insufficient stock or product not found.",
                        "sql_query": text_response
                    }
                
                db.commit()
                return {"response": "Successfully recorded the transaction.", "sql_query": text_response}
            except Exception as e:
                db.rollback()
                return {"response": f"Error executing transaction: {str(e)}", "sql_query": text_response}
        
        return {"response": text_response}
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
