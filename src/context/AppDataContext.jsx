import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { getInventory, getMandiPrices, getSales } from '../services/api';

const AppDataContext = createContext();

export const useAppData = () => {
    return useContext(AppDataContext);
};

export const AppDataProvider = ({ children }) => {
    const [inventory, setInventory] = useState([]);
    const [mandiPrices, setMandiPrices] = useState([]);
    const [salesData, setSalesData] = useState([]);

    const [loadingInventory, setLoadingInventory] = useState(false);
    const [loadingMandi, setLoadingMandi] = useState(false);
    const [loadingSales, setLoadingSales] = useState(false);

    const [inventoryLoaded, setInventoryLoaded] = useState(false);
    const [mandiLoaded, setMandiLoaded] = useState(false);
    const [salesLoaded, setSalesLoaded] = useState(false);

    const refreshInventory = useCallback(async (force = false) => {
        if (inventoryLoaded && !force) return;
        setLoadingInventory(true);
        try {
            const data = await getInventory();
            setInventory(data);
            setInventoryLoaded(true);
        } catch (error) {
            console.error("Failed to fetch inventory", error);
        } finally {
            setLoadingInventory(false);
        }
    }, [inventoryLoaded]);

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
        if (salesLoaded && !force) return;
        setLoadingSales(true);
        try {
            const data = await getSales();
            setSalesData(data);
            setSalesLoaded(true);
        } catch (error) {
            console.error("Failed to fetch sales", error);
        } finally {
            setLoadingSales(false);
        }
    }, [salesLoaded]);

    // Initial load
    useEffect(() => {
        refreshInventory();
        refreshMandiPrices();
        refreshSales();
    }, []);

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
        cart,
        addToCart
    };

    return (
        <AppDataContext.Provider value={value}>
            {children}
        </AppDataContext.Provider>
    );
};
