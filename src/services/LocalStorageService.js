import { TranslationDictionary } from '../utils/translationDictionary';

const STORAGE_KEYS = {
    INVENTORY: 'kirana_inventory',
    SALES: 'kirana_sales',
    SETTINGS: 'kirana_settings'
};

// Seed data with offline assets and pre-filled translations where possible
const INITIAL_INVENTORY = [
    {
        id: '1',
        name: { en: 'Rice', hi: 'चावल', te: 'బియ్యం', ta: 'அரிசி', kn: 'ಅಕ್ಕಿ', ml: 'അരി', gu: 'ચોખા', mr: 'तांदूळ', bn: 'চাল', pa: 'ਚੌਲ' },
        category: 'Grains',
        price: '50',
        stock: 100,
        max_stock: 200,
        shelf_position: 'A1',
        icon_name: 'wheat',
        image_url: ''
    },
    {
        id: '2',
        name: { en: 'Sugar', hi: 'चीनी', te: 'చక్కెర', ta: 'சர்க்கரை', kn: 'ಸಕ್ಕರೆ', ml: 'പഞ്ചസാര', gu: 'ખાંડ', mr: 'साखर', bn: 'চিনি', pa: 'ਖੰਡ' },
        category: 'Essentials',
        price: '40',
        stock: 50,
        max_stock: 100,
        shelf_position: 'B1',
        icon_name: 'candy',
        image_url: ''
    },
    {
        id: '3',
        name: { en: 'Milk', hi: 'दूध', te: 'పాలు', ta: 'பால்', kn: 'ಹಾಲು', ml: 'പാൽ', gu: 'દૂધ', mr: 'दूध', bn: 'দুধ', pa: 'ਦੁੱਧ' },
        category: 'Dairy',
        price: '30',
        stock: 20,
        max_stock: 50,
        shelf_position: 'Fridge',
        icon_name: 'milk',
        image_url: ''
    },
    {
        id: '4',
        name: { en: 'Oil', hi: 'तेल', te: 'నూనె', ta: 'எண்ணெய்', kn: 'ಎಣ್ಣೆ', ml: 'എണ്ണ', gu: 'તેલ', mr: 'तेल', bn: 'তেਲ', pa: 'ਤੇਲ' },
        category: 'Oil',
        price: '120',
        stock: 30,
        max_stock: 60,
        shelf_position: 'C1',
        icon_name: 'droplet',
        image_url: ''
    },
    {
        id: '5',
        name: { en: 'Wheat Flour', hi: 'गेहूं का आटा', te: 'గోధుమ పిండి', ta: 'கோதுமை மாவு', kn: 'ಗೋಧಿ ಹಿಟ್ಟು', ml: 'ഗോതമ്പ് പൊടി', gu: 'ઘઉંનો લોટ', mr: 'गव्हाचे पीठ', bn: 'আটা', pa: 'ਕਣਕ ਦਾ ਆਟਾ' },
        category: 'Flour',
        price: '45',
        stock: 40,
        max_stock: 80,
        shelf_position: 'A2',
        icon_name: 'wheat',
        image_url: ''
    },
    {
        id: '6',
        name: { en: 'Salt', hi: 'नमक', te: 'ఉప్పు', ta: 'உப்பு', kn: 'ಉಪ್ಪು', ml: 'ഉപ്പ്', gu: 'મીઠું', mr: 'मीठ', bn: 'লবণ', pa: 'ਲੂਣ' },
        category: 'Essentials',
        price: '20',
        stock: 80,
        max_stock: 150,
        shelf_position: 'B2',
        icon_name: 'package',
        image_url: ''
    },
    {
        id: '7',
        name: { en: 'Turmeric', hi: 'हल्दी', te: 'పసుపు', ta: 'மஞ்சள்', kn: 'ಅರಿಶಿನ', ml: 'മഞ്ഞൾ', gu: 'હળદર', mr: 'हळद', bn: 'হলুদ', pa: 'ਹਲਦੀ' },
        category: 'Spices',
        price: '150',
        stock: 30,
        max_stock: 60,
        shelf_position: 'S1',
        icon_name: 'carrot',
        image_url: ''
    },
    {
        id: '8',
        name: { en: 'Chilli Powder', hi: 'लाल मिर्च पाउडर', te: 'కారం పొడి', ta: 'மிளகாய் தூள்', kn: 'ಖಾರದ ಪುಡಿ', ml: 'മുളക് പൊടി', gu: 'લાલ મરચું પાવડર', mr: 'लाल तिखट', bn: 'লंका গুঁড়া', pa: 'ਲਾਲ ਮਿਰਚ ਪਾਊਡਰ' },
        category: 'Spices',
        price: '180',
        stock: 25,
        max_stock: 50,
        shelf_position: 'S2',
        icon_name: 'carrot',
        image_url: ''
    },
    {
        id: '9',
        name: { en: 'Tea', hi: 'चाय', te: 'తేనీరు', ta: 'தேநீர்', kn: 'ಚಹಾ', ml: 'ചായ', gu: 'ચા', mr: 'हा', bn: 'চা', pa: 'ਚਾਹ' },
        category: 'Beverage',
        price: '250',
        stock: 40,
        max_stock: 100,
        shelf_position: 'D1',
        icon_name: 'coffee',
        image_url: ''
    },
    {
        id: '10',
        name: { en: 'Coffee', hi: 'कॉफी', te: 'కాఫీ', ta: 'காபி', kn: 'ಕಾಫಿ', ml: 'കാപ്പി', gu: 'કોફી', mr: 'कॉफी', bn: 'কফি', pa: 'ਕੌਫੀ' },
        category: 'Beverage',
        price: '400',
        stock: 20,
        max_stock: 50,
        shelf_position: 'D2',
        icon_name: 'coffee',
        image_url: ''
    },
    {
        id: '11',
        name: { en: 'Toor Dal', hi: 'अरहर दाल', te: 'కంది పప్పు', ta: 'துவரம் பருப்பு', kn: 'ತೊಗರಿ ಬೇಳೆ', ml: 'തുവര പരിപ്പ്', gu: 'તુવેર દાળ', mr: 'तूर डाळ', bn: 'তূর ডাল', pa: 'ਤੂਰ ਦਾਲ' },
        category: 'Pulses',
        price: '130',
        stock: 60,
        max_stock: 120,
        shelf_position: 'P1',
        icon_name: 'package',
        image_url: ''
    },
    {
        id: '12',
        name: { en: 'Moong Dal', hi: 'मूंग दाल', te: 'పెసర పప్పు', ta: 'பாசி பருப்பு', kn: 'ಹೆಸರು ಬೇಳೆ', ml: 'ചെറുപയർ പരിപ്പ്', gu: 'મગની દાળ', mr: 'मूग डाळ', bn: 'মুগ ডাল', pa: 'ਮੂੰਗ ਦਾਲ' },
        category: 'Pulses',
        price: '110',
        stock: 50,
        max_stock: 100,
        shelf_position: 'P2',
        icon_name: 'package',
        image_url: ''
    },
    {
        id: '13',
        name: { en: 'Onion', hi: 'प्याज़', te: 'ఉల్లిపాయ', ta: 'வெங்காயம்', kn: 'ಈರುಳ್ಳಿ', ml: 'സവാള', gu: 'ડુંગળી', mr: 'कांदा', bn: 'পেঁয়াজ', pa: 'ਪਿਆਜ਼' },
        category: 'Veg',
        price: '35',
        stock: 100,
        max_stock: 200,
        shelf_position: 'V1',
        icon_name: 'carrot',
        image_url: ''
    },
    {
        id: '14',
        name: { en: 'Potato', hi: 'आलू', te: 'బంగాళాదుంప', ta: 'உருளைக்கிழங்கு', kn: 'ಆಲೂಗಡ್ಡೆ', ml: 'ഉരുളക്കിഴങ്ങ്', gu: 'બટાટા', mr: 'बटाटा', bn: 'আলু', pa: 'ਆਲੂ' },
        category: 'Veg',
        price: '25',
        stock: 150,
        max_stock: 300,
        shelf_position: 'V2',
        icon_name: 'carrot',
        image_url: ''
    },
    {
        id: '15',
        name: { en: 'Tomato', hi: 'टमाटर', te: 'టమాటో', ta: 'தக்காளி', kn: 'ಟೊಮ್ಯಾಟೊ', ml: 'തക്കാളി', gu: 'ટામેટા', mr: 'टोमॅटो', bn: 'টমেটো', pa: 'ਟਮਾਟਰ' },
        category: 'Veg',
        price: '60',
        stock: 80,
        max_stock: 100,
        shelf_position: 'V3',
        icon_name: 'apple',
        image_url: ''
    }
];

export const LocalStorageService = {
    // Inventory Operations
    getInventory: () => {
        try {
            const data = localStorage.getItem(STORAGE_KEYS.INVENTORY);
            if (!data) {
                // Initialize with seed data if empty
                LocalStorageService.saveInventory(INITIAL_INVENTORY);
                return INITIAL_INVENTORY;
            }
            return JSON.parse(data);
        } catch (error) {
            console.error("Error reading inventory from local storage", error);
            return [];
        }
    },

    saveInventory: (inventory) => {
        try {
            localStorage.setItem(STORAGE_KEYS.INVENTORY, JSON.stringify(inventory));
            return true;
        } catch (error) {
            console.error("Error saving inventory to local storage", error);
            return false;
        }
    },

    addProduct: (product) => {
        const inventory = LocalStorageService.getInventory();
        const newProduct = { ...product, id: Date.now().toString() };
        const updatedInventory = [...inventory, newProduct];
        LocalStorageService.saveInventory(updatedInventory);
        return newProduct;
    },

    updateProduct: (id, updates) => {
        const inventory = LocalStorageService.getInventory();
        const updatedInventory = inventory.map(item =>
            item.id === id ? { ...item, ...updates } : item
        );
        LocalStorageService.saveInventory(updatedInventory);
        return updatedInventory.find(item => item.id === id);
    },

    deleteProduct: (id) => {
        const inventory = LocalStorageService.getInventory();
        const updatedInventory = inventory.filter(item => item.id !== id);
        LocalStorageService.saveInventory(updatedInventory);
    },

    // Sales Operations
    getSales: () => {
        try {
            const data = localStorage.getItem(STORAGE_KEYS.SALES);
            return data ? JSON.parse(data) : [];
        } catch (error) {
            console.error("Error reading sales from local storage", error);
            return [];
        }
    },

    addSale: (sale) => {
        try {
            const sales = LocalStorageService.getSales();
            const newSale = { ...sale, id: Date.now().toString(), timestamp: new Date().toISOString() };
            const updatedSales = [newSale, ...sales];
            localStorage.setItem(STORAGE_KEYS.SALES, JSON.stringify(updatedSales));

            // Also update stock
            const inventory = LocalStorageService.getInventory();
            const updatedInventory = inventory.map(item => {
                if (item.id === sale.product_id) {
                    return { ...item, stock: Math.max(0, item.stock - sale.quantity) };
                }
                return item;
            });
            LocalStorageService.saveInventory(updatedInventory);

            return newSale;
        } catch (error) {
            console.error("Error adding sale", error);
            throw error;
        }
    },

    // Bulk Operations (for initialization or restore)
    importData: (data) => {
        if (data.inventory) LocalStorageService.saveInventory(data.inventory);
        if (data.sales) localStorage.setItem(STORAGE_KEYS.SALES, JSON.stringify(data.sales));
    },

    clearAll: () => {
        localStorage.removeItem(STORAGE_KEYS.INVENTORY);
        localStorage.removeItem(STORAGE_KEYS.SALES);
        return LocalStorageService.getInventory(); // Re-seeds data
    }
};
