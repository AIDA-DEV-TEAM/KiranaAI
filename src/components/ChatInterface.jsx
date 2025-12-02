import React, { useState, useRef, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeHighlight from 'rehype-highlight';
import 'highlight.js/styles/github-dark.css';
import { Send, Bot, User, Loader2, Mic, X } from 'lucide-react';
import { chatWithData, api } from '../services/api';
import { cn } from '../lib/utils';
import {
    LiveKitRoom,
    RoomAudioRenderer,
    VoiceAssistantControlBar,
    BarVisualizer,
    useTracks,
    useRoomContext,
} from '@livekit/components-react';
import '@livekit/components-styles';
import { Track } from 'livekit-client';

const ChatInterface = ({ messages, setMessages }) => {
    const [input, setInput] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [isLiveMode, setIsLiveMode] = useState(false);
    const [token, setToken] = useState("");
    const [url, setUrl] = useState("");

    const messagesEndRef = useRef(null);

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
            // Format history for API
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

    const startLiveSession = async () => {
        try {
            setIsLoading(true);

            // Request microphone permission explicitly
            try {
                await navigator.mediaDevices.getUserMedia({ audio: true });
            } catch (err) {
                console.error("Microphone permission denied:", err);
                alert("Please grant microphone permission to use voice features.");
                setIsLoading(false);
                return;
            }

            // Fetch token from backend
            const response = await api.get('/api/live-chat/token');
            const data = response.data;
            setToken(data.token);
            setUrl(data.url);
            setIsLiveMode(true);
        } catch (error) {
            console.error("Failed to start live session:", error);
        } finally {
            setIsLoading(false);
        }
    };

    const stopLiveSession = () => {
        setIsLiveMode(false);
        setToken("");
        setUrl("");
    };

    return (
        <div className="flex flex-col h-[calc(100vh-8rem)] bg-slate-900 rounded-xl shadow-sm border border-slate-700 overflow-hidden relative">

            {/* LiveKit Room Overlay */}
            {isLiveMode && token && url && (
                <div className="absolute inset-0 z-50 bg-slate-900 flex flex-col">
                    <LiveKitRoom
                        token={token}
                        serverUrl={url}
                        connect={true}
                        audio={true}
                        video={false}
                        onDisconnected={stopLiveSession}
                        className="flex flex-col h-full"
                    >
                        <div className="flex-1 flex flex-col items-center justify-center space-y-8 p-8">
                            <div className="relative">
                                <div className="w-32 h-32 rounded-full bg-blue-600/20 animate-pulse absolute inset-0 blur-xl"></div>
                                <div className="w-32 h-32 rounded-full bg-slate-800 border-4 border-blue-500 flex items-center justify-center relative z-10 shadow-2xl">
                                    <Bot size={64} className="text-blue-400" />
                                </div>
                            </div>

                            <div className="h-16 w-full max-w-md flex items-center justify-center">
                                <BarVisualizer
                                    state="playing"
                                    barCount={7}
                                    trackRef={{ publication: { track: { source: Track.Source.Microphone } } }} // Placeholder, visualizer usually needs a track reference
                                    className="h-full w-full"
                                    options={{ color: '#60a5fa' }}
                                />
                            </div>

                            <p className="text-slate-400 text-lg font-medium animate-pulse">
                                KiranaAI is listening...
                            </p>
                        </div>

                        <div className="p-6 bg-slate-800 border-t border-slate-700">
                            <div className="flex justify-center gap-4">
                                <VoiceAssistantControlBar controls={{ leave: false, camera: false }} />
                                <button
                                    onClick={stopLiveSession}
                                    className="p-3 rounded-full bg-red-500/20 text-red-400 hover:bg-red-500/30 transition-colors"
                                >
                                    <X size={24} />
                                </button>
                            </div>
                        </div>
                        <RoomAudioRenderer />
                    </LiveKitRoom>
                </div>
            )}

            {/* Messages Area */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
                {messages.map((msg, index) => (
                    <div
                        key={index}
                        className={cn(
                            "flex gap-3 max-w-[85%]",
                            msg.role === 'user' ? "ml-auto flex-row-reverse" : ""
                        )}
                    >
                        <div className={cn(
                            "w-8 h-8 rounded-full flex items-center justify-center shrink-0 shadow-md",
                            msg.role === 'user' ? "bg-blue-600 text-white" : "bg-slate-700 text-blue-300"
                        )}>
                            {msg.role === 'user' ? <User size={16} /> : <Bot size={16} />}
                        </div>

                        <div className={cn(
                            "p-3 rounded-2xl text-sm shadow-md",
                            msg.role === 'user'
                                ? "bg-blue-600 text-white rounded-tr-none"
                                : "bg-slate-800 text-slate-200 rounded-tl-none border border-slate-700"
                        )}>
                            <div className="prose prose-sm prose-invert max-w-none">
                                <ReactMarkdown
                                    remarkPlugins={[remarkGfm]}
                                    rehypePlugins={[rehypeHighlight]}
                                    components={{
                                        table: ({ node, ...props }) => (
                                            <div className="overflow-x-auto my-2 rounded border border-slate-600 bg-slate-900/50">
                                                <table className="min-w-full divide-y divide-slate-700" {...props} />
                                            </div>
                                        ),
                                        thead: ({ node, ...props }) => <thead className="bg-slate-800" {...props} />,
                                        th: ({ node, ...props }) => <th className="px-3 py-2 text-left text-xs font-medium text-slate-300 uppercase" {...props} />,
                                        tbody: ({ node, ...props }) => <tbody className="divide-y divide-slate-700" {...props} />,
                                        tr: ({ node, ...props }) => <tr className="hover:bg-slate-800/50" {...props} />,
                                        td: ({ node, ...props }) => <td className="px-3 py-2 text-sm text-slate-300" {...props} />,
                                    }}
                                >
                                    {msg.content}
                                </ReactMarkdown>
                            </div>
                        </div>
                    </div>
                ))}
                {isLoading && !isLiveMode && (
                    <div className="flex gap-3">
                        <div className="w-8 h-8 rounded-full bg-slate-700 text-blue-300 flex items-center justify-center shrink-0">
                            <Bot size={16} />
                        </div>
                        <div className="bg-slate-800 p-3 rounded-2xl rounded-tl-none border border-slate-700">
                            <Loader2 className="w-5 h-5 animate-spin text-slate-400" />
                        </div>
                    </div>
                )}
                <div ref={messagesEndRef} />
            </div>

            {/* Input Area */}
            <div className="p-4 border-t border-slate-700 bg-slate-800">
                <form onSubmit={handleSend} className="flex gap-2 items-center">
                    <button
                        type="button"
                        onClick={startLiveSession}
                        disabled={isLoading}
                        className={cn(
                            "p-2 rounded-full transition-all duration-300 bg-slate-700 text-slate-300 hover:bg-slate-600",
                            isLoading ? "opacity-50 cursor-not-allowed" : ""
                        )}
                        title="Start Live Mode"
                    >
                        <Mic size={20} />
                    </button>

                    <input
                        type="text"
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        placeholder="Ask about your inventory or sales..."
                        className="flex-1 px-4 py-2 rounded-lg border border-slate-600 bg-slate-700 text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                        disabled={isLoading}
                    />
                    <button
                        type="submit"
                        disabled={isLoading || !input.trim()}
                        className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow-lg"
                    >
                        <Send size={20} />
                    </button>
                </form>
            </div>
        </div>
    );
};

export default ChatInterface;
