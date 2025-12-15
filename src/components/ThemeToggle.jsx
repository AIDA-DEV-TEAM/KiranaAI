import React, { useEffect, useState } from 'react';
import { Moon, Sun } from 'lucide-react';
import { cn } from '../lib/utils';

const ThemeToggle = ({ className }) => {
    const [theme, setTheme] = useState('light');

    useEffect(() => {
        // Synchronize local state with the actual DOM state on mount
        // This prevents the toggle from checking localStorage again and potentially overriding 
        // the current session state if it was changed elsewhere or if we just want to reflect current reality.
        if (document.documentElement.classList.contains('dark')) {
            setTheme('dark');
        } else {
            setTheme('light');
        }
    }, []);

    const toggleTheme = () => {
        if (theme === 'light') {
            setTheme('dark');
            document.documentElement.classList.add('dark');
            localStorage.setItem('theme', 'dark');
        } else {
            setTheme('light');
            document.documentElement.classList.remove('dark');
            localStorage.setItem('theme', 'light');
        }
    };

    return (
        <button
            onClick={toggleTheme}
            className={cn(
                "p-2 rounded-full transition-all duration-300 focus:outline-none focus:ring-2 focus:ring-primary/50",
                theme === 'dark'
                    ? "bg-slate-800 text-yellow-400 hover:bg-slate-700"
                    : "bg-orange-100 text-orange-500 hover:bg-orange-200",
                className
            )}
            title={`Switch to ${theme === 'light' ? 'dark' : 'light'} mode`}
            aria-label="Toggle theme"
        >
            {theme === 'dark' ? (
                <Moon size={20} className="fill-current" />
            ) : (
                <Sun size={20} className="fill-current" />
            )}
        </button>
    );
};

export default ThemeToggle;
