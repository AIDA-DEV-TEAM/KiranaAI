import os
import io
import base64
import google.generativeai as genai
from fastapi import APIRouter, UploadFile, File, HTTPException, Depends
from sqlalchemy.orm import Session
from sqlalchemy import text
from gtts import gTTS
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
async def live_chat(file: UploadFile = File(...), db: Session = Depends(get_db)):
    try:
        # Read audio file
        audio_content = await file.read()
        
        # 1. Transcribe Audio
        model = genai.GenerativeModel('gemini-2.5-flash')
        transcription_response = model.generate_content([
            {"mime_type": file.content_type or "audio/webm", "data": audio_content},
            "Listen to this audio and transcribe it exactly into text. Do not add any other words."
        ])
        user_message = transcription_response.text.strip()
        print(f"User said: {user_message}")

        # 2. Process with Chat Service (SQL Generation)
        # We don't have history for voice chat yet, passing empty list
        result = await process_chat_message(user_message, db, history=[])
        text_response = result["response"]
        
        # 3. Convert Response to Audio
        lang = detect_language(text_response)
        tts = gTTS(text=text_response, lang=lang, tld='co.in' if lang == 'en' else 'com') 
        
        mp3_fp = io.BytesIO()
        tts.write_to_fp(mp3_fp)
        mp3_fp.seek(0)
        audio_base64 = base64.b64encode(mp3_fp.read()).decode('utf-8')
        
        return {
            "text_response": text_response,
            "audio_base64": audio_base64,
            "language": lang,
            "sql_query": result.get("sql_query")
        }
        
    except Exception as e:
        print(f"Error in live chat: {str(e)}")
        return {
            "text_response": "I'm having trouble hearing you. Please try again.",
            "error": str(e)
        }
