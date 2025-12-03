import React, { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { MessageSquare, LayoutDashboard, Store, Menu, X } from 'lucide-react';
import { cn } from '../lib/utils';

const Layout = ({ children }) => {
    const location = useLocation();

    const [isSidebarOpen, setIsSidebarOpen] = useState(false);

    const navItems = [
        { icon: MessageSquare, label: 'Chat', path: '/' },
        { icon: LayoutDashboard, label: 'Dashboard', path: '/dashboard' },
        { icon: Store, label: 'Storekeeper', path: '/storekeeper' },
        { icon: Store, label: 'Stock Manager', path: '/stock' },
    ];

    return (
        <div className="flex h-screen bg-gray-50 dark:bg-gray-900 font-sans">
            {/* Mobile Sidebar Overlay */}
            {isSidebarOpen && (
                <div
                    className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40 md:hidden transition-opacity"
                    onClick={() => setIsSidebarOpen(false)}
                />
            )}

            {/* Sidebar */}
            <div className={cn(
                "fixed inset-y-0 left-0 z-50 w-72 bg-gradient-to-b from-primary to-indigo-900 text-white shadow-2xl transition-transform duration-300 ease-out md:relative md:translate-x-0",
                isSidebarOpen ? "translate-x-0" : "-translate-x-full"
            )}>
                <div className="p-8 flex items-center justify-between">
                    <h1 className="text-3xl font-extrabold tracking-tight flex items-center gap-3 text-white">
                        <Store className="w-8 h-8 text-secondary" />
                        KiranaAI
                    </h1>
                    <button
                        onClick={() => setIsSidebarOpen(false)}
                        className="md:hidden p-2 hover:bg-white/10 rounded-full transition-colors"
                    >
                        <X size={24} />
                    </button>
                </div>
                <nav className="px-6 space-y-3">
                    {navItems.map((item) => (
                        <Link
                            key={item.path}
                            to={item.path}
                            onClick={() => setIsSidebarOpen(false)}
                            className={cn(
                                "flex items-center gap-4 px-6 py-4 rounded-xl transition-all duration-200 group",
                                location.pathname === item.path
                                    ? "bg-white text-blue-600 shadow-lg font-bold transform scale-105"
                                    : "text-gray-100 hover:bg-white/10 hover:translate-x-1"
                            )}
                        >
                            <item.icon className={cn("w-6 h-6", location.pathname === item.path ? "text-primary" : "text-gray-300 group-hover:text-white")} />
                            <span className="text-lg">{item.label}</span>
                        </Link>
                    ))}
                </nav>

                <div className="absolute bottom-8 left-0 right-0 px-6">
                    <div className="bg-white/10 rounded-2xl p-4 backdrop-blur-md border border-white/10">
                        <p className="text-xs text-gray-300 mb-1">Status</p>
                        <div className="flex items-center gap-2">
                            <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
                            <span className="text-sm font-medium">System Online</span>
                        </div>
                    </div>
                </div>
            </div>

            {/* Main Content */}
            <div className="flex-1 overflow-auto flex flex-col bg-gray-50/50">
                {/* Mobile Header */}
                <div className="md:hidden pt-[calc(env(safe-area-inset-top)+1rem)] pb-4 px-4 bg-white/80 backdrop-blur-md border-b border-gray-200 sticky top-0 z-30 flex items-center justify-between shadow-sm">
                    <div className="flex items-center gap-3">
                        <button
                            onClick={() => setIsSidebarOpen(true)}
                            className="p-2 hover:bg-gray-100 rounded-xl text-gray-700"
                        >
                            <Menu size={24} />
                        </button>
                        <h1 className="text-xl font-bold text-primary">KiranaAI</h1>
                    </div>
                    <div className="w-8 h-8 rounded-full bg-gradient-to-br from-primary to-secondary" />
                </div>

                <div className={cn(
                    "md:p-8 max-w-7xl mx-auto w-full animate-in fade-in duration-500",
                    location.pathname === '/' ? "p-0" : "p-4"
                )}>
                    {children}
                </div>
            </div>
        </div>
    );
};

export default Layout;
