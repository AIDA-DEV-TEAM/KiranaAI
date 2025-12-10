import { useState, useCallback, useRef, useEffect } from 'react';
import { SpeechRecognition } from '@capacitor-community/speech-recognition';
import { TextToSpeech } from '@capacitor-community/text-to-speech';
import { Capacitor } from '@capacitor/core';
import { chatWithData } from '../services/api';
import {
    VOICE_LANGUAGE_MAP,
    SILENCE_TIMEOUT_MS,
    NO_SPEECH_TIMEOUT_MS,
    TTS_CONFIG,
    VOICE_STATES
} from '../utils/voiceConfig';

export const useVoiceManager = (currentLanguage = 'en', addMessage) => {
    const [voiceState, setVoiceState] = useState(VOICE_STATES.IDLE);
    const [transcript, setTranscript] = useState('');
    const [aiResponse, setAiResponse] = useState('');
    const [error, setError] = useState(null);
    const [isActive, setIsActive] = useState(false);

    const silenceTimerRef = useRef(null);
    const noSpeechTimerRef = useRef(null);
    const forceProcessTimerRef = useRef(null); // Force process after max wait time
    const isListeningRef = useRef(false);
    const isSpeakingRef = useRef(false);
    const conversationHistoryRef = useRef([]);
    const hasSetForceTimerRef = useRef(false); // Track if we've set the force timer
    const isProcessingRef = useRef(false); // Prevent duplicate processing

    // Get TTS language code based on current app language
    const getTTSLanguage = useCallback(() => {
        return VOICE_LANGUAGE_MAP[currentLanguage] || 'en-IN';
    }, [currentLanguage]);

    // Clear all timers
    const clearTimers = useCallback(() => {
        if (silenceTimerRef.current) {
            clearTimeout(silenceTimerRef.current);
            silenceTimerRef.current = null;
        }
        if (noSpeechTimerRef.current) {
            clearTimeout(noSpeechTimerRef.current);
            noSpeechTimerRef.current = null;
        }
        if (forceProcessTimerRef.current) {
            clearTimeout(forceProcessTimerRef.current);
            forceProcessTimerRef.current = null;
        }
        hasSetForceTimerRef.current = false;
    }, []);

    // Stop speech recognition
    const stopListening = useCallback(async () => {
        if (isListeningRef.current) {
            try {
                await SpeechRecognition.stop();
                isListeningRef.current = false;
            } catch (err) {
                console.error('Error stopping speech recognition:', err);
            }
        }
    }, []);

    // Stop TTS
    const stopSpeaking = useCallback(async () => {
        if (isSpeakingRef.current) {
            try {
                await TextToSpeech.stop();
                isSpeakingRef.current = false;
            } catch (err) {
                console.error('Error stopping TTS:', err);
            }
        }
    }, []);

    // Process the transcribed text through backend
    const processTranscript = useCallback(async (text) => {
        console.log('[VoiceManager] ========== START PROCESSING ==========');
        console.log('[VoiceManager] Text to process:', text);

        if (!text || text.trim() === '') {
            console.log('[VoiceManager] ERROR: Empty text, aborting');
            return;
        }

        setVoiceState(VOICE_STATES.THINKING);
        setTranscript(text);
        console.log('[VoiceManager] State set to THINKING');

        try {
            console.log('[VoiceManager] Calling backend API...');
            // Send to backend chat API
            const response = await chatWithData(
                text,
                conversationHistoryRef.current,
                currentLanguage
            );

            console.log('[VoiceManager] Backend response received:', response);
            const aiText = response.response;
            setAiResponse(aiText);
            console.log('[VoiceManager] AI Response:', aiText);

            // Update conversation history
            conversationHistoryRef.current.push(
                { role: 'user', content: text },
                { role: 'assistant', content: aiText }
            );

            // Visual History
            if (addMessage) {
                addMessage({ role: 'assistant', content: aiText });
            }

            // Keep only last 10 messages to avoid memory issues
            if (conversationHistoryRef.current.length > 10) {
                conversationHistoryRef.current = conversationHistoryRef.current.slice(-10);
            }

            // Speak the response
            console.log('[VoiceManager] Calling speakResponse...');
            await speakResponse(aiText);

        } catch (err) {
            console.error('[VoiceManager] ========== ERROR IN PROCESSING ==========');
            console.error('[VoiceManager] Error details:', err);
            console.error('[VoiceManager] Error message:', err.message);
            console.error('[VoiceManager] Error stack:', err.stack);
            setError(`Failed: ${err.message}`);
            setVoiceState(VOICE_STATES.IDLE);

            // Retry on error instead of stopping
            if (isActive) {
                setTimeout(() => startListening(), 1000);
            }
        }
    }, [currentLanguage]);

    // Watchdog: If stuck in SPEAKING for too long (> 10s), force reset
    useEffect(() => {
        let watchdogTimer;
        if (voiceState === VOICE_STATES.SPEAKING) {
            watchdogTimer = setTimeout(async () => {
                console.warn('[VoiceManager] Watchdog: Stuck in SPEAKING, forcing reset');
                isSpeakingRef.current = false;
                setVoiceState(VOICE_STATES.IDLE);

                // Explicitly check ref to ensure we want to be active
                if (isActive) {
                    console.log('[VoiceManager] Watchdog restarting listener...');
                    await startListening();
                }
            }, 10000);
        }
        return () => clearTimeout(watchdogTimer);
    }, [voiceState, isActive, startListening]);



    // Start listening for speech input
    const startListening = useCallback(async () => {
        if (!Capacitor.isNativePlatform()) {
            setError('Voice mode is only available on mobile devices');
            return;
        }

        clearTimers();
        setVoiceState(VOICE_STATES.LISTENING);
        setTranscript('');
        setAiResponse('');
        isListeningRef.current = true;

        try {
            console.log('[VoiceManager] Starting listening...');

            // Check permissions
            const hasPermission = await SpeechRecognition.checkPermissions();
            if (hasPermission.speechRecognition !== 'granted') {
                const result = await SpeechRecognition.requestPermissions();
                if (result.speechRecognition !== 'granted') {
                    throw new Error('Microphone permission denied');
                }
            }

            // Start recognition with partial results
            await SpeechRecognition.start({
                language: getTTSLanguage(),
                maxResults: 1,
                prompt: '',
                partialResults: true,
                popup: false
            });

            console.log('[VoiceManager] Speech recognition started');

            // Set no-speech timeout
            noSpeechTimerRef.current = setTimeout(async () => {
                console.log('[VoiceManager] No-speech timeout triggered');
                // Don't stop, just restart listening to keep the loop "alive"
                // setError('No speech detected. Voice mode stopped.');
                // setIsActive(false);
                if (isActive) {
                    await startListening();
                }
            }, NO_SPEECH_TIMEOUT_MS);

            let lastTranscript = '';

            // Listen for partial results
            SpeechRecognition.addListener('partialResults', (data) => {
                console.log('[VoiceManager] Partial results:', data);
                if (data.matches && data.matches.length > 0) {
                    const interimText = data.matches[0];
                    lastTranscript = interimText;
                    setTranscript(interimText);

                    // If we have meaningful text and haven't set force timer yet, set it
                    if (interimText.trim().length > 3 && !hasSetForceTimerRef.current) {
                        console.log('[VoiceManager] Setting force process timer for:', interimText);
                        hasSetForceTimerRef.current = true;

                        // Force process after 3 seconds regardless of silence detection
                        forceProcessTimerRef.current = setTimeout(async () => {
                            const textToProcess = lastTranscript; // Use ref variable, not closure variable
                            console.log('[VoiceManager] ========== FORCE TIMER FIRED ==========');
                            console.log('[VoiceManager] Processing text:', textToProcess);

                            // Clear only silence and no-speech timers, not ourselves
                            if (silenceTimerRef.current) {
                                clearTimeout(silenceTimerRef.current);
                                silenceTimerRef.current = null;
                            }
                            if (noSpeechTimerRef.current) {
                                clearTimeout(noSpeechTimerRef.current);
                                noSpeechTimerRef.current = null;
                            }

                            // Stop speech recognition (don't await - it can hang)
                            try {
                                SpeechRecognition.stop();
                            } catch (err) {
                                console.log('[VoiceManager] Error stopping recognition:', err);
                            }

                            if (textToProcess && textToProcess.trim().length > 3) {
                                console.log('[VoiceManager] ABOUT TO CALL processTranscript with:', textToProcess);
                                await processTranscript(textToProcess);
                            } else {
                                console.log('[VoiceManager] ERROR: Text too short or empty:', textToProcess);
                            }
                        }, 3000); // Force process after 3 seconds
                    }

                    // Reset no-speech timer since we're getting input
                    if (noSpeechTimerRef.current) {
                        clearTimeout(noSpeechTimerRef.current);
                        noSpeechTimerRef.current = setTimeout(() => {
                            console.log('[VoiceManager] No-speech timeout after partial results');
                            if (isActive) {
                                startListening();
                            }
                        }, NO_SPEECH_TIMEOUT_MS);
                    }

                    // Start silence timer (will reset on each partial result)
                    if (silenceTimerRef.current) {
                        clearTimeout(silenceTimerRef.current);
                    }

                    silenceTimerRef.current = setTimeout(async () => {
                        console.log('[VoiceManager] Silence detected, processing:', interimText);
                        // Process the transcript after silence detected
                        // Only process if we have meaningful text (more than 3 characters)
                        if (interimText && interimText.trim().length > 3) {
                            try {
                                SpeechRecognition.stop();
                            } catch (err) {
                                console.log('[VoiceManager] Error stopping recognition:', err);
                            }
                            console.log('[VoiceManager] ABOUT TO CALL processTranscript from silence timer');
                            await processTranscript(interimText);
                        } else {
                            console.log('[VoiceManager] Transcript too short, ignoring:', interimText);
                        }
                    }, SILENCE_TIMEOUT_MS);
                }
            });

            // Listen for final results (when user finishes speaking)
            SpeechRecognition.addListener('finalResults', async (data) => {
                console.log('[VoiceManager] Final results:', data);
                if (data.matches && data.matches.length > 0) {
                    const finalText = data.matches[0];
                    console.log('[VoiceManager] Processing final text:', finalText);

                    // Clear timers
                    clearTimers();

                    // Process immediately
                    await stopListening();

                    // Visual History
                    if (addMessage) {
                        addMessage({ role: 'user', content: finalText });
                    }

                    await processTranscript(finalText);
                } else if (lastTranscript && lastTranscript.trim() !== '') {
                    // Use last partial result if no final result
                    console.log('[VoiceManager] No final result, using last transcript:', lastTranscript);
                    clearTimers();
                    await stopListening();

                    if (addMessage) {
                        addMessage({ role: 'user', content: lastTranscript });
                    }

                    await processTranscript(lastTranscript);
                }
            });

        } catch (err) {
            console.error('[VoiceManager] Error starting speech recognition:', err);
            setError(err.message || 'Failed to start listening');
            isListeningRef.current = false;
            setVoiceState(VOICE_STATES.IDLE);
            setIsActive(false);
        }
    }, [getTTSLanguage, processTranscript, stopListening, clearTimers]);

    // Speak the AI response using TTS
    const speakResponse = useCallback(async (text) => {
        if (!text || text.trim() === '') {
            if (isActive) {
                await startListening();
            }
            return;
        }

        setVoiceState(VOICE_STATES.SPEAKING);
        isSpeakingRef.current = true;

        // Estimate duration: ~150 words per minute + 0.5s buffer
        const wordCount = text.split(/\s+/).length;
        const estimatedDurationMs = Math.max(1000, (wordCount / 150) * 60 * 1000 + 500);

        try {
            const ttsLang = getTTSLanguage();

            // Await the native completion event (The "Event Chain" fix)
            await TextToSpeech.speak({
                text: text,
                lang: ttsLang,
                rate: TTS_CONFIG.rate,
                pitch: TTS_CONFIG.pitch,
                volume: TTS_CONFIG.volume,
                category: TTS_CONFIG.category
            });

            console.log('[VoiceManager] TTS Promise resolved - Speech finished');

            // Only restart if we are still effectively speaking (not interrupted/stopped/watchdogged)
            if (isSpeakingRef.current && isActive) {
                console.log('[VoiceManager] Immediate restart of listening');
                isSpeakingRef.current = false;
                setVoiceState(VOICE_STATES.IDLE);
                await startListening();
            }

        } catch (err) {
            console.error('[VoiceManager] Error during speech:', err);

            // If it was just an interruption/error, ensure we recover
            if (isActive && isSpeakingRef.current) {
                isSpeakingRef.current = false;
                setVoiceState(VOICE_STATES.IDLE);
                await startListening();
            }
        }
    }, [getTTSLanguage, isActive, startListening]);

    // Start voice mode
    const startVoiceMode = useCallback(async () => {
        setIsActive(true);
        setError(null);
        conversationHistoryRef.current = [];
        await startListening();
    }, [startListening]);

    // Stop voice mode
    const stopVoiceMode = useCallback(async () => {
        console.log('[VoiceManager] Stopping Voice Mode');
        setIsActive(false);
        clearTimers();

        // Stop audio immediately
        try {
            await TextToSpeech.stop();
        } catch (e) {
            console.warn("Error stopping TTS:", e);
        }

        // Stop listening
        try {
            await stopListening();
        } catch (e) {
            console.warn("Error stopping listening:", e);
        }

        // Remove all listeners
        try {
            await SpeechRecognition.removeAllListeners();
        } catch (e) { }

        setVoiceState(VOICE_STATES.IDLE);
        setTranscript('');
        setAiResponse('');
        conversationHistoryRef.current = [];
    }, [clearTimers, stopListening, stopSpeaking]);

    // Interrupt (user wants to speak while AI is speaking)
    const interrupt = useCallback(async () => {
        if (isSpeakingRef.current) {
            await stopSpeaking();
            await startListening();
        }
    }, [stopSpeaking, startListening]);

    // Cleanup on unmount
    useEffect(() => {
        return () => {
            clearTimers();
            if (isListeningRef.current) {
                SpeechRecognition.stop().catch(console.error);
            }
            if (isSpeakingRef.current) {
                TextToSpeech.stop().catch(console.error);
            }
            SpeechRecognition.removeAllListeners().catch(console.error);
        };
    }, [clearTimers]);

    // Effect to cleanup when isActive becomes false
    useEffect(() => {
        if (!isActive) {
            clearTimers();
            if (isListeningRef.current) {
                SpeechRecognition.stop().catch(console.error);
                isListeningRef.current = false;
            }
            if (isSpeakingRef.current) {
                TextToSpeech.stop().catch(console.error);
                isSpeakingRef.current = false;
            }
            setVoiceState(VOICE_STATES.IDLE);
        }
    }, [isActive, clearTimers]);

    return {
        voiceState,
        transcript,
        aiResponse,
        error,
        isActive,
        startVoiceMode,
        stopVoiceMode,
        interrupt
    };
};
