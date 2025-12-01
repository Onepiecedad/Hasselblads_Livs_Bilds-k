import React, { useState, useEffect } from 'react';
import { User } from 'firebase/auth';
import { onAuthChange, signInWithGoogle, logOut } from '../firebaseConfig';
import { Cloud, User as UserIcon, Loader2, LogOut, RefreshCw } from 'lucide-react';

interface AuthGateProps {
  children: React.ReactNode;
}

export const AuthGate: React.FC<AuthGateProps> = ({ children }) => {
  /* 
  // --- AUTH LOGIC TEMPORARILY DISABLED ---
  const ALLOWED_EMAILS = new Set([
    'joakim@skylandai.se',
    'axel.hasselblad@gmail.com'
  ]);

  const isAllowedUser = (user: User | null) => {
    const email = user?.email?.toLowerCase();
    return !!email && ALLOWED_EMAILS.has(email);
  };

  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);
  const [signingIn, setSigningIn] = useState(false);

  useEffect(() => {
    const unsubscribe = onAuthChange((user) => {
      if (user && !isAllowedUser(user)) {
        setAuthError('Endast godkända konton kan logga in. Kontakta administratör.');
        logOut();
        setUser(null);
        setLoading(false);
        return;
      }
      setUser(user);
      setLoading(false);
    });
    return unsubscribe;
  }, []);

  const handleGoogleSignIn = async () => {
    setSigningIn(true);
    setAuthError(null);
    try {
      const signedIn = await signInWithGoogle();
      if (!isAllowedUser(signedIn)) {
        setAuthError('Detta konto har inte behörighet.');
        await logOut();
        setUser(null);
      }
    } catch (e: any) {
      console.error('Google sign-in error:', e);
      if (e.code === 'auth/popup-closed-by-user') {
        setAuthError('Inloggningen avbröts');
      } else if (e.code === 'auth/popup-blocked') {
        setAuthError('Popup blockerades av webbläsaren. Tillåt popups för denna sida.');
      } else {
        setAuthError(e.message || 'Kunde inte logga in');
      }
    } finally {
      setSigningIn(false);
    }
  };

  // Loading state
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-stone-50">
        <div className="text-center">
          <Loader2 className="w-10 h-10 animate-spin text-emerald-600 mx-auto mb-4" />
          <p className="text-stone-500 font-medium">Laddar...</p>
        </div>
      </div>
    );
  }

  // Not logged in - show login screen
  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-stone-50 p-4">
        <div className="max-w-md w-full bg-white rounded-2xl shadow-xl border border-stone-200 overflow-hidden">
          
          <div className="bg-emerald-900 p-8 text-center relative overflow-hidden">
            <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/cubes.png')] opacity-10"></div>
            <div className="relative z-10">
              <div className="w-16 h-16 bg-white/10 rounded-full flex items-center justify-center mx-auto mb-4 border border-white/20">
                <Cloud size={32} className="text-amber-400" />
              </div>
              <h1 className="text-2xl font-bold text-white serif-font">Hasselblad Bildstudio</h1>
              <p className="text-emerald-200 mt-2">Logga in för att synka mellan enheter</p>
            </div>
          </div>
          
          
          <div className="p-8 space-y-4">
            <button
              onClick={handleGoogleSignIn}
              disabled={signingIn}
              className="w-full flex items-center justify-center gap-3 bg-white border-2 border-stone-200 hover:border-emerald-500 text-stone-700 py-4 px-6 rounded-xl font-bold transition-all hover:bg-emerald-50 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {signingIn ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                <svg className="w-5 h-5" viewBox="0 0 24 24">
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                </svg>
              )}
              Fortsätt med Google
            </button>

            <p className="text-xs text-stone-400 text-center">
              Endast följande konton har tillgång:<br />
              joakim@skylandai.se och axel.hasselblad@gmail.com
            </p>
            
            {authError && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm flex items-center gap-2">
                <span>⚠️</span>
                <span>{authError}</span>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }
  */
 
  // Pass-through to children (Auth bypassed)
  return <>{children}</>;
};

/**
 * User badge component for displaying in header
 */
export const UserBadge: React.FC<{ onLogout?: () => void }> = ({ onLogout }) => {
  const [user, setUser] = useState<User | null>(null);
  const [showMenu, setShowMenu] = useState(false);

  useEffect(() => {
    const unsubscribe = onAuthChange(setUser);
    return unsubscribe;
  }, []);

  if (!user) return null;

  const handleLogout = async () => {
    await logOut();
    onLogout?.();
    setShowMenu(false);
  };

  const isAnon = user.isAnonymous;

  return (
    <div className="relative">
      <button 
        onClick={() => setShowMenu(!showMenu)}
        className="flex items-center gap-2 px-3 py-1.5 rounded-lg hover:bg-white/10 transition-colors"
      >
        {user.photoURL ? (
          <img src={user.photoURL} className="w-6 h-6 rounded-full border border-white/20" alt="" />
        ) : (
          <div className="w-6 h-6 rounded-full bg-emerald-700 flex items-center justify-center">
            <UserIcon size={14} className="text-emerald-200" />
          </div>
        )}
        <span className="text-xs text-emerald-200 hidden sm:inline">
          {isAnon ? 'Anonym' : (user.displayName || user.email)}
        </span>
        {isAnon && (
          <span className="text-[10px] bg-amber-500/20 text-amber-300 px-1.5 py-0.5 rounded font-medium">
            Lokal
          </span>
        )}
      </button>

      {showMenu && (
        <>
          <div 
            className="fixed inset-0 z-40" 
            onClick={() => setShowMenu(false)} 
          />
          <div className="absolute right-0 top-full mt-2 w-48 bg-white rounded-xl shadow-xl border border-stone-200 py-2 z-50">
            <div className="px-4 py-2 border-b border-stone-100">
              <p className="text-sm font-medium text-stone-800 truncate">
                {isAnon ? 'Anonym session' : (user.displayName || 'Användare')}
              </p>
              {!isAnon && user.email && (
                <p className="text-xs text-stone-400 truncate">{user.email}</p>
              )}
            </div>
            
            {isAnon && (
              <button
                onClick={async () => {
                  setShowMenu(false);
                  await signInWithGoogle();
                }}
                className="w-full px-4 py-2 text-left text-sm text-emerald-700 hover:bg-emerald-50 flex items-center gap-2"
              >
                <RefreshCw size={14} />
                Uppgradera till Google
              </button>
            )}
            
            <button
              onClick={handleLogout}
              className="w-full px-4 py-2 text-left text-sm text-red-600 hover:bg-red-50 flex items-center gap-2"
            >
              <LogOut size={14} />
              Logga ut
            </button>
          </div>
        </>
      )}
    </div>
  );
};

/**
 * Sync status indicator for header
 */
export const SyncIndicator: React.FC<{
  syncing: boolean;
  lastSync: Date | null;
  error?: string | null;
}> = ({ syncing, lastSync, error }) => {
  const formatRelativeTime = (date: Date): string => {
    const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
    if (seconds < 10) return 'just nu';
    if (seconds < 60) return `${seconds}s sedan`;
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m sedan`;
    const hours = Math.floor(minutes / 60);
    return `${hours}h sedan`;
  };

  if (error) {
    return (
      <div className="flex items-center gap-1.5 text-xs text-red-300">
        <span className="w-2 h-2 bg-red-400 rounded-full"></span>
        <span>Sync-fel</span>
      </div>
    );
  }

  if (syncing) {
    return (
      <div className="flex items-center gap-1.5 text-xs text-emerald-200">
        <Loader2 size={12} className="animate-spin" />
        <span>Synkar...</span>
      </div>
    );
  }

  if (lastSync) {
    return (
      <div className="flex items-center gap-1.5 text-xs text-emerald-300">
        <Cloud size={12} />
        <span>{formatRelativeTime(lastSync)}</span>
      </div>
    );
  }

  return null;
};