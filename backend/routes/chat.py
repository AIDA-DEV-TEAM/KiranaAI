import os
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from .. import database, models
from ..services.chat_service import process_chat_message
from dotenv import load_dotenv

load_dotenv()

router = APIRouter(prefix="/chat", tags=["chat"])

def get_db():
    db = database.SessionLocal()
    try:
        yield db
    finally:
        db.close()

@router.post("/", response_model=models.ChatResponse)
async def chat(request: models.ChatRequest, db: Session = Depends(get_db)):
    try:
        # Convert Pydantic models to dicts for the service
        history = [msg.dict() for msg in request.history]
        
        result = await process_chat_message(request.message, db, history)
        return result
        
    except Exception as e:
        import traceback
        traceback.print_exc()
        print(f"Error in chat endpoint: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Internal Server Error: {str(e)}")