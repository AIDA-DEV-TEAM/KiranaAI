import React, { useState, useRef, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeHighlight from 'rehype-highlight';
import 'highlight.js/styles/github-dark.css';
import { Send, Bot, User, Loader2, Mic } from 'lucide-react';
import { chatWithData } from '../services/api';
import { cn } from '../lib/utils';
import { useTranslation } from 'react-i18next';
import { useVoiceManager } from '../hooks/useVoiceManager';

import { useAppData } from '../context/AppDataContext';

const ChatInterface = () => {
    const { t, i18n } = useTranslation();
    const { refreshInventory, refreshSales, messages, setMessages, addMessage, refreshAllData } = useAppData();
    const [input, setInput] = useState('');
    const [isLoading, setIsLoading] = useState(false);

    const messagesEndRef = useRef(null);

    // Voice Manager
    const {
        voiceState,
        transcript,
        aiResponse,
        error: voiceError,
        isActive: isVoiceModeActive,
        startVoiceMode,
        stopVoiceMode
    } = useVoiceManager(i18n.language, addMessage, refreshAllData);

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    };

    useEffect(() => {
        scrollToBottom();
    }, [messages, isLoading]);

    const handleSend = async (e) => {
        if (e) e.preventDefault();

        if (input.trim() === '') return;

        setInput('');
        const newMessages = [...messages, { role: 'user', content: input }];
        setMessages(newMessages);
        setIsLoading(true);

        try {
            const history = newMessages.slice(1).map(msg => ({
                role: msg.role,
                content: msg.content
            }));

            // 15s Timeout for API call to prevent infinite loading
            const apiCall = chatWithData(input, history, i18n.language);
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

            // Refresh data if action was performed
            if (data.action_performed) {
                console.log("Action performed, refreshing data...");
                refreshInventory(true);
                refreshSales(true);
            }

        } catch (error) {
            console.error("Chat error:", error);
            const errorText = t('error_processing_request') || "I'm having trouble processing your request. Please try again.";

            setMessages(prev => [...prev, {
                role: 'assistant',
                content: errorText
            }]);
        } finally {
            setIsLoading(false);
        }
    };

    // Handle voice mode toggle
    const handleVoiceModeToggle = async () => {
        if (isVoiceModeActive) {
            await stopVoiceMode();
        } else {
            await startVoiceMode();
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

            </div>

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
                {/* Voice Status Indicator */}
                {(isVoiceModeActive || isLoading) && (
                    <div className="mb-2 flex items-center justify-center gap-2 animate-in fade-in slide-in-from-bottom-2">
                        <div className={cn(
                            "px-4 py-1.5 rounded-full text-xs font-semibold shadow-sm border flex items-center gap-2",
                            voiceState === 'listening' ? "bg-red-500/10 text-red-600 border-red-200" :
                                (voiceState === 'thinking' || isLoading) ? "bg-blue-500/10 text-blue-600 border-blue-200" :
                                    "bg-muted text-muted-foreground border-border"
                        )}>
                            {voiceState === 'listening' && (
                                <>
                                    <span className="relative flex h-2 w-2">
                                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                                        <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500"></span>
                                    </span>
                                    Listening...
                                </>
                            )}
                            {(voiceState === 'thinking' || isLoading) && (
                                <>
                                    <Loader2 className="w-3 h-3 animate-spin" />
                                    Processing...
                                </>
                            )}
                        </div>
                    </div>
                )}
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
                        {/* Integrated Voice Button */}
                        <button
                            type="button"
                            onClick={handleVoiceModeToggle}
                            className={cn(
                                "p-2.5 mr-1 rounded-xl transition-all flex items-center justify-center",
                                isVoiceModeActive
                                    ? "bg-destructive text-destructive-foreground animate-pulse shadow-sm"
                                    : "text-muted-foreground hover:bg-background hover:text-foreground"
                            )}
                            title={isVoiceModeActive ? t('tap_to_stop_voice') : t('start_voice_mode')}
                        >
                            {isVoiceModeActive ? <Loader2 size={20} className="animate-spin" /> : <Mic size={20} />}
                        </button>
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

            {/* Voice Mode Modal Removed to prevent screen switching */}
            {/* <VoiceModeModal ... /> */}
        </div>
    );
};

export default ChatInterface;
