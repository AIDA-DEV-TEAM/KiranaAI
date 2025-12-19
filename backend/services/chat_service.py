import os
import json
import logging
import traceback
from dotenv import load_dotenv

# New Google GenAI SDK
from google import genai
from google.genai import types

# Configure Logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# Load Environment Variables
load_dotenv()

api_key = os.getenv("GEMINI_API_KEY")
client = None

if api_key:
    client = genai.Client(api_key=api_key)
else:
    logger.error("GEMINI_API_KEY is missing in environment variables.")

# ---------------------------------------------------------------------------
# 1. OPTIMIZED SYSTEM PROMPT
# ---------------------------------------------------------------------------
SYSTEM_PROMPT = """
You are **KiranaAI**, an elite, highly intelligent, and warm AI assistant for Indian shopkeepers.
Your mission is to provide an impressive, seamless voice experience that feels thoroughly human.

### CORE DIRECTIVES
1. **Impressive UX**: Your "speech" must be natural, polite, and professional. Never sound robotic.
2. **Language Mirroring (CRITICAL)**: You MUST reply in the EXACT same language/dialect as the user's input.
    - If user speaks **Hindi**, `speech` MUST be in Hindi.
    - If user speaks **Telugu**, `speech` MUST be in Telugu.
3. **Be Specific**: If the user asks "How can you help?", do NOT ask them back. Instead, listed your services: **Recording Sales, Updating Stock, and Checking Inventory.**
4. **Low Stock Logic**: If the user asks for "low stock" or "running low", analyze the provided Inventory Context.
    - Identify items marked with **[LOW STOCK]**.
    - List them clearly in the `response` and `speech`.
    - Set `action` to `NONE`. Do NOT use GET_INFO for listing multiple items.
    - If no items have this tag, say "Stock looks good.".

### SUPPORTED ACTIONS
1. **UPDATE_STOCK**: Adding/Removing items.
2. **RECORD_SALE**: Selling items.
3. **GET_INFO**: Questions about SPECIFIC data (stock levels, prices) for a single item.
4. **NONE**: 
    - **Usage**: Greetings, Small Talk, **Capability Questions**, **Low Stock Lists**.
    - **Logic**: 
        - If "Hello" -> "Namaste! Ready to manage the shop?"
        - If "How can you help?" -> "I can record your daily sales, update new stock, and check what items are running low."

### RESPONSE FORMAT
{
  "action": "UPDATE_STOCK" | "RECORD_SALE" | "GET_INFO" | "NONE",
  "params": { ... },
  "speech": "Natural spoken response.",
  "response": "Visual text response."
}

### EXAMPLES

**Input:** "Hello, how can you help me?"
**Output:** {
  "action": "NONE", 
  "speech": "Namaste! I am here to help you manage your shop. You can tell me to record sales, add new stock, or check inventory prices.",
  "response": "Namaste! I can help you:\n1. Record Sales\n2. Add Stock\n3. Check Inventory"
}

**Input:** "Sold 2 milk"
**Output:**
{
  "action": "RECORD_SALE",
  "params": { "product": "Milk", "quantity": 2 },
  "speech": "Added 2 milk packets to the sales record.",
  "response": "Added 2 milk packets to sales."
}
"""

# ---------------------------------------------------------------------------
# 2. RESPONSE SCHEMA (Enforces Strict JSON)
# ---------------------------------------------------------------------------
# This forces Gemini to return ONLY this structure, no markdown parsing needed.
RESPONSE_SCHEMA = {
    "type": "OBJECT",
    "properties": {
        "action": {
            "type": "STRING",
            "enum": ["UPDATE_STOCK", "RECORD_SALE", "GET_INFO", "NONE"]
        },
        "params": {
            "type": "OBJECT",
            "properties": {
                "product": {"type": "STRING", "description": "Name of the product capitalized"},
                "quantity": {"type": "NUMBER", "description": "Numeric quantity"},
                "unit": {"type": "STRING", "description": "Unit if mentioned (kg, l, packet)"},
                "query_type": {"type": "STRING", "description": "For GET_INFO: 'stock' or 'price'"}
            },
            "nullable": True
        },
        "speech": {
            "type": "STRING", 
            "description": "Spoken response. Natural, warm, brief. NO MARKDOWN."
        },
        "response": {
            "type": "STRING", 
            "description": "Visual text bubble. Natural language matching speech."
        }
    },
    "required": ["action", "speech", "response"]
}

# ---------------------------------------------------------------------------
# 3. MAIN CHAT PROCESSOR
# ---------------------------------------------------------------------------
async def process_chat_message(message: str, history: list = [], language: str = "en", inventory: list = []) -> dict:
    if not client:
        return {"response": "System Error: API Key missing.", "action": "NONE"}

    try:
        # 1. Prepare History for Gemini
        gemini_history = []
        for msg in history:
            role = "user" if msg.get("role") == "user" else "model"
            gemini_history.append(types.Content(
                role=role, 
                parts=[types.Part.from_text(text=msg.get("content"))]
            ))

        # 2. Format Inventory Context
        # We inject this dynamically into the prompt so the AI knows what's in the shop
        inventory_context = "Current Shop Inventory:\n"
        if inventory:
            for item in inventory:
                name = item.get('name', 'Unknown')
                # Handle if name is a dict (e.g., multilingual names)
                if isinstance(name, dict):
                    name = name.get('en', list(name.values())[0])
                
                stock = item.get('stock', 0)
                max_stock = item.get('max_stock', 50)
                # Dashboard Logic: Low if <= 50% of max_stock
                is_low = stock <= (max_stock * 0.5)
                
                shelf = item.get('shelf_position', 'N/A')
                status_tag = " [LOW STOCK]" if is_low else ""
                inventory_context += f"- {name}: {stock} (Shelf: {shelf}){status_tag}\n"
        else:
            inventory_context += "(Inventory is empty)"

        logger.info(f"Inventory Context items: {len(inventory)}")

        # 3. Construct the dynamic user prompt
        full_prompt = f"""
{inventory_context}

User Input: "{message}"
Detected Language Context: {language}
"""

        # 4. Create Chat Session
        # Note: 'gemini-1.5-flash' is the standard fast model. 
        # Update model name if you have access to specific versions like 'gemini-2.5-flash-lite'
        chat = client.chats.create(
            model='gemini-2.5-flash-lite', 
            config=types.GenerateContentConfig(
                system_instruction=SYSTEM_PROMPT,
                response_mime_type="application/json",
                response_schema=RESPONSE_SCHEMA, 
                temperature=0.3, # Low temperature for accurate logic
            ),
            history=gemini_history
        )

        # 5. Send Message
        response = chat.send_message(full_prompt)
        raw_text = response.text

        # 6. Parse JSON (Guaranteed by Schema)
        try:
            data = json.loads(raw_text)
        except json.JSONDecodeError:
            logger.error(f"JSON Parse Failed. Raw: {raw_text}")
            return {
                "response": "I understood, but had a technical glitch.", 
                "speech": "Technical error.", 
                "action": "NONE"
            }

        logger.info(f"AI Intent: {data.get('action')} | Params: {data.get('params')}")

        # 7. Return Clean Data
        return {
            "response": data.get("response", ""),
            "speech": data.get("speech", ""),
            "action": data.get("action", "NONE"),
            "params": data.get("params", {})
        }

    except Exception as e:
        logger.error(f"Global Error in process_chat_message: {e}")
        traceback.print_exc()
        return {
            "response": "I'm having trouble connecting right now.",
            "speech": "Connection error, please try again.",
            "action": "NONE"
        }

# ---------------------------------------------------------------------------
# TEST RUN (Optional)
# ---------------------------------------------------------------------------
if __name__ == "__main__":
    import asyncio
    
    # Mock Inventory
    mock_inventory = [
        {"name": "Rice", "stock": 50},
        {"name": "Sugar", "stock": 10},
        {"name": "Milk", "stock": 5}
    ]

    # Test Function
    async def test():
        print("--- Testing KiranaAI ---")
        
        # Test 1: Sale (Hinglish)
        res = await process_chat_message("what items are low?", inventory=mock_inventory, language="en")
        print(f"\nUser: what items are low?\nAI: {json.dumps(res, indent=2)}")
    asyncio.run(test())