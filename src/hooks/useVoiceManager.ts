import { useState, useEffect, useCallback, useRef } from 'react';
import { SpeechRecognition } from '@capacitor-community/speech-recognition';
import { TextToSpeech } from '@capacitor-community/text-to-speech';
import { Capacitor } from '@capacitor/core';
import { getTTS } from '../services/api';

export enum VoiceState {
    IDLE = 'IDLE',
    LISTENING = 'LISTENING',
    PROCESSING = 'PROCESSING',
    SPEAKING = 'SPEAKING'
}

interface UseVoiceManagerProps {
    language?: string;
    onInputComplete?: (text: string) => void;
    onError?: (message: string) => void;
}

// Configuration
const CONFIG = {
    AUTO_RESTART_DELAY: 400, // Reduced from 800ms for faster responses
    MAX_RETRIES: 3,
    RETRY_BACKOFF: 1.5,
    SILENCE_TIMEOUT: 8000,
    PROCESS_GUARD_TIMEOUT: 20000,
    MIN_RESTART_DELAY: 200, // Minimum delay to prevent too rapid restarts
};

export const useVoiceManager = ({
    language = 'en-US',
    onInputComplete,
    onError
}: UseVoiceManagerProps = {}) => {
    const [voiceState, setVoiceState] = useState<VoiceState>(VoiceState.IDLE);
    const [transcript, setTranscript] = useState<string>('');
    const [isSpeaking, setIsSpeaking] = useState<boolean>(false);
    const [isStarting, setIsStarting] = useState<boolean>(false);

    const silenceTimer = useRef<any>(null);
    const processTimer = useRef<any>(null);
    const restartAttempts = useRef<number>(0);
    const stateRef = useRef({ voiceState, language, onInputComplete, onError });

    useEffect(() => {
        stateRef.current = { voiceState, language, onInputComplete, onError };

        let processGuard: any = null;
        if (voiceState === VoiceState.PROCESSING) {
            processGuard = setTimeout(() => {
                console.error("[VoiceManager] Stuck in PROCESSING > 20s - Resetting");
                setVoiceState(VoiceState.IDLE);
                stateRef.current.onError?.('Processing timeout - please try again');
            }, CONFIG.PROCESS_GUARD_TIMEOUT);
        }
        return () => {
            if (processGuard) clearTimeout(processGuard);
        };
    }, [voiceState, language, onInputComplete, onError]);

    const clearTimers = () => {
        if (silenceTimer.current) clearTimeout(silenceTimer.current);
        if (processTimer.current) clearTimeout(processTimer.current);
    };

    const checkPermissions = async () => {
        if (!Capacitor.isNativePlatform()) return true;
        try {
            const perm = await SpeechRecognition.checkPermissions();
            if (perm.speechRecognition !== 'granted') {
                const result = await SpeechRecognition.requestPermissions();
                return result.speechRecognition === 'granted';
            }
            return true;
        } catch (e) {
            console.error("[VoiceManager] Permission error:", e);
            return false;
        }
    };

    const stopListening = useCallback(async () => {
        clearTimers();
        if (Capacitor.isNativePlatform()) {
            try {
                await SpeechRecognition.stop();
            } catch (e) { }
        }
        setVoiceState(VoiceState.IDLE);
        restartAttempts.current = 0; // Reset retry counter
    }, []);

    const startListening = useCallback(async () => {
        console.log("[VoiceManager] Start listening called");

        if (stateRef.current.voiceState === VoiceState.SPEAKING) {
            try {
                await TextToSpeech.stop();
            } catch (e) { }
            window.speechSynthesis.cancel();
            setIsSpeaking(false);
        }

        clearTimers();
        setTranscript('');
        setIsStarting(true);

        if (Capacitor.isNativePlatform()) {
            try {
                const hasPerm = await checkPermissions();
                if (!hasPerm) {
                    setVoiceState(VoiceState.IDLE);
                    stateRef.current.onError?.('Microphone permission denied');
                    return;
                }

                // Shorter delay for faster start
                await new Promise(resolve => setTimeout(resolve, 300));

                silenceTimer.current = setTimeout(() => {
                    console.log("[VoiceManager] Silence timeout");
                    stopListening();
                }, CONFIG.SILENCE_TIMEOUT);

                setVoiceState(VoiceState.LISTENING);

                await SpeechRecognition.start({
                    language: stateRef.current.language || 'en-US',
                    partialResults: true,
                    popup: false,
                });

            } catch (e: any) {
                console.error("[VoiceManager] Start listening failed:", e);
                stateRef.current.onError?.("Mic Error: " + (e.message || JSON.stringify(e)));
                setVoiceState(VoiceState.IDLE);
            } finally {
                setIsStarting(false);
            }
        } else {
            // Web Speech API Support
            try {
                const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
                if (!SpeechRecognition) {
                    console.warn("[VoiceManager] Web Speech API not supported");
                    stateRef.current.onError?.('Speech recognition not supported in this browser');
                    setVoiceState(VoiceState.IDLE);
                    setIsStarting(false);
                    return;
                }

                const recognition = new SpeechRecognition();
                recognition.lang = stateRef.current.language || 'en-US';
                recognition.continuous = false;
                recognition.interimResults = true;

                recognition.onstart = () => {
                    console.log("[VoiceManager] Web Speech Started");
                    setVoiceState(VoiceState.LISTENING);
                    setIsStarting(false);
                };

                recognition.onresult = (event: any) => {
                    const current = event.resultIndex;
                    const transcriptResult = event.results[current][0].transcript;
                    setTranscript(transcriptResult);

                    if (silenceTimer.current) clearTimeout(silenceTimer.current);
                    if (processTimer.current) clearTimeout(processTimer.current);

                    // Reduced from 1500ms to 1200ms for faster processing
                    processTimer.current = setTimeout(() => {
                        setVoiceState(VoiceState.PROCESSING);
                        if (stateRef.current.onInputComplete) {
                            stateRef.current.onInputComplete(transcriptResult);
                        }
                    }, 1200);
                };

                recognition.onerror = (event: any) => {
                    console.error("[VoiceManager] Web Speech Error", event.error);
                    if (event.error === 'no-speech') {
                        setVoiceState(VoiceState.IDLE);
                    } else {
                        stateRef.current.onError?.(`Speech error: ${event.error}`);
                        setVoiceState(VoiceState.IDLE);
                    }
                };

                recognition.onend = () => {
                    if (stateRef.current.voiceState === VoiceState.LISTENING) {
                        setVoiceState(VoiceState.IDLE);
                    }
                };

                recognition.start();

            } catch (e) {
                console.error("[VoiceManager] Web Speech Setup Error", e);
                setVoiceState(VoiceState.IDLE);
                setIsStarting(false);
            }
        }
    }, [stopListening]);

    // Restart with retry logic
    const restartWithRetry = useCallback(async (attemptNumber = 0) => {
        console.log(`[VoiceManager] Restart attempt ${attemptNumber + 1}/${CONFIG.MAX_RETRIES}`);

        try {
            await startListening();
            restartAttempts.current = 0; // Reset on success
        } catch (error) {
            console.error(`[VoiceManager] Restart attempt ${attemptNumber + 1} failed:`, error);

            if (attemptNumber < CONFIG.MAX_RETRIES - 1) {
                const delay = CONFIG.AUTO_RESTART_DELAY * Math.pow(CONFIG.RETRY_BACKOFF, attemptNumber);
                console.log(`[VoiceManager] Retrying in ${delay}ms...`);
                setTimeout(() => restartWithRetry(attemptNumber + 1), delay);
            } else {
                console.error("[VoiceManager] All restart attempts failed");
                stateRef.current.onError?.('Failed to restart listening - please tap to try again');
                setVoiceState(VoiceState.IDLE);
            }
        }
    }, [startListening]);

    const cancelOutput = useCallback(async () => {
        clearTimers();
        if (Capacitor.isNativePlatform()) {
            try { await TextToSpeech.stop(); } catch (e) { }
            try { await SpeechRecognition.stop(); } catch (e) { }
        }
        window.speechSynthesis.cancel();
        setIsSpeaking(false);
        setVoiceState(VoiceState.IDLE);
    }, []);

    const speakResponse = useCallback(async (text: string) => {
        if (!text) {
            setTimeout(() => restartWithRetry(), CONFIG.MIN_RESTART_DELAY);
            return;
        }

        console.log(`[VoiceManager] Speaking: "${text.substring(0, 50)}..."`);

        clearTimers();
        // Stop any existing audio/speech
        try { await SpeechRecognition.stop(); } catch (e) { }
        try { await TextToSpeech.stop(); } catch (e) { }
        window.speechSynthesis.cancel();

        setVoiceState(VoiceState.SPEAKING);
        setIsSpeaking(true);

        const onComplete = () => {
            if (stateRef.current.voiceState !== VoiceState.SPEAKING) return;
            console.log("[VoiceManager] TTS Complete - Auto-restarting");
            setIsSpeaking(false);

            // Reduced delay for faster loop (800ms → 400ms)
            setTimeout(() => {
                console.log("[VoiceManager] Auto-restart triggered");
                restartWithRetry();
            }, CONFIG.AUTO_RESTART_DELAY);
        };

        const attemptWebSpeech = () => {
            console.log("[VoiceManager] Using Web Speech fallback");
            try {
                const utterance = new SpeechSynthesisUtterance(text);
                utterance.lang = stateRef.current.language;
                utterance.rate = 1.0;
                utterance.onend = () => onComplete();
                utterance.onerror = (e) => {
                    console.error("[VoiceManager] Web Speech API Error:", e);
                    stateRef.current.onError?.('Voice output failed');
                    onComplete();
                };
                window.speechSynthesis.speak(utterance);
            } catch (e) {
                console.error("[VoiceManager] Web Speech failed:", e);
                onComplete();
            }
        };

        const attemptDeviceTTS = async () => {
            console.log("[VoiceManager] Using device TTS (offline fallback)");
            try {
                if (Capacitor.isNativePlatform()) {
                    await TextToSpeech.speak({
                        text: text,
                        lang: stateRef.current.language,
                        rate: 1.0,
                        pitch: 1.0,
                        volume: 1.0,
                        category: 'ambient'
                    });
                    // Note: TextToSpeech doesn't have reliable onend callback
                    // So we estimate based on text length (rough: 150 words per minute)
                    const estimatedDuration = (text.split(' ').length / 150) * 60 * 1000;
                    setTimeout(onComplete, estimatedDuration);
                } else {
                    attemptWebSpeech();
                }
            } catch (e) {
                console.error("[VoiceManager] Device TTS failed:", e);
                attemptWebSpeech();
            }
        };

        // Cloud TTS with offline fallback
        const playBackendTTS = async () => {
            // Check if online
            if (!navigator.onLine) {
                console.log("[VoiceManager] Offline detected - using device TTS");
                attemptDeviceTTS();
                return;
            }

            console.log(`[VoiceManager] Fetching Cloud TTS for ${stateRef.current.language}`);
            try {
                const audioDataUrl = await getTTS(text, stateRef.current.language);

                const audio = new Audio(audioDataUrl);
                audio.playsInline = true;
                audio.preload = 'auto';

                audio.onended = () => {
                    console.log("[VoiceManager] Cloud TTS Finished");
                    onComplete();
                };

                audio.onerror = (e) => {
                    console.error("[VoiceManager] Cloud TTS Playback Error", e);
                    attemptDeviceTTS();
                };

                try {
                    await audio.play();
                    console.log("[VoiceManager] Cloud TTS playing");
                } catch (playErr) {
                    console.error("[VoiceManager] Audio Playback Blocked/Failed:", playErr);
                    attemptDeviceTTS();
                }
            } catch (err) {
                console.error("[VoiceManager] Cloud TTS Fetch Error:", err);
                attemptDeviceTTS();
            }
        };

        // Start TTS
        playBackendTTS();

    }, [restartWithRetry]);

    useEffect(() => {
        let listenerHandle: any = null;

        if (Capacitor.isNativePlatform()) {
            SpeechRecognition.addListener('partialResults', (data: any) => {
                const results = data.matches;
                if (results && results.length > 0) {
                    const text = results[0];
                    setTranscript(text);

                    if (silenceTimer.current) clearTimeout(silenceTimer.current);
                    if (processTimer.current) clearTimeout(processTimer.current);

                    // Reduced from 1500ms to 1200ms
                    processTimer.current = setTimeout(() => {
                        setVoiceState(VoiceState.PROCESSING);
                        if (stateRef.current.onInputComplete) {
                            stateRef.current.onInputComplete(text);
                        }
                    }, 1200);
                }
            }).then(handle => {
                listenerHandle = handle;
            });

            SpeechRecognition.addListener('onError' as any, (err: any) => {
                console.error("[VoiceManager] Speech Recognition Error:", err);
                stateRef.current.onError?.("Recognition Error: " + (err.message || JSON.stringify(err)));
                setVoiceState(VoiceState.IDLE);
            });

            return () => {
                if (listenerHandle) {
                    listenerHandle.remove();
                }
                SpeechRecognition.removeAllListeners();
            };
        }
    }, []);

    return {
        voiceState,
        transcript,
        isSpeaking,
        isStarting,
        startListening,
        stopListening,
        speakResponse,
        cancelOutput
    };
};

