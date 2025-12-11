import React, { useState, useEffect } from 'react';
import {
    Home,
    AlertTriangle,
    TrendingUp,
    Search,
    Filter,
    Plus,
    ArrowUpRight,
    ArrowDownRight,
    Package,
    ShoppingCart,
    ChevronRight,
    MoreVertical,
    Database,
    Loader2,
    CheckCircle,
    Milk,
    Apple,
    Carrot,
    Beef,
    Wheat,
    Candy,
    Droplet,
    UtensilsCrossed,
    Fish,
    IceCream,
    Pizza,
    Sandwich,
    Coffee,
    Beer,
    Wine,
    Cigarette,
    X,
    Image as ImageIcon
} from 'lucide-react';
import { cn } from '../lib/utils';
// import { addProduct, updateProduct, addSale } from '../services/api'; -> Replaced
import { LocalStorageService } from '../services/LocalStorageService';
import { api } from '../services/api'; // For translation endpoint
import { getInstantTranslation } from '../utils/translationDictionary';
import { useTranslation } from 'react-i18next';
import { useAppData } from '../context/AppDataContext';

const ICONS = [
    { name: 'package', icon: Package, label: 'General' },
    { name: 'milk', icon: Milk, label: 'Dairy' },
    { name: 'apple', icon: Apple, label: 'Fruit' },
    { name: 'carrot', icon: Carrot, label: 'Veg' },
    { name: 'beef', icon: Beef, label: 'Meat' },
    { name: 'wheat', icon: Wheat, label: 'Grains' },
    { name: 'candy', icon: Candy, label: 'Sweets' },
    { name: 'droplet', icon: Droplet, label: 'Oil/Liq' },
    { name: 'utensils', icon: UtensilsCrossed, label: 'Food' },
    { name: 'fish', icon: Fish, label: 'Seafood' },
    { name: 'ice-cream', icon: IceCream, label: 'Frozen' },
    { name: 'pizza', icon: Pizza, label: 'Fast Food' },
    { name: 'coffee', icon: Coffee, label: 'Beverage' },
];



// Mock Data removed for real API integration

const CATEGORIES = ['All', 'Grains', 'Pulses', 'Oil', 'Flour', 'Spices', 'Dairy', 'Snacks', 'Essentials'];
const SHELF_POSITIONS = ['A1', 'A2', 'A3', 'B1', 'B2', 'B3', 'C1', 'C2', 'C3', 'D1', 'D2', 'Front', 'Counter', 'Storage'];

const StorekeeperView = () => {
    const [activeTab, setActiveTab] = useState('catalog');
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedCategory, setSelectedCategory] = useState('All');
    const { inventory, mandiPrices, loadingInventory, loadingMandi, refreshInventory, refreshSales, addToCart } = useAppData();
    const [products, setProducts] = useState([]);
    const [marketPrices, setMarketPrices] = useState([]);
    const { t, i18n } = useTranslation();

    // Swipe State
    const [touchStart, setTouchStart] = useState(null);
    const [touchEnd, setTouchEnd] = useState(null);
    const minSwipeDistance = 50;

    // Stock Update State
    const [stockUpdates, setStockUpdates] = useState({}); // { [id]: newStock }
    const [stockLoading, setStockLoading] = useState({}); // { [id]: boolean }
    const [reorderQuantities, setReorderQuantities] = useState({});
    const [reorderLoading, setReorderLoading] = useState({});

    // Modal State
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingProduct, setEditingProduct] = useState(null);
    const [formData, setFormData] = useState({
        name: '',
        translations: {}, // Store translations here
        category: 'Grains',
        price: '',
        stock: '',
        max_stock: '50',
        shelf_position: '',
        icon_name: 'package',
        image_url: ''
    });
    const [submitting, setSubmitting] = useState(false);
    const [isTranslating, setIsTranslating] = useState(false);

    // Sync local state with context data
    useEffect(() => {
        setProducts(inventory);
    }, [inventory]);

    useEffect(() => {
        setMarketPrices(mandiPrices);
    }, [mandiPrices]);

    const handleAddClick = () => {
        setEditingProduct(null);
        setFormData({
            name: '',
            translations: {},
            category: 'Grains',
            price: '',
            stock: '',
            max_stock: '50',
            shelf_position: '',
            icon_name: 'package',
            image_url: ''
        });
        setIsModalOpen(true);
    };

    const handleEditClick = (product) => {
        setEditingProduct(product);
        setFormData({
            name: product.name,
            translations: product.translations || {},
            category: product.category,
            price: product.price,
            stock: product.stock,
            max_stock: product.max_stock || '50',
            shelf_position: product.shelf_position || '',
            icon_name: product.icon_name || 'package',
            image_url: product.image_url || ''
        });
        setIsModalOpen(true);
    };

    // Swipe Handlers
    const onTouchStart = (e) => {
        setTouchEnd(null);
        setTouchStart(e.targetTouches[0].clientX);
    };

    const onTouchMove = (e) => setTouchEnd(e.targetTouches[0].clientX);

    const onTouchEnd = () => {
        if (!touchStart || !touchEnd) return;
        const distance = touchStart - touchEnd;
        const isLeftSwipe = distance > minSwipeDistance;
        const isRightSwipe = distance < -minSwipeDistance;
        const tabs = ['catalog', 'shortfall', 'prices'];
        const currentIndex = tabs.indexOf(activeTab);

        if (isLeftSwipe && currentIndex < tabs.length - 1) {
            setActiveTab(tabs[currentIndex + 1]);
        }
        if (isRightSwipe && currentIndex > 0) {
            setActiveTab(tabs[currentIndex - 1]);
        }
    };

    // Stock Logic
    const handleStockChange = (productId, currentStock, delta) => {
        setStockUpdates(prev => {
            const currentVal = prev[productId] ?? currentStock;
            const newVal = currentVal + delta;

            // Constraint 1: Cannot go below 0
            if (newVal < 0) return prev;

            // Constraint 2: Cannot exceed ORIGINAL stock (currentStock passed from UI is the DB value)
            if (newVal > currentStock) return prev;

            if (newVal === currentStock) {
                const { [productId]: _, ...rest } = prev;
                return rest;
            }
            return { ...prev, [productId]: newVal };
        });
    };

    const saveStockUpdate = async (product) => {
        const newStock = stockUpdates[product.id];
        if (newStock === undefined) return;

        // Calculate delta: original - new
        const quantitySold = product.stock - newStock;

        if (quantitySold <= 0) {
            alert("To restock items, please use the Reorder tab.");
            setStockUpdates(prev => {
                const { [product.id]: _, ...rest } = prev;
                return rest;
            });
            return;
        }

        setStockLoading(prev => ({ ...prev, [product.id]: true }));
        try {
            // Call Sales API to record sale + deduct stock
            // Replaced with LocalStorageService
            await LocalStorageService.addSale({
                product_id: product.id,
                quantity: quantitySold
            });

            // Optimistic update locally
            setProducts(prev => prev.map(p => p.id === product.id ? { ...p, stock: newStock } : p));
            setStockUpdates(prev => {
                const { [product.id]: _, ...rest } = prev;
                return rest;
            });
            await refreshInventory(true);
            await refreshSales(true);
        } catch (error) {
            console.error("Failed to update stock", error);
            alert("Failed to record sale");
        } finally {
            setStockLoading(prev => ({ ...prev, [product.id]: false }));
        }
    };

    const handleReorderChange = (productId, delta) => {
        const product = products.find(p => p.id === productId);
        if (!product) return;

        const maxStock = product.max_stock || 50;
        const currentStock = product.stock;
        const maxAddable = Math.max(0, maxStock - currentStock);

        setReorderQuantities(prev => {
            const shortfall = maxStock - currentStock;
            // Default: Try 10, but at least shortfall, BUT capped at maxAddable (which is shortfall anyway?)
            // Wait: shortfall = max - current. maxAddable = max - current.
            // So default = Math.min(maxAddable, Math.max(10, shortfall)); 
            // Effectively, if shortfall > 10, use shortfall. If shortfall < 10, use 10 but cap at maxAddable (which IS shortfall).
            // So really, sticking to 'shortfall' (filling to max) is the only logical default if we can't exceed max.
            // If I want to suggest 10 when shortfall is 2, I can't, because 2+10 > max? 
            // User said "user shouldn't able to restock the more than max quantity".
            // If I have 48/50. Shortfall 2. I can only add 2.
            // So default MUST be 'shortfall'.

            const defaultQty = shortfall;

            const currentVal = prev[productId] ?? defaultQty;
            const newVal = currentVal + delta;

            if (newVal < 1) return prev;
            if (newVal > maxAddable) return prev;

            return { ...prev, [productId]: newVal };
        });
    };

    const confirmRestock = async (product) => {
        const maxStock = product.max_stock || 50;
        const shortfall = Math.max(0, maxStock - product.stock);
        const qtyToAdd = reorderQuantities[product.id] ?? shortfall;

        setReorderLoading(prev => ({ ...prev, [product.id]: true }));
        try {
            const newStock = product.stock + qtyToAdd;
            // Safety check: ensure we don't exceed max unless explicitly intended (though reorder logic usually aims for max)
            // Given the requirement "New_Stock = Current + Added", we stick to that formula.

            // await updateProduct(product.id, { ...product, stock: newStock }); -> Replaced
            LocalStorageService.updateProduct(product.id, { stock: newStock });

            setProducts(prev => prev.map(p => p.id === product.id ? { ...p, stock: newStock } : p));
            setReorderQuantities(prev => {
                const { [product.id]: _, ...rest } = prev;
                return rest;
            });
            await refreshInventory(true);
        } catch (error) {
            console.error("Failed to restock", error);
            alert("Failed to restock");
        } finally {
            setReorderLoading(prev => ({ ...prev, [product.id]: false }));
        }
    }; const handleSubmit = async (e) => {
        e.preventDefault();
        setSubmitting(true);
        try {
            if (parseInt(formData.stock) > parseInt(formData.max_stock)) {
                alert(t('stock_exceeds_max') || "Stock cannot exceed Max Stock!");
                setSubmitting(false);
                return;
            }

            const payload = {
                ...formData,
                price: parseFloat(formData.price),
                stock: parseInt(formData.stock),
                max_stock: parseInt(formData.max_stock)
            };

            if (editingProduct) {
                // await updateProduct(editingProduct.id, payload);
                LocalStorageService.updateProduct(editingProduct.id, payload);
            } else {
                // await addProduct(payload);
                LocalStorageService.addProduct(payload);
            }

            await refreshInventory(true); // Force refresh context
            setIsModalOpen(false);
        } catch (error) {
            console.error("Failed to save product", error);
            alert("Failed to save product");
        } finally {
            setSubmitting(false);
            setIsTranslating(false);
        }
    };

    // Translation Handler
    const handleNameChange = async (e) => {
        const newName = e.target.value;
        const newTranslations = { ...formData.translations, en: newName };

        setFormData(prev => ({ ...prev, name: newName, translations: newTranslations }));

        if (!newName.trim()) return;

        // 1. Try Local Dictionary (Instant)
        const supportedLangs = ['hi', 'te', 'ta', 'kn', 'ml', 'gu', 'mr', 'bn', 'pa'];
        let missingLangs = [];
        let hasLocal = false;

        supportedLangs.forEach(lang => {
            const localTrans = getInstantTranslation(newName, lang);
            if (localTrans) {
                newTranslations[lang] = localTrans;
                hasLocal = true;
            } else {
                missingLangs.push(lang);
            }
        });

        if (hasLocal) {
            setFormData(prev => ({ ...prev, translations: newTranslations }));
        }

        // 2. AI Fallback (Debounced)
        if (missingLangs.length > 0) {
            setIsTranslating(true);
            // Simple debounce using timeout id attached to window or just let it fly for now (optimize later if needed)
            // For stability, we'll just trigger it.
            try {
                const response = await api.post('/translate/', {
                    text: newName,
                    target_languages: missingLangs
                });

                if (response.data?.translations) {
                    setFormData(prev => ({
                        ...prev,
                        translations: { ...prev.translations, ...response.data.translations }
                    }));
                }
            } catch (err) {
                console.warn("Translation failed", err);
            } finally {
                setIsTranslating(false);
            }
        }
    };

    const getLocalizedName = (product) => {
        if (!product) return '';
        // If translations exist and current language is valid
        if (product.translations && product.translations[i18n.language]) {
            return product.translations[i18n.language];
        }
        // Fallback to name (English)
        return product.name;
    };


    const filteredProducts = products.filter(p => {
        // Search in English name OR translated name
        const currentName = getLocalizedName(p).toLowerCase();
        const englishName = (p.name || '').toLowerCase();
        const query = searchQuery.toLowerCase();

        const matchesSearch = currentName.includes(query) || englishName.includes(query);
        // Assuming API returns category, if not, we might need to adjust or mock it for now
        const matchesCategory = selectedCategory === 'All' || (p.category || 'Uncategorized') === selectedCategory;
        return matchesSearch && matchesCategory;
    });

    return (
        <div className="flex flex-col h-full bg-background relative font-sans">
            {/* Top Navigation Tabs */}
            <div className="sticky top-0 z-10 bg-background/80 backdrop-blur-xl border-b border-border pb-2">
                <div className="px-4 py-3">
                    <div className="flex items-center justify-between mb-2">
                        <h1 className="text-2xl font-bold tracking-tight text-foreground">{t('store_management')}</h1>
                        <button
                            onClick={handleAddClick}
                            className="flex items-center gap-2 px-3 py-1.5 bg-primary hover:bg-primary/90 text-primary-foreground rounded-lg text-xs font-medium transition-colors shadow-sm shadow-primary/20"
                        >
                            <Plus size={14} />
                            {t('add_product')}
                        </button>
                    </div>
                    <div className="flex p-1 bg-muted/50 rounded-xl overflow-x-auto no-scrollbar">
                        {['catalog', 'shortfall', 'prices'].map((tab) => (
                            <button
                                key={tab}
                                onClick={() => setActiveTab(tab)}
                                className={cn(
                                    "flex-1 py-2 text-sm font-medium rounded-lg transition-all duration-200 capitalize min-w-[80px]",
                                    activeTab === tab
                                        ? "bg-background text-foreground shadow-sm"
                                        : "text-muted-foreground hover:text-foreground"
                                )}
                            >
                                {tab === 'shortfall' ? t('reorder') || "Reorder" : t(tab)}
                            </button>
                        ))}
                    </div>
                </div>
            </div>

            {/* Main Content Area */}
            <div
                className="flex-1 overflow-y-auto pb-safe-nav touch-pan-y"
                onTouchStart={onTouchStart}
                onTouchMove={onTouchMove}
                onTouchEnd={onTouchEnd}
            >

                {/* Screen 1: Catalog */}
                {activeTab === 'catalog' && (
                    <div className="px-2 py-4 space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-300">
                        {/* Search & Filter */}
                        <div className="space-y-3">
                            <div className="flex items-center gap-2 bg-card p-3 rounded-xl shadow-sm border border-border focus-within:ring-2 focus-within:ring-primary/20 transition-all">
                                <Search size={20} className="text-muted-foreground" />
                                <input
                                    type="text"
                                    placeholder={t('search_products')}
                                    className="flex-1 outline-none bg-transparent text-foreground placeholder-muted-foreground"
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                />
                                <Filter size={18} className="text-muted-foreground" />
                            </div>

                            {/* Category Pills */}
                            <div className="flex gap-2 overflow-x-auto pb-2 no-scrollbar">
                                {CATEGORIES.map(cat => (
                                    <button
                                        key={cat}
                                        onClick={() => setSelectedCategory(cat)}
                                        className={cn(
                                            "px-4 py-1.5 rounded-full text-sm font-medium whitespace-nowrap transition-all active:scale-95",
                                            selectedCategory === cat
                                                ? "bg-primary text-primary-foreground shadow-md shadow-primary/20"
                                                : "bg-card text-muted-foreground border border-border hover:bg-muted"
                                        )}
                                    >
                                        {cat}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Product Grid */}
                        {loadingInventory ? (
                            <div className="flex justify-center py-12">
                                <Loader2 className="w-8 h-8 animate-spin text-primary" />
                            </div>
                        ) : (
                            <div className="grid grid-cols-1 gap-3">
                                {filteredProducts.length > 0 ? filteredProducts.map(product => (
                                    <div key={product.id} className="bg-card p-3 rounded-2xl shadow-sm border border-border flex items-start gap-3">
                                        <div className="w-20 h-20 bg-muted/50 rounded-xl flex items-center justify-center text-3xl shrink-0 overflow-hidden self-center">
                                            {product.image_url ? (
                                                <img src={product.image_url} alt={product.name} className="w-full h-full object-cover" />
                                            ) : (
                                                (() => {
                                                    const IconComponent = ICONS.find(i => i.name === product.icon_name)?.icon || Package;
                                                    return <IconComponent className="text-muted-foreground" size={32} />;
                                                })()
                                            )}
                                        </div>
                                        <div className="flex-1 min-w-0 flex flex-col justify-between h-full">
                                            <div>
                                                <div className="flex justify-between items-start">
                                                    <h3 className="font-bold text-foreground truncate text-base">
                                                        {getLocalizedName(product)}
                                                    </h3>
                                                    <button onClick={() => handleEditClick(product)} className="text-muted-foreground p-1 hover:bg-muted rounded-full">
                                                        <MoreVertical size={16} />
                                                    </button>
                                                </div>
                                                <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
                                                    <span>{product.category || 'General'}</span>
                                                    <span>•</span>
                                                    <span className="font-medium text-purple-600 bg-purple-500/10 px-1.5 py-0.5 rounded text-[10px] border border-purple-500/20">
                                                        {product.shelf_position || 'N/A'}
                                                    </span>
                                                </div>
                                            </div>

                                            <div className="flex items-end justify-between mt-3">
                                                <div className="flex flex-col">
                                                    <span className="text-xs text-muted-foreground">Price</span>
                                                    <span className="text-sm font-bold text-foreground">₹{product.price}</span>
                                                </div>

                                                <div className="flex flex-col items-end gap-1">
                                                    <div className="flex items-center gap-3 bg-muted/50 rounded-lg p-1">
                                                        <button
                                                            onClick={() => handleStockChange(product.id, product.stock, -1)}
                                                            className="w-8 h-8 flex items-center justify-center bg-background rounded-md shadow-sm border border-border text-foreground hover:bg-muted active:scale-95 transition-all"
                                                        >
                                                            <div className="w-3 h-0.5 bg-current rounded-full" />
                                                        </button>
                                                        <span className="text-xl font-bold text-primary min-w-[1.5rem] text-center">
                                                            {stockUpdates[product.id] ?? product.stock}
                                                        </span>
                                                        <button
                                                            onClick={() => handleStockChange(product.id, product.stock, 1)}
                                                            disabled={(stockUpdates[product.id] ?? product.stock) >= product.stock}
                                                            className={cn(
                                                                "w-8 h-8 flex items-center justify-center rounded-md shadow-sm transition-all",
                                                                (stockUpdates[product.id] ?? product.stock) >= product.stock
                                                                    ? "bg-muted text-muted-foreground cursor-not-allowed"
                                                                    : "bg-primary text-primary-foreground hover:bg-primary/90 active:scale-95"
                                                            )}
                                                        >
                                                            <Plus size={16} strokeWidth={3} />
                                                        </button>
                                                    </div>
                                                </div>
                                            </div>

                                            {stockUpdates[product.id] !== undefined && (
                                                <div className="mt-2 flex justify-end">
                                                    <button
                                                        onClick={() => saveStockUpdate(product)}
                                                        disabled={stockLoading[product.id]}
                                                        className="text-xs bg-black dark:bg-white text-white dark:text-black font-bold px-3 py-1.5 rounded-lg shadow-lg active:scale-95 transition-all flex items-center gap-1.5"
                                                    >
                                                        {stockLoading[product.id] ? <Loader2 size={12} className="animate-spin" /> : <CheckCircle size={12} />}
                                                        {t('confirm_sale') || "Confirm Sale"}
                                                    </button>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                )) : (
                                    <div className="text-center py-12 text-muted-foreground">
                                        {t('no_stock_found') || "No Stock Found"}
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                )}

                {/* Screen 2: Inventory Shortfall */}
                {activeTab === 'shortfall' && (
                    <div className="px-2 py-4 space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-300">
                        <div className="flex items-center gap-2 mb-2">
                            <AlertTriangle className="text-red-500" size={20} />
                            <h2 className="text-lg font-bold text-foreground">{t('low_stock_items')}</h2>
                        </div>

                        <div className="space-y-3">
                            {products.filter(p => p.stock <= ((p.max_stock || 50) * 0.5)).length > 0 ? (
                                products.filter(p => p.stock <= ((p.max_stock || 50) * 0.5)).map(item => {
                                    const maxStock = item.max_stock || 50;
                                    const shortfall = maxStock - item.stock;
                                    const maxAddable = maxStock - item.stock;
                                    const restockQty = reorderQuantities[item.id] ?? shortfall;

                                    return (
                                        <div key={item.id} className={cn(
                                            "bg-card p-4 rounded-2xl border-l-4 shadow-sm flex flex-col gap-3",
                                            item.stock < 5 ? "border-l-red-500" : "border-l-orange-500"
                                        )}>
                                            <div className="flex justify-between items-start">
                                                <div>
                                                    <h3 className="font-semibold text-foreground">{getLocalizedName(item)}</h3>
                                                    <div className="flex gap-3 mt-1 text-sm">
                                                        <p className="text-muted-foreground">Current: <span className="font-bold text-foreground">{item.stock}</span></p>
                                                        <p className="text-muted-foreground">Target: {maxStock}</p>
                                                    </div>
                                                </div>
                                            </div>

                                            <div className="flex items-center justify-between border-t border-border pt-3">
                                                <div className="flex items-center gap-3 bg-muted/30 rounded-lg p-1">
                                                    <button
                                                        onClick={() => handleReorderChange(item.id, -1)}
                                                        className="w-8 h-8 flex items-center justify-center bg-background rounded-md shadow-sm border border-border text-foreground hover:bg-muted active:scale-95 transition-all"
                                                    >
                                                        <div className="w-3 h-0.5 bg-current rounded-full" />
                                                    </button>
                                                    <span className="text-lg font-bold text-foreground min-w-[2rem] text-center">
                                                        {restockQty}
                                                    </span>
                                                    <button
                                                        onClick={() => handleReorderChange(item.id, 1)}
                                                        disabled={restockQty >= maxAddable}
                                                        className={cn(
                                                            "w-8 h-8 flex items-center justify-center rounded-md shadow-sm transition-all",
                                                            restockQty >= maxAddable
                                                                ? "bg-muted text-muted-foreground cursor-not-allowed"
                                                                : "bg-primary text-primary-foreground hover:bg-primary/90 active:scale-95"
                                                        )}
                                                    >
                                                        <Plus size={16} strokeWidth={3} />
                                                    </button>
                                                </div>

                                                <button
                                                    onClick={() => confirmRestock(item)}
                                                    disabled={reorderLoading[item.id]}
                                                    className="px-4 py-2 bg-primary text-primary-foreground text-sm font-medium rounded-xl shadow-sm shadow-primary/20 hover:bg-primary/90 active:scale-95 transition-all flex items-center gap-2"
                                                >
                                                    {reorderLoading[item.id] ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle size={14} />}
                                                    {t('restock')}
                                                </button>
                                            </div>
                                        </div>
                                    );
                                })
                            ) : (
                                <div className="text-center py-8 text-muted-foreground bg-card rounded-2xl border border-border">
                                    <CheckCircle className="w-12 h-12 mx-auto mb-2 text-green-500 opacity-50" />
                                    <p>All stock levels are healthy!</p>
                                </div>
                            )}
                        </div>

                        <div className="bg-blue-500/10 p-5 rounded-2xl border border-blue-500/20 mt-6">
                            <h3 className="font-semibold text-blue-600 dark:text-blue-400 mb-2 flex items-center gap-2">
                                <TrendingUp size={16} /> {t('smart_suggestion')}
                            </h3>
                            <p className="text-sm text-blue-700 dark:text-blue-300 leading-relaxed">
                                {products.filter(p => p.stock <= ((p.max_stock || 50) * 0.5)).length > 0 ? (
                                    (() => {
                                        // Find item with highest shortfall
                                        const criticalItem = [...products]
                                            .filter(p => p.stock <= ((p.max_stock || 50) * 0.5))
                                            .sort((a, b) => ((b.max_stock || 50) - b.stock) - ((a.max_stock || 50) - a.stock))[0];

                                        const shortfall = (criticalItem.max_stock || 50) - criticalItem.stock;

                                        return (
                                            <>
                                                Priority Action: Restock <strong>{getLocalizedName(criticalItem)}</strong> immediately.
                                                You are short by <strong>{shortfall} units</strong> to meet your target of {criticalItem.max_stock || 50}.
                                            </>
                                        );
                                    })()
                                ) : (
                                    "Great job! Your inventory levels are optimized. No urgent restocking needed."
                                )}
                            </p>
                        </div>
                    </div>
                )}

                {/* Screen 3: Live Prices */}
                {activeTab === 'prices' && (
                    <div className="px-2 py-4 space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-300">
                        <div className="flex items-center gap-2 mb-2">
                            <TrendingUp className="text-green-500" size={20} />
                            <h2 className="text-lg font-bold text-foreground">
                                {t('market_intelligence')}
                                <span className="ml-2 text-sm font-normal text-muted-foreground">
                                    {new Date().toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}
                                </span>
                            </h2>
                        </div>

                        <div className="bg-card rounded-2xl shadow-sm border border-border overflow-hidden">
                            <table className="w-full text-left text-sm">
                                <thead className="bg-muted/50 text-muted-foreground font-medium border-b border-border">
                                    <tr>
                                        <th className="px-4 py-3">Item</th>
                                        <th className="px-4 py-3">Market</th>
                                        <th className="px-4 py-3">Price (₹/q)</th>
                                        <th className="px-4 py-3 text-right">Date</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-border">
                                    {(() => {
                                        // Create a Set of normalized inventory keywords (names and categories) for efficient matching
                                        // We confirm if the commodity is relevant to what we sell
                                        const uniqueInventoryKeywords = new Set([
                                            ...products.map(p => p.name.toLowerCase()),
                                            ...products.map(p => p.category.toLowerCase())
                                        ]);

                                        const livePrices = marketPrices.filter(item => {
                                            // 1. Validity Check
                                            if (!item.arrival_date || !item.commodity) return false;

                                            // 2. Inventory Match Check
                                            const commodity = item.commodity.toLowerCase();
                                            const isRelevant = Array.from(uniqueInventoryKeywords).some(keyword =>
                                                keyword.includes(commodity) || commodity.includes(keyword)
                                            );

                                            if (!isRelevant) return false;

                                            // 3. Price Validity (User also asked for "Live" previously, keeping valid price check)
                                            return parseFloat(item.modal_price) > 0;
                                        });

                                        if (livePrices.length === 0) {
                                            return (
                                                <tr>
                                                    <td colSpan="4" className="px-4 py-8 text-center text-muted-foreground">
                                                        {loadingMandi ? <Loader2 className="animate-spin mx-auto" /> : (
                                                            <div className="flex flex-col items-center gap-2">
                                                                <p>{t('no_sales') || "No relevant market data found."}</p>
                                                                <p className="text-xs">Prices are only shown for items in your inventory.</p>
                                                            </div>
                                                        )}
                                                    </td>
                                                </tr>
                                            );
                                        }

                                        return livePrices.map((item, index) => (
                                            <tr key={index} className="hover:bg-muted/50 transition-colors">
                                                <td className="px-4 py-3 font-medium text-foreground">
                                                    <div className="flex items-center gap-2">
                                                        {item.commodity}
                                                        <span className="bg-green-500/10 text-green-600 text-[10px] font-bold px-1.5 py-0.5 rounded">{t('live')}</span>
                                                    </div>
                                                    <div className="text-[10px] text-muted-foreground font-normal">{item.market}</div>
                                                </td>
                                                <td className="px-4 py-3 text-muted-foreground">{item.district}</td>
                                                <td className="px-4 py-3 font-bold text-primary">₹{item.modal_price}</td>
                                                <td className="px-4 py-3 text-right text-xs text-muted-foreground">
                                                    {item.arrival_date}
                                                </td>
                                            </tr>
                                        ));
                                    })()}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}


            </div>

            {/* Add/Edit Modal */}
            {isModalOpen && (
                <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center p-4 sm:p-0">
                    <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setIsModalOpen(false)} />
                    <div className="relative bg-card w-full max-w-lg rounded-t-3xl sm:rounded-3xl shadow-2xl border border-border max-h-[85vh] overflow-y-auto animate-in slide-in-from-bottom-10 fade-in duration-300 pb-safe">
                        <div className="sticky top-0 bg-card/80 backdrop-blur-md p-4 border-b border-border flex items-center justify-between z-10">
                            <h2 className="text-lg font-bold text-foreground">
                                {editingProduct ? t('edit_product') : t('add_product')}
                            </h2>
                            <button onClick={() => setIsModalOpen(false)} className="p-2 hover:bg-muted rounded-full transition-colors">
                                <X size={20} />
                            </button>
                        </div>

                        <form onSubmit={handleSubmit} className="p-6 space-y-6">
                            {/* Icon/Image Selector */}
                            <div className="space-y-3">
                                <label className="text-sm font-medium text-muted-foreground">{t('product_visual')}</label>
                                <div className="bg-muted/30 p-4 rounded-2xl border border-border">
                                    <div className="flex gap-2 mb-4">
                                        <button
                                            type="button"
                                            onClick={() => setFormData({ ...formData, image_url: '' })}
                                            className={cn(
                                                "flex-1 py-2 text-xs font-medium rounded-lg transition-all",
                                                !formData.image_url ? "bg-primary text-primary-foreground shadow-sm" : "bg-background text-muted-foreground hover:bg-muted"
                                            )}
                                        >
                                            {t('select_icon')}
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => setFormData({ ...formData, image_url: 'https://' })}
                                            className={cn(
                                                "flex-1 py-2 text-xs font-medium rounded-lg transition-all",
                                                formData.image_url ? "bg-primary text-primary-foreground shadow-sm" : "bg-background text-muted-foreground hover:bg-muted"
                                            )}
                                        >
                                            {t('image_url')}
                                        </button>
                                    </div>

                                    {!formData.image_url ? (
                                        <div className="grid grid-cols-5 gap-2">
                                            {ICONS.map((item) => (
                                                <button
                                                    key={item.name}
                                                    type="button"
                                                    onClick={() => setFormData({ ...formData, icon_name: item.name })}
                                                    className={cn(
                                                        "aspect-square flex flex-col items-center justify-center gap-1 rounded-xl transition-all",
                                                        formData.icon_name === item.name
                                                            ? "bg-primary text-primary-foreground shadow-md scale-105"
                                                            : "bg-background text-muted-foreground hover:bg-muted hover:scale-105"
                                                    )}
                                                >
                                                    <item.icon size={20} />
                                                </button>
                                            ))}
                                        </div>
                                    ) : (
                                        <div className="space-y-3">
                                            <div className="flex items-center gap-2 bg-background p-2 rounded-xl border border-border focus-within:ring-2 focus-within:ring-primary/20">
                                                <ImageIcon size={18} className="text-muted-foreground" />
                                                <input
                                                    type="url"
                                                    placeholder="https://example.com/image.jpg"
                                                    className="flex-1 bg-transparent outline-none text-sm"
                                                    value={formData.image_url}
                                                    onChange={(e) => setFormData({ ...formData, image_url: e.target.value })}
                                                />
                                            </div>
                                            {formData.image_url && (
                                                <div className="aspect-video rounded-xl bg-black/5 overflow-hidden border border-border">
                                                    <img
                                                        src={formData.image_url}
                                                        alt="Preview"
                                                        className="w-full h-full object-cover"
                                                        onError={(e) => e.target.style.display = 'none'}
                                                    />
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>
                            </div>

                            <div className="space-y-4">
                                <div className="space-y-2">
                                    <label className="text-sm font-medium text-muted-foreground">
                                        {t('product_name')}
                                        {isTranslating && <span className="text-xs text-primary ml-2 animate-pulse">Translating...</span>}
                                    </label>
                                    <input
                                        required
                                        type="text"
                                        placeholder="e.g. Sona Masoori Rice"
                                        className="w-full bg-muted/30 p-3 rounded-xl border border-border outline-none focus:ring-2 focus:ring-primary/20 transition-all"
                                        value={formData.name}
                                        onChange={handleNameChange}
                                    />
                                </div>

                                <div className="grid grid-cols-2 gap-4">
                                    <div className="space-y-2">
                                        <label className="text-sm font-medium text-muted-foreground">{t('category')}</label>
                                        <select
                                            className="w-full bg-muted/30 p-3 rounded-xl border border-border outline-none focus:ring-2 focus:ring-primary/20 transition-all appearance-none"
                                            value={formData.category}
                                            onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                                        >
                                            {CATEGORIES.filter(c => c !== 'All').map(c => (
                                                <option key={c} value={c}>{c}</option>
                                            ))}
                                        </select>
                                    </div>
                                    <div className="space-y-2">
                                        <label className="text-sm font-medium text-muted-foreground">{t('shelf_position')}</label>
                                        <select
                                            className="w-full bg-muted/30 p-3 rounded-xl border border-border outline-none focus:ring-2 focus:ring-primary/20 transition-all appearance-none"
                                            value={formData.shelf_position}
                                            onChange={(e) => setFormData({ ...formData, shelf_position: e.target.value })}
                                        >
                                            <option value="" disabled>Select Position</option>
                                            {SHELF_POSITIONS.map(pos => (
                                                <option key={pos} value={pos}>{pos}</option>
                                            ))}
                                        </select>
                                    </div>
                                </div>

                                <div className="grid grid-cols-2 gap-4">
                                    <div className="space-y-2">
                                        <label className="text-sm font-medium text-muted-foreground">{t('price')} (₹)</label>
                                        <input
                                            required
                                            type="number"
                                            min="0"
                                            step="0.01"
                                            className="w-full bg-muted/30 p-3 rounded-xl border border-border outline-none focus:ring-2 focus:ring-primary/20 transition-all"
                                            value={formData.price}
                                            onChange={(e) => setFormData({ ...formData, price: e.target.value })}
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <label className="text-sm font-medium text-muted-foreground">{t('stock')}</label>
                                        <input
                                            required
                                            type="number"
                                            min="0"
                                            className="w-full bg-muted/30 p-3 rounded-xl border border-border outline-none focus:ring-2 focus:ring-primary/20 transition-all"
                                            value={formData.stock}
                                            onChange={(e) => setFormData({ ...formData, stock: e.target.value })}
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <label className="text-sm font-medium text-muted-foreground">Max Stock</label>
                                        <input
                                            required
                                            type="number"
                                            min="0"
                                            className="w-full bg-muted/30 p-3 rounded-xl border border-border outline-none focus:ring-2 focus:ring-primary/20 transition-all"
                                            value={formData.max_stock}
                                            onChange={(e) => setFormData({ ...formData, max_stock: e.target.value })}
                                        />
                                    </div>
                                </div>
                            </div>

                            <button
                                type="submit"
                                disabled={submitting}
                                className="w-full bg-primary text-primary-foreground py-4 rounded-xl font-bold text-lg shadow-lg shadow-primary/25 hover:bg-primary/90 active:scale-95 transition-all disabled:opacity-70 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                            >
                                {submitting ? <Loader2 className="animate-spin" /> : <CheckCircle />}
                                {editingProduct ? t('update_product') : t('save_product')}
                            </button>
                        </form>
                    </div>
                </div>
            )}
        </div >
    );
};

export default StorekeeperView;
