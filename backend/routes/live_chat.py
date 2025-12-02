from fastapi import APIRouter, WebSocket, WebSocketDisconnect
import websockets
import json
import os
import asyncio
from dotenv import load_dotenv

load_dotenv()

router = APIRouter()

GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
HOST = "generativelanguage.googleapis.com"
MODEL = "gemini-2.0-flash-exp" # Live API usually requires specific models
URI = f"wss://{HOST}/ws/google.ai.generativelanguage.v1alpha.GenerativeService.BidiGenerateContent?key={GEMINI_API_KEY}"

@router.websocket("/ws/chat")
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()
    
    try:
        async with websockets.connect(URI) as gemini_ws:
            # Initial setup message to Gemini
            setup_msg = {
                "setup": {
                    "model": f"models/{MODEL}",
                    "generation_config": {
                        "response_modalities": ["AUDIO"]
                    }
                }
            }
            await gemini_ws.send(json.dumps(setup_msg))
            
            # Initial response from Gemini (setup complete)
            init_resp = await gemini_ws.recv()
            print("Gemini Setup Response:", init_resp)

            async def receive_from_client():
                try:
                    while True:
                        data = await websocket.receive_json()
                        # Forward to Gemini
                        # Assuming client sends data in the format Gemini expects or we wrap it
                        # Client should send: {"realtime_input": {"media_chunks": [{"mime_type": "audio/pcm", "data": "base64..."}]}}
                        await gemini_ws.send(json.dumps(data))
                except WebSocketDisconnect:
                    print("Client disconnected")
                except Exception as e:
                    print(f"Error receiving from client: {e}")

            async def receive_from_gemini():
                try:
                    while True:
                        msg = await gemini_ws.recv()
                        # Forward to client
                        await websocket.send_text(msg)
                except Exception as e:
                    print(f"Error receiving from Gemini: {e}")

            # Run both tasks
            await asyncio.gather(receive_from_client(), receive_from_gemini())

    except Exception as e:
        print(f"WebSocket connection error: {e}")
        await websocket.close()
