import React, { useState } from 'react';
import { useAppData } from '../context/AppDataContext';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, Calendar, Search, Filter, Download, Clock } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { cn } from '../lib/utils';

const SalesHistory = () => {
    const { t } = useTranslation();
    const navigate = useNavigate();
    const { salesData, loadingSales } = useAppData();
    const [filter, setFilter] = useState('all'); // all, today, week, month
    const [searchQuery, setSearchQuery] = useState('');

    const filteredSales = salesData.filter(sale => {
        const saleDate = new Date(sale.timestamp);
        const today = new Date();
        const isToday = saleDate.toDateString() === today.toDateString();

        let matchesFilter = true;
        if (filter === 'today') matchesFilter = isToday;
        if (filter === 'week') {
            const weekAgo = new Date();
            weekAgo.setDate(today.getDate() - 7);
            matchesFilter = saleDate >= weekAgo;
        }
        if (filter === 'month') {
            const monthAgo = new Date();
            monthAgo.setMonth(today.getMonth() - 1);
            matchesFilter = saleDate >= monthAgo;
        }

        const matchesSearch = (sale.product_name || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
            (sale.id.toString().includes(searchQuery));

        return matchesFilter && matchesSearch;
    }).sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

    const totalAmount = filteredSales.reduce((sum, sale) => {
        const amount = parseFloat(sale.total_amount);
        return sum + (isNaN(amount) ? 0 : amount);
    }, 0);

    return (
        <div className="flex flex-col h-full bg-background relative font-sans">
            {/* Header */}
            <div className="sticky top-0 z-10 bg-background/80 backdrop-blur-xl border-b border-border">
                <div className="px-4 py-3">
                    <div className="flex items-center gap-3 mb-4">
                        <button
                            onClick={() => navigate(-1)}
                            className="p-2 hover:bg-muted rounded-full transition-colors"
                        >
                            <ArrowLeft size={20} />
                        </button>
                        <h1 className="text-xl font-bold tracking-tight text-foreground">{t('sales_history') || "Sales History"}</h1>
                    </div>

                    {/* Filters */}
                    <div className="flex flex-col gap-3">
                        <div className="flex items-center gap-2 bg-card p-2.5 rounded-xl shadow-sm border border-border focus-within:ring-2 focus-within:ring-primary/20 transition-all">
                            <Search size={18} className="text-muted-foreground" />
                            <input
                                type="text"
                                placeholder="Search by product or ID..."
                                className="flex-1 outline-none bg-transparent text-sm text-foreground placeholder-muted-foreground"
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                            />
                        </div>

                        <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1">
                            {['all', 'today', 'week', 'month'].map((f) => (
                                <button
                                    key={f}
                                    onClick={() => setFilter(f)}
                                    className={cn(
                                        "px-4 py-1.5 rounded-full text-xs font-medium capitalize transition-all whitespace-nowrap",
                                        filter === f
                                            ? "bg-primary text-primary-foreground shadow-md"
                                            : "bg-card text-muted-foreground border border-border hover:bg-muted"
                                    )}
                                >
                                    {f}
                                </button>
                            ))}
                        </div>
                    </div>
                </div>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-4 pb-safe-nav space-y-4">
                {/* Summary Card */}
                <div className="bg-primary/5 p-4 rounded-2xl border border-primary/10 flex justify-between items-center">
                    <div>
                        <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">Total Revenue</p>
                        <h2 className="text-2xl font-bold text-primary mt-1">₹{totalAmount.toFixed(2)}</h2>
                    </div>
                    <div className="text-right">
                        <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">Transactions</p>
                        <h2 className="text-2xl font-bold text-foreground mt-1">{filteredSales.length}</h2>
                    </div>
                </div>

                {/* Sales List */}
                <div className="space-y-3">
                    {filteredSales.length > 0 ? (
                        filteredSales.map((sale) => (
                            <div key={sale.id} className="bg-card p-4 rounded-2xl shadow-sm border border-border flex justify-between items-center">
                                <div>
                                    <h3 className="font-semibold text-foreground">{sale.product_name || `Product #${sale.product_id}`}</h3>
                                    <div className="flex items-center gap-2 mt-1">
                                        <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded-md">Qty: {sale.quantity}</span>
                                        <span className="text-xs text-muted-foreground flex items-center gap-1">
                                            <Clock size={12} />
                                            {new Date(sale.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                        </span>
                                    </div>
                                    <p className="text-xs text-muted-foreground mt-1">
                                        {new Date(sale.timestamp).toLocaleDateString()}
                                    </p>
                                </div>
                                <div className="text-right">
                                    <span className="block font-bold text-lg text-primary">₹{sale.total_amount}</span>
                                    <span className="text-xs text-muted-foreground">ID: #{sale.id}</span>
                                </div>
                            </div>
                        ))
                    ) : (
                        <div className="text-center py-12 text-muted-foreground">
                            No sales found for this period.
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default SalesHistory;
