import os
import json
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from google import genai
from google.genai import types
from dotenv import load_dotenv

load_dotenv()

router = APIRouter(prefix="/translate", tags=["translate"])

# Configure Gemini
api_key = os.getenv("GEMINI_API_KEY")
client = None
if api_key:
    client = genai.Client(api_key=api_key)

class TranslateRequest(BaseModel):
    text: str
    target_languages: list[str] = ["hi", "te", "ta", "kn", "ml", "gu", "mr", "bn", "pa"]

class TranslateResponse(BaseModel):
    translations: dict[str, str]

# In-memory cache: {(text, tuple(sorted(targets))): translations_dict}
translation_cache = {}

@router.post("/", response_model=TranslateResponse)
async def translate_text(request: TranslateRequest):
    if not client:
        raise HTTPException(status_code=500, detail="Gemini API Key not configured")

    # Check cache
    cache_key = (request.text.strip().lower(), tuple(sorted(request.target_languages)))
    if cache_key in translation_cache:
        print(f"Cache hit for: {request.text}")
        return {"translations": translation_cache[cache_key]}

    try:
        # model = genai.GenerativeModel('gemini-flash-latest', generation_config={"response_mime_type": "application/json"})
        
        prompt = f"""
        Translate the following product name into these languages: {', '.join(request.target_languages)}.
        Product Name: "{request.text}"
        
        Return ONLY a valid JSON object where keys are language codes and values are the translations.
        Example format: {{ "hi": "...", "te": "..." }}
        ensure the translation is accurate for a grocery store context.
        """

        response = client.models.generate_content(
            model='gemini-flash-latest',
            contents=prompt,
            config=types.GenerateContentConfig(response_mime_type="application/json")
        )
        text_response = response.text.strip()
        
        # Parse JSON
        try:
            translations = json.loads(text_response)
            translation_cache[cache_key] = translations
            return {"translations": translations}
        except json.JSONDecodeError:
            # Fallback cleanup
            clean_text = text_response.replace("```json", "").replace("```", "").strip()
            translations = json.loads(clean_text)
            
            # Update cache
            translation_cache[cache_key] = translations
            return {"translations": translations}

    except Exception as e:
        print(f"Translation Error: {e}")
        # Fallback: return original text for all languages
        fallback_translations = {lang: request.text for lang in request.target_languages}
        return {"translations": fallback_translations}
