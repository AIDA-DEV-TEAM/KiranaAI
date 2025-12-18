import React, { useState, useEffect } from 'react';
import { Camera, Upload, CheckCircle, AlertCircle, Save, RefreshCw, Plus, Trash2 } from 'lucide-react';
import { Camera as CapacitorCamera, CameraResultType, CameraSource } from '@capacitor/camera';
import { uploadVisionImage } from '../services/api';
import { useAppData } from '../context/AppDataContext';
import { LocalStorageService } from '../services/LocalStorageService';

const SHELF_POSITIONS = ['A1', 'A2', 'A3', 'B1', 'B2', 'B3', 'C1', 'C2', 'C3', 'D1', 'D2', 'Front', 'Counter', 'Storage'];
const CATEGORIES = ['Grains', 'Pulses', 'Oil', 'Flour', 'Spices', 'Dairy', 'Snacks', 'Essentials', 'Beverage', 'Fruit', 'Veg', 'Meat', 'Seafood', 'Frozen', 'Sweets', 'Fast Food', 'Uncategorized'];

const StockScanningView = () => {
    // Context
    const { inventory, refreshInventory } = useAppData();

    // State
    const [ocrResult, setOcrResult] = useState(null); // Raw result
    const [billData, setBillData] = useState([]); // [{ name, quantity, price, matchedProductId, isNew }]
    const [shelfResult, setShelfResult] = useState(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [isReviewing, setIsReviewing] = useState(false);
    const [commitLoading, setCommitLoading] = useState(false);

    // Persistence: Load on Mount
    useEffect(() => {
        const storedBillData = localStorage.getItem('bill_review_data');
        const storedIsReviewing = localStorage.getItem('bill_is_reviewing');
        const storedShelfResult = localStorage.getItem('shelf_organizer_result');

        if (storedBillData) {
            try {
                setBillData(JSON.parse(storedBillData));
            } catch (e) { console.error("Failed to parse stored bill data"); }
        }

        if (storedIsReviewing) {
            setIsReviewing(storedIsReviewing === 'true');
        }

        if (storedShelfResult) {
            try {
                setShelfResult(JSON.parse(storedShelfResult));
            } catch (e) { console.error("Failed to parse stored shelf result"); }
        }
    }, []);

    // Persistence: Save on Change
    useEffect(() => {
        localStorage.setItem('bill_review_data', JSON.stringify(billData));
        localStorage.setItem('bill_is_reviewing', isReviewing.toString());
        localStorage.setItem('shelf_organizer_result', JSON.stringify(shelfResult));
    }, [billData, isReviewing, shelfResult]);

    // Matching Logic
    const matchProducts = (extractedItems) => {
        return extractedItems.map(item => {
            // Simple fuzzy match: check if extracted name is container in product name or vice versa
            // In real app, use Fuse.js or Levenshtein
            const bestMatch = inventory.find(p => {
                const pName = (typeof p.name === 'object' ? (p.name.en || Object.values(p.name)[0]) : p.name).toLowerCase();
                const iName = (item.name || '').toLowerCase();
                return pName.includes(iName) || iName.includes(pName);
            });

            return {
                ...item,
                quantity: item.quantity || 1,
                unit_price: item.unit_price || (bestMatch ? bestMatch.price : 0),
                shelf_position: bestMatch ? (bestMatch.shelf_position || 'Storage') : 'Storage',
                category: bestMatch ? bestMatch.category : 'Uncategorized',
                max_stock: bestMatch ? bestMatch.max_stock : 50,
                matchedProductId: bestMatch ? bestMatch.id : 'new',
                isNew: !bestMatch
            };
        });
    };

    const processImageFile = async (file, type) => {
        if (!file) return;

        setLoading(true);
        setError(null);
        setOcrResult(null);
        setShelfResult(null);
        setIsReviewing(false);

        try {
            const result = await uploadVisionImage(file, type);
            // Robust parsing
            const cleanJson = typeof result.data === 'string'
                ? result.data.replace(/```json\n?|\n?```/g, '').trim()
                : JSON.stringify(result.data);

            let parsedData;
            try {
                parsedData = typeof result.data === 'object' ? result.data : JSON.parse(cleanJson);
            } catch (e) {
                console.error("JSON parse error:", e);
                // Fallback if AI returns text instead of JSON
                parsedData = [];
                setError("Could not parse image data. Please try again.");
                return;
            }

            if (type === 'ocr') {
                const items = Array.isArray(parsedData) ? parsedData : [];
                if (items.length === 0) {
                    setError("Oops! We couldn't find any items in that image. Please try capturing or uploading a clear photo of the bill.");
                    return;
                }
                const matchedMessages = matchProducts(items);
                setBillData(matchedMessages);
                setOcrResult(matchedMessages); // Keep raw reference if needed
                setIsReviewing(true);
            } else {
                if (!parsedData || (Array.isArray(parsedData) && parsedData.length === 0)) {
                    setError("We couldn't spot any products on the shelf. Please ensure the shelves are well-lit and try again.");
                    return;
                }

                // Smart Shelf Organizer Logic
                const auditedItems = parsedData.map(item => {
                    // Match with inventory
                    const bestMatch = inventory.find(p => {
                        const pName = (typeof p.name === 'object' ? (p.name.en || Object.values(p.name)[0]) : p.name).toLowerCase();
                        const iName = (item.name || '').toLowerCase();
                        return pName.includes(iName) || iName.includes(pName);
                    });

                    // Determine Category: Use matched product's category if available (source of truth), else AI guess, else Uncategorized
                    const resolvedCategory = bestMatch?.category || item.category || 'Uncategorized';

                    return {
                        ...item,
                        matchedId: bestMatch ? bestMatch.id : null,
                        status: bestMatch ? 'match' : 'new',
                        visualCount: item.count || 1,
                        name: bestMatch ? (typeof bestMatch.name === 'object' ? (bestMatch.name.en || Object.values(bestMatch.name)[0]) : bestMatch.name) : item.name,
                        category: resolvedCategory,
                        isMisplaced: item.misplaced === true // AI Flag
                    };
                });

                // Post-process: Refine Misplaced based on Dominant Category
                // 1. Calculate Dominant Category
                const catCounts = {};
                auditedItems.forEach(i => {
                    const cat = i.category;
                    catCounts[cat] = (catCounts[cat] || 0) + 1;
                });
                const dominantCategory = Object.keys(catCounts).reduce((a, b) => catCounts[a] > catCounts[b] ? a : b, 'Uncategorized');

                // 2. Mark Misplaced if category mismatch
                const finalItems = auditedItems.map(item => {
                    const isCategoryMismatch = dominantCategory !== 'Uncategorized' && item.category !== 'Uncategorized' && item.category !== dominantCategory;

                    return {
                        ...item,
                        isMisplaced: item.isMisplaced || isCategoryMismatch
                    };
                });

                setShelfResult(finalItems);
            }
        } catch (err) {
            console.error("Vision API Error:", err);
            setError("Failed to process image. Please try again.");
        } finally {
            setLoading(false);
        }
    };

    const handleNativeGallery = async (type) => {
        try {
            const image = await CapacitorCamera.getPhoto({
                quality: 90,
                allowEditing: false,
                resultType: CameraResultType.Uri,
                source: CameraSource.Photos // Force gallery source
            });

            // Convert webPath to Blob
            const response = await fetch(image.webPath);
            const blob = await response.blob();
            const file = new File([blob], `gallery_upload_${Date.now()}.jpg`, { type: 'image/jpeg' });

            processImageFile(file, type);

        } catch (error) {
            console.error("Gallery selection failed:", error);
            if (error && error.message !== 'User cancelled photos app') {
                setError("Gallery error: " + (error.message || "Unknown error"));
            }
        }
    };

    const handleCameraCapture = async (type) => {
        try {
            const image = await CapacitorCamera.getPhoto({
                quality: 90,
                allowEditing: false,
                resultType: CameraResultType.Uri,
                source: CameraSource.Camera // Force camera source
            });

            // Convert webPath to Blob
            const response = await fetch(image.webPath);
            const blob = await response.blob();
            const file = new File([blob], `camera_capture_${Date.now()}.jpg`, { type: 'image/jpeg' });

            processImageFile(file, type);

        } catch (error) {
            console.error("Camera capture failed:", error);
            if (error && error.message !== 'User cancelled photos app') {
                setError("Camera error: " + (error.message || "Unknown error"));
            }
        }
    };

    const handleCommitInventory = async () => {
        if (!billData.length) return;
        setCommitLoading(true);
        try {
            for (const item of billData) {
                if (item.matchedProductId === 'skip') continue;

                if (item.matchedProductId === 'new') {
                    // Create New Product
                    const newProduct = {
                        name: item.name,
                        price: parseFloat(item.unit_price) || 0,
                        stock: parseInt(item.quantity) || 1,
                        category: item.category || 'Uncategorized',
                        max_stock: parseInt(item.max_stock) || 50,
                        shelf_position: item.shelf_position || 'Storage'
                    };
                    LocalStorageService.addProduct(newProduct);
                } else {
                    // Update Existing
                    const product = inventory.find(p => p.id === item.matchedProductId);
                    if (product) {
                        const newStock = (parseInt(product.stock) || 0) + (parseInt(item.quantity) || 0);
                        const updates = {
                            stock: newStock,
                            price: parseFloat(item.unit_price) || product.price,
                            shelf_position: item.shelf_position || product.shelf_position
                        };
                        LocalStorageService.updateProduct(product.id, updates);
                    }
                }
            }
            await refreshInventory(true);

            // Clear Persistence
            setBillData([]);
            setIsReviewing(false);
            localStorage.removeItem('bill_review_data');
            localStorage.removeItem('bill_is_reviewing');

            alert("Inventory Updated Successfully!");
        } catch (e) {
            console.error("Commit failed", e);
            alert("Failed to update inventory.");
        } finally {
            setCommitLoading(false);
        }
    };

    const updateBillItem = (index, field, value) => {
        const newData = [...billData];
        newData[index] = { ...newData[index], [field]: value };
        setBillData(newData);
    };

    const removeBillItem = (index) => {
        const newData = [...billData];
        newData.splice(index, 1);
        setBillData(newData);
    };

    // No refs needed for native camera/gallery

    return (
        <div className="p-4 space-y-8 pb-32 overflow-y-auto h-full">
            <h1 className="text-2xl font-bold mb-4">Stock Management</h1>

            {/* Bill OCR Section */}
            {/* Bill OCR Section */}
            <div className="bg-white dark:bg-card p-6 rounded-xl shadow-md border border-gray-200 dark:border-border">
                <h2 className="text-xl font-bold flex items-center gap-2 mb-4 text-black dark:text-foreground">
                    <div className="bg-blue-100 dark:bg-blue-900/30 p-2 rounded-lg">
                        <Upload size={24} className="text-blue-700 dark:text-blue-400" />
                    </div>
                    Smart Bill Entry
                </h2>
                <p className="text-sm text-gray-600 dark:text-muted-foreground mb-6">
                    Scan a distributor bill to automatically update inventory. Review distinct items before saving.
                </p>

                <div className="flex gap-4">
                    {/* Camera Option */}
                    <button
                        onClick={() => handleCameraCapture('ocr')}
                        className="flex-1 flex flex-col items-center justify-center h-32 bg-white dark:bg-card border-2 border-dashed border-blue-500 dark:border-blue-600 rounded-xl hover:bg-blue-50 dark:hover:bg-blue-900/10 transition-colors shadow-sm"
                    >
                        <Camera className="w-8 h-8 text-blue-700 dark:text-blue-400 mb-2" />
                        <p className="text-sm font-bold text-blue-900 dark:text-blue-300">Take Photo</p>
                    </button>

                    {/* Gallery Option */}
                    <button
                        onClick={() => handleNativeGallery('ocr')}
                        className="flex-1 flex flex-col items-center justify-center h-32 bg-white dark:bg-card border-2 border-dashed border-gray-300 dark:border-gray-700 rounded-xl hover:bg-gray-50 dark:hover:bg-muted/50 transition-colors shadow-sm"
                    >
                        <Upload className="w-8 h-8 text-gray-500 dark:text-muted-foreground mb-2" />
                        <p className="text-sm font-bold text-gray-700 dark:text-muted-foreground">Upload File</p>
                    </button>
                </div>

                {/* Review UI */}
                {isReviewing && billData.length > 0 && (
                    <div className="mt-6 space-y-4 animate-in fade-in slide-in-from-bottom-4">
                        <div className="flex items-center justify-between">
                            <h3 className="font-bold text-foreground">Review Items</h3>
                            <span className="text-xs bg-muted px-2 py-1 rounded text-muted-foreground">{billData.length} items found</span>
                        </div>

                        <div className="grid gap-3 max-h-[60vh] overflow-y-auto pr-1">
                            {billData.map((item, idx) => (
                                <div key={idx} className="bg-card border border-border rounded-xl p-3 shadow-sm flex flex-col gap-3 relative animate-in fade-in slide-in-from-bottom-2">
                                    <button
                                        onClick={() => removeBillItem(idx)}
                                        className="absolute top-3 right-3 text-muted-foreground hover:text-red-500 transition-colors p-1"
                                    >
                                        <Trash2 size={16} />
                                    </button>

                                    {/* Top Row: Scanned Name */}
                                    <div className="pr-8">
                                        <label className="text-[10px] uppercase tracking-wider text-muted-foreground font-bold">Bill Item</label>
                                        <input
                                            value={item.name}
                                            onChange={(e) => updateBillItem(idx, 'name', e.target.value)}
                                            className="w-full bg-transparent font-medium text-foreground border-none outline-none focus:ring-0 p-0 text-base"
                                        />
                                    </div>

                                    {/* Middle Row: Match & Conditional Fields */}
                                    <div className="space-y-3">
                                        <div>
                                            <label className="text-[10px] uppercase tracking-wider text-muted-foreground font-bold block mb-1">Matched Product</label>
                                            <select
                                                value={item.matchedProductId}
                                                onChange={(e) => updateBillItem(idx, 'matchedProductId', e.target.value)}
                                                className="w-full bg-muted/30 border border-border rounded-lg px-2 py-2 text-sm focus:ring-2 focus:ring-primary/20 outline-none"
                                            >
                                                <option value="new" className="font-bold text-primary">+ Create New Product</option>
                                                <option value="skip" className="text-muted-foreground">Skip (Don't Add)</option>
                                                <optgroup label="Existing Inventory">
                                                    {inventory.map(p => (
                                                        <option key={p.id} value={p.id}>
                                                            {typeof p.name === 'object' ? (p.name.en || Object.values(p.name)[0]) : p.name}
                                                        </option>
                                                    ))}
                                                </optgroup>
                                            </select>
                                        </div>

                                        {/* Conditional Fields for New Products */}
                                        {item.matchedProductId === 'new' && (
                                            <div className="grid grid-cols-2 gap-2 animate-in fade-in slide-in-from-top-2">
                                                <div>
                                                    <label className="text-[10px] uppercase tracking-wider text-muted-foreground font-bold block mb-1">Category</label>
                                                    <select
                                                        value={item.category || 'Uncategorized'}
                                                        onChange={(e) => updateBillItem(idx, 'category', e.target.value)}
                                                        className="w-full bg-background border border-border rounded-lg px-2 py-2 text-sm focus:ring-2 focus:ring-primary/20 outline-none"
                                                    >
                                                        {CATEGORIES.filter(c => c !== 'All').map(c => (
                                                            <option key={c} value={c}>{c}</option>
                                                        ))}
                                                    </select>
                                                </div>
                                                <div>
                                                    <label className="text-[10px] uppercase tracking-wider text-muted-foreground font-bold block mb-1">Max Stock</label>
                                                    <input
                                                        type="number"
                                                        value={item.max_stock || 50}
                                                        onChange={(e) => updateBillItem(idx, 'max_stock', e.target.value)}
                                                        className="w-full bg-background border border-border rounded-lg px-2 py-2 text-sm focus:ring-2 focus:ring-primary/20 outline-none"
                                                        placeholder="50"
                                                    />
                                                </div>
                                            </div>
                                        )}
                                    </div>

                                    {/* Bottom Grid: Price | Shelf | Qty */}
                                    <div className="grid grid-cols-3 gap-2">
                                        <div className="flex flex-col gap-1">
                                            <label className="text-[10px] uppercase text-muted-foreground font-bold text-center">Price</label>
                                            <input
                                                type="number"
                                                value={item.unit_price}
                                                onChange={(e) => updateBillItem(idx, 'unit_price', e.target.value)}
                                                className="w-full bg-background border border-border rounded-lg py-1.5 text-center text-sm font-medium focus:border-primary outline-none transition-all"
                                                placeholder="0"
                                            />
                                        </div>
                                        <div className="flex flex-col gap-1">
                                            <label className="text-[10px] uppercase text-muted-foreground font-bold text-center">Shelf</label>
                                            <select
                                                value={item.shelf_position}
                                                onChange={(e) => updateBillItem(idx, 'shelf_position', e.target.value)}
                                                className="w-full bg-background border border-border rounded-lg py-1.5 px-0 text-center text-sm font-medium focus:border-primary outline-none appearance-none"
                                            >
                                                {SHELF_POSITIONS.map(pos => (
                                                    <option key={pos} value={pos}>{pos}</option>
                                                ))}
                                            </select>
                                        </div>
                                        <div className="flex flex-col gap-1">
                                            <label className="text-[10px] uppercase text-muted-foreground font-bold text-center">Qty</label>
                                            <div className="relative">
                                                <input
                                                    type="number"
                                                    value={item.quantity}
                                                    onChange={(e) => updateBillItem(idx, 'quantity', e.target.value)}
                                                    className="w-full bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg py-1.5 text-center text-sm font-bold text-green-700 dark:text-green-400 focus:border-green-500 outline-none"
                                                    placeholder="0"
                                                />
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>

                        <div className="pt-2 flex gap-3">
                            <button
                                onClick={handleCommitInventory}
                                disabled={commitLoading}
                                className="flex-1 py-3 bg-primary text-primary-foreground font-bold rounded-xl shadow-lg hover:bg-primary/90 active:scale-95 transition-all flex items-center justify-center gap-2"
                            >
                                {commitLoading ? <RefreshCw className="animate-spin" /> : <Save size={18} />}
                                Confirm & Update Inventory
                            </button>
                            <button
                                onClick={() => {
                                    setIsReviewing(false);
                                    setBillData([]);
                                    localStorage.removeItem('bill_review_data');
                                    localStorage.removeItem('bill_is_reviewing');
                                }}
                                className="px-4 py-3 bg-muted text-foreground font-medium rounded-xl hover:bg-muted/80"
                            >
                                Cancel
                            </button>
                        </div>
                    </div>
                )}
            </div>

            {/* Smart Shelf Organizer Section */}
            <div className="bg-white dark:bg-card p-6 rounded-xl shadow-md border border-gray-200 dark:border-border">
                <h2 className="text-xl font-bold flex items-center gap-2 mb-4 text-black dark:text-foreground">
                    <div className="bg-purple-100 dark:bg-purple-900/30 p-2 rounded-lg">
                        <CheckCircle size={24} className="text-purple-700 dark:text-purple-400" />
                    </div>
                    Smart Shelf Organizer
                </h2>

                <p className="text-sm text-gray-600 dark:text-muted-foreground mb-6">
                    Analyze shelf layout, find misplaced items, and bulk-update product locations.
                </p>

                <div className="flex gap-4 mb-6">
                    {/* Camera */}
                    <button
                        onClick={() => handleCameraCapture('shelf')}
                        className="flex-1 flex flex-col items-center justify-center h-32 bg-white dark:bg-card border-2 border-dashed border-purple-500 dark:border-purple-600 rounded-xl hover:bg-purple-50 dark:hover:bg-purple-900/10 transition-colors shadow-sm"
                    >
                        <Camera className="w-8 h-8 text-purple-700 dark:text-purple-400 mb-2" />
                        <p className="text-sm font-bold text-purple-900 dark:text-purple-300">Scan Shelf</p>
                    </button>

                    {/* Gallery */}
                    <button
                        onClick={() => handleNativeGallery('shelf')}
                        className="flex-1 flex flex-col items-center justify-center h-32 bg-white dark:bg-card border-2 border-dashed border-gray-300 dark:border-gray-700 rounded-xl hover:bg-gray-50 dark:hover:bg-muted/50 transition-colors shadow-sm"
                    >
                        <Upload className="w-8 h-8 text-gray-500 dark:text-muted-foreground mb-2" />
                        <p className="text-sm font-bold text-gray-700 dark:text-muted-foreground">Upload Image</p>
                    </button>
                </div>

                {shelfResult && (
                    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4">

                        {/* 1. Insights Dashboard */}
                        <div className="grid grid-cols-2 gap-4">
                            {/* Dominant Category */}
                            <div className="p-4 bg-gray-50 dark:bg-muted/20 rounded-xl border border-gray-200 dark:border-border shadow-sm">
                                <span className="text-xs font-bold text-gray-500 dark:text-muted-foreground uppercase tracking-widest">Dominant Category</span>
                                <div className="text-2xl font-black text-blue-900 dark:text-blue-400 mt-1">
                                    {shelfResult.reduce((a, b, i, arr) => (arr.filter(v => v.category === a).length >= arr.filter(v => v.category === b).length ? a : b), null)?.category || "Mixed"}
                                </div>
                            </div>

                            {/* Shelf Value */}
                            <div className="p-4 bg-gray-50 dark:bg-muted/20 rounded-xl border border-gray-200 dark:border-border shadow-sm">
                                <span className="text-xs font-bold text-gray-500 dark:text-muted-foreground uppercase tracking-widest">Shelf Value</span>
                                <div className="text-2xl font-black text-green-800 dark:text-green-400 mt-1">
                                    ₹{shelfResult.reduce((sum, item) => sum + ((inventory.find(p => p.id === item.matchedId)?.price || 0) * item.visualCount), 0).toLocaleString()}
                                </div>
                            </div>
                        </div>

                        {/* 2. Misplaced Items Alert */}
                        {shelfResult.some(i => i.isMisplaced) && (
                            <div className="bg-red-50 dark:bg-red-900/20 p-4 rounded-xl border-2 border-red-200 dark:border-red-800 flex flex-col gap-2 shadow-sm">
                                <div className="flex items-center gap-2">
                                    <AlertCircle className="w-6 h-6 text-red-600 dark:text-red-400" />
                                    <h4 className="font-bold text-black dark:text-white text-base">Misplaced Items Detected</h4>
                                </div>

                                <p className="text-sm text-gray-900 dark:text-gray-100 font-medium">
                                    The following items seem out of place for a <strong className="underline decoration-red-500 font-bold">{shelfResult[0]?.category}</strong> shelf:
                                </p>
                                <div className="flex flex-wrap gap-2 mt-1">
                                    {shelfResult.filter(i => i.isMisplaced).map((item, idx) => (
                                        <span key={idx} className="text-xs bg-red-800 text-white px-3 py-1.5 rounded-lg font-bold shadow-md">
                                            {item.name}
                                        </span>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* 3. Item List & Location Sync */}
                        <div className="space-y-4">
                            <div className="flex items-center justify-between">
                                <label className="text-sm font-bold text-black dark:text-foreground uppercase">Update Exact Location</label>
                                <select
                                    id="final-shelf-select"
                                    className="bg-white dark:bg-background border-2 border-gray-300 dark:border-gray-700 rounded-lg text-sm px-4 py-2 font-bold text-black dark:text-foreground outline-none focus:border-purple-500 dark:focus:border-purple-600"
                                    defaultValue=""
                                >
                                    <option value="" disabled>Select Shelf ID</option>
                                    {SHELF_POSITIONS.map(pos => <option key={pos} value={pos}>{pos}</option>)}
                                </select>
                            </div>

                            <div className="border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden">
                                <div className="max-h-60 overflow-y-auto bg-gray-50 dark:bg-muted/10">
                                    {shelfResult.map((item, idx) => (
                                        <div key={idx} className={`p-4 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between text-sm ${item.isMisplaced ? 'bg-red-50 dark:bg-red-900/10' : 'bg-white dark:bg-card'}`}>
                                            <div className="flex items-center gap-3">
                                                {item.isMisplaced ? <AlertCircle size={18} className="text-red-600 dark:text-red-500" /> : <CheckCircle size={18} className="text-green-600 dark:text-green-500" />}
                                                <div>
                                                    <p className="font-bold text-black dark:text-foreground text-sm">{item.name}</p>
                                                    <p className="text-xs text-gray-500 dark:text-muted-foreground font-medium">{item.category} • <span className="text-black dark:text-foreground">{item.visualCount} units</span></p>
                                                </div>
                                            </div>
                                            <div className="text-right">
                                                <span className={`text-xs font-bold px-2 py-1 rounded border ${item.status === 'match' ? 'bg-gray-100 dark:bg-muted text-gray-800 dark:text-muted-foreground border-gray-300 dark:border-gray-600' : 'bg-blue-100 dark:bg-blue-900/20 text-blue-800 dark:text-blue-300 border-blue-200 dark:border-blue-800'}`}>
                                                    {item.status === 'match' ? (inventory.find(p => p.id === item.matchedId)?.shelf_position || 'Storage') : 'NEW'}
                                                </span>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            <div className="pt-2 flex gap-3">
                                <button
                                    onClick={() => {
                                        const targetShelf = document.getElementById('final-shelf-select').value;
                                        if (!targetShelf) {
                                            alert("Please select the current Shelf ID to sync locations.");
                                            return;
                                        }

                                        let count = 0;
                                        shelfResult.filter(i => i.status === 'match').forEach(item => {
                                            const product = inventory.find(p => p.id === item.matchedId);
                                            if (product && product.shelf_position !== targetShelf) {
                                                LocalStorageService.updateProduct(product.id, { shelf_position: targetShelf });
                                                count++;
                                            }
                                        });

                                        refreshInventory(true);
                                        alert(`Successfully moved ${count} items to Shelf ${targetShelf}!`);
                                        setShelfResult(null);
                                        localStorage.removeItem('shelf_organizer_result');
                                    }}
                                    className="flex-1 py-4 bg-purple-700 dark:bg-purple-600 text-white font-bold rounded-xl shadow-md hover:bg-purple-800 dark:hover:bg-purple-700 active:scale-95 transition-all flex items-center justify-center gap-2 text-base"
                                >
                                    <Save size={20} />
                                    CONFIRM & UPDATE LOCATIONS
                                </button>
                                <button
                                    onClick={() => {
                                        setShelfResult(null);
                                        localStorage.removeItem('shelf_organizer_result');
                                    }}
                                    className="px-6 py-4 bg-gray-100 dark:bg-muted text-gray-700 dark:text-muted-foreground font-bold rounded-xl hover:bg-gray-200 dark:hover:bg-muted/80 transition-all"
                                >
                                    CANCEL
                                </button>
                            </div>
                        </div>
                    </div>
                )}
            </div>

            {loading && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50">
                    <div className="bg-card p-6 rounded-2xl shadow-xl flex flex-col items-center animate-in zoom-in-95">
                        <div className="animate-spin rounded-full h-10 w-10 border-4 border-primary border-t-transparent mb-4"></div>
                        <p className="font-medium text-foreground">Processing Image...</p>
                        <p className="text-xs text-muted-foreground mt-2">Extracting items & prices...</p>
                    </div>
                </div>
            )}

            {error && (
                <div className="bg-red-50 dark:bg-red-900/20 p-4 rounded-xl border border-red-200 dark:border-red-800 flex items-center gap-3 text-red-700 dark:text-red-400">
                    <AlertCircle size={20} />
                    <p className="text-sm font-medium">{error}</p>
                </div>
            )}
        </div>
    );
};

export default StockScanningView;
