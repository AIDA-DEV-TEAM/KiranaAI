import React from 'react';
import { useTranslation } from 'react-i18next';
import { Globe, Moon, Sun, Phone, ChevronRight, Mail, MapPin } from 'lucide-react';
import { cn } from '../lib/utils';
import ThemeToggle from './ThemeToggle';
import { Link } from 'react-router-dom';

const LANGUAGES = [
    { code: 'en', name: 'English', native: 'English' },
    { code: 'hi', name: 'Hindi', native: 'हिन्दी' },
    { code: 'bn', name: 'Bengali', native: 'বাংলা' },
    { code: 'te', name: 'Telugu', native: 'తెలుగు' },
    { code: 'mr', name: 'Marathi', native: 'मराठी' },
    { code: 'ta', name: 'Tamil', native: 'தமிழ்' },
    { code: 'gu', name: 'Gujarati', native: 'ગુજરાતી' },
    { code: 'kn', name: 'Kannada', native: 'ಕನ್ನಡ' },
    { code: 'ml', name: 'Malayalam', native: 'മലയാളം' },
    { code: 'pa', name: 'Punjabi', native: 'ਪੰਜਾਬੀ' },
];

const SettingsView = () => {
    const { t, i18n } = useTranslation();

    const changeLanguage = (lng) => {
        i18n.changeLanguage(lng);
    };

    return (
        <div className="flex flex-col h-full bg-background relative font-sans pb-safe">
            {/* Header */}
            <div className="sticky top-0 z-10 bg-background/80 backdrop-blur-xl border-b border-border p-4">
                <h1 className="text-2xl font-bold tracking-tight text-foreground">{t('settings')}</h1>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-6">

                {/* Appearance Section */}
                <div className="space-y-3">
                    <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wider px-1">{t('appearance')}</h2>
                    <div className="bg-card rounded-2xl border border-border overflow-hidden shadow-sm">
                        <div className="p-4 flex items-center justify-between">
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-xl bg-purple-500/10 flex items-center justify-center text-purple-600 dark:text-purple-400">
                                    <Moon size={20} className="hidden dark:block" />
                                    <Sun size={20} className="block dark:hidden" />
                                </div>
                                <div>
                                    <h3 className="font-medium text-foreground">{t('dark_mode')}</h3>
                                    <p className="text-xs text-muted-foreground">{t('toggle_theme')}</p>
                                </div>
                            </div>
                            <ThemeToggle />
                        </div>
                    </div>
                </div>

                {/* Language Section */}
                <div className="space-y-3">
                    <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wider px-1">{t('language')}</h2>
                    <div className="bg-card rounded-2xl border border-border overflow-hidden shadow-sm p-4 space-y-4">
                        <div className="flex items-center gap-3 mb-2">
                            <div className="w-10 h-10 rounded-xl bg-blue-500/10 flex items-center justify-center text-blue-600">
                                <Globe size={20} />
                            </div>
                            <div>
                                <h3 className="font-medium text-foreground">{t('app_language')}</h3>
                                <p className="text-xs text-muted-foreground">{t('select_preferred_language')}</p>
                            </div>
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                            {LANGUAGES.map((lang) => (
                                <button
                                    key={lang.code}
                                    onClick={() => changeLanguage(lang.code)}
                                    className={cn(
                                        "p-3 rounded-xl border text-left transition-all active:scale-95",
                                        i18n.language === lang.code
                                            ? "bg-primary/10 border-primary text-primary"
                                            : "bg-background border-border text-foreground hover:bg-muted"
                                    )}
                                >
                                    <div className="font-medium">{lang.native}</div>
                                    <div className="text-xs text-muted-foreground">{lang.name}</div>
                                </button>
                            ))}
                        </div>
                    </div>
                </div>

                {/* Support Section */}
                <div className="space-y-3">
                    <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wider px-1">{t('support')}</h2>
                    <div className="bg-card rounded-2xl border border-border overflow-hidden shadow-sm divide-y divide-border">
                        <Link to="/contact" className="p-4 flex items-center justify-between hover:bg-muted/50 transition-colors">
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-xl bg-green-500/10 flex items-center justify-center text-green-600">
                                    <Phone size={20} />
                                </div>
                                <div>
                                    <h3 className="font-medium text-foreground">{t('contact_us')}</h3>
                                    <p className="text-xs text-muted-foreground">{t('get_help_support')}</p>
                                </div>
                            </div>
                            <ChevronRight size={20} className="text-muted-foreground" />
                        </Link>
                    </div>
                </div>

                {/* App Info */}
                <div className="text-center py-6">
                    <p className="text-xs text-muted-foreground">KiranaAI v1.0.0</p>
                    <p className="text-[10px] text-muted-foreground/60 mt-1">Made with ❤️ for India</p>
                </div>
            </div>
        </div>
    );
};

export default SettingsView;
