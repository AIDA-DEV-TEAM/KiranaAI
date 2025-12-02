import React, { useState, useRef, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeHighlight from 'rehype-highlight';
import 'highlight.js/styles/github-dark.css';
import { Send, Bot, User, Loader2, Mic, MicOff, Radio } from 'lucide-react';
import { chatWithData } from '../services/api';
import { cn } from '../lib/utils';

const ChatInterface = ({ messages, setMessages }) => {
    const [input, setInput] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [isRecording, setIsRecording] = useState(false);
    const [isLiveMode, setIsLiveMode] = useState(false);
    const [isConnected, setIsConnected] = useState(false);

    const messagesEndRef = useRef(null);
    const websocketRef = useRef(null);
    const audioContextRef = useRef(null);
    const processorRef = useRef(null);
    const sourceRef = useRef(null);
    const audioQueueRef = useRef([]);
    const isPlayingRef = useRef(false);

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    };

    useEffect(() => {
        scrollToBottom();
    }, [messages, isLoading]);

    // Cleanup on unmount
    useEffect(() => {
        return () => {
            stopLiveSession();
        };
    }, []);

    const handleSend = async (e) => {
        if (e) e.preventDefault();
        if (!input.trim()) return;

        const userMessage = input;
        setInput('');
        setMessages(prev => [...prev, { role: 'user', content: userMessage }]);
        setIsLoading(true);

        try {
            // Format history for API (exclude the new message we just added locally AND the initial greeting)
            // Assuming the first message is always the static greeting
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

    const toggleLiveMode = () => {
        if (isLiveMode) {
            stopLiveSession();
        } else {
            startLiveSession();
        }
    };

    const startLiveSession = async () => {
        try {
            setIsLiveMode(true);
            setIsLoading(true);

            // Initialize WebSocket
            const wsUrl = 'wss://kiranaai.onrender.com/ws/chat';

            console.log("Connecting to WebSocket:", wsUrl);
            websocketRef.current = new WebSocket(wsUrl);

            websocketRef.current.onopen = () => {
                console.log("Connected to Live API");
                setIsConnected(true);
                setIsLoading(false);
                startAudioCapture();
            };

            websocketRef.current.onmessage = async (event) => {
                const text = event.data;
                try {
                    const data = JSON.parse(text);
                    // Handle different message types from Gemini
                    if (data.serverContent && data.serverContent.modelTurn && data.serverContent.modelTurn.parts) {
                        for (const part of data.serverContent.modelTurn.parts) {
                            if (part.text) {
                                setMessages(prev => [...prev, { role: 'assistant', content: part.text }]);
                            }
                            if (part.inlineData && part.inlineData.mimeType.startsWith('audio/')) {
                                // Play audio
                                playAudioChunk(part.inlineData.data);
                            }
                        }
                    }
                } catch (e) {
                    console.log("Received non-JSON message:", text);
                }
            };

            websocketRef.current.onclose = () => {
                console.log("Disconnected from Live API");
                setIsConnected(false);
                setIsLiveMode(false);
                stopAudioCapture();
            };

            websocketRef.current.onerror = (error) => {
                console.error("WebSocket error:", error);
                setIsLoading(false);
            };

        } catch (error) {
            console.error("Failed to start live session:", error);
            setIsLiveMode(false);
            setIsLoading(false);
        }
    };

    const stopLiveSession = () => {
        if (websocketRef.current) {
            websocketRef.current.close();
        }
        stopAudioCapture();
        setIsLiveMode(false);
        setIsConnected(false);
    };

    const startAudioCapture = async () => {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: { sampleRate: 16000, channelCount: 1 } });
            audioContextRef.current = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 16000 });
            sourceRef.current = audioContextRef.current.createMediaStreamSource(stream);

            // Use ScriptProcessor for capturing raw PCM
            processorRef.current = audioContextRef.current.createScriptProcessor(4096, 1, 1);

            processorRef.current.onaudioprocess = (e) => {
                if (!websocketRef.current || websocketRef.current.readyState !== WebSocket.OPEN) return;

                const inputData = e.inputBuffer.getChannelData(0);
                // Convert float32 to int16
                const pcmData = new Int16Array(inputData.length);
                for (let i = 0; i < inputData.length; i++) {
                    pcmData[i] = Math.max(-1, Math.min(1, inputData[i])) * 0x7FFF;
                }

                // Convert to base64
                const buffer = new ArrayBuffer(pcmData.length * 2);
                const view = new DataView(buffer);
                for (let i = 0; i < pcmData.length; i++) {
                    view.setInt16(i * 2, pcmData[i], true); // Little endian
                }

                const base64Audio = btoa(String.fromCharCode(...new Uint8Array(buffer)));

                // Send to Gemini
                const msg = {
                    realtime_input: {
                        media_chunks: [{
                            mime_type: "audio/pcm",
                            data: base64Audio
                        }]
                    }
                };
                websocketRef.current.send(JSON.stringify(msg));
            };

            sourceRef.current.connect(processorRef.current);
            processorRef.current.connect(audioContextRef.current.destination);

        } catch (error) {
            console.error("Error capturing audio:", error);
        }
    };

    const stopAudioCapture = () => {
        if (processorRef.current) {
            processorRef.current.disconnect();
            processorRef.current = null;
        }
        if (sourceRef.current) {
            sourceRef.current.disconnect();
            sourceRef.current = null;
        }
        if (audioContextRef.current) {
            audioContextRef.current.close();
            audioContextRef.current = null;
        }
    };

    const nextStartTimeRef = useRef(0);
    const audioQueueRef = useRef([]);
    const isPlayingRef = useRef(false);
    const MIN_BUFFER_SIZE = 3; // Wait for 3 chunks before starting playback

    const processAudioQueue = async () => {
        if (isPlayingRef.current || audioQueueRef.current.length === 0) return;

        // If we have enough chunks or if we are already in a playback sequence (checked by nextStartTimeRef)
        // But to start fresh, we want a buffer.
        // Let's simplify: Just play if we have chunks, but ensure nextStartTime is managed.
        // Actually, to fix "breaking", we should wait for a few chunks if the queue was empty.

        isPlayingRef.current = true;

        while (audioQueueRef.current.length > 0) {
            const { audioBuffer, audioCtx } = audioQueueRef.current.shift();

            const source = audioCtx.createBufferSource();
            source.buffer = audioBuffer;
            source.connect(audioCtx.destination);

            // Schedule playback
            // Ensure we don't schedule in the past
            // Add a small buffer if we are starting fresh (gap detected)
            const currentTime = audioCtx.currentTime;
            if (nextStartTimeRef.current < currentTime) {
                nextStartTimeRef.current = currentTime + 0.2; // 200ms buffer for fresh start
            }

            const startTime = nextStartTimeRef.current;
            source.start(startTime);

            // Update next start time
            nextStartTimeRef.current = startTime + audioBuffer.duration;
        }

        isPlayingRef.current = false;
    };

    const playAudioChunk = async (base64Data) => {
        try {
            // Initialize AudioContext if not present or closed
            if (!audioContextRef.current || audioContextRef.current.state === 'closed') {
                audioContextRef.current = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 24000 });
                nextStartTimeRef.current = audioContextRef.current.currentTime;
            }

            const audioCtx = audioContextRef.current;

            // Decode base64
            const binaryString = atob(base64Data);
            const len = binaryString.length;
            const bytes = new Uint8Array(len);
            for (let i = 0; i < len; i++) {
                bytes[i] = binaryString.charCodeAt(i);
            }

            // Convert PCM to AudioBuffer
            // Gemini sends PCM 24kHz (usually)
            const int16Array = new Int16Array(bytes.buffer);
            const float32Array = new Float32Array(int16Array.length);

            for (let i = 0; i < int16Array.length; i++) {
                float32Array[i] = int16Array[i] / 32768.0;
            }

            const audioBuffer = audioCtx.createBuffer(1, float32Array.length, 24000);
            audioBuffer.getChannelData(0).set(float32Array);

            // Add to queue
            audioQueueRef.current.push({ audioBuffer, audioCtx });

            // Trigger processing if not already playing and we have enough buffer
            // Or if we are already "streaming" (nextStartTime is in future), we can just push and let the loop handle it?
            // The loop above is synchronous-ish (while loop), so it drains the queue immediately.
            // We need a better approach for "streaming".
            // Actually, the Web Audio API handles scheduling. We can just schedule everything in the queue immediately.
            // The "breaking" happens when nextStartTime < currentTime.

            processAudioQueue();

        } catch (e) {
            console.error("Error playing audio:", e);
        }
    };

    return (
        <div className="flex flex-col h-[calc(100vh-8rem)] bg-slate-900 rounded-xl shadow-sm border border-slate-700 overflow-hidden">
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
                {isLoading && (
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
                        onClick={toggleLiveMode}
                        className={cn(
                            "p-2 rounded-full transition-all duration-300",
                            isLiveMode
                                ? "bg-red-500/20 text-red-400 hover:bg-red-500/30 animate-pulse"
                                : "bg-slate-700 text-slate-300 hover:bg-slate-600"
                        )}
                        title={isLiveMode ? "Stop Live Mode" : "Start Live Mode"}
                    >
                        {isLiveMode ? <Radio size={20} /> : <Mic size={20} />}
                    </button>

                    <input
                        type="text"
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        placeholder={isLiveMode ? "Listening..." : "Ask about your inventory or sales..."}
                        className="flex-1 px-4 py-2 rounded-lg border border-slate-600 bg-slate-700 text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                        disabled={isLoading || isLiveMode}
                    />
                    <button
                        type="submit"
                        disabled={isLoading || !input.trim() || isLiveMode}
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
