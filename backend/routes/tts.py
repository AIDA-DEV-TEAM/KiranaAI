import io
from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
import edge_tts
from gtts import gTTS
from ..services.audio_cache import get_cache

router = APIRouter(prefix="/tts", tags=["tts"])

@router.get("/")
async def generate_tts(text: str, language: str = "en"):
    try:
        # Voice mapping for edge-tts
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
            'en': 'en-IN-NeerjaNeural'
        }
        
        voice = voice_map.get(language, 'en-IN-NeerjaNeural')
        print(f"[TTS] Generating for: '{text[:50]}...' with voice: {voice}")

        # Check cache first
        cache = get_cache()
        cached_audio = await cache.get(text, language, voice)
        
        if cached_audio:
            print(f"[TTS] ✓ Cache HIT - returning cached audio ({len(cached_audio)} bytes)")
            return StreamingResponse(
                io.BytesIO(cached_audio),
                media_type="audio/mpeg"
            )
        
        print(f"[TTS] Cache MISS - generating new audio")

        async def audio_stream_with_cache():
            audio_buffer = io.BytesIO()
            try:
                # Generate with edge-tts
                communicate = edge_tts.Communicate(text, voice)
                async for chunk in communicate.stream():
                    if chunk["type"] == "audio":
                        audio_buffer.write(chunk["data"])
                        yield chunk["data"]
                
                # Cache the generated audio
                audio_data = audio_buffer.getvalue()
                await cache.set(text, language, voice, audio_data)
                print(f"[TTS] ✓ Audio cached ({len(audio_data)} bytes)")
                
            except Exception as e:
                print(f"[TTS] EdgeTTS failed: {e}. Falling back to gTTS.")
                # Fallback to gTTS
                audio_buffer = io.BytesIO()
                tts = gTTS(text=text, lang=language)
                tts.write_to_fp(audio_buffer)
                audio_buffer.seek(0)
                audio_data = audio_buffer.read()
                
                # Cache gTTS fallback too
                await cache.set(text, language, voice, audio_data)
                yield audio_data

        return StreamingResponse(
            audio_stream_with_cache(), 
            media_type="audio/mpeg"
        )
        
    except Exception as e:
        print(f"[TTS] Error: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/cache/stats")
async def get_cache_stats():
    """Get TTS cache statistics"""
    cache = get_cache()
    return cache.get_stats()

