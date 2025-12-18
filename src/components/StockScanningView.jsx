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

        if (storedBillData) {
            try {
                setBillData(JSON.parse(storedBillData));
            } catch (e) { console.error("Failed to parse stored bill data"); }
        }

        if (storedIsReviewing) {
            setIsReviewing(storedIsReviewing === 'true');
        }
    }, []);

    // Persistence: Save on Change
    useEffect(() => {
        localStorage.setItem('bill_review_data', JSON.stringify(billData));
        localStorage.setItem('bill_is_reviewing', isReviewing.toString());
    }, [billData, isReviewing]);

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

                // Shelf Audit Logic
                const targetShelf = document.getElementById('target-shelf-select')?.value;
                if (!targetShelf) {
                    setError("Target Shelf not selected.");
                    return;
                }

                const auditedItems = parsedData.map(item => {
                    // Match with inventory
                    const bestMatch = inventory.find(p => {
                        const pName = (typeof p.name === 'object' ? (p.name.en || Object.values(p.name)[0]) : p.name).toLowerCase();
                        const iName = (item.name || '').toLowerCase();
                        return pName.includes(iName) || iName.includes(pName);
                    });

                    if (bestMatch) {
                        const isCorrectShelf = bestMatch.shelf_position === targetShelf;
                        return {
                            ...item,
                            matchedId: bestMatch.id,
                            status: isCorrectShelf ? 'verified' : 'moved',
                            currentShelf: targetShelf,
                            oldShelf: bestMatch.shelf_position,
                            count: item.count || 1
                        };
                    } else {
                        return {
                            ...item,
                            status: 'new',
                            currentShelf: targetShelf,
                            count: item.count || 1
                        };
                    }
                });

                setShelfResult(auditedItems);
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
            <div className="bg-card p-6 rounded-xl shadow-sm border border-border">
                <h2 className="text-lg font-semibold flex items-center gap-2 mb-4">
                    <Upload size={20} className="text-primary" /> Smart Bill Entry
                </h2>
                <p className="text-sm text-muted-foreground mb-4">
                    Scan a distributor bill to automatically update inventory. Review distinct items before saving.
                </p>

                <div className="flex gap-4">
                    {/* Camera Option */}
                    <button
                        onClick={() => handleCameraCapture('ocr')}
                        className="flex-1 flex flex-col items-center justify-center h-32 border-2 border-dashed border-primary/30 bg-primary/5 rounded-xl hover:bg-primary/10 transition-colors"
                    >
                        <Camera className="w-8 h-8 text-primary mb-2" />
                        <p className="text-sm font-medium text-primary">Take Photo</p>
                    </button>

                    {/* Gallery Option */}
                    <button
                        onClick={() => handleNativeGallery('ocr')}
                        className="flex-1 flex flex-col items-center justify-center h-32 border-2 border-dashed border-border bg-card rounded-xl hover:bg-muted/50 transition-colors"
                    >
                        <Upload className="w-8 h-8 text-muted-foreground mb-2" />
                        <p className="text-sm font-medium text-muted-foreground">Upload File</p>
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

            {/* Shelf Analysis Section */}
            <div className="bg-card p-6 rounded-xl shadow-sm border border-border">
                <h2 className="text-lg font-semibold flex items-center gap-2 mb-4">
                    <CheckCircle size={20} className="text-blue-600 dark:text-blue-400" /> Shelf Audit
                </h2>
                <p className="text-sm text-muted-foreground mb-4">
                    Verify product placement by analyzing shelf photos. Select the shelf you are auditing below.
                </p>

                {/* Target Shelf Selection */}
                <div className="mb-4">
                    <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider block mb-1">Target Shelf (Ground Truth)</label>
                    <select
                        className="w-full bg-background border border-border rounded-xl p-3 outline-none focus:ring-2 focus:ring-blue-500/20"
                        onChange={(e) => {
                            // Clear previous results when shelf changes to avoid confusion
                            setShelfResult(null);
                            // Store target shelf in a temp variable or ref if needed, 
                            // but for now we can read it directly from the select when processing matches if we used a ref, 
                            // or better, use state. Let's add state for it.
                        }}
                        id="target-shelf-select"
                        defaultValue=""
                    >
                        <option value="" disabled>Select Shelf to Audit</option>
                        {SHELF_POSITIONS.map(pos => (
                            <option key={pos} value={pos}>{pos}</option>
                        ))}
                    </select>
                </div>

                <div className="flex gap-4 mb-6">
                    {/* Camera Option */}
                    <button
                        onClick={() => {
                            const shelf = document.getElementById('target-shelf-select').value;
                            if (!shelf) { alert("Please select a target shelf first."); return; }
                            handleCameraCapture('shelf');
                        }}
                        className="flex-1 flex flex-col items-center justify-center h-28 border-2 border-dashed border-blue-200 dark:border-blue-800 bg-blue-50/50 dark:bg-blue-900/10 rounded-xl hover:bg-blue-100/50 transition-colors"
                    >
                        <Camera className="w-6 h-6 text-blue-600 dark:text-blue-400 mb-2" />
                        <p className="text-xs font-bold text-blue-700 dark:text-blue-300">Audit {document.getElementById('target-shelf-select')?.value ? `Shelf ${document.getElementById('target-shelf-select').value}` : 'Shelf'}</p>
                    </button>

                    {/* Gallery Option */}
                    <button
                        onClick={() => {
                            const shelf = document.getElementById('target-shelf-select').value;
                            if (!shelf) { alert("Please select a target shelf first."); return; }
                            handleNativeGallery('shelf');
                        }}
                        className="flex-1 flex flex-col items-center justify-center h-28 border-2 border-dashed border-border bg-card rounded-xl hover:bg-muted/50 transition-colors"
                    >
                        <Upload className="w-6 h-6 text-muted-foreground mb-2" />
                        <p className="text-xs font-medium text-muted-foreground">Upload File</p>
                    </button>
                </div>

                {shelfResult && (
                    <div className="space-y-4 animate-in fade-in slide-in-from-bottom-4">
                        <div className="flex items-center justify-between">
                            <h3 className="font-bold text-foreground">Audit Results</h3>
                            <span className="text-xs bg-muted px-2 py-1 rounded text-muted-foreground">{shelfResult.length} items detected</span>
                        </div>

                        <div className="space-y-3">
                            {shelfResult.map((item, idx) => (
                                <div key={idx} className={`p-3 rounded-xl border flex items-center justify-between gap-3 ${item.status === 'verified' ? 'bg-green-50/50 border-green-200 dark:bg-green-900/10 dark:border-green-800' :
                                    item.status === 'moved' ? 'bg-yellow-50/50 border-yellow-200 dark:bg-yellow-900/10 dark:border-yellow-800' :
                                        'bg-blue-50/50 border-blue-200 dark:bg-blue-900/10 dark:border-blue-800'
                                    }`}>
                                    <div className="flex-1">
                                        <p className="font-semibold text-sm text-foreground">{item.name}</p>
                                        <p className="text-xs text-muted-foreground">
                                            {item.status === 'verified' && <span className="text-green-600 dark:text-green-400 flex items-center gap-1"><CheckCircle size={10} /> Verified in {item.currentShelf}</span>}
                                            {item.status === 'moved' && <span className="text-yellow-600 dark:text-yellow-400 flex items-center gap-1"><AlertCircle size={10} /> Moved from {item.oldShelf || 'Storage'}</span>}
                                            {item.status === 'new' && <span className="text-blue-600 dark:text-blue-400 flex items-center gap-1"><Plus size={10} /> New Item</span>}
                                        </p>
                                    </div>
                                    <div className="text-right">
                                        <span className="block text-lg font-bold">{item.count}</span>
                                        <span className="text-[10px] text-muted-foreground uppercase">Count</span>
                                    </div>
                                </div>
                            ))}
                        </div>

                        <button
                            onClick={() => {
                                // Update Logic
                                const targetShelf = document.getElementById('target-shelf-select').value;
                                if (!targetShelf) return;

                                let updatesCount = 0;
                                shelfResult.forEach(item => {
                                    if (item.status === 'moved' && item.matchedId) {
                                        // Update existing product location
                                        const product = inventory.find(p => p.id === item.matchedId);
                                        if (product) {
                                            LocalStorageService.updateProduct(product.id, { shelf_position: targetShelf });
                                            updatesCount++;
                                        }
                                    } else if (item.status === 'new') {
                                        // Create new product listing
                                        LocalStorageService.addProduct({
                                            name: item.name,
                                            price: 0,
                                            stock: item.count,
                                            category: 'Uncategorized',
                                            max_stock: 50,
                                            shelf_position: targetShelf
                                        });
                                        updatesCount++;
                                    }
                                });

                                refreshInventory(true);
                                alert(`Audit Complete! Updated ${updatesCount} items to Shelf ${targetShelf}.`);
                                setShelfResult(null);
                            }}
                            className="w-full py-3 bg-blue-600 text-white font-bold rounded-xl shadow-lg hover:bg-blue-700 active:scale-95 transition-all"
                        >
                            Update All Locations
                        </button>
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
