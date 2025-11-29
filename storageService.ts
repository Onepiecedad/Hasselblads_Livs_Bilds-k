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
        
        const payload = JSON.stringify(cleanProducts);
        localStorage.setItem(STORAGE_KEY, payload);
        localStorage.setItem(META_KEY, JSON.stringify({ 
            lastSaved: Date.now(), 
            count: products.length,
            completed: products.filter(p => p.status === 'completed').length
        }));
    } catch (e: any) {
        if (e.name === 'QuotaExceededError' || e.code === 22) {
             logger.warn('LocalStorage Quota Exceeded. Attempting to prune...');
             try {
                // Aggressive Pruning: Remove old original search results from completed items to save space
                const prunedProducts = products.map(p => {
                    if (p.status === 'completed') {
                         const { originalSearchResultUrl, prefetchedResults, ...rest } = p;
                         return rest;
                    }
                    const { prefetchedResults, ...rest } = p;
                    return rest;
                });
                localStorage.setItem(STORAGE_KEY, JSON.stringify(prunedProducts));
                logger.success('Storage pruned and saved successfully.');
                return;
             } catch (pruneError) {
                 logger.error('CRITICAL: Storage full even after pruning. Progress not saved.');
             }
        } else {
             console.error('Failed to save state to localStorage', e);
             logger.warn('Kunde inte spara automatiskt. Okänt fel vid lagring.');
        }
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