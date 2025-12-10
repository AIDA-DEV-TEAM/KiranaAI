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

// getProducts is removed as it was a duplicate of getInventory

export const getMandiPrices = async () => {
    try {
        const response = await api.get('/mandi/prices');
        return response.data;
    } catch (error) {
        console.error("Failed to fetch mandi prices", error);
        return { prices: [] }; // Return empty structure on error
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
