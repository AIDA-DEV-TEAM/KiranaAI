
import os
import google.generativeai as genai
from sqlalchemy.orm import Session
from sqlalchemy import func, or_
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

You have access to REAL-TIME data about the store.

Context:
{context}

Guidelines:
1. **Be Concise & Direct**: The user is busy. Give straight answers.
2. **Data-Driven**: 
   - If asked about a specific product (e.g., "Rice"), check the "Specific Product Details" section.
   - If asked about sales, use "Today's Sales".
   - If STOCK is low (see "Low Stock Items"), WARN the user.
3. **Proactive**: If stock is low, suggest reordering.
4. **Professional Tone**: Friendly, respectful, and efficient.
5. **Language**: Respond in the same language as the user (English by default).

If the user asks "How is the store doing?", summarize key metrics and mention any critical low stock.
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
        
        # Relevant Products Search (Context-Aware Retrieval)
        # Split message into keywords > 2 chars to find mentioned products
        search_terms = [w.strip() for w in message.split() if len(w.strip()) > 2]
        relevant_products = []
        if search_terms:
            # Create a simple OR query for product names matching keywords
            conditions = [Product.name.ilike(f"%{term}%") for term in search_terms]
            if conditions:
                relevant_products = db.query(Product).filter(or_(*conditions)).limit(5).all()

        # Format Context
        low_stock_context = ", ".join([f"{p.name} (Qty: {p.stock}/{p.max_stock})" for p in low_stock_items]) if low_stock_items else "None"
        
        relevant_items_context = "None"
        if relevant_products:
            relevant_items_context = "\n".join([
                f"- {p.name}: Stock {p.stock}/{p.max_stock}, Price ₹{p.price}, Shelf: {p.shelf_position or 'N/A'}"
                for p in relevant_products
            ])

        context_str = f"""
        [General Stats]
        - Date: {datetime.now().strftime("%Y-%m-%d")}
        - Total Products: {total_products}
        - Today's Sales: ₹{todays_sales}
        
        [Low Stock Items (Action Required)]
        {low_stock_context}

        [Specific Product Details (Based on your query)]
        {relevant_items_context}
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
        # Using gemini-flash-latest to avoid 404s
        model = genai.GenerativeModel('gemini-flash-latest')
        response = model.generate_content(messages)
        
        try:
            text_response = response.text
        except ValueError:
            # Handle cases where response might be empty or blocked even with finish_reason=STOP
            logger.warning(f"Gemini response invalid/empty. Candidates: {response.candidates}")
            text_response = "I apologize, but I couldn't generate a response at the moment. Please try again."

        return {
            "response": text_response,
            "sql_query": None 
        }

    except Exception as e:
        logger.error(f"Error in chat service: {e}")
        return {
            "response": "I'm having trouble connecting to my brain right now. Please try again later.",
            "sql_query": None
        }
