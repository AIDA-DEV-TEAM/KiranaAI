import axios from 'axios';

const API_URL = 'https://kiranaai.onrender.com';

export const api = axios.create({
    baseURL: API_URL,
});

export const chatWithData = async (message, history = [], language = 'en') => {
    const response = await api.post('/chat/', { message, history, language });
    return response.data;
};

export const sendVoiceMessage = async (audioBlob) => {
    const formData = new FormData();
    formData.append('file', audioBlob, 'voice.webm');
    const response = await api.post('/live/chat', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
        responseType: 'blob' // Important: Expect binary data
    });

    // Extract text response from headers
    const textResponse = decodeURIComponent(response.headers['x-text-response'] || '');
    const language = response.headers['x-language'] || 'en';

    return {
        audioBlob: response.data,
        text_response: textResponse,
        language: language
    };
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

export const getTTS = async (text, language = 'en', retries = 2) => {
    const timeout = 10000; // 10 second timeout

    for (let attempt = 0; attempt <= retries; attempt++) {
        try {
            console.log(`[API] getTTS attempt ${attempt + 1}/${retries + 1}`);

            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), timeout);

            const response = await api.get('/tts/', {
                params: { text, language },
                responseType: 'arraybuffer',
                signal: controller.signal
            });

            clearTimeout(timeoutId);

            // Convert ArrayBuffer to Base64
            const base64 = btoa(
                new Uint8Array(response.data)
                    .reduce((data, byte) => data + String.fromCharCode(byte), '')
            );

            console.log(`[API] getTTS success (${response.data.byteLength} bytes)`);
            return `data:audio/mp3;base64,${base64}`;

        } catch (error) {
            const isLastAttempt = attempt === retries;

            if (error.name === 'AbortError' || error.code === 'ECONNABORTED') {
                console.error(`[API] getTTS timeout (attempt ${attempt + 1})`);
                if (isLastAttempt) {
                    throw new Error('Voice service timeout - please check your connection');
                }
            } else if (error.response?.status) {
                console.error(`[API] getTTS server error: ${error.response.status}`);
                throw new Error(`Voice service error: ${error.response.status}`);
            } else if (error.request) {
                console.error(`[API] getTTS network error (attempt ${attempt + 1})`);
                if (isLastAttempt) {
                    throw new Error('Network error - please check your connection');
                }
            } else {
                console.error(`[API] getTTS unknown error:`, error);
                throw error;
            }

            // Wait before retry (exponential backoff)
            if (!isLastAttempt) {
                const delay = Math.min(1000 * Math.pow(2, attempt), 3000);
                console.log(`[API] Retrying in ${delay}ms...`);
                await new Promise(resolve => setTimeout(resolve, delay));
            }
        }
    }
};


