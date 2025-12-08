import os
import google.generativeai as genai
from sqlalchemy.orm import Session
from sqlalchemy import func, or_
from ..database import Product, Sale
from datetime import datetime
import logging
import json
import re

# Configure Logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Configure Gemini
genai.configure(api_key=os.getenv("GEMINI_API_KEY"))

SYSTEM_PROMPT = """
You are KiranaAI, an expert Grocery Store Assistant.
Your Goal: Help the store owner manage inventory, track sales, and optimize their business.

You have access to REAL-TIME data.
Context:
{context}

Guidelines:
1. **Be Concise & Direct**.
2. **Data-Driven**: Use provided context stats.
3. **Actions**: If the user says they SOLD something (e.g., "Sold 20kg Rice", "Add sale 5 milk"), you MUST output a JSON block to record it.
   
   Format for SALES:
   ```json
   {{
     "action": "RECORD_SALE",
     "product_name": "exact or partial name from user",
     "quantity": 20,
     "unit": "kg/packets/etc"
   }}
   ```
   
   If NO action is needed, just give a plain text response.
   
   Example User: "Sold 5 Bread"
   Example Output:
   ```json
   {{
     "action": "RECORD_SALE",
     "product_name": "Bread",
     "quantity": 5,
     "unit": "packets"
   }}
   ```
   Thinking: Found 'Bread' in inventory. Recording sale...
   Response: Recorded sale of 5 Bread. Stock updated.

4. **Professional Tone**.
"""

async def process_chat_message(message: str, db: Session, history: list, language: str = "en") -> dict:
    try:
        # 1. Fetch Context
        total_products = db.query(func.count(Product.id)).scalar() or 0
        low_stock_items = db.query(Product).filter(Product.stock <= (Product.max_stock * 0.5)).limit(10).all()
        today = datetime.now().date()
        todays_sales = db.query(func.sum(Sale.total_amount)).filter(func.date(Sale.timestamp) == today).scalar() or 0.0
        
        search_terms = [w.strip() for w in message.split() if len(w.strip()) > 2]
        relevant_products = []
        if search_terms:
            conditions = [Product.name.ilike(f"%{term}%") for term in search_terms]
            if conditions:
                relevant_products = db.query(Product).filter(or_(*conditions)).limit(5).all()

        low_stock_context = ", ".join([f"{p.name} (Qty: {p.stock}/{p.max_stock})" for p in low_stock_items]) if low_stock_items else "None"
        relevant_items_context = "None"
        if relevant_products:
            relevant_items_context = "\n".join([
                f"- {p.name}: Stock {p.stock}/{p.max_stock}, Price ₹{p.price}"
                for p in relevant_products
            ])

        context_str = f"""
        [Stats] Date: {datetime.now().strftime("%Y-%m-%d")}, Products: {total_products}, Today's Sales: ₹{todays_sales}
        [Low Stock] {low_stock_context}
        [Relevant Products] {relevant_items_context}
        """

        messages = [{"role": "user", "parts": [SYSTEM_PROMPT.format(context=context_str)]}]
        for msg in history:
            role = "user" if msg['role'] == 'user' else "model"
            messages.append({"role": role, "parts": [msg['content']]})
        messages.append({"role": "user", "parts": [message]})

        # 2. Call Gemini
        model = genai.GenerativeModel('gemini-flash-latest')
        response = model.generate_content(messages)
        
        ai_text = ""
        try:
            ai_text = response.text
        except ValueError:
            ai_text = "Sorry, I couldn't process that. Please try again."

        # 3. Action Parsing & Execution
        sql_query = None
        final_response = ai_text

        # Extract JSON if present
        json_match = re.search(r'```json\s*(\{.*?\})\s*```', ai_text, re.DOTALL)
        if not json_match:
            json_match = re.search(r'(\{.*"action":.*\})', ai_text, re.DOTALL)

        if json_match:
            try:
                action_data = json.loads(json_match.group(1))
                if action_data.get("action") == "RECORD_SALE":
                    # Execute Action
                    p_name = action_data.get("product_name")
                    qty = float(action_data.get("quantity", 0))
                    
                    # Find Product
                    product = db.query(Product).filter(Product.name.ilike(f"%{p_name}%")).first()
                    
                    result_context = ""
                    if product:
                        if product.stock >= qty:
                            # Update DB
                            product.stock -= int(qty)
                            total_amt = product.price * qty
                            new_sale = Sale(product_id=product.id, quantity=int(qty), total_amount=total_amt)
                            db.add(new_sale)
                            db.commit()
                            
                            # Fetch updated stats
                            today_str = datetime.now().date()
                            prod_sales_today = db.query(func.sum(Sale.quantity)).filter(
                                Sale.product_id == product.id, 
                                func.date(Sale.timestamp) == today_str
                            ).scalar() or 0
                            
                            warning = ""
                            if product.stock <= (product.max_stock * 0.2):
                                warning = "CRITICAL LOW STOCK!"
                            
                            result_context = f"""
                            ACTION RESULT: SUCCESS
                            - Product: {product.name}
                            - Sold: {int(qty)} units
                            - Revenue: ₹{total_amt}
                            - Remaining Stock: {product.stock}
                            - Sold Today: {int(prod_sales_today)} units
                            - Warnings: {warning}
                            """
                        else:
                            result_context = f"ACTION RESULT: FAILURE. Not enough stock. Requested: {int(qty)}, Available: {product.stock}"
                    else:
                        result_context = f"ACTION RESULT: FAILURE. Product '{p_name}' not found."
                    
                    # Ask AI to generate the final response
                    response_prompt = f"""
                    You performed a sales action. Here is the result:
                    {result_context}
                    
                    Task: Generate a professional, concise confirmation message for the user in {language} language.
                    Use emojis. If success, show Revenue and Stock Left clearly. 
                    If critical low stock, warn the user.
                    """
                    
                    resp_model = genai.GenerativeModel('gemini-flash-latest')
                    final_response = resp_model.generate_content(response_prompt).text.strip()

            except Exception as e:
                logger.error(f"Action execution failed: {e}")
                # Fallback to original text if validation fails
                pass

        return {
            "response": final_response,
            "sql_query": None 
        }

    except Exception as e:
        logger.error(f"Error in chat service: {e}")
        return {
            "response": "I'm having trouble connecting to my brain right now. Please try again later.",
            "sql_query": None
        }
