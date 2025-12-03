import React, { useState } from 'react';
import { Camera as CameraIcon, Upload, CheckCircle, AlertCircle, Loader2, ScanLine, FileText } from 'lucide-react';
import { uploadVisionImage } from '../services/api';
import { cn } from '../lib/utils';
import { Camera, CameraResultType, CameraSource } from '@capacitor/camera';

const StockManager = () => {
    const [ocrResult, setOcrResult] = useState(null);
    const [shelfResult, setShelfResult] = useState(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);

    const handleCameraCapture = async (type) => {
        try {
            const image = await Camera.getPhoto({
                quality: 90,
                allowEditing: false,
                resultType: CameraResultType.Uri,
                source: CameraSource.Camera
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

                    if (type === 'ocr') {
                        setOcrResult(parsedData);
                        setShelfResult(null);
                    } else {
                        setShelfResult(parsedData);
                        setOcrResult(null);
                    }
                } catch (err) {
                    console.error("Vision API Error:", err);
                    setError("Failed to process image. Please try again.");
                } finally {
                    setLoading(false);
                }
            }
        } catch (error) {
            console.error("Camera Error:", error);
            // Don't show error if user cancelled
            if (error.message !== 'User cancelled photos app') {
                alert(`Camera Error: ${error.message}`);
                setError("Failed to open camera.");
            }
        }
    };

    const handleFileUpload = async (event, type) => {
        const file = event.target.files[0];
        if (!file) return;

        setLoading(true);
        setError(null);
        try {
            const result = await uploadVisionImage(file, type);
            const parsedData = JSON.parse(result.data);

            if (type === 'ocr') {
                setOcrResult(parsedData);
                setShelfResult(null);
            } else {
                setShelfResult(parsedData);
                setOcrResult(null);
            }
        } catch (err) {
            console.error("Vision API Error:", err);
            setError("Failed to process image. Please try again.");
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="p-4 space-y-6 pb-safe-nav">
            <div className="flex items-center justify-between">
                <h1 className="text-3xl font-bold tracking-tight text-foreground">Stock Management</h1>
            </div>

            {/* Bill OCR Section */}
            <div className="bg-card p-6 rounded-2xl shadow-sm border border-border">
                <div className="flex items-center gap-3 mb-4">
                    <div className="p-3 bg-blue-500/10 text-blue-600 rounded-xl">
                        <FileText size={24} />
                    </div>
                    <div>
                        <h2 className="text-lg font-semibold text-foreground">Scan Bill of Lading</h2>
                        <p className="text-sm text-muted-foreground">Upload a photo of the distributor's bill to automatically update inventory.</p>
                    </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                    <div className="flex-1">
                        <button
                            onClick={() => handleCameraCapture('ocr')}
                            className="flex flex-col items-center justify-center h-32 border-2 border-dashed border-primary/30 rounded-2xl hover:bg-primary/5 bg-primary/5 cursor-pointer w-full transition-all active:scale-95"
                        >
                            <CameraIcon className="w-8 h-8 text-primary mb-2" />
                            <p className="text-sm text-primary font-medium">Take Photo</p>
                        </button>
                    </div>

                    <div className="flex-1 relative">
                        <div className="flex flex-col items-center justify-center h-32 border-2 border-dashed border-border rounded-2xl hover:bg-muted cursor-pointer w-full transition-all active:scale-95">
                            <Upload className="w-8 h-8 text-muted-foreground mb-2" />
                            <p className="text-sm text-muted-foreground">Upload File</p>
                        </div>
                        <input
                            type="file"
                            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                            accept="image/*"
                            onChange={(e) => handleFileUpload(e, 'ocr')}
                            onClick={(e) => (e.target.value = null)}
                        />
                    </div>
                </div>

                {ocrResult && (
                    <div className="mt-6 bg-green-500/10 p-5 rounded-2xl border border-green-500/20 animate-in fade-in slide-in-from-bottom-2">
                        <h3 className="font-bold text-green-700 dark:text-green-400 mb-3 flex items-center gap-2">
                            <CheckCircle size={18} /> Extracted Items
                        </h3>
                        <ul className="space-y-2 mb-4">
                            {ocrResult.map((item, idx) => (
                                <li key={idx} className="flex justify-between text-sm p-2 bg-white/50 dark:bg-black/20 rounded-lg">
                                    <span className="font-medium text-foreground">{item.name}</span>
                                    <span className="font-mono text-muted-foreground bg-muted px-2 py-0.5 rounded">Qty: {item.quantity}</span>
                                </li>
                            ))}
                        </ul>
                        <button className="w-full bg-green-600 text-white py-3 rounded-xl font-medium shadow-lg shadow-green-600/20 hover:bg-green-700 active:scale-95 transition-all">
                            Confirm & Update Inventory
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
                        <h2 className="text-lg font-semibold text-foreground">Shelf Analysis</h2>
                        <p className="text-sm text-muted-foreground">Take a picture of the shelf to update product locations.</p>
                    </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                    <div className="flex-1">
                        <button
                            onClick={() => handleCameraCapture('shelf')}
                            className="flex flex-col items-center justify-center h-32 border-2 border-dashed border-purple-500/30 rounded-2xl hover:bg-purple-500/5 bg-purple-500/5 cursor-pointer w-full transition-all active:scale-95"
                        >
                            <CameraIcon className="w-8 h-8 text-purple-600 mb-2" />
                            <p className="text-sm text-purple-600 font-medium">Take Photo</p>
                        </button>
                    </div>

                    <div className="flex-1 relative">
                        <div className="flex flex-col items-center justify-center h-32 border-2 border-dashed border-border rounded-2xl hover:bg-muted cursor-pointer w-full transition-all active:scale-95">
                            <Upload className="w-8 h-8 text-muted-foreground mb-2" />
                            <p className="text-sm text-muted-foreground">Upload File</p>
                        </div>
                        <input
                            type="file"
                            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                            accept="image/*"
                            onChange={(e) => handleFileUpload(e, 'shelf')}
                            onClick={(e) => (e.target.value = null)}
                        />
                    </div>
                </div>

                {shelfResult && (
                    <div className="mt-6 bg-purple-500/10 p-5 rounded-2xl border border-purple-500/20 animate-in fade-in slide-in-from-bottom-2">
                        <h3 className="font-bold text-purple-700 dark:text-purple-400 mb-3 flex items-center gap-2">
                            <CheckCircle size={18} /> Identified Locations
                        </h3>
                        <ul className="space-y-2 mb-4">
                            {shelfResult.map((item, idx) => (
                                <li key={idx} className="flex justify-between text-sm p-2 bg-white/50 dark:bg-black/20 rounded-lg">
                                    <span className="font-medium text-foreground">{item.name}</span>
                                    <span className="font-mono text-muted-foreground bg-muted px-2 py-0.5 rounded">{item.shelf}</span>
                                </li>
                            ))}
                        </ul>
                        <button className="w-full bg-purple-600 text-white py-3 rounded-xl font-medium shadow-lg shadow-purple-600/20 hover:bg-purple-700 active:scale-95 transition-all">
                            Update Shelf Locations
                        </button>
                    </div>
                )}
            </div>

            {loading && (
                <div className="fixed inset-0 bg-background/80 backdrop-blur-sm flex items-center justify-center z-50 animate-in fade-in">
                    <div className="bg-card p-8 rounded-3xl shadow-2xl border border-border flex flex-col items-center gap-4">
                        <Loader2 className="w-10 h-10 animate-spin text-primary" />
                        <p className="text-lg font-medium text-foreground">Processing Image...</p>
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
