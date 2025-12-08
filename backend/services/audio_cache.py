import os
import hashlib
import asyncio
from pathlib import Path
from datetime import datetime, timedelta
import aiofiles
import json

class TTSCache:
    """
    High-performance TTS audio cache to reduce latency.
    Caches frequently used phrases to avoid repeated API calls.
    """
    
    def __init__(self, cache_dir='./tts_cache', max_cache_size_mb=100, ttl_hours=24):
        self.cache_dir = Path(cache_dir)
        self.cache_dir.mkdir(parents=True, exist_ok=True)
        self.metadata_file = self.cache_dir / 'metadata.json'
        self.max_cache_size_mb = max_cache_size_mb
        self.ttl_hours = ttl_hours
        self.metadata = self._load_metadata()
    
    def _load_metadata(self) -> dict:
        """Load cache metadata from disk"""
        if self.metadata_file.exists():
            try:
                with open(self.metadata_file, 'r', encoding='utf-8') as f:
                    return json.load(f)
            except:
                return {}
        return {}
    
    def _save_metadata(self):
        """Save cache metadata to disk"""
        with open(self.metadata_file, 'w', encoding='utf-8') as f:
            json.dump(self.metadata, f, indent=2)
    
    def get_cache_key(self, text: str, language: str, voice: str) -> str:
        """Generate cache key from text, language, and voice"""
        # Normalize text (strip whitespace, lowercase)
        normalized_text = text.strip().lower()
        content = f"{normalized_text}:{language}:{voice}"
        return hashlib.md5(content.encode('utf-8')).hexdigest()
    
    def _is_expired(self, cache_key: str) -> bool:
        """Check if cached item has expired"""
        if cache_key not in self.metadata:
            return True
        
        cached_time = datetime.fromisoformat(self.metadata[cache_key]['timestamp'])
        expiry_time = cached_time + timedelta(hours=self.ttl_hours)
        return datetime.now() > expiry_time
    
    async def get(self, text: str, language: str, voice: str) -> bytes | None:
        """
        Retrieve cached audio if available and not expired.
        Returns None if not cached or expired.
        """
        cache_key = self.get_cache_key(text, language, voice)
        cache_file = self.cache_dir / f"{cache_key}.mp3"
        
        if not cache_file.exists() or self._is_expired(cache_key):
            return None
        
        try:
            async with aiofiles.open(cache_file, 'rb') as f:
                audio_data = await f.read()
            
            # Update access count and last accessed
            self.metadata[cache_key]['access_count'] += 1
            self.metadata[cache_key]['last_accessed'] = datetime.now().isoformat()
            self._save_metadata()
            
            return audio_data
        except Exception as e:
            print(f"Error reading cache: {e}")
            return None
    
    async def set(self, text: str, language: str, voice: str, audio_data: bytes):
        """
        Store audio in cache with metadata.
        Automatically manages cache size.
        """
        cache_key = self.get_cache_key(text, language, voice)
        cache_file = self.cache_dir / f"{cache_key}.mp3"
        
        try:
            # Write audio file
            async with aiofiles.open(cache_file, 'wb') as f:
                await f.write(audio_data)
            
            # Update metadata
            self.metadata[cache_key] = {
                'text': text[:100],  # Store first 100 chars for reference
                'language': language,
                'voice': voice,
                'timestamp': datetime.now().isoformat(),
                'last_accessed': datetime.now().isoformat(),
                'access_count': 1,
                'size_bytes': len(audio_data)
            }
            self._save_metadata()
            
            # Check cache size and cleanup if needed
            await self._cleanup_if_needed()
            
        except Exception as e:
            print(f"Error saving to cache: {e}")
    
    async def _cleanup_if_needed(self):
        """Remove least recently used items if cache exceeds size limit"""
        total_size_mb = sum(item['size_bytes'] for item in self.metadata.values()) / (1024 * 1024)
        
        if total_size_mb > self.max_cache_size_mb:
            # Sort by last accessed time (oldest first)
            sorted_items = sorted(
                self.metadata.items(),
                key=lambda x: (x[1]['access_count'], x[1]['last_accessed'])
            )
            
            # Remove oldest 20% of items
            items_to_remove = int(len(sorted_items) * 0.2)
            for cache_key, _ in sorted_items[:items_to_remove]:
                cache_file = self.cache_dir / f"{cache_key}.mp3"
                if cache_file.exists():
                    cache_file.unlink()
                del self.metadata[cache_key]
            
            self._save_metadata()
            print(f"Cache cleanup: removed {items_to_remove} items")
    
    def get_stats(self) -> dict:
        """Get cache statistics"""
        total_items = len(self.metadata)
        total_size_mb = sum(item['size_bytes'] for item in self.metadata.values()) / (1024 * 1024)
        total_accesses = sum(item['access_count'] for item in self.metadata.values())
        
        return {
            'total_items': total_items,
            'total_size_mb': round(total_size_mb, 2),
            'total_accesses': total_accesses,
            'avg_accesses_per_item': round(total_accesses / total_items, 2) if total_items > 0 else 0
        }

# Global cache instance
_cache_instance = None

def get_cache() -> TTSCache:
    """Get or create global cache instance"""
    global _cache_instance
    if _cache_instance is None:
        _cache_instance = TTSCache()
    return _cache_instance
