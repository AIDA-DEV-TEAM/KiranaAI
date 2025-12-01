import React, { useState, useEffect } from 'react';
import { useSwipeable } from 'react-swipeable';
import { getMandiPrices, getProducts, getSales } from '../services/api';
import { ArrowLeft, ArrowRight, TrendingUp, Package, IndianRupee } from 'lucide-react';

const StorekeeperView = () => {
    const [products, setProducts] = useState([]);
    const [mandiPrices, setMandiPrices] = useState([]);
    const [sales, setSales] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetchData();
    }, []);

    const fetchData = async () => {
        try {
            const [productsData, mandiData, salesData] = await Promise.all([
                getProducts(),
                getMandiPrices(),
                getSales()
            ]);
            setProducts(productsData);
            setMandiPrices(mandiData.prices || []);
            setSales(salesData);
        } catch (error) {
            console.error("Error fetching data:", error);
        } finally {
            setLoading(false);
        }
    };

    const handlers = useSwipeable({
        onSwipedLeft: (eventData) => console.log("User swiped left!", eventData),
        onSwipedRight: (eventData) => console.log("User swiped right!", eventData),
    });

    if (loading) return <div className="p-4">Loading...</div>;

    const totalSales = sales.reduce((sum, sale) => sum + sale.total_amount, 0);

    return (
        <div className="p-4 space-y-6 pb-20">
            <div className="flex justify-between items-center mb-4">
                <h1 className="text-2xl font-bold">Storekeeper Dashboard</h1>
                <button
                    onClick={async () => {
                        try {
                            await fetch('https://kiranaai.onrender.com/seed', { method: 'POST' });
                            alert('Data reset! Pull to refresh or restart app.');
                            window.location.reload();
                        } catch (e) {
                            alert('Failed to reset data');
                        }
                    }}
                    className="bg-gray-200 text-xs px-2 py-1 rounded"
                >
                    Reset Data
                </button>
            </div>

            {/* Sales Overview */}
            <div className="bg-indigo-50 border border-indigo-200 rounded-lg p-4">
                <h2 className="text-lg font-semibold flex items-center gap-2 mb-2 text-indigo-800">
                    <IndianRupee size={20} /> Sales Overview
                </h2>
                <div className="flex justify-between items-end mb-4">
                    <div>
                        <p className="text-sm text-indigo-600">Total Revenue</p>
                        <p className="text-2xl font-bold text-indigo-900">₹{totalSales.toLocaleString()}</p>
                    </div>
                    <div className="text-right">
                        <p className="text-sm text-indigo-600">Transactions</p>
                        <p className="text-xl font-bold text-indigo-900">{sales.length}</p>
                    </div>
                </div>
                <div className="bg-white rounded p-2 max-h-40 overflow-y-auto">
                    <table className="w-full text-sm text-left">
                        <thead className="text-xs text-gray-500 uppercase bg-gray-50 sticky top-0">
                            <tr>
                                <th className="px-2 py-1">Item</th>
                                <th className="px-2 py-1">Qty</th>
                                <th className="px-2 py-1 text-right">Amount</th>
                            </tr>
                        </thead>
                        <tbody>
                            {sales.map((sale) => (
                                <tr key={sale.id} className="border-b last:border-0">
                                    <td className="px-2 py-2 font-medium">{sale.product_name}</td>
                                    <td className="px-2 py-2">{sale.quantity}</td>
                                    <td className="px-2 py-2 text-right">₹{sale.total_amount}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Mandi Prices Ticker */}
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 overflow-hidden">
                <h2 className="text-lg font-semibold flex items-center gap-2 mb-2 text-yellow-800">
                    <TrendingUp size={20} /> Mandi Prices (Live)
                </h2>
                <div className="flex gap-4 overflow-x-auto pb-2">
                    {mandiPrices.length > 0 ? (
                        mandiPrices.map((item, index) => (
                            <div key={index} className="min-w-[150px] bg-white p-3 rounded shadow-sm border border-yellow-100">
                                <p className="font-bold text-gray-800">{item.commodity}</p>
                                <p className="text-sm text-gray-600">₹{item.modal_price}/q</p>
                                <p className="text-xs text-gray-400">{item.market}</p>
                            </div>
                        ))
                    ) : (
                        <p className="text-sm text-gray-500">No price updates available.</p>
                    )}
                </div>
            </div>

            {/* Inventory List */}
            <div>
                <h2 className="text-lg font-semibold flex items-center gap-2 mb-4">
                    <Package size={20} /> Inventory (Swipe Actions)
                </h2>
                <div className="space-y-3">
                    {products.map((product) => (
                        <InventoryCard key={product.id} product={product} />
                    ))}
                </div>
            </div>
        </div>
    );
};

const InventoryCard = ({ product }) => {
    const [swipeAction, setSwipeAction] = useState(null);

    const handlers = useSwipeable({
        onSwipedLeft: () => setSwipeAction('restock'),
        onSwipedRight: () => setSwipeAction('price_update'),
        trackMouse: true
    });

    const resetSwipe = () => setSwipeAction(null);

    return (
        <div {...handlers} className="relative overflow-hidden rounded-lg shadow-md bg-white border border-gray-100 select-none">
            {/* Swipe Backgrounds */}
            {swipeAction === 'restock' && (
                <div className="absolute inset-0 bg-blue-100 flex items-center justify-end pr-6 text-blue-700 font-bold z-10" onClick={resetSwipe}>
                    Restock <ArrowLeft className="ml-2" />
                </div>
            )}
            {swipeAction === 'price_update' && (
                <div className="absolute inset-0 bg-green-100 flex items-center justify-start pl-6 text-green-700 font-bold z-10" onClick={resetSwipe}>
                    <ArrowRight className="mr-2" /> Update Price
                </div>
            )}

            {/* Card Content */}
            <div className={`p-4 bg-white relative z-20 transition-transform ${swipeAction === 'restock' ? '-translate-x-24' : ''} ${swipeAction === 'price_update' ? 'translate-x-24' : ''}`}>
                <div className="flex justify-between items-start">
                    <div>
                        <h3 className="font-bold text-lg">{product.name}</h3>
                        <p className="text-sm text-gray-500">{product.category}</p>
                        {product.shelf_position && (
                            <span className="inline-block bg-gray-100 text-xs px-2 py-1 rounded mt-1">
                                📍 {product.shelf_position}
                            </span>
                        )}
                    </div>
                    <div className="text-right">
                        <p className="text-xl font-bold text-green-600">₹{product.price}</p>
                        <p className={`text-sm ${product.stock < 10 ? 'text-red-500 font-bold' : 'text-gray-600'}`}>
                            Stock: {product.stock}
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default StorekeeperView;
