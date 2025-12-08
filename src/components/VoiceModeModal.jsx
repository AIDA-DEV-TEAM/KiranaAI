import React, { useEffect } from 'react';
import { X, Mic, Loader2, Volume2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { cn } from '../lib/utils';
import { VOICE_STATES } from '../utils/voiceConfig';

const VoiceModeModal = ({
    isOpen,
    onClose,
    voiceState,
    transcript,
    aiResponse,
    error
}) => {
    const { t, i18n } = useTranslation();

    // Close on escape key
    useEffect(() => {
        const handleEscape = (e) => {
            if (e.key === 'Escape' && isOpen) {
                onClose();
            }
        };
        document.addEventListener('keydown', handleEscape);
        return () => document.removeEventListener('keydown', handleEscape);
    }, [isOpen, onClose]);

    if (!isOpen) return null;

    const getStateInfo = () => {
        switch (voiceState) {
            case VOICE_STATES.LISTENING:
                return {
                    icon: Mic,
                    text: t('listening'),
                    color: 'text-blue-500',
                    bgColor: 'bg-blue-500/10',
                    animation: 'animate-pulse'
                };
            case VOICE_STATES.THINKING:
                return {
                    icon: Loader2,
                    text: t('thinking'),
                    color: 'text-purple-500',
                    bgColor: 'bg-purple-500/10',
                    animation: 'animate-spin'
                };
            case VOICE_STATES.SPEAKING:
                return {
                    icon: Volume2,
                    text: t('speaking'),
                    color: 'text-green-500',
                    bgColor: 'bg-green-500/10',
                    animation: 'animate-pulse'
                };
            default:
                return {
                    icon: Mic,
                    text: t('starting'),
                    color: 'text-muted-foreground',
                    bgColor: 'bg-muted',
                    animation: ''
                };
        }
    };

    const stateInfo = getStateInfo();
    const StateIcon = stateInfo.icon;

    return (
        <div className="fixed inset-0 z-50 bg-background/95 backdrop-blur-sm animate-in fade-in duration-300">
            {/* Header */}
            <div className="absolute top-0 left-0 right-0 pt-safe px-4 py-4 flex items-center justify-between border-b border-border bg-background/80 backdrop-blur-xl">
                <div className="flex items-center gap-2">
                    <div className={cn(
                        "w-2 h-2 rounded-full animate-pulse",
                        voiceState === VOICE_STATES.LISTENING ? "bg-blue-500" :
                            voiceState === VOICE_STATES.THINKING ? "bg-purple-500" :
                                voiceState === VOICE_STATES.SPEAKING ? "bg-green-500" : "bg-muted-foreground"
                    )} />
                    <span className="text-sm font-medium text-foreground">{t('voice_mode_active')}</span>
                </div>
                <button
                    onClick={onClose}
                    className="w-10 h-10 rounded-full bg-muted hover:bg-destructive/10 hover:text-destructive flex items-center justify-center transition-colors"
                >
                    <X size={20} />
                </button>
            </div>

            {/* Main Content */}
            <div className="flex flex-col items-center justify-center h-full px-6 pt-20 pb-safe">

                {/* Animated Icon */}
                <div className={cn(
                    "relative w-32 h-32 rounded-full flex items-center justify-center mb-8",
                    stateInfo.bgColor,
                    stateInfo.animation
                )}>
                    <div className={cn(
                        "absolute inset-0 rounded-full opacity-20",
                        voiceState === VOICE_STATES.LISTENING && "animate-ping bg-blue-500",
                        voiceState === VOICE_STATES.SPEAKING && "animate-ping bg-green-500"
                    )} />
                    <StateIcon size={48} className={stateInfo.color} strokeWidth={2} />
                </div>

                {/* State Text */}
                <h2 className="text-2xl font-bold text-foreground mb-2">{stateInfo.text}</h2>

                {/* Language Indicator */}
                <p className="text-sm text-muted-foreground mb-8">
                    {t('language')}: {i18n.language.toUpperCase()}
                </p>

                {/* Transcript Display */}
                <div className="w-full max-w-2xl space-y-4">
                    {error && (
                        <div className="p-4 rounded-2xl bg-destructive/10 border border-destructive/20 text-destructive text-center animate-in slide-in-from-bottom-2">
                            <p className="text-sm font-medium">{error}</p>
                        </div>
                    )}

                    {transcript && (
                        <div className="p-4 rounded-2xl bg-primary/10 border border-primary/20 animate-in slide-in-from-bottom-2">
                            <p className="text-xs text-muted-foreground mb-1">{t('you')}:</p>
                            <p className="text-foreground">{transcript}</p>
                        </div>
                    )}

                    {aiResponse && (
                        <div className="p-4 rounded-2xl bg-card border border-border animate-in slide-in-from-bottom-2">
                            <p className="text-xs text-muted-foreground mb-1">{t('assistant')}:</p>
                            <p className="text-foreground">{aiResponse}</p>
                        </div>
                    )}
                </div>

                {/* Instruction Text */}
                <div className="mt-auto pt-8 text-center">
                    <p className="text-sm text-muted-foreground max-w-md">
                        {voiceState === VOICE_STATES.LISTENING && t('speak_now_hint')}
                        {voiceState === VOICE_STATES.THINKING && t('processing_hint')}
                        {voiceState === VOICE_STATES.SPEAKING && t('speaking_hint')}
                    </p>
                    <button
                        onClick={onClose}
                        className="mt-6 px-8 py-3 rounded-full bg-destructive/10 hover:bg-destructive/20 text-destructive font-medium transition-colors active:scale-95"
                    >
                        {t('tap_to_stop_voice')}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default VoiceModeModal;
