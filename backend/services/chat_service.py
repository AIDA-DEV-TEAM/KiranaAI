
import os
import google.generativeai as genai
from sqlalchemy.orm import Session
from sqlalchemy import func
from ..database import Product, Sale
from datetime import datetime, timedelta
import logging

# Configure Logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Configure Gemini
# Ensure GEMINI_API_KEY is set in .env
genai.configure(api_key=os.getenv("GEMINI_API_KEY"))

SYSTEM_PROMPT = """
You are KiranaAI, an expert Grocery Store Assistant.
Your Goal: Help the store owner (Storekeeper) manage inventory, track sales, and optimize their business.

You have access to the following context about the store. Use it to answer questions accurately.

Context:
{context}

Guidelines:
1. **Be Concise & Direct**: The user is busy. Give straight answers.
2. **Data-Driven**: If asked about stock or sales, purely use the provided context. If data is missing, say so.
3. **Proactive**: If stock is low, suggest reordering.
4. **Professional Tone**: Friendly, respectful, and efficient (like a top-tier manager).
5. **Language**: Respond in the same language as the user (English by default).

If the user asks "How is the store doing?", summarize key metrics (Sales, Low Stock).
If the user asks "What should I order?", look at low stock items.
"""

async def process_chat_message(message: str, db: Session, history: list, language: str = "en") -> dict:
    try:
        # 1. Fetch Real-time Context
        # Inventory Stats
        total_products = db.query(func.count(Product.id)).scalar() or 0
        low_stock_items = db.query(Product).filter(Product.stock <= (Product.max_stock * 0.5)).limit(10).all()
        
        # Sales Stats (Today)
        today = datetime.now().date()
        todays_sales = db.query(func.sum(Sale.total_amount)).filter(func.date(Sale.timestamp) == today).scalar() or 0.0
        
        # Format Context
        low_stock_context = ", ".join([f"{p.name} (Qty: {p.stock}/{p.max_stock})" for p in low_stock_items]) if low_stock_items else "None"
        
        context_str = f"""
        - Date: {datetime.now().strftime("%Y-%m-%d")}
        - Total Products: {total_products}
        - Today's Sales: ₹{todays_sales}
        - Low Stock Items: {low_stock_context}
        """

        # 2. Prepare Prompt
        messages = [
            {"role": "user", "parts": [SYSTEM_PROMPT.format(context=context_str)]},
        ]
        
        # Add History
        for msg in history:
            role = "user" if msg['role'] == 'user' else "model"
            messages.append({"role": role, "parts": [msg['content']]})
            
        # Add Current Message
        messages.append({"role": "user", "parts": [message]})

        # 3. Call Gemini
        model = genai.GenerativeModel('gemini-flash-latest')
        response = model.generate_content(messages)
        
        return {
            "response": response.text,
            "sql_query": None 
        }

    except Exception as e:
        logger.error(f"Error in chat service: {e}")
        return {
            "response": "I'm having trouble connecting to my brain right now. Please try again later.",
            "sql_query": None
        }
