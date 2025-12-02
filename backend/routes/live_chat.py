from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from google import genai
import os
import asyncio
import json
import logging
import base64

router = APIRouter()
logger = logging.getLogger("live_chat")

# Initialize Gemini Client
# Ensure GEMINI_API_KEY is set in environment variables
api_key = os.environ.get("GEMINI_API_KEY")
client = genai.Client(api_key=api_key, http_options={"api_version": "v1alpha"})

MODEL = "gemini-2.5-flash-native-audio-preview-09-2025"

@router.websocket("/ws/chat")
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()
    logger.info("WebSocket connection accepted")

    config = {
        "response_modalities": ["AUDIO"],
        "system_instruction": "You are a helpful shop assistant for KiranaAI. Answer concisely. Always reply in the same language as the user's input. Do not output internal thoughts, reasoning steps, or headers like 'Acknowledge' or 'Formulating'. Just provide the final spoken response directly."
    }

    try:
        async with client.aio.live.connect(model=MODEL, config=config) as session:
            logger.info("Connected to Gemini Live API")

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
                                continue

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
