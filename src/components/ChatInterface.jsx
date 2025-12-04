import React, { useState, useRef, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeHighlight from 'rehype-highlight';
import 'highlight.js/styles/github-dark.css';
import { Send, Bot, User, Loader2, Mic, X, Radio, Sparkles } from 'lucide-react';
import { chatWithData, sendVoiceMessage } from '../services/api';
import { cn } from '../lib/utils';
import { SpeechRecognition } from '@capacitor-community/speech-recognition';
import { Capacitor } from '@capacitor/core';
import ThemeToggle from './ThemeToggle';

import { useTranslation } from 'react-i18next';

const ChatInterface = ({ messages, setMessages }) => {
    const { t, i18n } = useTranslation();
    const [input, setInput] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [isLiveMode, setIsLiveMode] = useState(false);
    const [isRecording, setIsRecording] = useState(false);
    const [isProcessing, setIsProcessing] = useState(false);
    const [permissionGranted, setPermissionGranted] = useState(false);
    const [volumeLevel, setVolumeLevel] = useState(0); // For visual feedback
    const [isSpeakingState, setIsSpeakingState] = useState(false); // For UI feedback

    const messagesEndRef = useRef(null);
    const mediaRecorderRef = useRef(null);
    const audioChunksRef = useRef([]);
    const isLiveModeRef = useRef(isLiveMode);

    useEffect(() => {
        isLiveModeRef.current = isLiveMode;
        if (!isLiveMode && isRecording) {
            stopRecording();
        }
        if (isLiveMode && !isRecording && !isProcessing) {
            startRecording();
        }
    }, [isLiveMode]);

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    };

    useEffect(() => {
        scrollToBottom();
    }, [messages, isLoading]);

    const handleSend = async (e) => {
        if (e) e.preventDefault();
        if (!input.trim()) return;

        const userMessage = input;
        setInput('');
        setMessages(prev => [...prev, { role: 'user', content: userMessage }]);
        setIsLoading(true);

        try {
            const history = messages.slice(1).map(msg => ({
                role: msg.role,
                content: msg.content
            }));

            const data = await chatWithData(userMessage, history, i18n.language);
            setMessages(prev => [...prev, {
                role: 'assistant',
                content: data.response,
                sql: data.sql_query
            }]);

        } catch (error) {
            setMessages(prev => [...prev, {
                role: 'assistant',
                content: t('error_processing_request')
            }]);
        } finally {
            setIsLoading(false);
        }
    };

    const checkPermission = async () => {
        if (Capacitor.isNativePlatform()) {
            try {
                const status = await SpeechRecognition.checkPermissions();
                if (status.speechRecognition === 'granted') {
                    setPermissionGranted(true);
                    return true;
                }
                const { permission } = await SpeechRecognition.requestPermission();
                if (permission) {
                    setPermissionGranted(true);
                    return true;
                }
                return false;
            } catch (e) {
                console.error("Permission check failed", e);
                return false;
            }
        }
        return true; // Browser usually handles this via getUserMedia
    };

    const startRecording = async () => {
        try {
            if (!permissionGranted) {
                const granted = await checkPermission();
                if (!granted && Capacitor.isNativePlatform()) {
                    alert(t('mic_permission_required'));
                    setIsLiveMode(false);
                    return;
                }
            }

            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            const mediaRecorder = new MediaRecorder(stream);
            mediaRecorderRef.current = mediaRecorder;
            audioChunksRef.current = [];

            // Audio Context for VAD (Voice Activity Detection)
            const audioContext = new AudioContext();
            await audioContext.resume(); // Ensure context is running
            const source = audioContext.createMediaStreamSource(stream);
            const analyser = audioContext.createAnalyser();
            analyser.fftSize = 256;
            source.connect(analyser);

            const bufferLength = analyser.frequencyBinCount;
            const dataArray = new Uint8Array(bufferLength);

            let silenceStart = Date.now();
            let isSpeaking = false;
            let silenceThreshold = 50; // Increased threshold to 50
            let silenceDuration = 1000; // Reduced to 1 second
            let maxDuration = 10000; // 10 seconds max recording time
            let recordingStart = Date.now();

            const checkSilence = () => {
                if (!isLiveModeRef.current || mediaRecorder.state !== 'recording') {
                    if (audioContext.state !== 'closed') audioContext.close();
                    return;
                }

                analyser.getByteFrequencyData(dataArray);
                const average = dataArray.reduce((a, b) => a + b) / bufferLength;

                // Update volume level for visual feedback
                setVolumeLevel(average);

                if (average > silenceThreshold) {
                    silenceStart = Date.now();
                    if (!isSpeaking) {
                        isSpeaking = true;
                        setIsSpeakingState(true);
                    }
                } else if (isSpeaking) {
                    if (Date.now() - silenceStart > silenceDuration) {
                        console.log("Silence detected, stopping recording...");
                        stopRecording();
                        isSpeaking = false;
                        setIsSpeakingState(false);
                        if (audioContext.state !== 'closed') audioContext.close();
                        return;
                    }
                }

                // Max duration safety check
                if (Date.now() - recordingStart > maxDuration) {
                    console.log("Max duration reached, stopping recording...");
                    stopRecording();
                    if (audioContext.state !== 'closed') audioContext.close();
                    return;
                }

                requestAnimationFrame(checkSilence);
            };

            mediaRecorder.ondataavailable = (event) => {
                if (event.data.size > 0) {
                    audioChunksRef.current.push(event.data);
                }
            };

            mediaRecorder.onstop = async () => {
                const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
                setIsProcessing(true);
                setVolumeLevel(0); // Reset volume visual
                setIsSpeakingState(false);
                try {
                    const data = await sendVoiceMessage(audioBlob);

                    const audio = new Audio(`data:audio/mp3;base64,${data.audio_base64}`);

                    audio.onended = () => {
                        if (isLiveModeRef.current) {
                            setTimeout(() => startRecording(), 500);
                        }
                    };

                    audio.play();

                    setMessages(prev => [...prev,
                    { role: 'assistant', content: data.text_response }
                    ]);
                } catch (error) {
                    console.error("Error processing voice:", error);
                    // Retry listening even on error if still in live mode
                    if (isLiveModeRef.current) {
                        setTimeout(() => startRecording(), 1000);
                    }
                } finally {
                    setIsProcessing(false);
                }

                stream.getTracks().forEach(track => track.stop());
                if (audioContext.state !== 'closed') audioContext.close();
            };

            mediaRecorder.start();
            setIsRecording(true);
            checkSilence();

        } catch (err) {
            console.error("Error accessing microphone:", err);
            if (isLiveModeRef.current) {
                setIsLiveMode(false);
                alert(t('mic_access_error'));
            }
        }
    };

    const stopRecording = () => {
        if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
            mediaRecorderRef.current.stop();
            setIsRecording(false);
        }
    };

    return (
        <div className="flex flex-col h-full bg-background md:rounded-2xl md:shadow-xl md:border border-border overflow-hidden relative font-sans">

            {/* Header - Desktop & Mobile */}
            <div className="absolute top-0 left-0 right-0 pt-safe h-[calc(3.5rem+env(safe-area-inset-top))] bg-background/80 backdrop-blur-md border-b border-border z-10 flex items-center px-4 justify-between transition-all duration-300">
                <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-primary to-purple-600 flex items-center justify-center text-primary-foreground shadow-lg shadow-primary/20">
                        <Bot size={20} />
                    </div>
                    <div>
                        <h3 className="font-bold text-foreground text-sm">Kirana Assistant</h3>
                        <p className="text-[10px] font-medium text-green-500 flex items-center gap-1.5 bg-green-500/10 px-2 py-0.5 rounded-full w-fit">
                            <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" /> {t('online')}
                        </p>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    <ThemeToggle />
                    <button
                        onClick={() => setIsLiveMode(true)}
                        className="p-2.5 bg-primary/10 text-primary rounded-full hover:bg-primary/20 transition-colors active:scale-95"
                        title={t('live_mode')}
                    >
                        <Mic size={20} />
                    </button>
                </div>
            </div>

            {/* Gemini Live Style Overlay */}
            {/* Gemini Live Style Overlay */}
            {isLiveMode && (
                <div className="absolute inset-0 z-50 bg-background/95 backdrop-blur-xl flex flex-col items-center justify-center transition-all duration-500 animate-in fade-in">

                    {/* Top Controls */}
                    <div className="absolute top-0 left-0 right-0 p-6 pt-safe flex justify-between items-center z-10">
                        <div className="flex items-center gap-2 text-foreground/70">
                            <Sparkles size={18} className="text-primary" />
                            <span className="text-sm font-medium tracking-wide">KiranaAI</span>
                        </div>
                        <button
                            onClick={() => setIsLiveMode(false)}
                            className="p-3 bg-muted hover:bg-muted/80 rounded-full text-foreground transition-colors"
                        >
                            <X size={24} />
                        </button>
                    </div>

                    {/* Main Visualizer */}
                    <div className="flex-1 flex flex-col items-center justify-center w-full relative">

                        {/* Status Text */}
                        <div className="absolute top-1/4 text-center space-y-2 animate-in slide-in-from-bottom-4 duration-700">
                            <h2 className="text-2xl md:text-3xl font-semibold text-foreground tracking-tight">
                                {isProcessing ? t('thinking') : isSpeakingState ? t('hearing') : t('listening')}
                            </h2>
                        </div>

                        {/* Abstract Waveform / Orb */}
                        <div className="relative w-64 h-64 flex items-center justify-center">
                            {/* Core Orb */}
                            <div
                                className={cn(
                                    "absolute w-32 h-32 rounded-full blur-3xl transition-all duration-100", // Faster transition for volume
                                    isRecording ? (isSpeakingState ? "bg-primary/60" : "bg-primary/40") : "bg-secondary/40",
                                    isProcessing && "bg-purple-500/60 animate-pulse"
                                )}
                                style={{
                                    transform: isRecording ? `scale(${1 + Math.min(volumeLevel / 50, 1)})` : 'scale(1)'
                                }}
                            />

                            {/* Outer Rings */}
                            <div className={cn(
                                "absolute inset-0 border-2 rounded-full opacity-20 transition-all duration-1000",
                                isRecording ? "border-primary animate-ping-slow" : "border-muted-foreground scale-90"
                            )} />
                            <div className={cn(
                                "absolute inset-0 border border-primary/10 rounded-full scale-150 opacity-10",
                                isRecording && "animate-spin-slow"
                            )} />

                            {/* Center Icon (Optional, can be removed for pure abstract look) */}
                            <div className={cn(
                                "relative z-10 w-20 h-20 rounded-full flex items-center justify-center transition-transform duration-500",
                                isRecording ? "scale-110" : "scale-100"
                            )}>
                                {isProcessing ? (
                                    <Loader2 size={40} className="text-primary animate-spin" />
                                ) : (
                                    <div className="flex gap-1 h-8 items-center">
                                        {[...Array(5)].map((_, i) => (
                                            <div
                                                key={i}
                                                className={cn(
                                                    "w-1.5 bg-foreground rounded-full transition-all duration-200",
                                                    isRecording ? "animate-wave" : "h-1.5 opacity-50"
                                                )}
                                                style={{
                                                    height: isRecording ? `${10 + Math.random() * 20 + volumeLevel}px` : '6px', // Dynamic height
                                                    animationDelay: `${i * 0.1}s`
                                                }}
                                            />
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* Bottom Controls */}
                    <div className="p-8 w-full flex justify-center pb-safe">
                        <button
                            onClick={() => setIsLiveMode(false)}
                            className="px-8 py-3 rounded-full bg-destructive/10 text-destructive border border-destructive/20 font-medium hover:bg-destructive/20 transition-colors"
                        >
                            {t('end_session')}
                        </button>
                    </div>
                </div>
            )}

            {/* Messages Area */}
            <div className="flex-1 overflow-y-auto p-4 pt-[calc(4rem+env(safe-area-inset-top))] space-y-6 scroll-smooth no-scrollbar">
                {messages.map((msg, index) => (
                    <div
                        key={index}
                        className={cn(
                            "flex gap-3 max-w-[90%] md:max-w-[80%] animate-in slide-in-from-bottom-2 duration-300",
                            msg.role === 'user' ? "ml-auto flex-row-reverse" : ""
                        )}
                    >
                        <div className={cn(
                            "w-8 h-8 rounded-xl flex items-center justify-center shrink-0 shadow-sm border border-border",
                            msg.role === 'user'
                                ? "bg-primary text-primary-foreground"
                                : "bg-card text-foreground"
                        )}>
                            {msg.role === 'user' ? <User size={16} /> : <Bot size={16} />}
                        </div>

                        <div className={cn(
                            "p-3.5 rounded-2xl text-[15px] shadow-sm leading-relaxed",
                            msg.role === 'user'
                                ? "bg-primary text-primary-foreground rounded-tr-sm"
                                : "bg-card text-card-foreground rounded-tl-sm border border-border"
                        )}>
                            <div className="prose prose-sm prose-invert max-w-none">
                                <ReactMarkdown
                                    remarkPlugins={[remarkGfm]}
                                    rehypePlugins={[rehypeHighlight]}
                                    components={{
                                        table: ({ node, ...props }) => (
                                            <div className="overflow-x-auto my-3 rounded-lg border border-border bg-muted/50 shadow-inner">
                                                <table className="min-w-full divide-y divide-border" {...props} />
                                            </div>
                                        ),
                                        thead: ({ node, ...props }) => <thead className="bg-muted" {...props} />,
                                        th: ({ node, ...props }) => <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider" {...props} />,
                                        tbody: ({ node, ...props }) => <tbody className="divide-y divide-border" {...props} />,
                                        tr: ({ node, ...props }) => <tr className="hover:bg-muted/50 transition-colors" {...props} />,
                                        td: ({ node, ...props }) => <td className="px-4 py-3 text-sm text-foreground whitespace-nowrap" {...props} />,
                                        p: ({ node, ...props }) => <p className="mb-2 last:mb-0" {...props} />,
                                        ul: ({ node, ...props }) => <ul className="list-disc pl-4 mb-2 space-y-1" {...props} />,
                                        ol: ({ node, ...props }) => <ol className="list-decimal pl-4 mb-2 space-y-1" {...props} />,
                                    }}
                                >
                                    {msg.content}
                                </ReactMarkdown>
                            </div>
                        </div>
                    </div>
                ))}
                {isLoading && (
                    <div className="flex gap-4 animate-in fade-in duration-300">
                        <div className="w-8 h-8 rounded-xl bg-card text-foreground flex items-center justify-center shrink-0 shadow-sm border border-border">
                            <Bot size={16} />
                        </div>
                        <div className="bg-card p-4 rounded-2xl rounded-tl-sm border border-border shadow-sm flex items-center gap-3">
                            <Loader2 className="w-4 h-4 animate-spin text-primary" />
                            <span className="text-sm text-muted-foreground">{t('thinking')}</span>
                        </div>
                    </div>
                )}
                <div ref={messagesEndRef} className="h-4" />
            </div>

            {/* Input Area */}
            <div className="p-3 bg-background/80 backdrop-blur-xl border-t border-border sticky bottom-0 z-20 pb-[calc(env(safe-area-inset-bottom,0px)+0.5rem)] md:pb-4">
                <form onSubmit={handleSend} className="flex gap-2 items-end max-w-4xl mx-auto">
                    <div className="flex-1 relative bg-muted/50 rounded-2xl border border-transparent focus-within:border-primary/50 focus-within:bg-background transition-all duration-200">
                        <input
                            type="text"
                            value={input}
                            onChange={(e) => setInput(e.target.value)}
                            placeholder={t('ask_anything')}
                            className="w-full pl-4 pr-12 py-3.5 bg-transparent text-foreground placeholder-muted-foreground focus:outline-none rounded-2xl"
                            disabled={isLoading}
                        />
                        <button
                            type="submit"
                            disabled={isLoading || !input.trim()}
                            className="absolute right-1.5 bottom-1.5 p-2 bg-primary text-primary-foreground rounded-xl hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-sm active:scale-95"
                        >
                            <Send size={18} />
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};

export default ChatInterface;
