import os
import google.generativeai as genai
from fastapi import APIRouter, UploadFile, File, HTTPException
from PIL import Image
import io
from dotenv import load_dotenv

load_dotenv()

router = APIRouter(prefix="/vision", tags=["vision"])

api_key = os.getenv("GEMINI_API_KEY")
if not api_key:
    print("Warning: GEMINI_API_KEY not found in environment variables")
else:
    genai.configure(api_key=api_key)

model = genai.GenerativeModel('gemini-2.5-flash-lite')

@router.post("/ocr")
async def process_bill(file: UploadFile = File(...)):
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
        
        response = model.generate_content([prompt, image])
        return {"data": response.text.strip()}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"OCR failed: {str(e)}")

@router.post("/shelf")
async def analyze_shelf(file: UploadFile = File(...)):
    try:
        contents = await file.read()
        image = Image.open(io.BytesIO(contents))
        
        prompt = """
        You are an Expert Retail Inventory Manager. 
        Analyze the provided image of a retail shelf and extract the visible products into a structured JSON array.
        
        The JSON objects must have the following fields:
        - "name": Identify the product name, brand, and variant visible on the label. Be specific (e.g., "Maggi Masala Noodles", "Lays Classic Salted").
        - "count": Estimate the distinct count of this specific item visible on the shelf. Default to 1 if unsure.

        Exception Handling:
        - If the image is very blurry or products are unrecognizable, return a JSON object with: {"error": "Unable to identify products. Please re-upload a clearer image."}
        
        Return the data in a STRICT JSON array format. Do not include any markdown formatting (like ```json ... ```).
        """
        
        response = model.generate_content([prompt, image])
        return {"data": response.text.strip()}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Shelf analysis failed: {str(e)}")
