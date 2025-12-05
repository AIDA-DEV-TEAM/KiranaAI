import React, { useState, useRef, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeHighlight from 'rehype-highlight';
import 'highlight.js/styles/github-dark.css';
import { Send, Bot, User, Loader2, Mic, X, Radio, Sparkles, Volume2 } from 'lucide-react';
import { chatWithData, getTTS } from '../services/api';
import { cn } from '../lib/utils';
import { SpeechRecognition } from '@capacitor-community/speech-recognition';
import { Capacitor } from '@capacitor/core';
import { useTranslation } from 'react-i18next';

const ChatInterface = ({ messages, setMessages }) => {
    const { t, i18n } = useTranslation();
    const [input, setInput] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [isListening, setIsListening] = useState(false);
    const [isSpeaking, setIsSpeaking] = useState(false);
    const [isLiveMode, setIsLiveMode] = useState(false);

    const messagesEndRef = useRef(null);
    const recognitionRef = useRef(null);
    const audioRef = useRef(new Audio());

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    };

    useEffect(() => {
        scrollToBottom();
    }, [messages, isLoading]);

    // Initialize Web Speech API for browser
    useEffect(() => {
        if (!Capacitor.isNativePlatform() && 'webkitSpeechRecognition' in window) {
            const recognition = new window.webkitSpeechRecognition();
            recognition.continuous = false;
            recognition.interimResults = true;
            recognition.lang = i18n.language === 'hi' ? 'hi-IN' : 'en-US';

            recognition.onstart = () => setIsListening(true);
            recognition.onend = () => setIsListening(false);

            recognition.onresult = (event) => {
                const transcript = Array.from(event.results)
                    .map(result => result[0].transcript)
                    .join('');
                setInput(transcript);

                if (event.results[0].isFinal) {
                    handleSend(null, transcript, 'voice');
                }
            };

            recognitionRef.current = recognition;
        }
    }, [i18n.language]);

    const handleSend = async (e, textOverride = null, source = 'text') => {
        if (e) e.preventDefault();
        const textToSend = textOverride || input;

        if (!textToSend.trim()) return;

        if (isListening) stopListening();
        if (isSpeaking) {
            audioRef.current.pause();
            setIsSpeaking(false);
        }

        setInput('');
        setMessages(prev => [...prev, { role: 'user', content: textToSend }]);
        setIsLoading(true);

        try {
            const history = messages.slice(1).map(msg => ({
                role: msg.role,
                content: msg.content
            }));

            const data = await chatWithData(textToSend, history, i18n.language);
            const responseText = data.response;

            setMessages(prev => [...prev, {
                role: 'assistant',
                content: responseText,
                sql: data.sql_query
            }]);

            // Only speak if source is voice or live mode is active
            if (source === 'voice' || isLiveMode) {
                playTTS(responseText, isLiveMode);
            }

        } catch (error) {
            console.error("Chat error:", error);
            setMessages(prev => [...prev, {
                role: 'assistant',
                content: t('error_processing_request')
            }]);
            setIsLoading(false);
        } finally {
            setIsLoading(false);
        }
    };

    const playTTS = async (text, autoRestartListening = false) => {
        try {
            // Optimize text for speech: Remove markdown tables and code blocks
            // 1. Remove code blocks
            let speakableText = text.replace(/```[\s\S]*?```/g, '');
            // 2. Remove tables (lines starting with |)
            speakableText = speakableText.replace(/^\|.*$/gm, '');
            // 3. Remove table separators (lines with - and |)
            speakableText = speakableText.replace(/^[-| :]+$/gm, '');
            // 4. Clean up extra whitespace
            speakableText = speakableText.replace(/\n+/g, ' ').trim();

            // If text is too long, maybe just speak the first sentence?
            // For now, let's just speak the cleaned text.
            if (!speakableText) return; // Nothing to speak (e.g. only table)

            setIsSpeaking(true);
            const audioBlob = await getTTS(speakableText, i18n.language);
            const audioUrl = URL.createObjectURL(audioBlob);

            audioRef.current.src = audioUrl;
            audioRef.current.onended = () => {
                setIsSpeaking(false);
                URL.revokeObjectURL(audioUrl);
                if (autoRestartListening && isLiveMode) {
                    setTimeout(() => startListening(), 500);
                }
            };
            audioRef.current.play();
        } catch (error) {
            console.error("TTS Error:", error);
            setIsSpeaking(false);
        }
    };

    const silenceTimer = useRef(null);

    const startListening = async () => {
        if (Capacitor.isNativePlatform()) {
            try {
                const { available } = await SpeechRecognition.available();
                if (available) {
                    setIsListening(true);
                    SpeechRecognition.start({
                        language: i18n.language === 'hi' ? 'hi-IN' : 'en-US',
                        partialResults: true,
                        popup: false,
                    });

                    SpeechRecognition.addListener('partialResults', (data) => {
                        if (data.matches && data.matches.length > 0) {
                            const transcript = data.matches[0];
                            setInput(transcript);

                            // Auto-send after silence
                            if (silenceTimer.current) clearTimeout(silenceTimer.current);
                            silenceTimer.current = setTimeout(() => {
                                handleSend(null, transcript, 'voice');
                            }, 1500);
                        }
                    });
                }
            } catch (e) {
                console.error("Native speech error:", e);
                setIsListening(false);
            }
        } else {
            recognitionRef.current?.start();
        }
    };

    const stopListening = async () => {
        if (silenceTimer.current) clearTimeout(silenceTimer.current);
        if (Capacitor.isNativePlatform()) {
            await SpeechRecognition.stop();
            setIsListening(false);
        } else {
            recognitionRef.current?.stop();
        }
    };

    const toggleLiveMode = () => {
        if (isLiveMode) {
            setIsLiveMode(false);
            stopListening();
            if (isSpeaking) {
                audioRef.current.pause();
                setIsSpeaking(false);
            }
        } else {
            setIsLiveMode(true);
            startListening();
        }
    };

    const toggleListening = () => {
        if (isListening) {
            stopListening();
        } else {
            startListening();
        }
    };

    return (
        <div className="flex flex-col h-full bg-background md:rounded-2xl md:shadow-xl md:border border-border overflow-hidden relative font-sans">

            {/* Header */}
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

                {/* Live Mode Toggle Button */}
                <button
                    onClick={toggleLiveMode}
                    className={cn(
                        "p-2.5 rounded-full transition-all active:scale-95",
                        isLiveMode
                            ? "bg-red-500/10 text-red-500 animate-pulse"
                            : "bg-primary/10 text-primary hover:bg-primary/20"
                    )}
                    title={t('live_mode')}
                >
                    {isLiveMode ? <X size={20} /> : <Mic size={20} />}
                </button>
            </div>

            {/* Live Mode Overlay */}
            {isLiveMode && (
                <div className="absolute inset-0 z-50 bg-background/95 backdrop-blur-xl flex flex-col items-center justify-center transition-all duration-500 animate-in fade-in">

                    {/* Top Controls */}
                    <div className="absolute top-0 left-0 right-0 p-6 pt-safe flex justify-between items-center z-10">
                        <div className="flex items-center gap-2 text-foreground/70">
                            <Sparkles size={18} className="text-primary" />
                            <span className="text-sm font-medium tracking-wide">KiranaAI Live</span>
                        </div>
                        <button
                            onClick={toggleLiveMode}
                            className="p-3 bg-muted hover:bg-muted/80 rounded-full text-foreground transition-colors"
                        >
                            <X size={24} />
                        </button>
                    </div>

                    {/* Visualizer */}
                    <div className="flex-1 flex flex-col items-center justify-center w-full relative px-6">

                        {/* Status Text */}
                        <div className="absolute top-1/4 text-center space-y-2 animate-in slide-in-from-bottom-4 duration-700 w-full">
                            <h2 className="text-2xl md:text-3xl font-semibold text-foreground tracking-tight">
                                {isLoading ? t('thinking') : isSpeaking ? t('speaking') : t('listening')}
                            </h2>
                            {/* Show live transcript or response preview */}
                            <p className="text-muted-foreground text-lg max-w-md mx-auto line-clamp-3">
                                {isLoading ? "..." : (input || (messages[messages.length - 1]?.role === 'assistant' ? messages[messages.length - 1].content : ""))}
                            </p>
                        </div>

                        {/* Orb Animation */}
                        <div className="relative w-64 h-64 flex items-center justify-center mt-12">
                            <div
                                className={cn(
                                    "absolute w-32 h-32 rounded-full blur-3xl transition-all duration-300",
                                    isListening ? "bg-primary/60 scale-110" : "bg-secondary/40",
                                    isLoading && "bg-purple-500/60 animate-pulse",
                                    isSpeaking && "bg-green-500/60 scale-125"
                                )}
                            />
                            <div className={cn(
                                "absolute inset-0 border-2 rounded-full opacity-20 transition-all duration-1000",
                                isListening ? "border-primary animate-ping-slow" : "border-muted-foreground scale-90"
                            )} />

                            <div className={cn(
                                "relative z-10 w-24 h-24 rounded-full flex items-center justify-center transition-transform duration-500 bg-background/50 backdrop-blur-sm border border-white/10",
                                isListening ? "scale-110" : "scale-100"
                            )}>
                                {isLoading ? (
                                    <Loader2 size={48} className="text-primary animate-spin" />
                                ) : isSpeaking ? (
                                    <Volume2 size={48} className="text-green-500 animate-pulse" />
                                ) : (
                                    <Mic size={48} className={cn("text-foreground", isListening && "text-primary")} />
                                )}
                            </div>
                        </div>
                    </div>

                    {/* Bottom Controls */}
                    <div className="p-8 w-full flex justify-center pb-safe">
                        <button
                            onClick={toggleLiveMode}
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
                                            <div className="overflow-x-auto my-4 rounded-xl border border-border/50 bg-card shadow-sm max-w-[calc(100vw-4rem)] md:max-w-full">
                                                <table className="min-w-full divide-y divide-border/50" {...props} />
                                            </div>
                                        ),
                                        thead: ({ node, ...props }) => (
                                            <thead className="bg-muted/50 text-xs uppercase font-semibold text-muted-foreground tracking-wider" {...props} />
                                        ),
                                        th: ({ node, ...props }) => (
                                            <th className="px-5 py-4 text-left" {...props} />
                                        ),
                                        tbody: ({ node, ...props }) => (
                                            <tbody className="divide-y divide-border/50 bg-card" {...props} />
                                        ),
                                        tr: ({ node, ...props }) => (
                                            <tr className="hover:bg-muted/30 transition-colors duration-150 group" {...props} />
                                        ),
                                        td: ({ node, ...props }) => (
                                            <td className="px-5 py-3.5 text-sm text-foreground whitespace-nowrap group-hover:text-primary transition-colors" {...props} />
                                        ),
                                        p: ({ node, ...props }) => <p className="mb-3 last:mb-0 leading-relaxed" {...props} />,
                                        ul: ({ node, ...props }) => <ul className="list-disc pl-5 mb-3 space-y-1.5 marker:text-primary" {...props} />,
                                        ol: ({ node, ...props }) => <ol className="list-decimal pl-5 mb-3 space-y-1.5 marker:text-primary" {...props} />,
                                        strong: ({ node, ...props }) => <strong className="font-semibold text-primary" {...props} />,
                                        blockquote: ({ node, ...props }) => (
                                            <blockquote className="border-l-4 border-primary/50 pl-4 italic text-muted-foreground my-4" {...props} />
                                        ),
                                        code: ({ node, inline, className, children, ...props }) => {
                                            const match = /language-(\w+)/.exec(className || '');
                                            return !inline && match ? (
                                                <div className="relative rounded-lg overflow-hidden my-4 border border-border/50 shadow-sm">
                                                    <div className="bg-muted/50 px-4 py-2 text-xs font-mono text-muted-foreground border-b border-border/50 flex justify-between">
                                                        <span>{match[1]}</span>
                                                    </div>
                                                    <code className={className} {...props}>
                                                        {children}
                                                    </code>
                                                </div>
                                            ) : (
                                                <code className="bg-muted/50 px-1.5 py-0.5 rounded text-sm font-mono text-primary" {...props}>
                                                    {children}
                                                </code>
                                            );
                                        }
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
                <form onSubmit={(e) => handleSend(e)} className="flex gap-2 items-end max-w-4xl mx-auto">
                    <div className="flex-1 relative bg-muted/50 rounded-2xl border border-transparent focus-within:border-primary/50 focus-within:bg-background transition-all duration-200 flex items-center">
                        <input
                            type="text"
                            value={input}
                            onChange={(e) => setInput(e.target.value)}
                            placeholder={t('ask_anything')}
                            className="w-full px-4 py-3.5 bg-transparent text-foreground placeholder-muted-foreground focus:outline-none rounded-2xl"
                            disabled={isLoading}
                        />
                    </div>

                    <button
                        type="submit"
                        disabled={isLoading || !input.trim()}
                        className="p-3.5 bg-primary text-primary-foreground rounded-2xl hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-sm active:scale-95"
                    >
                        <Send size={20} />
                    </button>
                </form>
            </div>
        </div>
    );
};

export default ChatInterface;
