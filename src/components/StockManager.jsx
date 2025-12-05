import React, { useState } from 'react';
import { Camera as CameraIcon, Upload, CheckCircle, AlertCircle, Loader2, ScanLine, FileText } from 'lucide-react';
import { uploadVisionImage, importInventory, updateShelfLocations } from '../services/api';
import { cn } from '../lib/utils';
import { Camera, CameraResultType, CameraSource } from '@capacitor/camera';
import { useTranslation } from 'react-i18next';
import { useAppData } from '../context/AppDataContext';

const StockManager = () => {
    const { t } = useTranslation();
    const { refreshInventory } = useAppData();
    const [ocrResult, setOcrResult] = useState(null);
    const [shelfResult, setShelfResult] = useState(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);

    const handleCameraCapture = async (type, source = CameraSource.Camera) => {
        try {
            const image = await Camera.getPhoto({
                quality: 90,
                allowEditing: false,
                resultType: CameraResultType.Uri,
                source: source
            });

            if (image.webPath) {
                setLoading(true);
                setError(null);

                // Convert webPath to Blob
                const response = await fetch(image.webPath);
                const blob = await response.blob();
                const file = new File([blob], "camera_capture.jpg", { type: "image/jpeg" });

                try {
                    const result = await uploadVisionImage(file, type);
                    const parsedData = JSON.parse(result.data);

                    if (parsedData.error) {
                        setError(parsedData.error);
                        setOcrResult(null);
                        setShelfResult(null);
                    } else if (type === 'ocr') {
                        setOcrResult(parsedData);
                        setShelfResult(null);
                    } else {
                        setShelfResult(parsedData);
                        setOcrResult(null);
                    }
                } catch (err) {
                    console.error("Vision API Error:", err);
                    setError(t('failed_process_image') || "Failed to process image. Please try again.");
                } finally {
                    setLoading(false);
                }
            }
        } catch (error) {
            console.error("Camera Error:", error);
            // Don't show error if user cancelled
            if (error.message !== 'User cancelled photos app') {
                alert(`${t('camera_error')}: ${error.message}`);
                setError(t('failed_open_camera') || "Failed to open camera.");
            }
        }
    };

    const handleInventoryUpdate = async () => {
        if (!ocrResult) return;
        setLoading(true);
        try {
            // Map OCR result to ProductCreate format
            const productsToUpdate = ocrResult.map(item => ({
                name: item.name,
                stock: parseInt(item.quantity) || 0,
                price: 0, // Default, will be ignored if product exists and price is 0
                category: 'Uncategorized', // Default for new products
                shelf_position: '',
                image_url: '',
                icon_name: 'package'
            }));

            await importInventory(productsToUpdate);
            await refreshInventory(true); // Force refresh context
            alert(t('inventory_updated_success') || "Inventory updated successfully!");
            setOcrResult(null);
        } catch (error) {
            console.error("Failed to update inventory", error);
            setError(t('failed_update_inventory') || "Failed to update inventory. Please try again.");
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="p-4 space-y-6 pb-safe-nav">
            <div className="flex items-center justify-between">
                <h1 className="text-3xl font-bold tracking-tight text-foreground">{t('stock_management')}</h1>
            </div>

            {/* Bill OCR Section */}
            <div className="bg-card p-6 rounded-2xl shadow-sm border border-border">
                <div className="flex items-center gap-3 mb-4">
                    <div className="p-3 bg-blue-500/10 text-blue-600 rounded-xl">
                        <FileText size={24} />
                    </div>
                    <div>
                        <h2 className="text-lg font-semibold text-foreground">{t('scan_bill')}</h2>
                        <p className="text-sm text-muted-foreground">{t('scan_bill_desc') || "Upload a photo of the distributor's bill to automatically update inventory."}</p>
                    </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                    <div className="flex-1">
                        <button
                            onClick={() => handleCameraCapture('ocr', CameraSource.Camera)}
                            className="flex flex-col items-center justify-center h-32 border-2 border-dashed border-primary/30 rounded-2xl hover:bg-primary/5 bg-primary/5 cursor-pointer w-full transition-all active:scale-95"
                        >
                            <CameraIcon className="w-8 h-8 text-primary mb-2" />
                            <p className="text-sm text-primary font-medium">{t('take_photo')}</p>
                        </button>
                    </div>

                    <div className="flex-1">
                        <button
                            onClick={() => handleCameraCapture('ocr', CameraSource.Photos)}
                            className="flex flex-col items-center justify-center h-32 border-2 border-dashed border-border rounded-2xl hover:bg-muted cursor-pointer w-full transition-all active:scale-95"
                        >
                            <Upload className="w-8 h-8 text-muted-foreground mb-2" />
                            <p className="text-sm text-muted-foreground">{t('upload_file')}</p>
                        </button>
                    </div>
                </div>

                {ocrResult && (
                    <div className="mt-6 bg-green-500/10 p-5 rounded-2xl border border-green-500/20 animate-in fade-in slide-in-from-bottom-2">
                        <h3 className="font-bold text-green-700 dark:text-green-400 mb-3 flex items-center gap-2">
                            <CheckCircle size={18} /> {t('extracted_items')}
                        </h3>
                        <ul className="space-y-2 mb-4">
                            {ocrResult.map((item, idx) => (
                                <li key={idx} className="flex justify-between text-sm p-2 bg-white/50 dark:bg-black/20 rounded-lg">
                                    <span className="font-medium text-foreground">{item.name}</span>
                                    <span className="font-mono text-muted-foreground bg-muted px-2 py-0.5 rounded">{t('qty')}: {item.quantity}</span>
                                </li>
                            ))}
                        </ul>
                        <button
                            onClick={handleInventoryUpdate}
                            className="w-full bg-green-600 text-white py-3 rounded-xl font-medium shadow-lg shadow-green-600/20 hover:bg-green-700 active:scale-95 transition-all flex items-center justify-center gap-2"
                        >
                            {loading ? <Loader2 className="animate-spin" /> : <CheckCircle size={20} />}
                            {t('confirm_update')}
                        </button>
                    </div>
                )}
            </div>

            {/* Shelf Analysis Section */}
            <div className="bg-card p-6 rounded-2xl shadow-sm border border-border">
                <div className="flex items-center gap-3 mb-4">
                    <div className="p-3 bg-purple-500/10 text-purple-600 rounded-xl">
                        <ScanLine size={24} />
                    </div>
                    <div>
                        <h2 className="text-lg font-semibold text-foreground">{t('shelf_analysis')}</h2>
                        <p className="text-sm text-muted-foreground">{t('shelf_analysis_desc') || "Take a picture of the shelf to update product locations."}</p>
                    </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                    <div className="flex-1">
                        <button
                            onClick={() => handleCameraCapture('shelf', CameraSource.Camera)}
                            className="flex flex-col items-center justify-center h-32 border-2 border-dashed border-purple-500/30 rounded-2xl hover:bg-purple-500/5 bg-purple-500/5 cursor-pointer w-full transition-all active:scale-95"
                        >
                            <CameraIcon className="w-8 h-8 text-purple-600 mb-2" />
                            <p className="text-sm text-purple-600 font-medium">{t('take_photo')}</p>
                        </button>
                    </div>

                    <div className="flex-1">
                        <button
                            onClick={() => handleCameraCapture('shelf', CameraSource.Photos)}
                            className="flex flex-col items-center justify-center h-32 border-2 border-dashed border-border rounded-2xl hover:bg-muted cursor-pointer w-full transition-all active:scale-95"
                        >
                            <Upload className="w-8 h-8 text-muted-foreground mb-2" />
                            <p className="text-sm text-muted-foreground">{t('upload_file')}</p>
                        </button>
                    </div>
                </div>

                {shelfResult && (
                    <div className="mt-6 bg-purple-500/10 p-5 rounded-2xl border border-purple-500/20 animate-in fade-in slide-in-from-bottom-2">
                        <h3 className="font-bold text-purple-700 dark:text-purple-400 mb-3 flex items-center gap-2">
                            <CheckCircle size={18} /> {t('identified_locations')}
                        </h3>
                        <ul className="space-y-2 mb-4">
                            {shelfResult.map((item, idx) => (
                                <li key={idx} className="flex justify-between text-sm p-2 bg-white/50 dark:bg-black/20 rounded-lg">
                                    <span className="font-medium text-foreground">{item.name}</span>
                                    <span className="font-mono text-muted-foreground bg-muted px-2 py-0.5 rounded">{item.shelf}</span>
                                </li>
                            ))}
                        </ul>
                        <button
                            onClick={async () => {
                                if (!shelfResult) return;
                                setLoading(true);
                                try {
                                    await updateShelfLocations(shelfResult);
                                    await refreshInventory(true); // Force refresh context
                                    alert(t('shelf_updated_success') || "Shelf locations updated successfully!");
                                    setShelfResult(null);
                                } catch (error) {
                                    console.error("Failed to update shelf locations", error);
                                    setError(t('failed_update_shelf') || "Failed to update shelf locations.");
                                } finally {
                                    setLoading(false);
                                }
                            }}
                            className="w-full bg-purple-600 text-white py-3 rounded-xl font-medium shadow-lg shadow-purple-600/20 hover:bg-purple-700 active:scale-95 transition-all flex items-center justify-center gap-2"
                        >
                            {loading ? <Loader2 className="animate-spin" /> : <CheckCircle size={20} />}
                            {t('update_locations')}
                        </button>
                    </div>
                )}
            </div>

            {loading && (
                <div className="fixed inset-0 bg-background/80 backdrop-blur-sm flex items-center justify-center z-50 animate-in fade-in">
                    <div className="bg-card p-8 rounded-3xl shadow-2xl border border-border flex flex-col items-center gap-4">
                        <Loader2 className="w-10 h-10 animate-spin text-primary" />
                        <p className="text-lg font-medium text-foreground">{t('processing_image') || "Processing Image..."}</p>
                    </div>
                </div>
            )}

            {error && (
                <div className="bg-destructive/10 p-4 rounded-xl border border-destructive/20 flex items-center gap-3 text-destructive animate-in slide-in-from-top-2">
                    <AlertCircle size={20} />
                    <span className="font-medium">{error}</span>
                </div>
            )}
        </div>
    );
};

export default StockManager;
