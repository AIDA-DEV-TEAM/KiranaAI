import React, { useState, useRef, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeHighlight from 'rehype-highlight';
import 'highlight.js/styles/github-dark.css'; // Import highlight.js styles
import { Send, Bot, User, Loader2, Mic, MicOff, Volume2 } from 'lucide-react';
import { chatWithData, transcribeAudio } from '../services/api';
import { cn } from '../lib/utils';
import { SpeechRecognition } from '@capacitor-community/speech-recognition';

const ChatInterface = ({ messages, setMessages }) => {
    // Local state removed, using props now
    const [input, setInput] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [isRecording, setIsRecording] = useState(false);
    const [isTranscribing, setIsTranscribing] = useState(false);
    const [isSpeaking, setIsSpeaking] = useState(false);

    const messagesEndRef = useRef(null);
    const mediaRecorderRef = useRef(null);
    const audioChunksRef = useRef([]);

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    };

    useEffect(() => {
        scrollToBottom();
    }, [messages, isLoading, isTranscribing]);

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

            // Speak the response
            speakResponse(data.response);

        } catch (error) {
            setMessages(prev => [...prev, {
                role: 'assistant',
                content: "Sorry, I encountered an error processing your request."
            }]);
        } finally {
            setIsLoading(false);
        }
    };

    const startRecording = async () => {
        try {
            // Request permissions first (using the plugin helper)
            try {
                await SpeechRecognition.requestPermissions();
            } catch (permError) {
                console.warn("Permission request via plugin failed/skipped:", permError);
            }

            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

            // Determine supported mime type
            let mimeType = 'audio/webm';
            if (MediaRecorder.isTypeSupported('audio/mp4')) {
                mimeType = 'audio/mp4';
            } else if (MediaRecorder.isTypeSupported('audio/webm;codecs=opus')) {
                mimeType = 'audio/webm;codecs=opus';
            }

            console.log("Using MIME type:", mimeType);
            mediaRecorderRef.current = new MediaRecorder(stream, { mimeType });
            audioChunksRef.current = [];

            mediaRecorderRef.current.ondataavailable = (event) => {
                if (event.data.size > 0) {
                    audioChunksRef.current.push(event.data);
                }
            };

            mediaRecorderRef.current.onstop = async () => {
                const audioBlob = new Blob(audioChunksRef.current, { type: mimeType });
                setIsTranscribing(true);
                try {
                    const data = await transcribeAudio(audioBlob);
                    if (data.text) {
                        setInput(data.text);
                        handleSendWithText(data.text);
                    }
                } catch (error) {
                    console.error("Transcription error:", error);
                    const errorMessage = error.response?.data?.detail || error.message || "Unknown error";
                    alert(`Failed to transcribe audio: ${errorMessage}`);
                } finally {
                    setIsTranscribing(false);
                }

                // Stop all tracks
                stream.getTracks().forEach(track => track.stop());
            };

            mediaRecorderRef.current.start();
            setIsRecording(true);
        } catch (error) {
            console.error("Error accessing microphone:", error);
            alert(`Could not access microphone. Error: ${error.name} - ${error.message}. Please ensure you have granted microphone permission.`);
        }
    };

    const stopRecording = () => {
        if (mediaRecorderRef.current && isRecording) {
            mediaRecorderRef.current.stop();
            setIsRecording(false);
        }
    };

    const toggleRecording = () => {
        if (isRecording) {
            stopRecording();
        } else {
            startRecording();
        }
    };

    const handleSendWithText = async (text) => {
        if (!text.trim()) return;

        setMessages(prev => [...prev, { role: 'user', content: text }]);
        setIsLoading(true);

        try {
            const history = messages.slice(1).map(msg => ({
                role: msg.role,
                content: msg.content
            }));

            const data = await chatWithData(text, history);
            setMessages(prev => [...prev, {
                role: 'assistant',
                content: data.response,
                sql: data.sql_query
            }]);
            speakResponse(data.response);
        } catch (error) {
            setMessages(prev => [...prev, {
                role: 'assistant',
                content: "Sorry, I encountered an error processing your request."
            }]);
        } finally {
            setIsLoading(false);
        }
    };

    const speakResponse = (text) => {
        if ('speechSynthesis' in window) {
            window.speechSynthesis.cancel();
            // Strip markdown for speech (simple regex to remove some common markdown)
            const cleanText = text.replace(/[*#`_]/g, '');
            const utterance = new SpeechSynthesisUtterance(cleanText);

            // Try to find an Indian English voice
            const voices = window.speechSynthesis.getVoices();
            const indianVoice = voices.find(v => v.lang.includes('IN'));
            if (indianVoice) utterance.voice = indianVoice;

            setIsSpeaking(true);
            utterance.onend = () => setIsSpeaking(false);
            window.speechSynthesis.speak(utterance);
        }
    };

    // Live Mode State
    const [isLiveMode, setIsLiveMode] = useState(false);
    const [isConnected, setIsConnected] = useState(false);
    const websocketRef = useRef(null);
    const audioContextRef = useRef(null);
    const processorRef = useRef(null);
    const sourceRef = useRef(null);
    const audioQueueRef = useRef([]);
    const isPlayingRef = useRef(false);

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
            const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
            const wsUrl = `${protocol}//${window.location.host}/ws/chat`; // Use relative path for proxy
            // For local dev with separate backend port, might need full URL:
            // const wsUrl = 'wss://kiranaai.onrender.com/ws/chat'; 

            websocketRef.current = new WebSocket("wss://kiranaai.onrender.com/ws/chat");

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
                    // If not JSON, might be raw text or other format
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

    const playAudioChunk = async (base64Data) => {
        // Simple queue-based playback
        // In a real app, use a proper AudioWorklet for smooth streaming playback
        try {
            const binaryString = atob(base64Data);
            const len = binaryString.length;
            const bytes = new Uint8Array(len);
            for (let i = 0; i < len; i++) {
                bytes[i] = binaryString.charCodeAt(i);
            }

            // Create a blob and play it (not efficient for streaming but works for chunks)
            // Better: decode using AudioContext
            // For now, let's assume Gemini sends playable chunks or we need to decode PCM
            // Gemini Live API usually sends PCM 24kHz or similar. We need to check the header.
            // If it's PCM, we need to play it via AudioContext.

            // Placeholder: Log that we received audio
            console.log("Received audio chunk from Gemini", bytes.length);

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
                {isTranscribing && (
                    <div className="flex gap-3 ml-auto flex-row-reverse">
                        <div className="bg-slate-800 p-3 rounded-2xl rounded-tr-none border border-slate-700 flex items-center gap-2">
                            <Loader2 className="w-4 h-4 animate-spin text-blue-400" />
                            <span className="text-xs text-slate-400">Transcribing audio...</span>
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
                            "p-3 rounded-full transition-all duration-200 shadow-lg",
                            isLiveMode
                                ? "bg-green-500 text-white animate-pulse ring-4 ring-green-500/30"
                                : "bg-slate-700 text-slate-300 hover:bg-slate-600"
                        )}
                        title="Live Mode"
                    >
                        <Volume2 size={20} />
                    </button>

                    <button
                        type="button"
                        onClick={toggleRecording}
                        className={cn(
                            "p-3 rounded-full transition-all duration-200 shadow-lg",
                            isRecording
                                ? "bg-red-500 text-white animate-pulse ring-4 ring-red-500/30"
                                : "bg-slate-700 text-slate-300 hover:bg-slate-600"
                        )}
                        disabled={isLoading || isTranscribing || isLiveMode}
                    >
                        {isRecording ? <MicOff size={20} /> : <Mic size={20} />}
                    </button>

                    <input
                        type="text"
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        placeholder={isLiveMode ? "Listening..." : "Ask about your inventory or sales..."}
                        className="flex-1 px-4 py-2 rounded-lg border border-slate-600 bg-slate-700 text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                        disabled={isLoading || isRecording || isTranscribing || isLiveMode}
                    />
                    <button
                        type="submit"
                        disabled={isLoading || !input.trim() || isRecording || isTranscribing || isLiveMode}
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
