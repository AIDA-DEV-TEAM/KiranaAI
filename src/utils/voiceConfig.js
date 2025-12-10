// Voice configuration for TTS language mapping
export const VOICE_LANGUAGE_MAP = {
    'en': 'en-IN',  // English (India)
    'hi': 'hi-IN',  // Hindi (India)
    'bn': 'bn-IN',  // Bengali (India)
    'te': 'te-IN',  // Telugu (India)
    'mr': 'mr-IN',  // Marathi (India)
    'ta': 'ta-IN',  // Tamil (India)
    'gu': 'gu-IN',  // Gujarati (India)
    'kn': 'kn-IN',  // Kannada (India)
    'ml': 'ml-IN',  // Malayalam (India)
    'pa': 'pa-IN'   // Punjabi (India)
};

// Silence detection threshold (milliseconds) - reduced for better responsiveness
export const SILENCE_TIMEOUT_MS = 1000; // 1.0 second of silence to trigger processing

// No speech detected timeout (milliseconds)
export const NO_SPEECH_TIMEOUT_MS = 20000; // 20 seconds of no speech to auto-stop

// TTS Configuration
export const TTS_CONFIG = {
    rate: 1.0,      // Natural speech rate
    pitch: 1.0,     // Natural pitch
    volume: 1.0,    // Maximum volume
    category: 'ambient' // Audio category for Android
};

// Voice state constants
export const VOICE_STATES = {
    IDLE: 'idle',
    LISTENING: 'listening',
    THINKING: 'thinking',
    SPEAKING: 'speaking'
};
