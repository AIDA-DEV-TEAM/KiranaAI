import os
import json
import re
import google.generativeai as genai
from sqlalchemy.orm import Session
from sqlalchemy import text
from dotenv import load_dotenv
import logging
import traceback

# Configure Logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

load_dotenv()

api_key = os.getenv("GEMINI_API_KEY")
if api_key:
    genai.configure(api_key=api_key)

SYSTEM_PROMPT = """
You are a smart, friendly, and efficient Kirana (Grocery) Shop Assistant.
Your goal is to help the shopkeeper manage their inventory and sales using natural language.

**Database Schema:**
- `products` (id, name, category, price, stock, max_stock, shelf_position, image_url, icon_name)
- `sales` (id, product_id, quantity, total_amount, timestamp)

**Your Capabilities:**
1.  **Answer Questions**: Provide helpful answers about the shop's data.
2.  **Execute Actions**: Generate SQL to update stock or record sales.
3.  **Be Conversational**: If the user says "Hi" or "Thanks", reply naturally.

**Rules for SQL Generation:**
- **Read Data**: Use `SELECT`. Example: "How much rice?" -> `SELECT name, stock FROM products WHERE name LIKE '%rice%'`
- **Record Sale**: Use `INSERT` into `sales` AND `UPDATE` `products`. **ALWAYS** follow with a `SELECT` to check the new stock.
- **Restock**: Use `UPDATE`. **ALWAYS** follow with a `SELECT` to check the new stock.
- **Syntax**: Use standard SQLite syntax.

**Response Format (CRITICAL):**
You must **ALWAYS** reply with a valid JSON object. Do not output any text outside the JSON.

**Format 1: For General Answers**
```json
{
  "type": "answer",
  "content": "Your friendly natural language response here. **IMPORTANT**: If listing multiple items (products, sales, prices), YOU MUST USE A MARKDOWN TABLE."
}
```

**Format 2: For Database Actions (read/write)**
```json
{
  "type": "sql",
  "content": "THE SQL QUERY HERE"
}
```

**CRITICAL RULES:**
1.  **Language**: The `content` field MUST be in the SAME language as the user's input (Hindi/Telugu/English).
2.  **No Technical Terms**: The `content` for "answer" type must be simple and non-technical.
3.  **Valid JSON**: Ensure the output is strictly valid JSON.
4.  **Markdown Tables**: When showing lists of data (e.g., "Show all rice products", "List sales today"), format the output as a clean Markdown table.
"""

# Using flash-latest as per existing configuration pattern
model = genai.GenerativeModel('gemini-flash-latest', system_instruction=SYSTEM_PROMPT, generation_config={"response_mime_type": "application/json"})

async def process_chat_message(message: str, db: Session, history: list = [], language: str = "en") -> dict:
    if not api_key:
        logger.error("Gemini API key not configured")
        return {"response": "System Error: API Key missing.", "sql_query": None}

    # Convert history to Gemini format
    gemini_history = []
    for msg in history:
        role = "user" if msg.get("role") == "user" else "model"
        gemini_history.append({"role": role, "parts": [msg.get("content")]})

    chat_session = model.start_chat(history=gemini_history)
    # Explicitly enforce language constraint in every turn
    prompt = f"User: {message}\nLanguage: {language}\nRespond in {language}.\n"

    try:
        response = chat_session.send_message(prompt)
        text_response = response.text.strip()
        logger.info(f"AI Raw Response: {text_response}")

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
            logger.info(f"Executing SQL: {sql_query}")
            try:
                # Clean up SQL
                sql_query = sql_query.replace("```sql", "").replace("```", "").strip()
                # Handle multiple statements if any (though usually one block)
                # We need to split properly if multiple queries are sent
                queries = [q.strip() for q in sql_query.split(';') if q.strip()]
                
                data_str = ""
                
                for q in queries:
                    result = db.execute(text(q))
                    db.commit() # Commit changes for INSERT/UPDATE
                    
                    if result.returns_rows:
                        rows = result.fetchall()
                        if rows:
                            # Convert rows to string representation for the AI
                            # keys() returns column names
                            cols = result.keys()
                            for row in rows:
                                row_dict = dict(zip(cols, row))
                                data_str += str(row_dict) + "\n"
                        else:
                            data_str += "Query executed successfully. No data returned.\n"
                    else:
                        data_str += "Action executed successfully.\n"

                # Feed result back to AI to generate natural language response
                answer_prompt = f"""
                SQL Execution Result:
                {data_str}

                Task:
                1. Summarize this result for the user in a friendly way.
                2. If it was a sale, confirm the sale, amount, and remaining stock.
                   - Example: "Sold 2 milk. Remaining stock: 8"
                3. If it was a query, show the data cleanly.
                4. **CRITICAL**: Reply in the SAME language as the user's question ({language}).
                5. **Formatting**: If the data retrieved contains multiple rows (more than 1), YOU MUST present it as a Markdown Table in your response.
                6. **Output Format**: Return a JSON object: {{ "type": "answer", "content": "..." }}
                """

                final_response = chat_session.send_message(answer_prompt)
                try:
                    final_text = final_response.text.strip()
                    # Clean potential markdown
                    final_text = final_text.replace("```json", "").replace("```", "").strip()
                    final_data = json.loads(final_text)
                    # User requested strictly NO SQL in response, so we return None for sql_query
                    return {"response": final_data.get("content"), "sql_query": None}
                except Exception as json_err:
                    logger.error(f"Error parsing final response: {json_err}")
                    # If final response isn't JSON, just return text
                    return {"response": final_response.text.strip(), "sql_query": None}

            except Exception as e:
                db.rollback()
                logger.error(f"Database Execution Error: {e}")
                traceback.print_exc()
                return {"response": f"I encountered an error while accessing the database. Error: {str(e)}", "sql_query": None}

        return {"response": "I'm not sure how to help with that.", "sql_query": None}

    except Exception as e:
        logger.error(f"Global Error in process_chat_message: {e}")
        traceback.print_exc()
        return {
            "response": "I'm having trouble connecting to my brain right now. Please try again later.",
            "sql_query": None
        }
