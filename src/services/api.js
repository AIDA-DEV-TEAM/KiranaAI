import axios from 'axios';

const API_URL = 'https://kiranaai.onrender.com';

export const api = axios.create({
    baseURL: API_URL,
});

export const chatWithData = async (message, history = []) => {
    const response = await api.post('/chat/', { message, history });
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

export const getMandiPrices = async () => {
    const response = await api.get('/mandi/prices');
    return response.data;
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


