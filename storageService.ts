import { ProcessedProduct } from './types';
import { logger } from './logger';

const STORAGE_KEY = 'woocom_automator_products';
const META_KEY = 'woocom_automator_meta';

export const saveState = (products: ProcessedProduct[]) => {
    try {
        // Optimization: Don't save prefetched results to save space
        const cleanProducts = products.map(p => {
            const { prefetchedResults, ...rest } = p;
            return rest;
        });
        
        localStorage.setItem(STORAGE_KEY, JSON.stringify(cleanProducts));
        localStorage.setItem(META_KEY, JSON.stringify({ 
            lastSaved: Date.now(), 
            count: products.length,
            completed: products.filter(p => p.status === 'completed').length
        }));
    } catch (e) {
        console.error('Failed to save state to localStorage', e);
        logger.warn('Kunde inte spara automatiskt. Lagringsutrymmet kan vara fullt.');
    }
};

export const loadState = (): ProcessedProduct[] | null => {
    try {
        const data = localStorage.getItem(STORAGE_KEY);
        if (!data) return null;
        return JSON.parse(data);
    } catch (e) {
        console.error('Failed to load state', e);
        return null;
    }
};

export const clearState = () => {
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(META_KEY);
};

export const hasSavedState = (): boolean => {
    return !!localStorage.getItem(STORAGE_KEY);
};

export const getMeta = () => {
    try {
        const meta = localStorage.getItem(META_KEY);
        return meta ? JSON.parse(meta) : null;
    } catch {
        return null;
    }
};