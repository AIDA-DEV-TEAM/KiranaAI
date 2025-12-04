import React, { useState } from 'react';
import { Mail, Phone, MapPin, Send, ArrowLeft, MessageSquare } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

const ContactUs = () => {
    const { t } = useTranslation();
    const [formData, setFormData] = useState({
        name: '',
        email: '',
        message: ''
    });
    const [submitted, setSubmitted] = useState(false);

    const handleSubmit = (e) => {
        e.preventDefault();
        // Simulate form submission
        setTimeout(() => {
            setSubmitted(true);
            setFormData({ name: '', email: '', message: '' });
        }, 1000);
    };

    return (
        <div className="flex flex-col h-full bg-background relative font-sans pb-safe">
            {/* Header */}
            <div className="sticky top-0 z-10 bg-background/80 backdrop-blur-xl border-b border-border p-4 flex items-center gap-3">
                <Link to="/" className="p-2 hover:bg-muted rounded-full transition-colors">
                    <ArrowLeft size={20} className="text-foreground" />
                </Link>
                <h1 className="text-xl font-bold text-foreground">{t('contact_us')}</h1>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-6">
                {/* Contact Info Cards */}
                <div className="grid grid-cols-1 gap-4">
                    <div className="bg-card p-5 rounded-2xl border border-border shadow-sm flex items-center gap-4">
                        <div className="w-12 h-12 bg-primary/10 rounded-xl flex items-center justify-center text-primary">
                            <Mail size={24} />
                        </div>
                        <div>
                            <h3 className="font-semibold text-foreground">{t('email_us')}</h3>
                            <p className="text-sm text-muted-foreground">support@kiranaai.com</p>
                        </div>
                    </div>

                    <div className="bg-card p-5 rounded-2xl border border-border shadow-sm flex items-center gap-4">
                        <div className="w-12 h-12 bg-green-500/10 rounded-xl flex items-center justify-center text-green-600">
                            <Phone size={24} />
                        </div>
                        <div>
                            <h3 className="font-semibold text-foreground">{t('call_us')}</h3>
                            <p className="text-sm text-muted-foreground">+91 98765 43210</p>
                        </div>
                    </div>

                    <div className="bg-card p-5 rounded-2xl border border-border shadow-sm flex items-center gap-4">
                        <div className="w-12 h-12 bg-orange-500/10 rounded-xl flex items-center justify-center text-orange-600">
                            <MapPin size={24} />
                        </div>
                        <div>
                            <h3 className="font-semibold text-foreground">{t('visit_us')}</h3>
                            <p className="text-sm text-muted-foreground">123, Tech Park, Bangalore, India</p>
                        </div>
                    </div>
                </div>

                {/* Contact Form */}
                <div className="bg-card p-6 rounded-2xl border border-border shadow-sm">
                    <div className="flex items-center gap-2 mb-6">
                        <MessageSquare className="text-primary" size={20} />
                        <h2 className="text-lg font-bold text-foreground">{t('send_message')}</h2>
                    </div>

                    {submitted ? (
                        <div className="text-center py-8 animate-in fade-in zoom-in duration-300">
                            <div className="w-16 h-16 bg-green-500/10 text-green-600 rounded-full flex items-center justify-center mx-auto mb-4">
                                <Send size={32} />
                            </div>
                            <h3 className="text-xl font-bold text-foreground mb-2">{t('message_sent')}</h3>
                            <p className="text-muted-foreground">{t('message_sent_desc')}</p>
                            <button
                                onClick={() => setSubmitted(false)}
                                className="mt-6 text-primary font-medium hover:underline"
                            >
                                {t('send_another')}
                            </button>
                        </div>
                    ) : (
                        <form onSubmit={handleSubmit} className="space-y-4">
                            <div className="space-y-2">
                                <label className="text-sm font-medium text-muted-foreground">{t('your_name')}</label>
                                <input
                                    required
                                    type="text"
                                    placeholder="John Doe"
                                    className="w-full bg-muted/30 p-3 rounded-xl border border-border outline-none focus:ring-2 focus:ring-primary/20 transition-all"
                                    value={formData.name}
                                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                                />
                            </div>
                            <div className="space-y-2">
                                <label className="text-sm font-medium text-muted-foreground">{t('your_email')}</label>
                                <input
                                    required
                                    type="email"
                                    placeholder="john@example.com"
                                    className="w-full bg-muted/30 p-3 rounded-xl border border-border outline-none focus:ring-2 focus:ring-primary/20 transition-all"
                                    value={formData.email}
                                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                                />
                            </div>
                            <div className="space-y-2">
                                <label className="text-sm font-medium text-muted-foreground">{t('message')}</label>
                                <textarea
                                    required
                                    rows={4}
                                    placeholder={t('how_can_we_help')}
                                    className="w-full bg-muted/30 p-3 rounded-xl border border-border outline-none focus:ring-2 focus:ring-primary/20 transition-all resize-none"
                                    value={formData.message}
                                    onChange={(e) => setFormData({ ...formData, message: e.target.value })}
                                />
                            </div>
                            <button
                                type="submit"
                                className="w-full bg-primary text-primary-foreground py-3 rounded-xl font-bold shadow-lg shadow-primary/25 hover:bg-primary/90 active:scale-95 transition-all flex items-center justify-center gap-2"
                            >
                                <Send size={18} />
                                {t('send_message')}
                            </button>
                        </form>
                    )}
                </div>
            </div>
        </div>
    );
};

export default ContactUs;
