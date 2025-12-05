import io
from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
import edge_tts
from gtts import gTTS

router = APIRouter(prefix="/tts", tags=["tts"])

@router.get("/")
async def generate_tts(text: str, language: str = "en"):
    try:
        # Voice mapping for edge-tts
        voice_map = {
            'hi': 'hi-IN-MadhurNeural',
            'te': 'te-IN-MohanNeural',
            'ta': 'ta-IN-ValluvarNeural',
            'kn': 'kn-IN-GaganNeural',
            'ml': 'ml-IN-MidhunNeural',
            'mr': 'mr-IN-ManoharNeural',
            'gu': 'gu-IN-NiranjanNeural',
            'bn': 'bn-IN-BashkarNeural',
            'pa': 'pa-IN-OjasNeural',
            'en': 'en-IN-PrabhatNeural'
        }
        
        voice = voice_map.get(language, 'en-IN-PrabhatNeural')
        print(f"Generating TTS for: '{text}' with voice: {voice}")

        async def audio_stream():
            try:
                communicate = edge_tts.Communicate(text, voice)
                async for chunk in communicate.stream():
                    if chunk["type"] == "audio":
                        yield chunk["data"]
            except Exception as e:
                print(f"EdgeTTS failed: {e}. Falling back to gTTS.")
                # Fallback to gTTS
                mp3_fp = io.BytesIO()
                tts = gTTS(text=text, lang=language)
                tts.write_to_fp(mp3_fp)
                mp3_fp.seek(0)
                yield mp3_fp.read()

        return StreamingResponse(
            audio_stream(), 
            media_type="audio/mpeg"
        )
        
    except Exception as e:
        print(f"Error in TTS: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))
