import { initializeApp } from 'firebase/app';
import { 
  getAuth, 
  GoogleAuthProvider, 
  signInWithPopup, 
  signInAnonymously, 
  onAuthStateChanged, 
  signOut,
  setPersistence,
  browserLocalPersistence,
  User,
  Auth
} from 'firebase/auth';
import {
  getFirestore,
  Firestore
} from 'firebase/firestore';
import { logger } from './logger';

// Firebase configuration for hasselblad-bildstudio
const firebaseConfig = {
  apiKey: "AIzaSyDVXvM31-uY2JZFr-GCYFKigd09vNye2Ts",
  authDomain: "hasselblad-bildstudio.firebaseapp.com",
  projectId: "hasselblad-bildstudio",
  storageBucket: "hasselblad-bildstudio.firebasestorage.app",
  messagingSenderId: "906146481810",
  appId: "1:906146481810:web:0d7989d0cce6fb9173484b"
};

// Initialize Firebase defensively
let app;
let auth: Auth | null = null;
let db: Firestore | null = null;

try {
  // Check if we are in a restricted environment where Firebase might fail
  if (typeof window !== 'undefined') {
      app = initializeApp(firebaseConfig);
      // Initialize services
      auth = getAuth(app);
      db = getFirestore(app);
  }
} catch (error) {
  console.warn("Firebase initialization failed (Running in offline/local mode):", error);
  // We leave auth and db as null. 
  // The syncService must check for null before using them.
}

export { auth, db };

// Auth helpers with safety checks
export const signInWithGoogle = async (): Promise<User> => {
  if (!auth) throw new Error("Cloud service unavailable (Offline mode)");
  const provider = new GoogleAuthProvider();
  try {
    await setPersistence(auth, browserLocalPersistence);
  } catch (e) {
    console.warn("Persistence warning (likely environment restriction)", e);
  }
  const result = await signInWithPopup(auth, provider);
  logger.success(`Inloggad som ${result.user.displayName}`);
  return result.user;
};

export const signInAnon = async (): Promise<User> => {
  if (!auth) throw new Error("Cloud service unavailable (Offline mode)");
  try {
    await setPersistence(auth, browserLocalPersistence);
  } catch (e) {
    console.warn("Persistence warning", e);
  }
  const result = await signInAnonymously(auth);
  logger.info('Anonym session startad');
  return result.user;
};

export const logOut = async (): Promise<void> => {
  if (auth) {
    await signOut(auth);
    logger.info('Utloggad');
  }
};

export const getCurrentUser = (): User | null => auth?.currentUser || null;

export const onAuthChange = (callback: (user: User | null) => void): (() => void) => {
  if (auth) {
    return onAuthStateChanged(auth, callback);
  }
  // If auth failed to load, we just never trigger the callback, effectively staying "logged out"
  return () => {};
};

export const isAnonymousUser = (): boolean => {
  return auth?.currentUser?.isAnonymous ?? false;
};