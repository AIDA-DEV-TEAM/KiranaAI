import axios from 'axios';

const API_URL = 'https://kiranaai-9t4f.onrender.com';

export const api = axios.create({
    baseURL: API_URL,
});

export const chatWithData = async (message, history = [], language = 'en', inventory = []) => {
    console.log("API chatWithData received inventory:", inventory ? inventory.length : 'null');
    const response = await api.post('/chat/', { message, history, language, inventory });
    return response.data; // This contains { response, speech, action, params }
};

// export const getInventory = async () => {
//     const response = await api.get('/inventory/');
//     return response.data;
// };

// export const getSales = async () => {
//     const response = await api.get('/sales/');
//     return response.data;
// };

// getProducts is removed as it was a duplicate of getInventory

export const getMandiPrices = async () => {
    try {
        console.log("Fetching simulated Mandi prices from CSV...");
        // Use fetch API to load the file from public folder
        const response = await fetch('/mandi_data.csv');
        if (!response.ok) throw new Error("Failed to load CSV");

        const text = await response.text();

        // Simple CSV Parser
        const rows = text.split('\n').filter(r => r.trim() !== '');
        const headers = rows[0].split(',').map(h => h.trim());

        const prices = rows.slice(1).map(row => {
            const values = row.split(',').map(v => v.trim());
            if (values.length !== headers.length) return null;

            const item = {};
            headers.forEach((header, index) => {
                item[header] = values[index];
            });
            return item;
        }).filter(item => item !== null);

        return { prices };
    } catch (error) {
        console.error("Failed to fetch mandi prices", error);
        return { prices: [] };
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

// export const importInventory = async (products) => {
//     const response = await api.post('/inventory/bulk', products);
//     return response.data;
// };

// export const addProduct = async (product) => {
//     const response = await api.post('/inventory/', product);
//     return response.data;
// };

// export const updateProduct = async (id, product) => {
//     const response = await api.put(`/inventory/${id}`, product);
//     return response.data;
// };

// export const updateShelfLocations = async (items) => {
//     const response = await api.post('/inventory/shelf/bulk', items);
//     return response.data;
// };

// export const addSale = async (sale) => {
//     const response = await api.post('/sales/', sale);
//     return response.data;
// };
