
import React, { useState, useEffect, useRef } from 'react';
import CSVEditor from './components/CSVEditor';
import ImageWorkflow from './components/ImageWorkflow';
import ExportView from './components/ExportView';
import { CloudinaryConfig } from './components/CloudinaryConfig';
import { BatchModeView } from './components/BatchModeView';
import { DebugConsole } from './components/DebugConsole';
import { SupportChat } from './components/SupportChat';
import { ErrorBoundary } from './components/ErrorBoundary';
import { ProductSidebar } from './components/ProductSidebar';
import { AuthGate, UserBadge, SyncIndicator } from './components/AuthGate';
import { DashboardView } from './components/DashboardView';
// ModeSelectView removed from flow to flatten navigation
import { Product, ProcessedProduct, AppStep } from './types';
import { searchProductImages, setSearchConfig } from './geminiService';
import { setCloudinaryConfig } from './cloudinaryService';
import { saveState, loadState, hasSavedState, clearState } from './storageService';
import { DEFAULT_CSV_CONTENT } from './constants/defaultData';
import { parseCSVString } from './utils/csvParser';
import { Undo2, CheckCircle2, List, Settings, UploadCloud, ShoppingBag, Filter, Loader2, X, ChevronLeft } from 'lucide-react';
import {
  saveProductsToCloud,
  loadProductsFromCloud,
  clearCloudData,
  subscribeToProducts,
  saveProductToCloud
} from './syncService';
import { logOut, onAuthChange } from './firebaseConfig';
import { logger } from './logger';
import { User } from 'firebase/auth';

const App: React.FC = () => {
  const [step, setStep] = useState<AppStep>(AppStep.UPLOAD);
  const [products, setProducts] = useState<ProcessedProduct[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [reviewFilter, setReviewFilter] = useState<'all' | 'incomplete' | 'completed'>('all');
  const [filterOriginalImages, setFilterOriginalImages] = useState<boolean>(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isBatchRunning, setIsBatchRunning] = useState(false);
  const [isBatchPaused, setIsBatchPaused] = useState(false);
  const [cloudAvailable, setCloudAvailable] = useState(false);
  const prefetchingRef = useRef<Set<string>>(new Set());
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastSyncTime, setLastSyncTime] = useState<Date | null>(null);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [user, setUser] = useState<User | null>(null);
  
  // FIX: Keep a ref to products to access inside effects without adding it to dependencies
  const productsRef = useRef(products);
  useEffect(() => { productsRef.current = products; }, [products]);

  // --- AUTH & SYNC SETUP ---
  useEffect(() => {
    const unsubAuth = onAuthChange((u) => {
        setUser(u);
    });
    return () => unsubAuth();
  }, []);

  // --- REALTIME SYNC SUBSCRIPTION ---
  useEffect(() => {
      if (user && !user.isAnonymous) {
          logger.info('Starting realtime sync subscription...');
          setIsSyncing(true);
          const unsubProducts = subscribeToProducts((cloudData) => {
              if (cloudData.length > 0) {
                  setProducts(cloudData);
                  saveState(cloudData);
                  setLastSyncTime(new Date());
                  setCloudAvailable(true);
              }
              setIsSyncing(false);
          }, (err) => {
              console.error("Sync subscription error", err);
              setSyncError("Realtidssynk avbruten");
              setIsSyncing(false);
          });
          return () => unsubProducts();
      } else {
          setIsSyncing(false);
      }
  }, [user]);

  // --- INITIAL LOAD (LOCAL) ---
  useEffect(() => {
    const initializeApp = async () => {
      // 1. Config Migration
      const OLD_BROKEN_KEY = 'AIzaSyAtSpe9Rm7Nm-SDQlM5utxWijbl_L3UG-o';
      const CORRECT_KEY = 'AIzaSyAtSpe9Rm7Nm-SDqIM5utxWijbI_L3UG-o';
      
      let savedApiKey = localStorage.getItem('google_search_api_key');
      
      if (savedApiKey === OLD_BROKEN_KEY) {
          logger.info('Detected broken API key in storage. Auto-migrating to correct key.');
          localStorage.setItem('google_search_api_key', CORRECT_KEY);
          savedApiKey = CORRECT_KEY;
      }

      const savedCx = localStorage.getItem('google_search_cx');
      
      const apiKeyToUse = savedApiKey || CORRECT_KEY;
      const cxToUse = savedCx || 'b446eed8fbf424c0f';

      setSearchConfig(apiKeyToUse, cxToUse);

      const savedCloud = localStorage.getItem('cloudinary_cloud_name') || 'da7wmiyra';
      const savedPreset = localStorage.getItem('cloudinary_upload_preset') || 'woocom_upload';
      setCloudinaryConfig(savedCloud, savedPreset);

      // 2. Load local data if available
      if (hasSavedState()) {
        const savedProducts = loadState();
        if (savedProducts && savedProducts.length > 0) {
          setProducts(savedProducts);
          setStep(AppStep.DASHBOARD);
        }
      } else {
        // 3. Load default dataset if empty
        loadDefaultDataset();
      }
    };

    initializeApp();
    return () => { prefetchingRef.current.clear(); };
  }, []);

  const loadDefaultDataset = () => {
      try {
          const parsed = parseCSVString(DEFAULT_CSV_CONTENT);
          const initialized: ProcessedProduct[] = parsed.map(p => ({ ...p, status: 'pending' as const }));
          setProducts(initialized);
          setStep(AppStep.DASHBOARD);
          saveState(initialized);
      } catch (e) {
          console.error("Failed to load default dataset", e);
      }
  };

  // --- AUTO SAVE LOCAL ---
  useEffect(() => {
    if (products.length === 0) return;
    const timeoutId = setTimeout(async () => { saveState(products); }, 4000); 
    return () => clearTimeout(timeoutId);
  }, [products]);

  // --- PREFETCHING (Fixed Loop) ---
  useEffect(() => {
    if (step !== AppStep.PROCESS) return;
    const PREFETCH_WINDOW = 3; 
    
    const currentProducts = productsRef.current;
    
    const runPrefetch = async () => {
        const indicesToFetch: number[] = [];
        let count = 0;
        let lookAhead = 1;
        
        while (count < PREFETCH_WINDOW && (currentIndex + lookAhead) < currentProducts.length) {
            const idx = currentIndex + lookAhead;
            const p = currentProducts[idx];
            const hasInitial = p.initialImages && p.initialImages.length > 0;
            if (filterOriginalImages && hasInitial) {
                lookAhead++;
                continue;
            }
            if (p.status === 'pending' && !p.prefetchedResults && !prefetchingRef.current.has(p.id)) {
                indicesToFetch.push(idx);
                count++;
            }
            lookAhead++;
        }
        
        if (indicesToFetch.length === 0) return;
        indicesToFetch.forEach(idx => prefetchingRef.current.add(currentProducts[idx].id));

        for (const idx of indicesToFetch) {
            const product = currentProducts[idx];
            try {
                if (!prefetchingRef.current.has(product.id)) continue;
                if (productsRef.current[idx].status !== 'pending') continue;

                const results = await searchProductImages(product.product_name, product.brand, product.description);
                
                setProducts(prev => prev.map(p => {
                    if (p.id === product.id) return { ...p, prefetchedResults: results };
                    return p;
                }));
            } catch (e) {
                console.warn(`Prefetch failed for ${product.product_name}`, e);
            } finally {
                prefetchingRef.current.delete(product.id);
            }
        }
    };
    runPrefetch();
    return () => { prefetchingRef.current.clear(); };
  }, [currentIndex, step, filterOriginalImages]);

  // --- HANDLERS ---
  const handleCSVImport = async (newProducts: Product[], mergeMode: boolean) => {
    let updatedList: ProcessedProduct[] = [];
    if (mergeMode) {
        updatedList = [...products];
        let addedCount = 0;
        let updatedCount = 0;
        newProducts.forEach(newP => {
            const newP_ArtNr = newP.csvData?.['Artikelnummer'] || newP.csvData?.['sku'];
            const newId = newP_ArtNr || newP.product_name;
            const existingIndex = updatedList.findIndex(p => {
                const p_ArtNr = p.csvData?.['Artikelnummer'] || p.csvData?.['sku'];
                return (p_ArtNr || p.product_name) === newId;
            });

            if (existingIndex !== -1) {
                const existing = updatedList[existingIndex];
                updatedList[existingIndex] = {
                    ...existing, ...newP, id: existing.id, status: existing.status, 
                    finalImageUrl: existing.finalImageUrl, cloudinaryUrl: existing.cloudinaryUrl, initialImages: existing.initialImages 
                } as ProcessedProduct;
                updatedCount++;
            } else {
                updatedList.push({ ...newP, status: 'pending' } as ProcessedProduct);
                addedCount++;
            }
        });
        alert(`Uppdatering klar!\n${updatedCount} uppdaterade.\n${addedCount} nya.`);
        setProducts(updatedList);
        setStep(AppStep.DASHBOARD);
    } else {
        const initialized = newProducts.map(p => ({ ...p, status: 'pending' as const }));
        updatedList = initialized as ProcessedProduct[];
        setProducts(updatedList);
        // After new import, go to Configure, then Dashboard. Skip redundant "Mode Select".
        setStep(AppStep.CONFIGURE);
    }

    if (user && !user.isAnonymous && updatedList.length > 0) {
        try {
            await saveProductsToCloud(updatedList);
            logger.info('Imported products synced to cloud automatically.');
        } catch (e) {
            logger.warn('Failed to sync imported products to cloud.');
        }
    }
  };

  const handleEditListSave = (updatedProducts: Product[]) => {
      const processed = updatedProducts.map(p => {
          const existing = products.find(ep => ep.id === p.id);
          return {
              ...p,
              status: existing ? existing.status : 'pending',
              finalImageUrl: existing?.finalImageUrl,
              imageSource: existing?.imageSource,
              cloudinaryUrl: existing?.cloudinaryUrl
          } as ProcessedProduct;
      });
      setProducts(processed);
      saveState(processed);
      if (user && !user.isAnonymous) {
          saveProductsToCloud(processed).catch(e => logger.warn('Cloud sync failed after edit'));
      }
      setStep(AppStep.DASHBOARD);
  };

  const handleEditListSelect = (product: Product) => {
      const index = products.findIndex(p => p.id === product.id);
      if (index !== -1) {
          setCurrentIndex(index);
          setReviewFilter('all');
          setStep(AppStep.PROCESS);
      }
  };

  const startBatchMode = () => { setIsBatchPaused(false); setStep(AppStep.BATCH); };
  
  const startManualMode = () => {
      setReviewFilter('all');
      setFilterOriginalImages(false);
      setStep(AppStep.PROCESS);
      const firstPending = products.findIndex(p => p.status !== 'completed');
      setCurrentIndex(firstPending !== -1 ? firstPending : 0);
  };

  const navigateToFilter = (filter: 'all' | 'incomplete' | 'completed') => {
      setReviewFilter(filter);
      setStep(AppStep.PROCESS);
      const idx = products.findIndex(p => {
          if (filter === 'incomplete') return p.status !== 'completed';
          if (filter === 'completed') return p.status === 'completed';
          return true;
      });
      setCurrentIndex(idx !== -1 ? idx : 0);
  };

  const handleRealtimeProductUpdate = (updatedProduct: ProcessedProduct) => {
      setProducts(prev => prev.map(p => p.id === updatedProduct.id ? updatedProduct : p));
      if (user && !user.isAnonymous) saveProductToCloud(updatedProduct).catch(console.error);
  };

  const handleReviewDuringBatch = () => {
      setReviewFilter('incomplete');
      setStep(AppStep.PROCESS);
      const firstPending = products.findIndex(p => p.status !== 'completed');
      setCurrentIndex(firstPending !== -1 ? firstPending : 0);
  };

  const handleBatchProductSelect = (product: ProcessedProduct) => {
      const index = products.findIndex(p => p.id === product.id);
      if (index !== -1) {
          setCurrentIndex(index);
          setReviewFilter('all'); 
          setStep(AppStep.PROCESS);
      }
  };

  const handleBatchComplete = (results: ProcessedProduct[]) => {
      setIsBatchRunning(false);
      setIsBatchPaused(false);
      setProducts(results);
      saveState(results);
      if (user && !user.isAnonymous) saveProductsToCloud(results).catch(console.error);

      const hasFailures = results.some(p => p.status !== 'completed');
      if (hasFailures) {
          setReviewFilter('incomplete');
          const firstIncomplete = results.findIndex(p => p.status !== 'completed');
          setCurrentIndex(firstIncomplete !== -1 ? firstIncomplete : 0);
      } else {
          setReviewFilter('all');
          setCurrentIndex(0);
      }
      setStep(AppStep.PROCESS);
  };

  const handleProductComplete = (imageUrl: string, updatedMetadata?: Partial<ProcessedProduct>) => {
    const updated = [...products];
    const updatedProduct = {
        ...updated[currentIndex],
        ...updatedMetadata,
        finalImageUrl: imageUrl,
        status: 'completed' as const,
        cloudinaryUrl: imageUrl.includes('cloudinary.com') ? imageUrl : undefined
    };
    updated[currentIndex] = updatedProduct;
    setProducts(updated);
    if (user && !user.isAnonymous) saveProductToCloud(updatedProduct).catch(console.error);
    moveToNext(updated);
  };

  const handleUploadCloud = async () => {
    if (!user || user.isAnonymous) { setSyncError('Logga in med Google för att ladda upp till molnet'); return; }
    if (products.length === 0) { setSyncError('Ingen data att ladda upp'); return; }
    setIsSyncing(true); setSyncError(null);
    try { await saveProductsToCloud(products); setLastSyncTime(new Date()); setCloudAvailable(true); }
    catch (e: any) { setSyncError('Kunde inte ladda upp molndata'); }
    finally { setIsSyncing(false); }
  };

  const handleProductSkip = () => {
    const updated = [...products];
    updated[currentIndex].status = 'skipped';
    setProducts(updated);
    if (user && !user.isAnonymous) saveProductToCloud(updated[currentIndex]).catch(console.error);
    moveToNext(updated);
  };

  const findNextIndex = (currentList: ProcessedProduct[], startIndex: number, direction: 1 | -1, ignoreFilter: boolean = false): number => {
      let next = startIndex + direction;
      while (next >= 0 && next < currentList.length) {
          const p = currentList[next];
          let valid = true;
          if (!ignoreFilter) {
              if (reviewFilter === 'incomplete' && p.status === 'completed') valid = false;
              if (reviewFilter === 'completed' && p.status !== 'completed') valid = false;
              if (valid && filterOriginalImages && p.initialImages && p.initialImages.length > 0) valid = false;
          }
          if (valid) return next;
          next += direction;
      }
      return -1;
  };

  const moveToNext = (currentList = products) => {
    const nextIndex = findNextIndex(currentList, currentIndex, 1);
    if (nextIndex !== -1) {
      setCurrentIndex(nextIndex);
    } else {
       if (reviewFilter === 'incomplete' || filterOriginalImages) {
           const anyLeft = currentList.some(p => {
               if (p.status === 'completed' && reviewFilter === 'incomplete') return false;
               if (filterOriginalImages && p.initialImages && p.initialImages.length > 0) return false;
               return true;
           });
           if (!anyLeft && reviewFilter === 'incomplete') setStep(AppStep.EXPORT);
       }
    }
  };

  const moveToPrevious = () => {
    const prevIndex = findNextIndex(products, currentIndex, -1);
    if (prevIndex !== -1) setCurrentIndex(prevIndex);
    else if (currentIndex > 0) setCurrentIndex(currentIndex - 1);
  };

  const resetToDefault = () => {
      if(confirm("Vill du återställa appen till det ursprungliga Grundsortimentet? Allt ditt arbete kommer raderas.")) {
          clearState();
          loadDefaultDataset();
      }
  }

  const resetApp = async () => {
    if(confirm("Är du säker? Detta raderar all data, både lokalt och i molnet.")) {
      clearState();
      if (user && !user.isAnonymous) { try { await clearCloudData(); } catch (e) { logger.warn('Kunde inte rensa molndata'); } }
      setProducts([]);
      setCurrentIndex(0);
      setStep(AppStep.UPLOAD);
      prefetchingRef.current.clear();
      setIsBatchPaused(false);
    }
  };

  const handleLogout = async () => {
    try { await logOut(); } finally { setStep(AppStep.DASHBOARD); }
  };

  const progress = products.length > 0 ? ((currentIndex + 1) / products.length) * 100 : 0;
  const currentProduct = products[currentIndex];
  const incompleteCount = products.filter(p => p.status !== 'completed').length;
  const completedCount = products.filter(p => p.status === 'completed').length;
  const nextPendingIndex = products.findIndex(p => p.status === 'pending');
  const nextPendingProduct = nextPendingIndex !== -1 ? products[nextPendingIndex] : null;

  return (
    <AuthGate>
      <ErrorBoundary>
        <div className="min-h-screen flex flex-col font-sans text-stone-900 pb-20 bg-stone-50 selection:bg-emerald-200 selection:text-emerald-900">
          
          {/* HEADER */}
          <header className="bg-emerald-950 text-white h-16 flex items-center justify-between px-4 md:px-6 sticky top-0 z-30 shadow-md backdrop-blur-md bg-opacity-90">
            <div className="flex items-center gap-3 cursor-pointer group" onClick={() => setStep(AppStep.DASHBOARD)}>
              <div className="bg-emerald-800/50 p-2 rounded-xl border border-white/10 group-hover:bg-emerald-800 transition-colors">
                <ShoppingBag size={20} className="text-amber-400" />
              </div>
              <div>
                <h1 className="font-bold text-lg tracking-wide serif-font leading-none text-emerald-50">Hasselblad</h1>
                <span className="text-[10px] text-emerald-300 uppercase tracking-widest font-medium group-hover:text-emerald-200">Bildstudio</span>
              </div>
            </div>

          {step === AppStep.PROCESS ? (
            <div className="flex-1 flex items-center justify-end gap-3 ml-4">
              
              {/* Batch Running Indicator */}
              {isBatchRunning && (
                <>
                  <button onClick={() => setStep(AppStep.BATCH)} className="hidden md:flex items-center gap-2 px-3 py-1.5 bg-emerald-800/80 border border-emerald-700/50 rounded-full text-[10px] font-bold uppercase tracking-widest text-emerald-100 animate-pulse hover:bg-emerald-800 mr-2">
                      <Loader2 size={12} className="animate-spin text-amber-400" />
                      Batch körs i bakgrunden...
                  </button>
                  <button onClick={() => setStep(AppStep.BATCH)} className="md:hidden flex items-center justify-center w-8 h-8 bg-emerald-800 rounded-full animate-pulse mr-2 border border-emerald-700/50">
                      <Loader2 size={14} className="animate-spin text-amber-400" />
                  </button>
                  <button onClick={() => setIsBatchPaused(prev => !prev)} className="px-3 py-1.5 bg-white/10 hover:bg-white/20 text-xs font-bold uppercase tracking-widest rounded-lg border border-white/10 text-emerald-50">
                    {isBatchPaused ? 'Återuppta' : 'Pausa'}
                  </button>
                </>
              )}

              <button onClick={moveToPrevious} className="p-2 text-emerald-300 hover:text-white transition-colors" title="Föregående">
                <Undo2 size={20} />
              </button>
              
              <div className="flex-1 max-w-xl mr-auto ml-3 hidden md:block">
                  <div className="flex justify-between text-xs font-medium text-emerald-200 mb-1.5">
                    <span>{reviewFilter === 'incomplete' ? `Att göra: ${incompleteCount} kvar` : reviewFilter === 'completed' ? `Granskar klara: ${completedCount} st` : `Produkt ${currentIndex + 1} av ${products.length}`}</span>
                  </div>
                  <div className="h-1.5 bg-emerald-950/50 rounded-full overflow-hidden border border-white/5">
                    <div className={`h-full rounded-full transition-all duration-500 ease-out ${reviewFilter === 'incomplete' ? 'bg-amber-500' : 'bg-emerald-400'}`} style={{ width: `${progress}%` }} />
                  </div>
              </div>
              
              <button onClick={() => { if(reviewFilter === 'all') setReviewFilter('incomplete'); else if(reviewFilter === 'incomplete') setReviewFilter('completed'); else setReviewFilter('all'); }}
                  className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${reviewFilter === 'incomplete' ? 'bg-amber-500/20 border-amber-500/50 text-amber-300' : reviewFilter === 'completed' ? 'bg-emerald-600 border-emerald-500 text-white' : 'bg-emerald-800 border-emerald-700 text-emerald-100'}`}
              >
                  {reviewFilter === 'incomplete' ? <Filter size={14} /> : reviewFilter === 'completed' ? <CheckCircle2 size={14} /> : <List size={14} />}
                  <span className="hidden lg:inline">{reviewFilter === 'incomplete' ? 'Visa: Att göra' : reviewFilter === 'completed' ? 'Visa: Klara' : 'Visa: Alla'}</span>
              </button>

              <div className="h-6 w-px bg-emerald-800 mx-1"></div>
              
              <button onClick={() => setIsSidebarOpen(!isSidebarOpen)} className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${isSidebarOpen ? 'bg-white text-emerald-900 shadow-md' : 'text-emerald-200 hover:bg-emerald-800'}`}>
                 <List size={18} /> <span className="hidden lg:inline">Lista</span>
              </button>

              {/* CLEAN NAVIGATION: Removed settings from process view to avoid clutter */}
              <button 
                onClick={() => setStep(AppStep.DASHBOARD)} 
                className="ml-2 bg-emerald-900 hover:bg-emerald-800 text-white px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-2 border border-emerald-700 shadow-sm transition-all"
                title="Tillbaka till översikten"
              >
                 <ChevronLeft size={14} /> Dashboard
              </button>
            </div>
          ) : (
              <div className="flex items-center gap-3">
                <SyncIndicator syncing={isSyncing} lastSync={lastSyncTime} error={syncError} />
                {isBatchRunning && step !== AppStep.BATCH && (
                  <button onClick={() => setIsBatchPaused(prev => !prev)} className="flex items-center gap-2 text-emerald-200 hover:text-white hover:bg-white/10 px-3 py-1.5 rounded-lg transition-colors text-sm font-medium border border-emerald-800/60">
                    {isBatchPaused ? 'Återuppta batch' : 'Pausa batch'}
                  </button>
                )}
                {(user && !user.isAnonymous) && (
                     <button onClick={handleUploadCloud} className="hidden md:flex items-center gap-2 text-emerald-400/50 hover:text-emerald-200 hover:bg-white/5 px-2 py-1.5 rounded transition-colors text-xs" title="Force Cloud Sync">
                      <UploadCloud size={12} />
                    </button>
                )}
                <button onClick={() => setStep(AppStep.CONFIGURE)} className="flex items-center gap-2 text-emerald-200 hover:text-white hover:bg-white/10 px-3 py-1.5 rounded-lg transition-colors text-sm font-medium">
                    <Settings size={16} /> Inställningar
                </button>
                <UserBadge onLogout={handleLogout}/>
              </div>
          )}
        </header>

        <main className="flex-1 p-4 md:p-8 overflow-hidden flex flex-col relative">
          <div className={`flex-1 w-full h-full transition-all duration-300 ease-in-out ${step === AppStep.PROCESS && isSidebarOpen ? 'lg:mr-80' : ''}`}>
            
            {step === AppStep.DASHBOARD && (
                <DashboardView 
                  products={products}
                  completedCount={completedCount}
                  incompleteCount={incompleteCount}
                  nextPendingProduct={nextPendingProduct}
                  onStepChange={setStep}
                  onStartManual={startManualMode}
                  onStartBatch={startBatchMode}
                  onFilterChange={navigateToFilter}
                  onResetDefault={resetToDefault}
                  onClearAll={resetApp}
                />
            )}

            {step === AppStep.UPLOAD && <CSVEditor onConfirm={handleCSVImport} isMergeMode={products.length > 0} />}
            
            {step === AppStep.EDIT_GRID && (
                <CSVEditor initialProducts={products} onConfirm={(updated) => handleEditListSave(updated)} onSelectProduct={handleEditListSelect} />
            )}

            {/* Configure now leads back to Dashboard via onConfigured/onSkip */}
            {step === AppStep.CONFIGURE && <CloudinaryConfig onConfigured={() => setStep(AppStep.DASHBOARD)} onSkip={() => setStep(AppStep.DASHBOARD)} />}
            
            {(step === AppStep.BATCH || isBatchRunning) && (
                <div className={step === AppStep.BATCH ? 'block' : 'hidden'}>
                    <BatchModeView 
                        products={products} 
                        onComplete={handleBatchComplete} 
                        onCancel={() => setStep(AppStep.DASHBOARD)} 
                        onStatusChange={(running) => { setIsBatchRunning(running); if(!running) setIsBatchPaused(false); }}
                        onProductProcessed={handleRealtimeProductUpdate}
                        onReview={handleReviewDuringBatch}
                        isPaused={isBatchPaused}
                        onTogglePause={() => setIsBatchPaused(prev => !prev)}
                        onSelectProduct={handleBatchProductSelect}
                    />
                </div>
            )}

            {step === AppStep.PROCESS && currentProduct && (
              <div className="h-full flex flex-col">
                  <ImageWorkflow key={currentProduct.id} product={currentProduct} onComplete={handleProductComplete} onSkip={handleProductSkip} onPrevious={moveToPrevious} />
              </div>
            )}
            {step === AppStep.EXPORT && <ExportView products={products} onReset={() => setStep(AppStep.DASHBOARD)} />}
          </div>
          
          {step === AppStep.PROCESS && (
              <ProductSidebar products={products} currentIndex={currentIndex} isOpen={isSidebarOpen} onClose={() => setIsSidebarOpen(false)} onSelect={(idx) => { setCurrentIndex(idx); if(window.innerWidth < 1024) setIsSidebarOpen(false); }} />
          )}
        </main>
        <SupportChat />
        <DebugConsole />
        </div>
      </ErrorBoundary>
    </AuthGate>
  );
};

export default App;
