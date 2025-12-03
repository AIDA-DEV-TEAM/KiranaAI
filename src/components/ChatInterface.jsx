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

const ChatInterface = ({ messages, setMessages }) => {
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

            const data = await chatWithData(userMessage, history);
            setMessages(prev => [...prev, {
                role: 'assistant',
                content: data.response,
                sql: data.sql_query
            }]);

        } catch (error) {
            setMessages(prev => [...prev, {
                role: 'assistant',
                content: "Sorry, I encountered an error processing your request."
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
                    alert("Microphone permission is required. Please enable it in settings.");
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
                alert("Could not access microphone. Please ensure permissions are granted.");
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
        <div className="flex flex-col h-[calc(100dvh-4rem)] md:h-[calc(100vh-8rem)] bg-slate-50 dark:bg-slate-900 md:rounded-2xl md:shadow-xl md:border border-slate-200 dark:border-slate-800 overflow-hidden relative font-sans">

            {/* Header - Mobile Only */}
            <div className="md:hidden absolute top-0 left-0 right-0 h-14 bg-white/80 dark:bg-slate-900/80 backdrop-blur-md border-b border-slate-200 dark:border-slate-800 z-10 flex items-center px-4 justify-between">
                <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-indigo-500 to-purple-500 flex items-center justify-center text-white shadow-lg">
                        <Bot size={18} />
                    </div>
                    <div>
                        <h3 className="font-bold text-slate-800 dark:text-white text-sm">Kirana Assistant</h3>
                        <p className="text-xs text-green-500 flex items-center gap-1">
                            <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" /> Online
                        </p>
                    </div>
                </div>
                <button
                    onClick={() => setIsLiveMode(true)}
                    className="p-2 bg-indigo-50 dark:bg-slate-800 text-indigo-600 dark:text-indigo-400 rounded-full hover:bg-indigo-100 transition-colors"
                >
                    <Mic size={20} />
                </button>
            </div>

            {/* Gemini Live Style Overlay */}
            {isLiveMode && (
                <div className="absolute inset-0 z-50 bg-black flex flex-col items-center justify-center transition-all duration-500 animate-in fade-in">

                    {/* Top Controls */}
                    <div className="absolute top-0 left-0 right-0 p-6 flex justify-between items-center">
                        <div className="flex items-center gap-2 text-white/70">
                            <Sparkles size={18} className="text-indigo-400" />
                            <span className="text-sm font-medium tracking-wide">Gemini Live</span>
                        </div>
                        <button
                            onClick={() => setIsLiveMode(false)}
                            className="p-3 bg-white/10 hover:bg-white/20 rounded-full text-white transition-colors backdrop-blur-md"
                        >
                            <X size={24} />
                        </button>
                    </div>

                    {/* Main Visualizer */}
                    <div className="flex-1 flex flex-col items-center justify-center w-full relative">

                        {/* Status Text */}
                        <div className="absolute top-1/4 text-center space-y-2 animate-in slide-in-from-bottom-4 duration-700">
                            <h2 className="text-2xl md:text-3xl font-semibold text-white tracking-tight">
                                {isProcessing ? "Thinking..." : isSpeakingState ? "Hearing Voice..." : "Listening..."}
                            </h2>
                        </div>

                        {/* Abstract Waveform / Orb */}
                        <div className="relative w-64 h-64 flex items-center justify-center">
                            {/* Core Orb */}
                            <div
                                className={cn(
                                    "absolute w-32 h-32 rounded-full blur-3xl transition-all duration-100", // Faster transition for volume
                                    isRecording ? (isSpeakingState ? "bg-green-500/60" : "bg-indigo-500/60") : "bg-blue-500/40",
                                    isProcessing && "bg-purple-500/60 animate-pulse"
                                )}
                                style={{
                                    transform: isRecording ? `scale(${1 + Math.min(volumeLevel / 50, 1)})` : 'scale(1)'
                                }}
                            />

                            {/* Outer Rings */}
                            <div className={cn(
                                "absolute inset-0 border-2 rounded-full opacity-20 transition-all duration-1000",
                                isRecording ? "border-indigo-400 animate-ping-slow" : "border-slate-500 scale-90"
                            )} />
                            <div className={cn(
                                "absolute inset-0 border border-white/10 rounded-full scale-150 opacity-10",
                                isRecording && "animate-spin-slow"
                            )} />

                            {/* Center Icon (Optional, can be removed for pure abstract look) */}
                            <div className={cn(
                                "relative z-10 w-20 h-20 rounded-full flex items-center justify-center transition-transform duration-500",
                                isRecording ? "scale-110" : "scale-100"
                            )}>
                                {isProcessing ? (
                                    <Loader2 size={40} className="text-white animate-spin" />
                                ) : (
                                    <div className="flex gap-1 h-8 items-center">
                                        {[...Array(5)].map((_, i) => (
                                            <div
                                                key={i}
                                                className={cn(
                                                    "w-1.5 bg-white rounded-full transition-all duration-200",
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
                            className="px-8 py-3 rounded-full bg-red-500/20 text-red-400 border border-red-500/30 font-medium hover:bg-red-500/30 transition-colors"
                        >
                            End Session
                        </button>
                    </div>
                </div>
            )}

            {/* Messages Area */}
            <div className="flex-1 overflow-y-auto p-4 pt-20 md:pt-4 space-y-6 scroll-smooth no-scrollbar">
                {messages.map((msg, index) => (
                    <div
                        key={index}
                        className={cn(
                            "flex gap-4 max-w-[90%] md:max-w-[80%] animate-in slide-in-from-bottom-2 duration-300",
                            msg.role === 'user' ? "ml-auto flex-row-reverse" : ""
                        )}
                    >
                        <div className={cn(
                            "w-10 h-10 rounded-full flex items-center justify-center shrink-0 shadow-lg border-2 border-white dark:border-slate-700",
                            msg.role === 'user'
                                ? "bg-gradient-to-br from-blue-500 to-blue-600 text-white"
                                : "bg-gradient-to-br from-indigo-500 to-purple-500 text-white"
                        )}>
                            {msg.role === 'user' ? <User size={20} /> : <Bot size={20} />}
                        </div>

                        <div className={cn(
                            "p-4 rounded-2xl text-[15px] shadow-sm leading-relaxed",
                            msg.role === 'user'
                                ? "bg-blue-600 text-white rounded-tr-none shadow-blue-500/20"
                                : "bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 rounded-tl-none border border-slate-100 dark:border-slate-700 shadow-slate-200/50 dark:shadow-none"
                        )}>
                            <div className="prose prose-sm prose-invert max-w-none">
                                <ReactMarkdown
                                    remarkPlugins={[remarkGfm]}
                                    rehypePlugins={[rehypeHighlight]}
                                    components={{
                                        table: ({ node, ...props }) => (
                                            <div className="overflow-x-auto my-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/50 shadow-inner">
                                                <table className="min-w-full divide-y divide-slate-200 dark:divide-slate-700" {...props} />
                                            </div>
                                        ),
                                        thead: ({ node, ...props }) => <thead className="bg-slate-100 dark:bg-slate-800" {...props} />,
                                        th: ({ node, ...props }) => <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider" {...props} />,
                                        tbody: ({ node, ...props }) => <tbody className="divide-y divide-slate-200 dark:divide-slate-700" {...props} />,
                                        tr: ({ node, ...props }) => <tr className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors" {...props} />,
                                        td: ({ node, ...props }) => <td className="px-4 py-3 text-sm text-slate-600 dark:text-slate-300 whitespace-nowrap" {...props} />,
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
                        <div className="w-10 h-10 rounded-full bg-gradient-to-br from-indigo-500 to-purple-500 text-white flex items-center justify-center shrink-0 shadow-lg">
                            <Bot size={20} />
                        </div>
                        <div className="bg-white dark:bg-slate-800 p-4 rounded-2xl rounded-tl-none border border-slate-100 dark:border-slate-700 shadow-sm flex items-center gap-3">
                            <Loader2 className="w-5 h-5 animate-spin text-indigo-500" />
                            <span className="text-sm text-slate-500">Thinking...</span>
                        </div>
                    </div>
                )}
                <div ref={messagesEndRef} className="h-4" />
            </div>

            {/* Input Area */}
            <div className="p-4 bg-white/80 dark:bg-slate-900/80 backdrop-blur-lg border-t border-slate-200 dark:border-slate-800 sticky bottom-0 z-20 pb-safe">
                <form onSubmit={handleSend} className="flex gap-3 items-center max-w-4xl mx-auto">
                    <button
                        type="button"
                        onClick={() => setIsLiveMode(true)}
                        className="p-3 text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-900/20 hover:bg-indigo-100 dark:hover:bg-indigo-900/40 rounded-xl transition-all duration-200 active:scale-95 hidden md:flex"
                        title="Live Mode"
                    >
                        <Mic size={22} />
                    </button>
                    <div className="flex-1 relative">
                        <input
                            type="text"
                            value={input}
                            onChange={(e) => setInput(e.target.value)}
                            placeholder="Ask about inventory, sales, or prices..."
                            className="w-full pl-5 pr-12 py-3.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 transition-all shadow-sm"
                            disabled={isLoading}
                        />
                        <button
                            type="submit"
                            disabled={isLoading || !input.trim()}
                            className="absolute right-2 top-1/2 -translate-y-1/2 p-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-md hover:shadow-lg active:scale-95"
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
