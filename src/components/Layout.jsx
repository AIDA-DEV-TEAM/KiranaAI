import React, { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { MessageSquare, LayoutDashboard, Store, Menu, X, Package, Phone, Settings } from 'lucide-react';
import { cn } from '../lib/utils';

const Layout = ({ children }) => {
    const location = useLocation();

    const [isSidebarOpen, setIsSidebarOpen] = useState(false);

    const navItems = [
        { icon: MessageSquare, label: 'Chat', path: '/' },
        { icon: LayoutDashboard, label: 'Dashboard', path: '/dashboard' },
        { icon: Store, label: 'Store', path: '/storekeeper' },
        { icon: Package, label: 'Stock', path: '/stock' },

        { icon: Settings, label: 'Settings', path: '/settings' },
    ];

    return (
        <div className="flex h-screen bg-background font-sans overflow-hidden">
            {/* Desktop Sidebar */}
            <div className="hidden md:flex flex-col w-72 bg-card border-r border-border shadow-sm z-50">
                <div className="p-6 flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-primary flex items-center justify-center text-primary-foreground shadow-lg shadow-primary/20">
                        <Store className="w-6 h-6" />
                    </div>
                    <h1 className="text-2xl font-bold tracking-tight text-foreground">
                        KiranaAI
                    </h1>
                </div>

                <nav className="flex-1 px-4 space-y-2 py-4">
                    {navItems.map((item) => (
                        <Link
                            key={item.path}
                            to={item.path}
                            className={cn(
                                "flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 group",
                                location.pathname === item.path
                                    ? "bg-primary text-primary-foreground shadow-md shadow-primary/20"
                                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                            )}
                        >
                            <item.icon className={cn("w-5 h-5", location.pathname === item.path ? "text-primary-foreground" : "text-muted-foreground group-hover:text-foreground")} />
                            <span className="font-medium">{item.label}</span>
                        </Link>
                    ))}
                </nav>

                <div className="p-4 mt-auto space-y-4">
                    <div className="flex items-center justify-between px-2">
                        <span className="text-sm font-medium text-muted-foreground">Theme</span>
                    </div>
                    <div className="bg-muted/50 rounded-2xl p-4 border border-border">
                        <div className="flex items-center gap-3">
                            <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse shadow-[0_0_8px_rgba(34,197,94,0.5)]" />
                            <span className="text-sm font-medium text-muted-foreground">System Online</span>
                        </div>
                    </div>
                </div>
            </div>

            {/* Main Content */}
            <div className="flex-1 flex flex-col h-full relative w-full">
                {/* Mobile Header (Only for non-chat pages) */}
                {location.pathname !== '/' && (
                    <div className="md:hidden pt-safe px-4 pb-2 bg-background/80 backdrop-blur-xl border-b border-border z-30 flex items-center justify-between sticky top-0">
                        <div className="flex items-center gap-2">
                            <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center text-primary-foreground">
                                <Store className="w-5 h-5" />
                            </div>
                            <h1 className="text-lg font-bold text-foreground">KiranaAI</h1>
                        </div>
                    </div>
                )}

                <div className="flex-1 overflow-y-auto overflow-x-hidden pb-24 md:pb-0 scroll-smooth">
                    <div className={cn(
                        "w-full h-full mx-auto animate-in fade-in duration-300 slide-in-from-bottom-4",
                        location.pathname === '/' ? "" : "md:p-8 max-w-7xl"
                    )}>
                        {children}
                    </div>
                </div>

                {/* Mobile Bottom Navigation */}
                <div className="md:hidden fixed bottom-0 left-0 right-0 bg-background/80 backdrop-blur-xl border-t border-border pb-safe z-50">
                    <div className="flex items-center justify-around px-2 py-2">
                        {navItems.map((item) => {
                            const isActive = location.pathname === item.path;
                            return (
                                <Link
                                    key={item.path}
                                    to={item.path}
                                    className={cn(
                                        "flex flex-col items-center justify-center w-full py-2 rounded-xl transition-all duration-300 active:scale-95",
                                        isActive ? "text-primary" : "text-muted-foreground hover:text-foreground"
                                    )}
                                >
                                    <div className={cn(
                                        "p-1.5 rounded-full transition-all duration-300 mb-1",
                                        isActive ? "bg-primary/10" : "bg-transparent"
                                    )}>
                                        <item.icon className={cn("w-6 h-6", isActive && "fill-current")} strokeWidth={isActive ? 2.5 : 2} />
                                    </div>
                                    <span className="text-[10px] font-medium tracking-wide">{item.label}</span>
                                </Link>
                            );
                        })}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default Layout;
