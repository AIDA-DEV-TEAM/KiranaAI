import React, { useState } from 'react';
import { Camera, Upload, CheckCircle, AlertCircle } from 'lucide-react';
import { uploadVisionImage } from '../services/api';

const StockManager = () => {
    const [ocrResult, setOcrResult] = useState(null);
    const [shelfResult, setShelfResult] = useState(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);

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
        <div className="p-4 space-y-8 pb-20">
            <h1 className="text-2xl font-bold mb-4">Stock Management</h1>

            {/* Bill OCR Section */}
            <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
                <h2 className="text-lg font-semibold flex items-center gap-2 mb-4">
                    <Upload size={20} /> Scan Bill of Lading
                </h2>
                <p className="text-sm text-gray-500 mb-4">Upload a photo of the distributor's bill to automatically update inventory.</p>

                <div className="flex gap-4">
                    <label className="flex-1 flex flex-col items-center justify-center h-32 border-2 border-dashed border-blue-300 rounded-lg cursor-pointer hover:bg-blue-50 bg-blue-50/30">
                        <Camera className="w-8 h-8 text-blue-500 mb-2" />
                        <p className="text-sm text-blue-600 font-medium">Take Photo</p>
                        <input
                            type="file"
                            className="hidden"
                            accept="image/*"
                            capture="environment"
                            onChange={(e) => handleFileUpload(e, 'ocr')}
                        />
                    </label>
                    <label className="flex-1 flex flex-col items-center justify-center h-32 border-2 border-dashed border-gray-300 rounded-lg cursor-pointer hover:bg-gray-50">
                        <Upload className="w-8 h-8 text-gray-400 mb-2" />
                        <p className="text-sm text-gray-500">Upload File</p>
                        <input
                            type="file"
                            className="hidden"
                            accept="image/*"
                            onChange={(e) => handleFileUpload(e, 'ocr')}
                        />
                    </label>
                </div>

                {ocrResult && (
                    <div className="mt-4 bg-green-50 p-4 rounded border border-green-200">
                        <h3 className="font-bold text-green-800 mb-2 flex items-center gap-2">
                            <CheckCircle size={16} /> Extracted Items
                        </h3>
                        <ul className="space-y-2">
                            {ocrResult.map((item, idx) => (
                                <li key={idx} className="flex justify-between text-sm">
                                    <span>{item.name}</span>
                                    <span className="font-mono">Qty: {item.quantity}</span>
                                </li>
                            ))}
                        </ul>
                        <button className="mt-4 w-full bg-green-600 text-white py-2 rounded hover:bg-green-700">
                            Confirm & Update Inventory
                        </button>
                    </div>
                )}
            </div>

            {/* Shelf Analysis Section */}
            <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
                <h2 className="text-lg font-semibold flex items-center gap-2 mb-4">
                    <Camera size={20} /> Shelf Analysis
                </h2>
                <p className="text-sm text-gray-500 mb-4">Take a picture of the shelf to update product locations.</p>

                <div className="flex gap-4">
                    <label className="flex-1 flex flex-col items-center justify-center h-32 border-2 border-dashed border-blue-300 rounded-lg cursor-pointer hover:bg-blue-50 bg-blue-50/30">
                        <Camera className="w-8 h-8 text-blue-500 mb-2" />
                        <p className="text-sm text-blue-600 font-medium">Take Photo</p>
                        <input
                            type="file"
                            className="hidden"
                            accept="image/*"
                            capture="environment"
                            onChange={(e) => handleFileUpload(e, 'shelf')}
                        />
                    </label>
                    <label className="flex-1 flex flex-col items-center justify-center h-32 border-2 border-dashed border-gray-300 rounded-lg cursor-pointer hover:bg-gray-50">
                        <Upload className="w-8 h-8 text-gray-400 mb-2" />
                        <p className="text-sm text-gray-500">Upload File</p>
                        <input
                            type="file"
                            className="hidden"
                            accept="image/*"
                            onChange={(e) => handleFileUpload(e, 'shelf')}
                        />
                    </label>
                </div>

                {shelfResult && (
                    <div className="mt-4 bg-blue-50 p-4 rounded border border-blue-200">
                        <h3 className="font-bold text-blue-800 mb-2 flex items-center gap-2">
                            <CheckCircle size={16} /> Identified Locations
                        </h3>
                        <ul className="space-y-2">
                            {shelfResult.map((item, idx) => (
                                <li key={idx} className="flex justify-between text-sm">
                                    <span>{item.name}</span>
                                    <span className="font-mono">{item.shelf}</span>
                                </li>
                            ))}
                        </ul>
                        <button className="mt-4 w-full bg-blue-600 text-white py-2 rounded hover:bg-blue-700">
                            Update Shelf Locations
                        </button>
                    </div>
                )}
            </div>

            {loading && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
                    <div className="bg-white p-6 rounded-lg shadow-xl">
                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-2"></div>
                        <p>Processing Image...</p>
                    </div>
                </div>
            )}

            {error && (
                <div className="bg-red-50 p-4 rounded border border-red-200 flex items-center gap-2 text-red-700">
                    <AlertCircle size={20} />
                    {error}
                </div>
            )}
        </div>
    );
};

export default StockManager;
