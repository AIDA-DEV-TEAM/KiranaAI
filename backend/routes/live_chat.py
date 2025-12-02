from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from google import genai
import os
import asyncio
import json
import logging
import base64
from datetime import datetime
from ..database import get_db_connection
from ..models import Product, Sale
from sqlalchemy.orm import Session
from sqlalchemy import func

router = APIRouter()
logger = logging.getLogger("live_chat")

# Initialize Gemini Client
# Ensure GEMINI_API_KEY is set in environment variables
api_key = os.environ.get("GEMINI_API_KEY")
client = genai.Client(api_key=api_key, http_options={"api_version": "v1alpha"})

MODEL = "gemini-2.5-flash-native-audio-preview-09-2025"

def get_shop_context():
    """Fetches a summary of inventory and recent sales for context."""
    try:
        # Create a new session for this request
        db = next(get_db_connection())
        
        # Inventory Summary
        products = db.query(Product).all()
        inventory_text = "Current Inventory:\n"
        if not products:
            inventory_text += "No items in stock.\n"
        else:
            for p in products:
                inventory_text += f"- {p.name}: {p.stock} units (Price: ₹{p.price})\n"
        
        # Sales Summary (Today)
        today = datetime.now().date()
        sales = db.query(Sale).filter(func.date(Sale.timestamp) == today).all()
        sales_text = "Sales Today:\n"
        if not sales:
            sales_text += "No sales yet today.\n"
        else:
            total_revenue = sum(s.total_amount for s in sales)
            sales_text += f"Total Revenue: ₹{total_revenue}\n"
            # Group by product for brevity if needed, but listing recent is okay for now
            sales_text += f"Total Transactions: {len(sales)}\n"

        return f"{inventory_text}\n{sales_text}"
    except Exception as e:
        logger.error(f"Error fetching shop context: {e}")
        return "Error fetching shop data."

@router.websocket("/ws/chat")
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()
    logger.info("WebSocket connection accepted")

    config = {
        "response_modalities": ["AUDIO"]
    }

    try:
        async with client.aio.live.connect(model=MODEL, config=config) as session:
            logger.info("Connected to Gemini Live API")
            
            # Fetch real-time context
            shop_context = get_shop_context()
            
            # Send system instruction as the first message
            sys_instruction = (
                "System Instruction: You are a helpful shop assistant for KiranaAI. "
                "You have access to the following real-time shop data:\n\n"
                f"{shop_context}\n\n"
                "Use this data to answer user queries accurately. "
                "Answer concisely. You MUST reply in the SAME language as the user's input. "
                "If the user speaks Hindi, reply in Hindi. If Telugu, reply in Telugu. "
                "Do not output internal thoughts, reasoning steps, or headers like 'Addressing the request'. "
                "Just provide the final spoken response directly."
            )
            await session.send(input=sys_instruction, end_of_turn=True)

            async def receive_from_frontend():
                try:
                    while True:
                        data = await websocket.receive_text()
                        message = json.loads(data)

                        # Handle audio input from frontend
                        if "realtime_input" in message:
                            media_chunks = message["realtime_input"]["media_chunks"]
                            for chunk in media_chunks:
                                # Send audio data to Gemini
                                # The SDK expects 'data' to be bytes
                                audio_bytes = base64.b64decode(chunk["data"])
                                await session.send(input={"mime_type": chunk["mime_type"], "data": audio_bytes}, end_of_turn=False)
                        
                        # Handle text input (if any)
                        if "client_content" in message:
                             # Example structure for text
                             pass

                except WebSocketDisconnect:
                    logger.info("Frontend disconnected")
                except Exception as e:
                    logger.error(f"Error in receive_from_frontend: {e}")

            async def send_to_frontend():
                try:
                    while True:
                        async for response in session.receive():
                            # Process response from Gemini and forward to frontend
                            
                            # Handle audio data directly if present (Native Audio)
                            if response.data:
                                # Send audio chunk to frontend
                                # Frontend expects base64 encoded audio in a specific format
                                # We'll wrap it in the same structure as before for compatibility
                                b64_data = base64.b64encode(response.data).decode('utf-8')
                                msg = {
                                    "serverContent": {
                                        "modelTurn": {
                                            "parts": [{
                                                "inlineData": {
                                                    "mimeType": "audio/pcm;rate=24000",
                                                    "data": b64_data
                                                }
                                            }]
                                        }
                                    }
                                }
                                await websocket.send_text(json.dumps(msg))
                                # Do not continue here, as the response might also contain text in server_content

                            # Handle text/other content if no audio data
                            server_content = {
                                "modelTurn": {
                                    "parts": []
                                }
                            }

                            if response.server_content and response.server_content.model_turn:
                                for part in response.server_content.model_turn.parts:
                                    part_data = {}
                                    if part.text:
                                        part_data["text"] = part.text
                                    # If inline_data is present but response.data wasn't (unlikely for audio mode but possible)
                                    if part.inline_data:
                                        part_data["inlineData"] = {
                                            "mimeType": part.inline_data.mime_type,
                                            "data": base64.b64encode(part.inline_data.data).decode('utf-8') 
                                        }
                                    if part_data:
                                        server_content["modelTurn"]["parts"].append(part_data)
                            
                            if server_content["modelTurn"]["parts"]:
                                msg = {"serverContent": server_content}
                                await websocket.send_text(json.dumps(msg))

                except Exception as e:
                    logger.error(f"Error in send_to_frontend: {e}")

            # Run both tasks concurrently
            receive_task = asyncio.create_task(receive_from_frontend())
            send_task = asyncio.create_task(send_to_frontend())

            done, pending = await asyncio.wait(
                [receive_task, send_task],
                return_when=asyncio.FIRST_COMPLETED,
            )

            for task in pending:
                task.cancel()
                try:
                    await task
                except asyncio.CancelledError:
                    pass

    except WebSocketDisconnect:
        logger.info("WebSocket disconnected")
    except Exception as e:
        logger.error(f"Gemini Live API connection error: {e}")
    finally:
        try:
            await websocket.close()
        except Exception:
            pass
