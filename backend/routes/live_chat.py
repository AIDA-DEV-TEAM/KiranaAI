import os
import io
import base64
import google.generativeai as genai
from fastapi import APIRouter, UploadFile, File, HTTPException, Depends, Form
from sqlalchemy.orm import Session
from sqlalchemy import text
from sqlalchemy import text
import edge_tts
from .. import database, models
from ..services.chat_service import process_chat_message
from dotenv import load_dotenv

from pathlib import Path
env_path = Path(__file__).parent.parent / '.env'
load_dotenv(dotenv_path=env_path)

router = APIRouter(prefix="/live", tags=["live"])

api_key = os.getenv("GEMINI_API_KEY")
genai.configure(api_key=api_key)

def get_db():
    db = database.SessionLocal()
    try:
        yield db
    finally:
        db.close()

def detect_language(text):
    for char in text:
        if '\u0900' <= char <= '\u097F': # Devanagari
            return 'hi'
        if '\u0C00' <= char <= '\u0C7F': # Telugu
            return 'te'
    return 'en'

@router.post("/chat")
async def live_chat(file: UploadFile = File(...), language: str = Form("en"), db: Session = Depends(get_db)):
    try:
        # Read audio file
        audio_content = await file.read()
        
        # 1. Transcribe Audio
        model = genai.GenerativeModel('gemini-2.5-flash')
        transcription_response = model.generate_content([
            {"mime_type": file.content_type or "audio/webm", "data": audio_content},
            f"Listen to this audio and transcribe it exactly into text. The language is likely {language}. Do not add any other words."
        ])
        user_message = transcription_response.text.strip()
        print(f"User said: {user_message}")

        # 2. Process with Chat Service (SQL Generation)
        # We don't have history for voice chat yet, passing empty list
        result = await process_chat_message(user_message, db, history=[], language=language)
        text_response = result["response"]
        
        # 3. Convert Response to Audio (using edge-tts)
        voice_map = {
            'hi': 'hi-IN-SwaraNeural',
            'te': 'te-IN-ShrutiNeural',
            'ta': 'ta-IN-PallaviNeural',
            'kn': 'kn-IN-GaganNeural',
            'ml': 'ml-IN-SobhanaNeural',
            'mr': 'mr-IN-AarohiNeural',
            'gu': 'gu-IN-DhwaniNeural',
            'bn': 'bn-IN-TanishaaNeural',
            'pa': 'pa-IN-OjasNeural',
            'en': 'en-IN-NeerjaNeural' # Default Indian English
        }
        
        voice = voice_map.get(language, 'en-IN-NeerjaNeural')
        communicate = edge_tts.Communicate(text_response, voice)
        
        mp3_fp = io.BytesIO()
        async for chunk in communicate.stream():
            if chunk["type"] == "audio":
                mp3_fp.write(chunk["data"])
                
        mp3_fp.seek(0)
        audio_base64 = base64.b64encode(mp3_fp.read()).decode('utf-8')
        
        return {
            "text_response": text_response,
            "audio_base64": audio_base64,
            "language": language
            # "sql_query": result.get("sql_query") # Hidden from frontend
        }
        
    except Exception as e:
        print(f"Error in live chat: {str(e)}")
        return {
            "text_response": "I'm having trouble hearing you. Please try again.",
            "error": str(e)
        }
