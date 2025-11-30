import { db, auth } from './firebaseConfig';
import {
  collection,
  doc,
  setDoc,
  getDoc,
  getDocs,
  onSnapshot,
  writeBatch,
  Timestamp,
  Unsubscribe
} from 'firebase/firestore';
import { ProcessedProduct } from './types';
import { logger } from './logger';

const DEFAULT_PROJECT_ID = 'default';

// Helper functions for Firestore paths
const getProductsRef = (userId: string, projectId: string = DEFAULT_PROJECT_ID) =>
  collection(db, 'users', userId, 'projects', projectId, 'products');

const getMetaRef = (userId: string, projectId: string = DEFAULT_PROJECT_ID) =>
  doc(db, 'users', userId, 'projects', projectId, 'meta');

/**
 * Identify device type for tracking which device made changes
 */
const getDeviceName = (): string => {
  const ua = navigator.userAgent.toLowerCase();
  if (/iphone|ipad|ipod/.test(ua)) return 'iPhone/iPad';
  if (/android/.test(ua)) return 'Android';
  if (/macintosh|mac os/.test(ua)) return 'Mac';
  if (/windows/.test(ua)) return 'Windows';
  return 'Okänd enhet';
};

/**
 * Save a single product to Firestore
 */
export const saveProductToCloud = async (product: ProcessedProduct): Promise<void> => {
  const user = auth.currentUser;
  if (!user) throw new Error('Ej inloggad');

  const productRef = doc(getProductsRef(user.uid), product.id);

  // Remove transient/non-serializable data before saving
  const productData = { ...product };
  delete (productData as any).prefetchedResults;

  await setDoc(productRef, {
    ...productData,
    updatedAt: Timestamp.now(),
    updatedBy: getDeviceName()
  }, { merge: true });
};

/**
 * Batch save multiple products (more efficient for large updates)
 * Firestore allows max 500 operations per batch, we use 450 for margin
 */
export const saveProductsToCloud = async (products: ProcessedProduct[]): Promise<void> => {
  const user = auth.currentUser;
  if (!user) throw new Error('Ej inloggad');

  const BATCH_SIZE = 450;
  const productsRef = getProductsRef(user.uid);

  for (let i = 0; i < products.length; i += BATCH_SIZE) {
    const batch = writeBatch(db);
    const chunk = products.slice(i, i + BATCH_SIZE);

    chunk.forEach(product => {
      const productData = { ...product };
      delete (productData as any).prefetchedResults;

      const ref = doc(productsRef, product.id);
      batch.set(ref, {
        ...productData,
        updatedAt: Timestamp.now(),
        updatedBy: getDeviceName()
      }, { merge: true });
    });

    await batch.commit();
    logger.info(`Synkade ${Math.min(i + BATCH_SIZE, products.length)}/${products.length} till molnet`);
  }

  // Update project metadata
  await updateProjectMeta(user.uid, products);
};

/**
 * Load all products from Firestore
 */
export const loadProductsFromCloud = async (): Promise<ProcessedProduct[]> => {
  const user = auth.currentUser;
  if (!user) throw new Error('Ej inloggad');

  const productsRef = getProductsRef(user.uid);
  const snapshot = await getDocs(productsRef);

  const products: ProcessedProduct[] = [];
  snapshot.forEach(docSnap => {
    const data = docSnap.data();
    products.push({
      ...data,
      id: docSnap.id
    } as ProcessedProduct);
  });

  // Sort by original order (based on id)
  products.sort((a, b) => a.id.localeCompare(b.id));

  logger.success(`Laddade ${products.length} produkter från molnet`);
  return products;
};

/**
 * Subscribe to realtime updates - called whenever data changes anywhere
 */
export const subscribeToProducts = (
  onUpdate: (products: ProcessedProduct[]) => void,
  onError: (error: Error) => void
): Unsubscribe => {
  const user = auth.currentUser;
  if (!user) {
    onError(new Error('Ej inloggad'));
    return () => {};
  }

  const productsRef = getProductsRef(user.uid);

  const unsubscribe = onSnapshot(
    productsRef,
    (snapshot) => {
      const products: ProcessedProduct[] = [];
      snapshot.forEach(docSnap => {
        const data = docSnap.data();
        products.push({
          ...data,
          id: docSnap.id
        } as ProcessedProduct);
      });

      // Sort by original order
      products.sort((a, b) => a.id.localeCompare(b.id));

      logger.info(`Realtidsuppdatering: ${products.length} produkter`);
      onUpdate(products);
    },
    (error) => {
      logger.error('Sync-fel', error.message);
      onError(error);
    }
  );

  return unsubscribe;
};

/**
 * Update project metadata
 */
const updateProjectMeta = async (userId: string, products: ProcessedProduct[]): Promise<void> => {
  const metaRef = getMetaRef(userId);

  await setDoc(metaRef, {
    name: 'Hasselblad Grundsortiment',
    updatedAt: Timestamp.now(),
    lastEditedBy: getDeviceName(),
    totalProducts: products.length,
    completedProducts: products.filter(p => p.status === 'completed').length,
    failedProducts: products.filter(p => p.status === 'failed').length
  }, { merge: true });
};

/**
 * Check if cloud data exists for current user
 */
export const hasCloudData = async (): Promise<boolean> => {
  const user = auth.currentUser;
  if (!user) return false;

  try {
    const metaRef = getMetaRef(user.uid);
    const metaSnap = await getDoc(metaRef);
    return metaSnap.exists();
  } catch (e) {
    return false;
  }
};

/**
 * Get sync metadata
 */
export const getCloudMeta = async (): Promise<{
  totalProducts: number;
  completedProducts: number;
  lastEditedBy: string;
  updatedAt: Date;
} | null> => {
  const user = auth.currentUser;
  if (!user) return null;

  try {
    const metaRef = getMetaRef(user.uid);
    const metaSnap = await getDoc(metaRef);
    if (!metaSnap.exists()) return null;

    const data = metaSnap.data();
    return {
      totalProducts: data.totalProducts || 0,
      completedProducts: data.completedProducts || 0,
      lastEditedBy: data.lastEditedBy || 'Okänd',
      updatedAt: data.updatedAt?.toDate() || new Date()
    };
  } catch (e) {
    return null;
  }
};

/**
 * Clear all cloud data for current user (for reset functionality)
 */
export const clearCloudData = async (): Promise<void> => {
  const user = auth.currentUser;
  if (!user) throw new Error('Ej inloggad');

  const productsRef = getProductsRef(user.uid);
  const snapshot = await getDocs(productsRef);

  if (snapshot.empty) {
    logger.info('Ingen molndata att radera');
    return;
  }

  const BATCH_SIZE = 450;
  const docs = snapshot.docs;

  for (let i = 0; i < docs.length; i += BATCH_SIZE) {
    const batch = writeBatch(db);
    const chunk = docs.slice(i, i + BATCH_SIZE);
    chunk.forEach(docSnap => batch.delete(docSnap.ref));
    await batch.commit();
  }

  // Also delete metadata
  const metaRef = getMetaRef(user.uid);
  await setDoc(metaRef, { deleted: true, deletedAt: Timestamp.now() });

  logger.warn('All molndata raderad');
};
