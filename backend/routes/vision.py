import os
import json
import io
from google import genai
from google.genai import types
from fastapi import APIRouter, UploadFile, File, HTTPException
from PIL import Image
from dotenv import load_dotenv

load_dotenv()

router = APIRouter(prefix="/vision", tags=["vision"])

api_key = os.getenv("GEMINI_API_KEY")

# Initialize client conditionally
client = None
if api_key:
    client = genai.Client(api_key=api_key)
else:
    print("Warning: GEMINI_API_KEY not found")

# Helper function to clean generic markdown response if it slips through
def clean_json_string(text: str) -> str:
    text = text.strip()
    if text.startswith("```json"):
        text = text[7:]
    if text.startswith("```"):
        text = text[3:]
    if text.endswith("```"):
        text = text[:-3]
    return text.strip()

@router.post("/ocr")
async def process_bill(file: UploadFile = File(...)):
    if not client:
        raise HTTPException(status_code=500, detail="Gemini API Key not configured")
    
    try:
        contents = await file.read()
        image = Image.open(io.BytesIO(contents))
        
        prompt = """
        You are an expert OCR and Data Extraction Specialist.
        Analyze the provided bill of lading or invoice image.
        
        Extract the line items into a pure JSON array. Each object must contain:
        - "name": Full product description/name.
        - "quantity": The count/qty purchased (number). Default to 1 if not explicitly stated.
        - "unit_price": The price per single unit (number). If only total is shown, calculate unit price.
        
        Handle handwritten text, poor lighting, and Indian currency formats.
        Output strictly the JSON array.
        """
        
        response = client.models.generate_content(
            model='gemini-1.5-flash', # Switched to stable version
            contents=[image, prompt],
            config=types.GenerateContentConfig(
                response_mime_type="application/json" # NATIVE JSON ENFORCEMENT
            )
        )
        
        # Parse string to JSON object before returning
        cleaned_text = clean_json_string(response.text)
        data = json.loads(cleaned_text)
        return {"data": data}

    except json.JSONDecodeError:
        raise HTTPException(status_code=500, detail="We couldn't read the bill details. Please ensure the bill is well-lit and not blurry.")
    except Exception as e:
        raise HTTPException(status_code=500, detail="Something went wrong while scanning the bill. Please try again.")

@router.post("/shelf")
async def analyze_shelf(file: UploadFile = File(...)):
    if not client:
        raise HTTPException(status_code=500, detail="Gemini API Key not configured")
    
    try:
        contents = await file.read()
        image = Image.open(io.BytesIO(contents))
        
        prompt = """
        You are a Retail Planogram Auditor and Spatial Analysis AI. 
        Analyze the shelf image to create a precise digital twin of the inventory.

        ### Spatial Reasoning Logic:
        1.  **Anchor Identification:** Scan the horizontal shelf edges (rails) for alphanumeric location labels (e.g., 'A1', 'B-2'). 
        2.  **Zone Definition:** The label on a rail defines the ID for the **entire row of products sitting directly on that shelf**.
        3.  **Product Scanning:** Identify every visible item.

        ### Output Schema (JSON Array):
        Extract all visible products into a flat JSON array:
        - "detected_shelf_id": (string or null) The label found on the shelf rail. 
            - CRITICAL: If a label 'A1' is visible anywhere on a rail, apply 'A1' to ALL items on that level.
            - If no label is visible for a specific row, return null for those items.
        - "category": (string) General category (e.g., "Soda", "Chips").
        - "name": (string) Precise brand and variant (e.g., "Coca-Cola Zero Sugar 300ml").

        ### Constraints:
        - Output strictly valid JSON.
        - Do not invent shelf IDs if they are physically not visible in the image.
        """
        
        response = client.models.generate_content(
            model='gemini-1.5-flash',
            contents=[image, prompt],
            config=types.GenerateContentConfig(
                response_mime_type="application/json" # NATIVE JSON ENFORCEMENT
            )
        )
        
        cleaned_text = clean_json_string(response.text)
        data = json.loads(cleaned_text)
        return {"data": data}

    except json.JSONDecodeError:
        raise HTTPException(status_code=500, detail="We couldn't understand the shelf layout from this image. Please try taking a closer photo.")
    except Exception as e:
        raise HTTPException(status_code=500, detail="Something went wrong while analyzing the shelf. Please try again.")
