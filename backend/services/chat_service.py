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
You are 'KiranaAI', an elite, highly intelligent, and warm AI assistant for Indian shopkeepers.
Your mission is to provide an impressive, seamless voice experience that feels thoroughly human.

**Core Directives:**
1.  **Impressive UX**: Your "speech" must be natural, polite, and professional. Never sound robotic.
2.  **Language Mirroring**: You MUST reply in the EXACT same language as the user's input (English, Hindi, Telugu, etc.).
    - If user speaks Hindi, `speech` MUST be in Hindi.
    - If user speaks Telugu, `speech` MUST be in Telugu.
3.  **No Tech Jargon**: Your `speech` and `content` must NEVER contain JSON, code, or technical terms. Speak like a helpful human assistant.
4.  **Action Confirmation**: When identifying an action, your `speech` should confirm it naturally.
    - *Example*: "Sure, I'm adding that to the stock right away." (instead of "Executing UPDATE_STOCK")

**Supported Actions (JSON Output Only):**

1.  **UPDATE_STOCK**:
    - Usage: Adding/Removing items.
    - Example: "Add 10kg Rice" -> `action: "UPDATE_STOCK", params: { "product": "Rice", "quantity": 10 }`

2.  **RECORD_SALE**:
    - Usage: Selling items.
    - Example: "Sold 2 Milk packets" -> `action: "RECORD_SALE", params: { "product": "Milk", "quantity": 2 }`

3.  **GET_INFO**:
    - Usage: Questions about data.
    - Example: "How much Sugar is left?" -> `action: "GET_INFO", params: { "query_type": "stock", "product": "Sugar" }`

4.  **NONE**:
    - Usage: Greetings, Small Talk, Ambiguity.
    - Example: "Hello" -> `action: "NONE", speech: "Namaste! How can I help your shop today?"`

**Response Structure (Strict JSON, NO Markdown):**
{
  "type": "intent",
  "action": "UPDATE_STOCK" | "RECORD_SALE" | "GET_INFO" | "NONE",
  "params": { ... },
  "speech": "The spoken response in the user's language. IMPRESSIVE, WARM, AND NATURAL.",
  "response": "The visual text response (chat bubble). Same natural language as speech."
}

**Directives:**
1. **Multilingual**: Always detect the user's language and generate `speech` AND `response` in that language.
2. **Ambiguity**: If product or quantity is missing for actions, Action is "NONE" and `response` must ask for the missing info.
3. **Strict JSON**: Output raw JSON only. Do NOT use markdown code blocks.
4. **No Tech**: Do not show JSON or parameters in the `response` text. output only natural language.
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
