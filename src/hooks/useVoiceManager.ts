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
}

export const useVoiceManager = ({ language = 'en-US', onInputComplete }: UseVoiceManagerProps = {}) => {
    const [voiceState, setVoiceState] = useState<VoiceState>(VoiceState.IDLE);
    const [transcript, setTranscript] = useState<string>('');
    const [isSpeaking, setIsSpeaking] = useState<boolean>(false);
    const [isStarting, setIsStarting] = useState<boolean>(false);

    const silenceTimer = useRef<any>(null);
    const processTimer = useRef<any>(null);
    const stateRef = useRef({ voiceState, language, onInputComplete });

    useEffect(() => {
        stateRef.current = { voiceState, language, onInputComplete };

        let processGuard: any = null;
        if (voiceState === VoiceState.PROCESSING) {
            processGuard = setTimeout(() => {
                console.error("Stuck in PROCESSING > 20s - Resetting");
                setVoiceState(VoiceState.IDLE);
            }, 20000);
        }
        return () => {
            if (processGuard) clearTimeout(processGuard);
        };
    }, [voiceState, language, onInputComplete]);

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
            console.error("Permission error:", e);
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
    }, []);

    const startListening = useCallback(async () => {
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
                    return;
                }

                await new Promise(resolve => setTimeout(resolve, 400));

                silenceTimer.current = setTimeout(() => {
                    console.log("Silence timeout");
                    stopListening();
                }, 8000);

                setVoiceState(VoiceState.LISTENING);

                await SpeechRecognition.start({
                    language: stateRef.current.language || 'en-US',
                    partialResults: true,
                    popup: false,
                });

            } catch (e: any) {
                console.error("Start listening failed:", e);
                alert("Mic Error: " + (e.message || JSON.stringify(e)));
                setVoiceState(VoiceState.IDLE);
            } finally {
                setIsStarting(false);
            }
        } else {
            // Web Speech API Support
            try {
                const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
                if (!SpeechRecognition) {
                    console.warn("Web Speech API not supported");
                    setVoiceState(VoiceState.IDLE);
                    setIsStarting(false);
                    return;
                }

                const recognition = new SpeechRecognition();
                recognition.lang = stateRef.current.language || 'en-US';
                recognition.continuous = false;
                recognition.interimResults = true;

                recognition.onstart = () => {
                    console.log("Web Speech Started");
                    setVoiceState(VoiceState.LISTENING);
                    setIsStarting(false);
                };

                recognition.onresult = (event: any) => {
                    const current = event.resultIndex;
                    const transcriptResult = event.results[current][0].transcript;
                    setTranscript(transcriptResult);

                    if (silenceTimer.current) clearTimeout(silenceTimer.current);
                    if (processTimer.current) clearTimeout(processTimer.current);

                    // Web speech doesn't always support partial nicely, so we debounce processing
                    processTimer.current = setTimeout(() => {
                        setVoiceState(VoiceState.PROCESSING);
                        if (stateRef.current.onInputComplete) {
                            stateRef.current.onInputComplete(transcriptResult);
                        }
                    }, 1500);
                };

                recognition.onerror = (event: any) => {
                    console.error("Web Speech Error", event.error);
                    if (event.error === 'no-speech') {
                        // Simple restart or idle? Let's go idle to avoid infinite loops if mic is broken
                        setVoiceState(VoiceState.IDLE);
                    } else {
                        setVoiceState(VoiceState.IDLE);
                    }
                };

                recognition.onend = () => {
                    // If we didn't process, we go idle. If we processed, state changes elsewhere.
                    if (stateRef.current.voiceState === VoiceState.LISTENING) {
                        setVoiceState(VoiceState.IDLE);
                    }
                };

                recognition.start();

            } catch (e) {
                console.error("Web Speech Setup Error", e);
                setVoiceState(VoiceState.IDLE);
                setIsStarting(false);
            }
        }
    }, [stopListening]);

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
            setTimeout(() => startListening(), 500);
            return;
        }

        clearTimers();
        // Stop any existing audio/speech
        try { await SpeechRecognition.stop(); } catch (e) { }
        try { await TextToSpeech.stop(); } catch (e) { }
        window.speechSynthesis.cancel();

        setVoiceState(VoiceState.SPEAKING);
        setIsSpeaking(true);

        const onComplete = () => {
            if (stateRef.current.voiceState !== VoiceState.SPEAKING) return;
            console.log("TTS Complete - Triggering Restart");
            setIsSpeaking(false);
            setTimeout(() => {
                console.log("Auto-restarting listener...");
                startListening();
            }, 500);
        };

        const attemptWebSpeech = () => {
            console.log("Cloud TTS failed, using Web Fallback as last resort...");
            try {
                const utterance = new SpeechSynthesisUtterance(text);
                utterance.lang = stateRef.current.language;
                utterance.rate = 1.0;
                utterance.onend = () => onComplete();
                utterance.onerror = (e) => {
                    console.error("Web Speech API Error:", e);
                    onComplete();
                };
                window.speechSynthesis.speak(utterance);
            } catch (e) {
                onComplete();
            }
        };

        // FORCE CLOUD TTS - "Gemini Live Style"
        const playBackendTTS = async () => {
            console.log(`[VoiceManager] Fetching Cloud TTS for ${stateRef.current.language}`);
            try {
                const audioBlob = await getTTS(text, stateRef.current.language);
                const audioUrl = URL.createObjectURL(audioBlob);
                const audio = new Audio(audioUrl);

                audio.onended = () => {
                    console.log("Cloud TTS Finished");
                    onComplete();
                    URL.revokeObjectURL(audioUrl);
                };

                audio.onerror = (e) => {
                    console.error("Cloud TTS Playback Error", e);
                    attemptWebSpeech();
                };

                await audio.play();
            } catch (err) {
                console.error("Cloud TTS Fetch Error:", err);
                attemptWebSpeech();
            }
        };

        // Trigger Cloud TTS Immediately
        playBackendTTS();

    }, [startListening]);

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

                    processTimer.current = setTimeout(() => {
                        setVoiceState(VoiceState.PROCESSING);
                        if (stateRef.current.onInputComplete) {
                            stateRef.current.onInputComplete(text);
                        }
                    }, 1500);
                }
            }).then(handle => {
                listenerHandle = handle;
            });

            SpeechRecognition.addListener('onError' as any, (err: any) => {
                console.error("Speech Recognition Error:", err);
                alert("Native Error: " + (err.message || JSON.stringify(err)));
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
