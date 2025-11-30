import { initializeApp } from 'firebase/app';
import { 
  getAuth, 
  GoogleAuthProvider, 
  signInWithPopup, 
  signInAnonymously, 
  onAuthStateChanged, 
  signOut,
  setPersistence,
  browserSessionPersistence,
  browserLocalPersistence,
  User 
} from 'firebase/auth';
import {
  getFirestore,
  enableIndexedDbPersistence
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

// Initialize Firebase
const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);

// Enable offline persistence (fails gracefully if not supported)
enableIndexedDbPersistence(db).catch((err) => {
  if (err.code === 'failed-precondition') {
    logger.warn('Firestore persistence failed: Multiple tabs open');
  } else if (err.code === 'unimplemented') {
    logger.warn('Firestore persistence not available in this browser');
  }
});

// Auth helpers
export const signInWithGoogle = async (): Promise<User> => {
  const provider = new GoogleAuthProvider();
  // Force session persistence so every new tab requires login
  try {
    await setPersistence(auth, browserSessionPersistence);
  } catch {
    // fallback not critical
    await setPersistence(auth, browserLocalPersistence);
  }
  const result = await signInWithPopup(auth, provider);
  logger.success(`Inloggad som ${result.user.displayName}`);
  return result.user;
};

export const signInAnon = async (): Promise<User> => {
  try {
    await setPersistence(auth, browserSessionPersistence);
  } catch {
    await setPersistence(auth, browserLocalPersistence);
  }
  const result = await signInAnonymously(auth);
  logger.info('Anonym session startad');
  return result.user;
};

export const logOut = async (): Promise<void> => {
  await signOut(auth);
  logger.info('Utloggad');
};

export const getCurrentUser = (): User | null => auth.currentUser;

export const onAuthChange = (callback: (user: User | null) => void): (() => void) => {
  return onAuthStateChanged(auth, callback);
};

export const isAnonymousUser = (): boolean => {
  return auth.currentUser?.isAnonymous ?? false;
};
