import os
import json
import re
import google.generativeai as genai
from sqlalchemy.orm import Session
from sqlalchemy import text
from dotenv import load_dotenv

load_dotenv()

api_key = os.getenv("GEMINI_API_KEY")
if api_key:
    genai.configure(api_key=api_key)

SYSTEM_PROMPT = """
You are a smart, friendly, and efficient Kirana (Grocery) Shop Assistant.
Your goal is to help the shopkeeper manage their inventory and sales using natural language.

**Database Schema:**
- `products` (id, name, category, price, stock, shelf_position)
- `sales` (id, product_id, quantity, total_amount, timestamp)

**Your Capabilities:**
1.  **Answer Questions**: Provide helpful answers about the shop's data.
2.  **Execute Actions**: Generate SQL to update stock or record sales.
3.  **Be Conversational**: If the user says "Hi" or "Thanks", reply naturally.

**Rules for SQL Generation:**
- **Read Data**: Use `SELECT`. Example: "How much rice?" -> `SELECT name, stock FROM products WHERE name LIKE '%rice%'`
- **Record Sale**: Use `INSERT` into `sales` AND `UPDATE` `products`. **ALWAYS** follow with a `SELECT` to check the new stock.
- **Restock**: Use `UPDATE`. **ALWAYS** follow with a `SELECT` to check the new stock.

**Response Format (CRITICAL):**
You must **ALWAYS** reply with a valid JSON object. Do not output any text outside the JSON.

**Format 1: For General Answers**
```json
{
  "type": "answer",
  "content": "Your friendly natural language response here."
}
```

**Format 2: For Database Actions**
```json
{
  "type": "sql",
  "content": "SELECT * FROM products..."
}
```

**CRITICAL RULES:**
1.  **Language**: The `content` field MUST be in the SAME language as the user's input (Hindi/Telugu/English).
2.  **No Technical Terms**: The `content` for "answer" type must be simple and non-technical.
3.  **Valid JSON**: Ensure the output is strictly valid JSON.
"""

model = genai.GenerativeModel('gemini-2.5-flash', system_instruction=SYSTEM_PROMPT, generation_config={"response_mime_type": "application/json"})

async def process_chat_message(message: str, db: Session, history: list = []):
    if not api_key:
        raise Exception("Gemini API key not configured")

    # Convert history to Gemini format
    gemini_history = []
    for msg in history:
        role = "user" if msg.get("role") == "user" else "model"
        # We need to ensure history parts are strings, not JSON objects if we want to maintain context cleanly
        # But since we are changing the format, old history might confuse it. 
        # For now, we pass the content as is.
        gemini_history.append({"role": role, "parts": [msg.get("content")]})

    chat_session = model.start_chat(history=gemini_history)
    prompt = f"User: {message}\n"

    try:
        response = chat_session.send_message(prompt)
        text_response = response.text.strip()
        
        try:
            data = json.loads(text_response)
        except json.JSONDecodeError:
            # Fallback if model outputs markdown code block
            clean_text = text_response.replace("```json", "").replace("```", "").strip()
            try:
                data = json.loads(clean_text)
            except:
                # Ultimate fallback: treat as answer
                return {"response": text_response, "sql_query": None}

        if data.get("type") == "answer":
            return {"response": data.get("content"), "sql_query": None}

        elif data.get("type") == "sql":
            sql_query = data.get("content")
            try:
                # Clean up SQL
                sql_query = sql_query.replace("```sql", "").replace("```", "").strip()
                queries = [q.strip() for q in sql_query.split(';') if q.strip()]
                data_str = ""
                changes_made = False
                
                for query in queries:
                    if not any(query.upper().startswith(kw) for kw in ["SELECT", "INSERT", "UPDATE", "DELETE"]):
                        continue

                    result = db.execute(text(query))
                    
                    if query.upper().startswith("SELECT"):
                        rows = result.fetchall()
                        if rows:
                            data_str += f"Query: {query}\nResult:\n"
                            for row in rows:
                                data_str += str(row) + "\n"
                        else:
                            data_str += f"Query: {query}\nResult: No data found.\n\n"
                    else:
                        if result.rowcount > 0:
                            changes_made = True
                            
                if changes_made:
                    db.commit()
                
                # Generate final natural language response
                answer_prompt = f"""
                User Question: {message}
                SQL Queries Executed: {sql_query}
                Data Retrieved:
                {data_str}
                Changes Made: {changes_made}
                
                Instructions:
                1. Answer the user's question naturally based on the Data Retrieved.
                2. If 'Changes Made' is True, confirm the action was successful.
                3. **CRITICAL**: If you have data about remaining stock, YOU MUST mention it.
                   - Example: "Sold 2 milk. Remaining stock: 8"
                   - Example: "Added 10 sugar. Total stock is now: 50"
                4. **CRITICAL**: Reply in the SAME language as the user's question.
                5. **Output Format**: Return a JSON object: `{{ "type": "answer", "content": "..." }}`
                """
                
                final_response = chat_session.send_message(answer_prompt)
                try:
                    final_data = json.loads(final_response.text.strip())
                    return {"response": final_data.get("content"), "sql_query": sql_query}
                except:
                    # If final response isn't JSON, just return text
                    return {"response": final_response.text.strip(), "sql_query": sql_query}

            except Exception as e:
                db.rollback()
                return {"response": f"I encountered an error while accessing the database. Error: {str(e)}", "sql_query": sql_query}

        return {"response": "I'm not sure how to help with that.", "sql_query": None}

    except Exception as e:
        import traceback
        traceback.print_exc()
        raise e
