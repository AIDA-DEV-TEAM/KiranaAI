import { useState, useCallback, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
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

import { LocalStorageService } from '../services/LocalStorageService';

export const useVoiceManager = (currentLanguage = 'en', addMessage, refreshData) => {
    const { t } = useTranslation();
    const [voiceState, setVoiceState] = useState(VOICE_STATES.IDLE);
    const [transcript, setTranscript] = useState('');
    const [aiResponse, setAiResponse] = useState('');
    const [error, setError] = useState(null);
    const [isActive, setIsActive] = useState(false);
    const isActiveRef = useRef(false);

    // Sync isActive state to ref
    useEffect(() => {
        isActiveRef.current = isActive;
    }, [isActive]);

    const silenceTimerRef = useRef(null);
    const noSpeechTimerRef = useRef(null);
    const forceProcessTimerRef = useRef(null);
    const isListeningRef = useRef(false);
    const isSpeakingRef = useRef(false);
    const conversationHistoryRef = useRef([]);
    const hasSetForceTimerRef = useRef(false);
    const isProcessingRef = useRef(false);

    // Refs to break dependency cycles
    const speakResponseRef = useRef(null);
    const startListeningRef = useRef(null);
    const processTranscriptRef = useRef(null);
    const stopListeningRef = useRef(null);
    const stopSpeakingRef = useRef(null);
    const clearTimersRef = useRef(null);

    // Get TTS language code
    const getTTSLanguage = useCallback(() => {
        return VOICE_LANGUAGE_MAP[currentLanguage] || 'en-IN';
    }, [currentLanguage]);

    // Clear all timers
    const clearTimers = useCallback(() => {
        if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
        if (noSpeechTimerRef.current) clearTimeout(noSpeechTimerRef.current);
        if (forceProcessTimerRef.current) clearTimeout(forceProcessTimerRef.current);
        hasSetForceTimerRef.current = false;
        silenceTimerRef.current = null;
        noSpeechTimerRef.current = null;
        forceProcessTimerRef.current = null;
    }, []);

    // Stop listening
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

    // Stop speaking
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

        if (isProcessingRef.current) {
            console.warn('[VoiceManager] Duplicate processing prevented. Locked.');
            return;
        }

        if (!text || text.trim() === '') {
            console.log('[VoiceManager] ERROR: Empty text, aborting');
            return;
        }

        isProcessingRef.current = true; // LOCK
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

            // Handle INTENT Actions (Frontend Execution)
            let aiText = response.response;
            let speechText = response.speech || aiText;

            if (response.action && response.action !== 'NONE') {
                console.log('[VoiceManager] ACTION DETAILS:', response.action, response.params);
                const actionResult = handleVoiceAction(response.action, response.params);

                // CRITICAL FIX: If local action returns speech (success OR failure), prefer it over LLM speech
                if (actionResult && actionResult.speech) {
                    speechText = actionResult.speech;
                    console.log('[VoiceManager] Overriding LLM speech with Local Result:', speechText);
                }

                if (refreshData) {
                    await refreshData(true);
                }
            }

            setAiResponse(aiText);

            // Audio Context Logic (Music ducking etc) would go here if needed

            console.log('[VoiceManager] AI Response:', aiText);

            // Update conversation history
            conversationHistoryRef.current.push(
                { role: 'user', content: text },
                { role: 'assistant', content: aiText }
            );

            // Visual History
            if (addMessage) {
                addMessage({ role: 'user', content: text });
                addMessage({ role: 'assistant', content: aiText });
            }

            // Keep only last 10 messages
            if (conversationHistoryRef.current.length > 10) {
                conversationHistoryRef.current = conversationHistoryRef.current.slice(-10);
            }

            // Speak the response using Ref to avoid circular dependency
            console.log('[VoiceManager] Calling speakResponse with:', speechText);
            if (speakResponseRef.current) {
                await speakResponseRef.current(speechText);
            } else {
                console.error('[VoiceManager] speakResponseRef is not set!');
                isProcessingRef.current = false; // Unlock if we can't speak
            }

        } catch (err) {
            console.error('[VoiceManager] ========== ERROR IN PROCESSING ==========');
            console.error('[VoiceManager] Error details:', err);
            setError(`Failed: ${err.message}`);
            setVoiceState(VOICE_STATES.IDLE);
            isProcessingRef.current = false;

            // Retry on error instead of stopping
            if (isActiveRef.current) {
                setTimeout(() => {
                    if (startListeningRef.current) {
                        startListeningRef.current();
                    }
                }, 1000);
            }
        }
    }, [currentLanguage, addMessage, refreshData, getTTSLanguage, isActive]);

    // Watchdog: If stuck in SPEAKING for too long (> 10s), force reset
    useEffect(() => {
        let watchdogTimer;
        if (voiceState === VOICE_STATES.SPEAKING) {
            watchdogTimer = setTimeout(async () => {
                console.warn('[VoiceManager] Watchdog: Stuck in SPEAKING, forcing reset');
                isSpeakingRef.current = false;
                setVoiceState(VOICE_STATES.IDLE);

                // Explicitly check ref to ensure we want to be active
                if (isActiveRef.current) {
                    console.log('[VoiceManager] Watchdog restarting listener...');
                    if (startListeningRef.current) {
                        await startListeningRef.current();
                    }
                }
            }, 10000);
        }
        return () => clearTimeout(watchdogTimer);
    }, [voiceState]); // removed isActive dependency as we use ref



    // Start listening for speech input
    const startListening = useCallback(async () => {
        if (!Capacitor.isNativePlatform()) {
            setError('Voice mode is only available on mobile devices');
            return;
        }

        if (clearTimersRef.current) clearTimersRef.current();

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
            // Set no-speech timeout to EXIT voice mode if no speech detected
            noSpeechTimerRef.current = setTimeout(async () => {
                console.log('[VoiceManager] No-speech timeout triggered. Exiting voice mode.');
                if (isActiveRef.current) {
                    setIsActive(false); // This triggers cleanup effect to set IDLE
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
                            setVoiceState(VOICE_STATES.THINKING);
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
                                if (processTranscriptRef.current) {
                                    await processTranscriptRef.current(textToProcess);
                                }
                            } else {
                                console.log('[VoiceManager] ERROR: Text too short or empty:', textToProcess);
                            }
                        }, 3000); // Force process after 3 seconds
                    }

                    // Reset no-speech timer since we're getting input
                    if (noSpeechTimerRef.current) {
                        clearTimeout(noSpeechTimerRef.current);
                        noSpeechTimerRef.current = setTimeout(() => {
                            console.log('[VoiceManager] No-speech timeout after partial results. Exiting voice mode.');
                            if (isActiveRef.current) {
                                setIsActive(false);
                            }
                        }, NO_SPEECH_TIMEOUT_MS);
                    }

                    // Start silence timer (will reset on each partial result)
                    if (silenceTimerRef.current) {
                        clearTimeout(silenceTimerRef.current);
                    }

                    silenceTimerRef.current = setTimeout(async () => {
                        console.log('[VoiceManager] Silence detected, processing:', interimText);
                        // Immediate visual feedback
                        if (interimText && interimText.trim().length > 3) {
                            setVoiceState(VOICE_STATES.THINKING);
                        }

                        // Process the transcript after silence detected
                        // Only process if we have meaningful text (more than 3 characters)
                        if (interimText && interimText.trim().length > 3) {
                            try {
                                SpeechRecognition.stop();
                            } catch (err) {
                                console.log('[VoiceManager] Error stopping recognition:', err);
                            }
                            console.log('[VoiceManager] ABOUT TO CALL processTranscript from silence timer');
                            if (processTranscriptRef.current) {
                                await processTranscriptRef.current(interimText);
                            }
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

                    // Immediate visual update to stop "Listening/Spinning"
                    setVoiceState(VOICE_STATES.THINKING);

                    // Clear timers
                    if (clearTimersRef.current) clearTimersRef.current();

                    // Process immediately
                    if (stopListeningRef.current) await stopListeningRef.current();

                    // Visual History
                    if (addMessage) {
                        addMessage({ role: 'user', content: finalText });
                    }

                    if (processTranscriptRef.current) {
                        await processTranscriptRef.current(finalText);
                    }
                } else if (lastTranscript && lastTranscript.trim() !== '') {
                    // Use last partial result if no final result
                    console.log('[VoiceManager] No final result, using last transcript:', lastTranscript);
                    setVoiceState(VOICE_STATES.THINKING);
                    if (clearTimersRef.current) clearTimersRef.current();
                    if (stopListeningRef.current) await stopListeningRef.current();

                    if (addMessage) {
                        addMessage({ role: 'user', content: lastTranscript });
                    }

                    if (processTranscriptRef.current) {
                        await processTranscriptRef.current(lastTranscript);
                    }
                }
            });

        } catch (err) {
            console.error('[VoiceManager] Error starting speech recognition:', err);
            setError(err.message || 'Failed to start listening');
            isListeningRef.current = false;
            setVoiceState(VOICE_STATES.IDLE);
            setIsActive(false);
        }
    }, [getTTSLanguage]);

    // Speak the AI response using TTS
    const speakResponse = useCallback(async (text) => {
        if (!text || text.trim() === '') {
            if (isActive) {
                if (startListeningRef.current) {
                    await startListeningRef.current();
                }
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

            // UNLOCK processing flag
            isProcessingRef.current = false;

            // Only restart if we are still effectively speaking (not interrupted/stopped/watchdogged)
            // Rely primarily on isActiveRef to ensure loop continues
            if (isActiveRef.current) {
                console.log('[VoiceManager] Immediate restart of listening');
                isSpeakingRef.current = false;
                // setVoiceState(VOICE_STATES.IDLE); // Skip IDLE to avoid flicker
                if (startListeningRef.current) {
                    await startListeningRef.current();
                }
            }

        } catch (err) {
            console.error('[VoiceManager] Error during speech:', err);

            // UNLOCK processing flag on error
            isProcessingRef.current = false;

            // If it was just an interruption/error, ensure we recover
            if (isActiveRef.current && isSpeakingRef.current) {
                isSpeakingRef.current = false;
                setVoiceState(VOICE_STATES.IDLE);
                if (startListeningRef.current) {
                    await startListeningRef.current();
                }
            }
        }
    }, [getTTSLanguage, isActive]);

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
        if (clearTimersRef.current) clearTimersRef.current();

        // Stop audio immediately
        try {
            await TextToSpeech.stop();
        } catch (e) {
            console.warn("Error stopping TTS:", e);
        }

        // Stop listening
        try {
            if (stopListeningRef.current) await stopListeningRef.current();
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
    }, []);

    // Interrupt (user wants to speak while AI is speaking)
    const interrupt = useCallback(async () => {
        if (isSpeakingRef.current) {
            if (stopSpeakingRef.current) await stopSpeakingRef.current();
            if (startListeningRef.current) await startListeningRef.current();
        }
    }, []);

    // Update refs when functions change
    useEffect(() => {
        speakResponseRef.current = speakResponse;
        startListeningRef.current = startListening;
        processTranscriptRef.current = processTranscript;
        stopListeningRef.current = stopListening;
        stopSpeakingRef.current = stopSpeaking;
        clearTimersRef.current = clearTimers;
    }, [speakResponse, startListening, processTranscript, stopListening, stopSpeaking, clearTimers]);

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

    // Action Handler with Localization
    const handleVoiceAction = (action, params) => {
        if (!params || !params.product) return null;

        const inventory = LocalStorageService.getInventory();
        const query = params.product.toLowerCase();

        // Improved Fuzzy Search
        const product = inventory.find(p => {
            const enName = (p.name.en || p.name).toLowerCase();
            const translations = typeof p.name === 'object' ? Object.values(p.name) : (p.translations ? Object.values(p.translations) : []);
            return enName.includes(query) || translations.some(t => String(t).toLowerCase().includes(query));
        });

        const lang = language || 'en';

        // Use main i18n t function if available
        // Note: We use the 't' from useTranslation hook at the top of the file

        if (!product) {
            console.warn("Product not found for:", params.product);
            const notFoundMsg = t('voice_product_not_found') || "Product not found.";
            return { speech: notFoundMsg };
        }

        try {
            if (action === 'UPDATE_STOCK') {
                const qty = parseInt(params.quantity);
                if (isNaN(qty)) return null;

                const newStock = Math.max(0, product.stock + qty);
                LocalStorageService.updateProduct(product.id, { stock: newStock });

                // Use localized success key or fallback
                const successMsg = t('voice_stock_response', { name: product.name.en || product.name, stock: newStock, lng: lang })
                    || `Stock updated. New stock: ${newStock}`;
                return { speech: successMsg };

            } else if (action === 'RECORD_SALE') {
                const qty = parseInt(params.quantity);
                if (isNaN(qty)) return null;

                if (product.stock < qty) {
                    const lowStockMsg = t('voice_low_stock') || `Not enough stock. Only ${product.stock} left.`;
                    return { speech: lowStockMsg };
                }

                const price = parseFloat(product.price);
                const finalPrice = isNaN(price) ? 0 : price;
                const nameStr = typeof product.name === 'object' ? (product.name.en || Object.values(product.name)[0]) : product.name;

                LocalStorageService.addSale({
                    product_id: product.id,
                    product_name: nameStr, // Ensure name is preserved as string
                    quantity: qty,
                    total_amount: qty * finalPrice
                });

                const left = product.stock - qty;
                return { speech: `${t.remaining} ${left}` };

            } else if (action === 'GET_INFO') {
                // The 't' from useTranslation will be used here, shadowing the 't' from 'responses'
                // Assuming useTranslation is imported and 't' is destructured from it at the component level.
                if (params.query_type === 'stock') {
                    const name = product.name[lang] || product.name.en || product.name;
                    return { speech: t('voice_stock_response', { name, stock: product.stock, lng: lang }) };
                }

                if (params.query_type === 'price') {
                    const name = product.name[lang] || product.name.en || product.name;
                    return { speech: t('voice_price_response', { name, price: product.price, lng: lang }) };
                }

                if (params.query_type === 'sales') {
                    // Calculate today's sales
                    const sales = LocalStorageService.getSales();
                    const todayStr = new Date().toDateString();
                    const todayTotal = sales
                        .filter(s => new Date(s.timestamp).toDateString() === todayStr)
                        .reduce((sum, s) => sum + (parseFloat(s.total_amount) || 0), 0);

                    return { speech: t('voice_sales_response', { amount: todayTotal, lng: lang }) };
                }
            }
        } catch (e) {
            console.error("Action execution failed", e);
            return { speech: "Error updating data." };
        }
        return null;
    };

    return {
        voiceState,
        transcript,
        aiResponse,
        error,
        isActive,
        startVoiceMode,
        stopVoiceMode,
        interrupt,
        handleVoiceAction // Expose validation/action logic
    };
};
