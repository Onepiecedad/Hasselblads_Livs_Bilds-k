import { ProcessedProduct } from './types';
import { logger } from './logger';

const STORAGE_KEY = 'woocom_automator_products';
const META_KEY = 'woocom_automator_meta';

export const saveState = (products: ProcessedProduct[]): { success: boolean; error?: string } => {
    try {
        // Optimization: Don't save prefetched results to save space
        const cleanProducts = products.map(p => {
            const { prefetchedResults, ...rest } = p;
            return rest;
        });

        const dataString = JSON.stringify(cleanProducts);
        const metaString = JSON.stringify({
            lastSaved: Date.now(),
            count: products.length,
            completed: products.filter(p => p.status === 'completed').length
        });

        // Check if we have enough space (estimate)
        const estimatedSize = dataString.length + metaString.length;
        const maxSize = 5 * 1024 * 1024; // 5MB typical localStorage limit

        if (estimatedSize > maxSize) {
            const errorMsg = 'Data är för stor för att sparas lokalt. Exportera till CSV istället.';
            logger.error(errorMsg);
            return { success: false, error: errorMsg };
        }

        localStorage.setItem(STORAGE_KEY, dataString);
        localStorage.setItem(META_KEY, metaString);
        return { success: true };
    } catch (e: any) {
        const errorMsg = e.name === 'QuotaExceededError'
            ? 'Lagringsutrymmet är fullt. Rensa webbläsarens cache eller exportera data till CSV.'
            : 'Kunde inte spara automatiskt. Kontrollera webbläsarinställningar.';

        console.error('Failed to save state to localStorage', e);
        logger.error(errorMsg);
        return { success: false, error: errorMsg };
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