import React, { useState, useRef, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeHighlight from 'rehype-highlight';
import 'highlight.js/styles/github-dark.css';
import { Send, Bot, User, Loader2, Mic, X, Radio, Sparkles, Volume2 } from 'lucide-react';
import { chatWithData } from '../services/api';
import { cn } from '../lib/utils';
import { useTranslation } from 'react-i18next';
import { useVoiceManager, VoiceState } from '../hooks/useVoiceManager';

const ChatInterface = ({ messages, setMessages }) => {
    const { t, i18n } = useTranslation();
    const [input, setInput] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [isLiveMode, setIsLiveMode] = useState(false);
    const [errorMessage, setErrorMessage] = useState('');

    const messagesEndRef = useRef(null);

    // Internal handler for voice input completion
    const handleVoiceInput = (text) => {
        handleSend(null, text, 'voice');
    };

    // Error handler for voice issues
    const handleVoiceError = (message) => {
        console.error('[ChatInterface] Voice error:', message);
        setErrorMessage(message);
        // Auto-dismiss after 5 seconds
        setTimeout(() => setErrorMessage(''), 5000);
    };

    // Helper to get correct locale for Indian languages
    const getVoiceLocale = (lang) => {
        const localeMap = {
            'hi': 'hi-IN',
            'bn': 'bn-IN',
            'te': 'te-IN',
            'ta': 'ta-IN',
            'mr': 'mr-IN',
            'gu': 'gu-IN',
            'kn': 'kn-IN',
            'ml': 'ml-IN',
            'pa': 'pa-IN',
            'en': 'en-IN'
        };
        return localeMap[lang] || 'en-IN';
    };

    const {
        voiceState,
        transcript,
        isSpeaking,
        isStarting,
        startListening,
        stopListening,
        speakResponse,
        cancelOutput
    } = useVoiceManager({
        language: getVoiceLocale(i18n.language),
        onInputComplete: handleVoiceInput,
        onError: handleVoiceError
    });

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    };

    useEffect(() => {
        scrollToBottom();
    }, [messages, isLoading]);

    // Sync transcript to input for visibility
    useEffect(() => {
        if (voiceState === VoiceState.LISTENING && transcript) {
            setInput(transcript);
        }
    }, [voiceState, transcript]);

    const handleSend = async (e, textOverride = null, source = 'text') => {
        if (e) e.preventDefault();

        const currentInput = textOverride || input;

        if (currentInput.trim() === '') return;

        // If manual send while speaking, stop speaking
        if (voiceState === VoiceState.SPEAKING) {
            cancelOutput();
        }

        setInput('');
        const newMessages = [...messages, { role: 'user', content: currentInput }];
        setMessages(newMessages);
        setIsLoading(true);

        try {
            const history = newMessages.slice(1).map(msg => ({
                role: msg.role,
                content: msg.content
            }));

            // 15s Timeout for API call to prevent infinite loading
            const apiCall = chatWithData(currentInput, history, i18n.language);
            const timeoutPromise = new Promise((_, reject) =>
                setTimeout(() => reject(new Error("Request timed out")), 15000)
            );

            const data = await Promise.race([apiCall, timeoutPromise]);
            const responseText = data.response;

            setMessages(prev => [...prev, {
                role: 'assistant',
                content: responseText,
                sql: data.sql_query
            }]);

            // If source was voice or we are in live mode, speak the response
            if (source === 'voice' || isLiveMode) {
                // Optimize text for speech
                let speakableText = responseText.replace(/```[\s\S]*?```/g, '');
                speakableText = speakableText.replace(/^\|.*$/gm, '');
                speakableText = speakableText.replace(/^[-| :]+$/gm, '');
                speakableText = speakableText.replace(/\n+/g, ' ').trim();

                console.log(`[VoiceLoop] Speaking response (${speakableText.length} chars):`, speakableText.substring(0, 50) + "...");

                if (speakableText) {
                    speakResponse(speakableText);
                } else {
                    console.log("[VoiceLoop] Empty speakable text, restarting listener manually");
                    // If nothing to speak, ensure we go back to listening if in live mode
                    if (isLiveMode) {
                        setTimeout(() => startListening(), 500);
                    }
                }
            }

        } catch (error) {
            console.error("Chat error:", error);
            setMessages(prev => [...prev, {
                role: 'assistant',
                content: t('error_processing_request')
            }]);

            if (isLiveMode) {
                speakResponse(t('error_processing_request'));
            }
        } finally {
            setIsLoading(false);
        }
    };

    const toggleLiveMode = () => {
        if (isLiveMode) {
            setIsLiveMode(false);
            cancelOutput();
        } else {
            setIsLiveMode(true);
            startListening();
        }
    };

    // Derived UI states
    const isListening = voiceState === VoiceState.LISTENING;

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

                    {/* Error Toast */}
                    {errorMessage && (
                        <div className="absolute top-24 left-4 right-4 z-20 bg-destructive/10 border border-destructive/20 text-destructive px-4 py-3 rounded-xl shadow-lg animate-in slide-in-from-top-4 duration-300">
                            <p className="text-sm font-medium">{errorMessage}</p>
                        </div>
                    )}

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
                                {isStarting ? (t('starting') || "Starting...") :
                                    voiceState === VoiceState.PROCESSING || isLoading ? t('thinking') :
                                        voiceState === VoiceState.SPEAKING ? t('speaking') :
                                            voiceState === VoiceState.LISTENING ? t('listening') :
                                                (t('tap_to_resume') === 'tap_to_resume' ? "Tap to Resume" : t('tap_to_resume'))}
                            </h2>
                            {/* Show live transcript or response preview */}
                            <p className="text-muted-foreground text-lg max-w-md mx-auto line-clamp-3">
                                {voiceState === VoiceState.LISTENING ? transcript :
                                    isLoading ? "..." :
                                        (messages[messages.length - 1]?.role === 'assistant' ? messages[messages.length - 1].content : "")}
                            </p>
                        </div>

                        {/* Orb Animation */}
                        <div className="relative w-64 h-64 flex items-center justify-center mt-12">
                            <div
                                className={cn(
                                    "absolute w-32 h-32 rounded-full blur-3xl transition-all duration-300",
                                    voiceState === VoiceState.LISTENING ? "bg-primary/60 scale-110" : "bg-secondary/40",
                                    (voiceState === VoiceState.PROCESSING || isLoading) && "bg-purple-500/60 animate-pulse",
                                    voiceState === VoiceState.SPEAKING && "bg-green-500/60 scale-125"
                                )}
                            />
                            <div className={cn(
                                "absolute inset-0 border-2 rounded-full opacity-20 transition-all duration-1000",
                                voiceState === VoiceState.LISTENING ? "border-primary animate-ping-slow" : "border-muted-foreground scale-90"
                            )} />

                            <button
                                onClick={() => {
                                    if (voiceState === VoiceState.IDLE) startListening();
                                }}
                                disabled={voiceState !== VoiceState.IDLE}
                                className={cn(
                                    "relative z-10 w-24 h-24 rounded-full flex items-center justify-center transition-transform duration-500 bg-background/50 backdrop-blur-sm border border-white/10 outline-none",
                                    voiceState === VoiceState.LISTENING ? "scale-110" : "scale-100 cursor-pointer hover:scale-105"
                                )}>
                                {(voiceState === VoiceState.PROCESSING || isLoading || isStarting) ? (
                                    <Loader2 size={48} className="text-primary animate-spin" />
                                ) : voiceState === VoiceState.SPEAKING ? (
                                    <Volume2 size={48} className="text-green-500 animate-pulse" />
                                ) : (
                                    <Mic size={48} className={cn("text-foreground", isListening ? "text-primary" : "text-muted-foreground")} />
                                )}
                            </button>
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
