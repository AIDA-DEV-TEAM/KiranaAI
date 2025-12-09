import axios from 'axios';

const API_URL = 'https://kiranaai.onrender.com';

export const api = axios.create({
    baseURL: API_URL,
});

export const chatWithData = async (message, history = [], language = 'en') => {
    const response = await api.post('/chat/', { message, history, language });
    return response.data;
};

export const getInventory = async () => {
    const response = await api.get('/inventory/');
    return response.data;
};

export const getSales = async () => {
    const response = await api.get('/sales/');
    return response.data;
};

export const getProducts = async () => {
    const response = await api.get('/inventory/');
    return response.data;
};

// Demo Mode: Fetch from local CSV
export const getMandiPrices = async () => {
    try {
        const response = await fetch('/demo_mandi_prices.csv');
        const text = await response.text();
        const rows = text.split('\n').filter(row => row.trim() !== '');
        const headers = rows[0].split(',').map(h => h.trim());

        const prices = rows.slice(1).map(row => {
            const values = row.split(',');
            const entry = {};
            headers.forEach((header, index) => {
                entry[header] = values[index]?.trim();
            });
            return entry;
        });

        return { prices };
    } catch (error) {
        console.warn("Failed to load demo prices, falling back to API", error);
        const response = await api.get('/mandi/prices');
        return response.data;
    }
};

export const uploadVisionImage = async (file, type = 'ocr') => {
    const formData = new FormData();
    formData.append('file', file);
    const endpoint = type === 'ocr' ? '/vision/ocr' : '/vision/shelf';
    const response = await api.post(endpoint, formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
    });
    return response.data;
};

export const importInventory = async (products) => {
    const response = await api.post('/inventory/bulk', products);
    return response.data;
};

export const addProduct = async (product) => {
    const response = await api.post('/inventory/', product);
    return response.data;
};

export const updateProduct = async (id, product) => {
    const response = await api.put(`/inventory/${id}`, product);
    return response.data;
};

export const updateShelfLocations = async (items) => {
    const response = await api.post('/inventory/shelf/bulk', items);
    return response.data;
};

export const addSale = async (sale) => {
    const response = await api.post('/sales/', sale);
    return response.data;
};
