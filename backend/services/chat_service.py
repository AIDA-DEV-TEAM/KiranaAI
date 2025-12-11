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

**CRITICAL ARCHITECTURE CHAGE:**
You DO NOT have direct access to the database. You cannot run SQL.
Instead, you must identify the user's **INTENT** and output a structured JSON command that the Mobile App will execute locally.

**Supported Actions:**

1.  **UPDATE_STOCK** (Add/Remove stock, Restock)
    *   `action`: "UPDATE_STOCK"
    *   `params`: { "product": "exact or fuzzy product name", "quantity": number (positive to add, negative to remove) }
    
2.  **RECORD_SALE** (Sell items)
    *   `action`: "RECORD_SALE"
    *   `params`: { "product": "exact or fuzzy product name", "quantity": number }

3.  **GET_INFO** (Questions about stock, sales, prices)
    *   `action`: "GET_INFO"
    *   `params`: { "query_type": "stock_check" | "sales_report" | "general", "filters": {} }

4.  **GENERAL_CHAT** (Greetings, small talk)
    *   `action`: "NONE"

**Response Format (Strict JSON):**
```json
{
  "type": "intent",
  "action": "UPDATE_STOCK | RECORD_SALE | GET_INFO | NONE",
  "params": { ... },
  "speech": "A short, conversational confirmation of what you ARE ABOUT TO DO. (e.g., 'Adding 5 packets of Rice.')",
  "content": "Visual text confirmation"
}
```

**Rules:**
1.  **Language**: Reply in the SAME language as the user (Hindi/Telugu/English).
2.  **Ambiguity**: If the user says "Add 5 packets" but doesn't say WHAT, ask them "Which product?" (Action: NONE).
3.  **No SQL**: Never output SQL.
"""

# Using gemini-2.5-flash as requested
model = genai.GenerativeModel('gemini-2.5-flash', system_instruction=SYSTEM_PROMPT, generation_config={"response_mime_type": "application/json"})

def parse_gemini_json(text: str) -> dict:
    """Helper to cleanly parse JSON from Gemini's output, handling markdown blocks."""
    try:
        data = json.loads(text)
        return data
    except json.JSONDecodeError:
        # Fallback: remove markdown
        clean_text = text.replace("```json", "").replace("```", "").strip()
        try:
            return json.loads(clean_text)
        except json.JSONDecodeError:
            return None

async def process_chat_message(message: str, db: Session, history: list = [], language: str = "en") -> dict:
    if not api_key:
        logger.error("Gemini API key not configured")
        return {"response": "System Error: API Key missing.", "action": "NONE"}

    # Convert history to Gemini format
    gemini_history = []
    for msg in history:
        role = "user" if msg.get("role") == "user" else "model"
        gemini_history.append({"role": role, "parts": [msg.get("content")]})

    chat_session = model.start_chat(history=gemini_history)
    
    prompt = f"""
User: {message}
Language: {language}
"""

    try:
        response = chat_session.send_message(prompt)
        text_response = ""
        try:
            text_response = response.text.strip()
        except ValueError:
             logger.warning("Gemini response blocked or empty.")
             return {"response": "I'm sorry, I couldn't generate a response.", "action": "NONE"}
             
        logger.info(f"AI Raw Response: {text_response}")

        data = parse_gemini_json(text_response)
        
        # Fallback if parsing fails
        if not data:
             return {"response": text_response, "speech": text_response, "action": "NONE"}

        # Return the structured intent directly to the frontend
        return {
            "response": data.get("content", ""),
            "speech": data.get("speech", ""),
            "action": data.get("action", "NONE"),
            "params": data.get("params", {})
        }

    except Exception as e:
        logger.error(f"Global Error in process_chat_message: {e}")
        traceback.print_exc()
        return {
            "response": "I'm having trouble processing that request.",
            "speech": "Error processing request.",
            "action": "NONE"
        }
