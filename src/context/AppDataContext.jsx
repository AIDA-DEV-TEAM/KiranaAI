import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { getMandiPrices } from '../services/api';
import { LocalStorageService } from '../services/LocalStorageService';

const AppDataContext = createContext();

export const useAppData = () => {
    return useContext(AppDataContext);
};

export const AppDataProvider = ({ children }) => {
    const [inventory, setInventory] = useState([]);
    const [mandiPrices, setMandiPrices] = useState([]);
    const [salesData, setSalesData] = useState([]);
    const [messages, setMessages] = useState([
        { role: 'assistant', content: 'Hello! I can help you analyze your shop data. Ask me questions like "How much rice do we have?" or "What are the total sales today?"' }
    ]);

    const [loadingInventory, setLoadingInventory] = useState(false);
    const [loadingMandi, setLoadingMandi] = useState(false);
    const [loadingSales, setLoadingSales] = useState(false);

    const [inventoryLoaded, setInventoryLoaded] = useState(false);
    const [mandiLoaded, setMandiLoaded] = useState(false);
    const [salesLoaded, setSalesLoaded] = useState(false);

    const refreshInventory = useCallback(async (force = false) => {
        // LocalStorage is cheap, so we can refresh more often to ensure consistency across tabs
        // if (inventoryLoaded && !force) return; 
        setLoadingInventory(true);
        try {
            const data = LocalStorageService.getInventory();
            setInventory(data);
            setInventoryLoaded(true);
        } catch (error) {
            console.error("Failed to fetch inventory", error);
        } finally {
            setLoadingInventory(false);
        }
    }, []);

    const refreshMandiPrices = useCallback(async (force = false) => {
        if (mandiLoaded && !force) return;
        setLoadingMandi(true);
        try {
            const data = await getMandiPrices();
            setMandiPrices(data.prices || []);
            setMandiLoaded(true);
        } catch (error) {
            console.error("Failed to fetch mandi prices", error);
        } finally {
            setLoadingMandi(false);
        }
    }, [mandiLoaded]);

    const [cart, setCart] = useState([]);

    const addToCart = (product) => {
        setCart(prev => {
            const existing = prev.find(item => item.id === product.id);
            if (existing) {
                return prev.map(item => item.id === product.id ? { ...item, quantity: item.quantity + 1 } : item);
            }
            return [...prev, { ...product, quantity: 1 }];
        });
        // Optional: Show toast or feedback here
        console.log(`Added ${product.name} to cart`);
    };

    const refreshSales = useCallback(async (force = false) => {
        // Remove stale check for local data
        // if (salesLoaded && !force) return;
        setLoadingSales(true);
        try {
            // const data = await getSales(); -> Replaced with LocalStorage
            const data = LocalStorageService.getSales();
            setSalesData(data);
            setSalesLoaded(true);
        } catch (error) {
            console.error("Failed to fetch sales", error);
        } finally {
            setLoadingSales(false);
        }
    }, []);

    // Initial load
    useEffect(() => {
        refreshInventory();
        refreshMandiPrices();
        refreshSales();
    }, []);

    const refreshAllData = useCallback(async () => {
        console.log("Refreshing all app data...");
        // Mandi prices still async, others are sync but we can await them if they become async
        await Promise.all([
            Promise.resolve(refreshInventory(true)),
            Promise.resolve(refreshSales(true)),
            refreshMandiPrices(true)
        ]);
        console.log("All app data refreshed.");
    }, [refreshInventory, refreshSales, refreshMandiPrices]);

    const updateStock = async (id, newStock) => {
        // Optimistic update helper if needed, but components handle it nicely.
        // Just wrapping LocalStorage update
        LocalStorageService.updateProduct(id, { stock: newStock });
        refreshInventory(true);
    };

    const value = {
        inventory,
        mandiPrices,
        salesData,
        loadingInventory,
        loadingMandi,
        loadingSales,
        refreshInventory,
        refreshMandiPrices,
        refreshSales,
        refreshAllData,
        cart,
        addToCart,
        messages,
        setMessages,
        addMessage: (msg) => setMessages(prev => [...prev, msg]),
        updateStock // Exporting helper
    };

    return (
        <AppDataContext.Provider value={value}>
            {children}
        </AppDataContext.Provider>
    );
};
