import os
from google import genai
from google.genai import types
from fastapi import APIRouter, UploadFile, File, HTTPException
from PIL import Image
import io
from dotenv import load_dotenv

load_dotenv()

router = APIRouter(prefix="/vision", tags=["vision"])

api_key = os.getenv("GEMINI_API_KEY")
client = None
if not api_key:
    print("Warning: GEMINI_API_KEY not found in environment variables")
else:
    client = genai.Client(api_key=api_key)

@router.post("/ocr")
async def process_bill(file: UploadFile = File(...)):
    if not client:
        raise HTTPException(status_code=500, detail="Gemini API Key not configured")
    try:
        contents = await file.read()
        image = Image.open(io.BytesIO(contents))
        
        prompt = """
        Analyze this bill of lading / invoice image. Extract the list of items.
        
        Return a Strict JSON array of objects with these fields:
        - "name": The product description or name (string).
        - "quantity": The quantity purchased (number). If unclear, default to 1.
        - "unit_price": The price per unit (number).
        - "total_price": The total line item cost (number).

        Handle handwritten text and poor lighting.
        If a field is missing, use reasonable defaults or null.
        
        Do not include any markdown formatting (like ```json). Return ONLY the JSON array.
        """
        
        response = client.models.generate_content(
            model='gemini-2.5-flash-lite',
            contents=[image, prompt]
        )
        return {"data": response.text.strip()}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"OCR failed: {str(e)}")

@router.post("/shelf")
async def analyze_shelf(file: UploadFile = File(...)):
    if not client:
        raise HTTPException(status_code=500, detail="Gemini API Key not configured")
    try:
        contents = await file.read()
        image = Image.open(io.BytesIO(contents))
        
        prompt = """
        You are an Expert Retail Inventory Manager / Planogram Specialist.
        Analyze the provided image of a retail shelf.
        
        Extract the visible products into a structured JSON array.
        For each product, provide:
        - "name": Specific product name/brand.
        - "count": Count of this item visible.
        - "category": Broad category (e.g., "Beverage", "Snacks").
        - "low_stock": Boolean. Set to true if there is significant empty shelf space for this product, suggesting it needs restocking.
        
        Analyze the shelf arrangement:
        - "misplaced": Boolean. Set to true if this item looks clearly out of place.
        - "suggested_shelf": If misplaced, suggest the ID of a shelf in the image (e.g., "A1", "B2") where it SHOULD be. If no IDs are visible, suggest a logical location.
        
        Strict JSON array output. No markdown.
        """
        
        response = client.models.generate_content(
            model='gemini-2.5-flash-lite',
            contents=[image, prompt]
        )
        return {"data": response.text.strip()}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Shelf analysis failed: {str(e)}")
