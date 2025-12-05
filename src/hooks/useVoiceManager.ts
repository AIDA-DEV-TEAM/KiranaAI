import { useState, useEffect, useCallback, useRef } from 'react';
import { SpeechRecognition } from '@capacitor-community/speech-recognition';
import { TextToSpeech } from '@capacitor-community/text-to-speech';
import { Capacitor } from '@capacitor/core';

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
    // Ref to access current state in async callbacks
    const stateRef = useRef({ voiceState, language, onInputComplete });

    useEffect(() => {
        stateRef.current = { voiceState, language, onInputComplete };
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
            } catch (e) {
                // Ignore stop errors
            }
        }
        setVoiceState(VoiceState.IDLE);
    }, []);

    const startListening = useCallback(async () => {
        // Interruption logic: If currently speaking, stop TTS
        if (stateRef.current.voiceState === VoiceState.SPEAKING) {
            try {
                await TextToSpeech.stop();
            } catch (e) { console.error("Error stopping TTS:", e); }
            setIsSpeaking(false);
        }

        clearTimers();
        setTranscript('');

        // Optimistic update removed - using isStarting
        setIsStarting(true);

        if (Capacitor.isNativePlatform()) {
            try {
                const hasPerm = await checkPermissions();
                if (!hasPerm) {
                    console.error("Permissions denied");
                    setVoiceState(VoiceState.IDLE);
                    return;
                }

                // Ensure fresh start
                try { await SpeechRecognition.stop(); } catch (e) { }
                // CRITICAL: Robust delay (250ms) to allow native layer to reset
                await new Promise(resolve => setTimeout(resolve, 250));

                // Safety timeout: If no input at all for 8 seconds, go IDLE
                silenceTimer.current = setTimeout(() => {
                    console.log("Silence timeout - stopping listener");
                    stopListening();
                }, 8000);

                setVoiceState(VoiceState.LISTENING);

                await SpeechRecognition.start({
                    language: stateRef.current.language || 'en-US',
                    partialResults: true,
                    popup: false,
                });

            } catch (e) {
                console.error("Start listening failed:", e);
                // Revert to IDLE so user can tap to retry
                setVoiceState(VoiceState.IDLE);
            } finally {
                setIsStarting(false);
            }
        } else {
            console.warn("Web Speech API not fully implemented in this native-focused hook");
            setVoiceState(VoiceState.IDLE);
            setIsStarting(false);
        }
    }, [stopListening]);

    const speakResponse = useCallback(async (text: string) => {
        if (!text) {
            // If no text, just restart loop immediately?
            setTimeout(() => startListening(), 500);
            return;
        }

        // Ensure we aren't listening
        clearTimers();
        try { await SpeechRecognition.stop(); } catch (e) { }

        setVoiceState(VoiceState.SPEAKING);
        setIsSpeaking(true);

        try {
            if (Capacitor.isNativePlatform()) {
                await TextToSpeech.speak({
                    text,
                    lang: stateRef.current.language,
                    rate: 1.0,
                    pitch: 1.0,
                    category: 'ambient',
                });
                // When promise resolves, TTS is done
                handleTTSComplete();
            } else {
                // Web fallback (using browser speech synthesis)
                const utterance = new SpeechSynthesisUtterance(text);
                utterance.lang = stateRef.current.language;
                utterance.onend = () => handleTTSComplete();
                window.speechSynthesis.speak(utterance);
            }
        } catch (e) {
            console.error("TTS Error:", e);
            handleTTSComplete();
        }
    }, [startListening]);

    const handleTTSComplete = useCallback(() => {
        setIsSpeaking(false);
        // CRITICAL: 500ms delay to release audio focus before listening
        setTimeout(() => {
            startListening();
        }, 500);
    }, [startListening]);

    const cancelOutput = useCallback(async () => {
        clearTimers();
        if (Capacitor.isNativePlatform()) {
            try { await TextToSpeech.stop(); } catch (e) { }
            try { await SpeechRecognition.stop(); } catch (e) { }
        } else {
            window.speechSynthesis.cancel();
        }
        setIsSpeaking(false);
        setVoiceState(VoiceState.IDLE);
    }, []);

    // Setup Listeners
    useEffect(() => {
        let listenerHandle: any = null;

        if (Capacitor.isNativePlatform()) {
            SpeechRecognition.addListener('partialResults', (data: any) => {
                const results = data.matches;
                if (results && results.length > 0) {
                    const text = results[0];
                    setTranscript(text);

                    // User is speaking, so reset silence timer
                    if (silenceTimer.current) clearTimeout(silenceTimer.current);

                    // Set/Reset "Done Speaking" timer
                    // This creates the "Safety Loop" - waiting for pause in speech
                    if (processTimer.current) clearTimeout(processTimer.current);

                    processTimer.current = setTimeout(() => {
                        // Consolidate input
                        setVoiceState(VoiceState.PROCESSING);
                        if (stateRef.current.onInputComplete) {
                            stateRef.current.onInputComplete(text);
                        }
                    }, 1500); // 1.5s pause = done speaking
                }
            }).then(handle => {
                listenerHandle = handle;
            });

            // Handle errors (No match, network, etc.)
            SpeechRecognition.addListener('onError' as any, (err: any) => {
                console.error("Speech Recognition Error:", err);
                // If error occurs, revert to IDLE to allow retry
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
