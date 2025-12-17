import React, { useState, useEffect } from 'react';
import { Camera, Upload, CheckCircle, AlertCircle, Save, RefreshCw, Plus, Trash2 } from 'lucide-react';
import { Camera as CapacitorCamera, CameraResultType, CameraSource } from '@capacitor/camera';
import { uploadVisionImage } from '../services/api';
import { useAppData } from '../context/AppDataContext';
import { LocalStorageService } from '../services/LocalStorageService';

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
                unit_price: item.unit_price || 0,
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
                const matchedMessages = matchProducts(Array.isArray(parsedData) ? parsedData : []);
                setBillData(matchedMessages);
                setOcrResult(matchedMessages); // Keep raw reference if needed
                setIsReviewing(true);
            } else {
                setShelfResult(parsedData);
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
                        price: item.unit_price || 0,
                        stock: item.quantity || 1,
                        category: 'Uncategorized', // Default
                        max_stock: 50,
                        shelf_position: 'Storage'
                    };
                    LocalStorageService.addProduct(newProduct);
                } else {
                    // Update Existing
                    const product = inventory.find(p => p.id === item.matchedProductId);
                    if (product) {
                        const newStock = (parseInt(product.stock) || 0) + (parseInt(item.quantity) || 0);
                        LocalStorageService.updateProduct(product.id, { stock: newStock });
                    }
                }
            }
            await refreshInventory(true);
            setBillData([]);
            setIsReviewing(false);
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

                        <div className="border border-border rounded-lg overflow-hidden bg-background">
                            <table className="w-full text-sm text-left">
                                <thead className="bg-muted/50 text-muted-foreground font-medium">
                                    <tr>
                                        <th className="p-3">Item (from Bill)</th>
                                        <th className="p-3">Matched Product</th>
                                        <th className="p-3 w-20">Qty</th>
                                        <th className="p-3 w-10"></th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-border">
                                    {billData.map((item, idx) => (
                                        <tr key={idx} className="hover:bg-muted/20">
                                            <td className="p-3 font-medium">
                                                <input
                                                    value={item.name}
                                                    onChange={(e) => updateBillItem(idx, 'name', e.target.value)}
                                                    className="w-full bg-transparent border-none outline-none focus:ring-1 focus:ring-primary rounded px-1"
                                                />
                                            </td>
                                            <td className="p-3">
                                                <select
                                                    value={item.matchedProductId}
                                                    onChange={(e) => updateBillItem(idx, 'matchedProductId', e.target.value)}
                                                    className="w-full max-w-[180px] bg-background border border-border rounded p-1.5 focus:ring-1 focus:ring-primary outline-none"
                                                >
                                                    <option value="new">+ Create New</option>
                                                    <option value="skip">Skip (Don't Add)</option>
                                                    <optgroup label="Existing Inventory">
                                                        {inventory.map(p => (
                                                            <option key={p.id} value={p.id}>
                                                                {typeof p.name === 'object' ? (p.name.en || Object.values(p.name)[0]) : p.name}
                                                            </option>
                                                        ))}
                                                    </optgroup>
                                                </select>
                                            </td>
                                            <td className="p-3">
                                                <input
                                                    type="number"
                                                    value={item.quantity}
                                                    onChange={(e) => updateBillItem(idx, 'quantity', e.target.value)}
                                                    className="w-full bg-background border border-border rounded p-1.5 text-center focus:ring-1 focus:ring-primary outline-none"
                                                />
                                            </td>
                                            <td className="p-3 text-center">
                                                <button onClick={() => removeBillItem(idx)} className="text-red-500 hover:bg-red-50 p-1 rounded">
                                                    <Trash2 size={16} />
                                                </button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
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
                                onClick={() => { setIsReviewing(false); setBillData([]); }}
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
                    <Camera size={20} className="text-secondary-foreground" /> Shelf Analysis
                </h2>
                <p className="text-sm text-muted-foreground mb-4">Take a picture of the shelf to update product locations.</p>

                <div className="flex gap-4">
                    {/* Camera Option */}
                    <button
                        onClick={() => handleCameraCapture('shelf')}
                        className="flex-1 flex flex-col items-center justify-center h-32 border-2 border-dashed border-border bg-muted/30 rounded-xl hover:bg-muted/50 transition-colors"
                    >
                        <Camera className="w-8 h-8 text-secondary-foreground mb-2" />
                        <p className="text-sm font-medium text-foreground">Take Photo</p>
                    </button>

                    {/* Gallery Option */}
                    <button
                        onClick={() => handleNativeGallery('shelf')}
                        className="flex-1 flex flex-col items-center justify-center h-32 border-2 border-dashed border-border bg-card rounded-xl hover:bg-muted/50 transition-colors"
                    >
                        <Upload className="w-8 h-8 text-muted-foreground mb-2" />
                        <p className="text-sm font-medium text-muted-foreground">Upload File</p>
                    </button>
                </div>

                {shelfResult && (
                    <div className="mt-4 bg-blue-50 dark:bg-blue-900/20 p-4 rounded-xl border border-blue-200 dark:border-blue-800">
                        <h3 className="font-bold text-blue-800 dark:text-blue-300 mb-2 flex items-center gap-2">
                            <CheckCircle size={16} /> Identified Locations
                        </h3>
                        <ul className="space-y-2">
                            {Array.isArray(shelfResult) ? shelfResult.map((item, idx) => (
                                <li key={idx} className="flex justify-between text-sm">
                                    <span className="text-foreground">{item.name}</span>
                                    <span className="font-mono bg-background px-2 py-0.5 rounded border border-border text-xs">{item.shelf}</span>
                                </li>
                            )) : <p className="text-sm text-foreground">{JSON.stringify(shelfResult)}</p>}
                        </ul>
                        <button className="mt-4 w-full bg-blue-600 text-white py-2 rounded-lg hover:bg-blue-700 font-medium">
                            Update Shelf Locations
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
