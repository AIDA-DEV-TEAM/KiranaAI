import React from 'react';
import { Package, TrendingUp, AlertTriangle, ArrowUpRight, ArrowDownRight, Clock } from 'lucide-react';
import { cn } from '../lib/utils';
import { useTranslation } from 'react-i18next';
import { useAppData } from '../context/AppDataContext';
import { useNavigate } from 'react-router-dom';

const Dashboard = () => {
    const { t } = useTranslation();
    const { inventory, salesData: sales, loadingInventory, loadingSales } = useAppData();
    const navigate = useNavigate();

    const loading = loadingInventory || loadingSales;

    if (loading) {
        return (
            <div className="flex justify-center items-center h-[50vh]">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
            </div>
        );
    }

    const lowStockItems = inventory.filter(item => item.stock < (item.max_stock || 50));
    const totalSalesToday = sales
        .filter(sale => new Date(sale.timestamp).toDateString() === new Date().toDateString())
        .reduce((sum, sale) => sum + sale.total_amount, 0);

    const stats = [
        {
            label: t('total_products'),
            value: inventory.length,
            icon: Package,
            color: "text-blue-600 dark:text-blue-400",
            bg: "bg-blue-500/10",
            trend: "+12%",
            trendUp: true
        },
        {
            label: t('todays_sales'),
            value: `₹${totalSalesToday.toFixed(0)}`,
            icon: TrendingUp,
            color: "text-emerald-600 dark:text-emerald-400",
            bg: "bg-emerald-500/10",
            trend: "+8%",
            trendUp: true
        },
        {
            label: t('low_stock_items'),
            value: lowStockItems.length,
            icon: AlertTriangle,
            color: "text-orange-600 dark:text-orange-400",
            bg: "bg-orange-500/10",
            trend: "-2",
            trendUp: false
        }
    ];

    return (
        <div className="p-4 space-y-8 pb-safe">
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-3xl font-bold tracking-tight text-foreground">{t('dashboard')}</h2>
                    <div className="text-sm text-muted-foreground bg-muted px-3 py-1 rounded-full w-fit mt-2">
                        {new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}
                    </div>
                </div>
            </div>

            {/* Stats Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {stats.map((stat, index) => (
                    <div key={index} className="bg-card p-6 rounded-2xl shadow-sm border border-border hover:shadow-md transition-shadow duration-200">
                        <div className="flex items-center justify-between mb-4">
                            <div className={cn("p-3 rounded-xl", stat.bg, stat.color)}>
                                <stat.icon size={24} />
                            </div>
                            <div className={cn(
                                "flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-full",
                                stat.trendUp ? "text-emerald-600 dark:text-emerald-400 bg-emerald-500/10" : "text-red-600 dark:text-red-400 bg-red-500/10"
                            )}>
                                {stat.trendUp ? <ArrowUpRight size={14} /> : <ArrowDownRight size={14} />}
                                {stat.trend}
                            </div>
                        </div>
                        <div>
                            <p className="text-sm font-medium text-muted-foreground">{stat.label}</p>
                            <h3 className="text-3xl font-bold text-foreground mt-1">{stat.value}</h3>
                        </div>
                    </div>
                ))}
            </div>

            {/* Recent Sales Table */}
            <div className="bg-card rounded-2xl shadow-sm border border-border overflow-hidden">
                <div className="p-6 border-b border-border flex items-center justify-between">
                    <h3 className="text-lg font-semibold text-foreground">{t('recent_sales')}</h3>
                    <button
                        onClick={() => navigate('/sales')}
                        className="text-sm text-primary font-medium hover:underline"
                    >
                        {t('view_all')}
                    </button>
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm">
                        <thead className="bg-muted/50 text-muted-foreground">
                            <tr>
                                <th className="px-6 py-4 font-medium">Product</th>
                                <th className="px-6 py-4 font-medium">Quantity</th>
                                <th className="px-6 py-4 font-medium">Amount</th>
                                <th className="px-6 py-4 font-medium">Time</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-border">
                            {sales.slice(0, 5).map((sale) => (
                                <tr key={sale.id} className="hover:bg-muted/50 transition-colors">
                                    <td className="px-6 py-4">
                                        <div className="font-medium text-foreground">{sale.product_name || `Product #${sale.product_id}`}</div>
                                        <div className="text-xs text-muted-foreground">ID: #{sale.id}</div>
                                    </td>
                                    <td className="px-6 py-4 text-muted-foreground">{sale.quantity}</td>
                                    <td className="px-6 py-4 font-medium text-foreground">₹{sale.total_amount}</td>
                                    <td className="px-6 py-4 text-muted-foreground">
                                        <div className="flex items-center gap-1.5">
                                            <Clock size={14} />
                                            {new Date(sale.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                        </div>
                                    </td>
                                </tr>
                            ))}
                            {sales.length === 0 && (
                                <tr>
                                    <td colSpan={4} className="px-6 py-8 text-center text-muted-foreground">
                                        {t('no_sales')}
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
};

export default Dashboard;
