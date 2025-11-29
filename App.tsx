
import React, { useState, useEffect, useRef } from 'react';
import CSVEditor from './components/CSVEditor';
import ImageWorkflow from './components/ImageWorkflow';
import ExportView from './components/ExportView';
import { CloudinaryConfig } from './components/CloudinaryConfig';
import { BatchModeView } from './components/BatchModeView';
import { DebugConsole } from './components/DebugConsole';
import { ErrorBoundary } from './components/ErrorBoundary';
import { ProductSidebar } from './components/ProductSidebar';
import { Tooltip } from './components/Tooltip';
import { Product, ProcessedProduct, AppStep } from './types';
import { searchProductImages, setSearchConfig } from './geminiService';
import { setCloudinaryConfig } from './cloudinaryService';
import { saveState, loadState, hasSavedState, clearState } from './storageService';
import { DEFAULT_CSV_CONTENT } from './constants/defaultData';
import { parseCSVString } from './utils/csvParser';
import { Layers, Undo2, Rocket, Hand, Filter, CheckCircle2, Zap, Save, Trash2, UploadCloud, PlayCircle, Download, ImageOff, Image as ImageIcon, Database, ShoppingBag, Settings, List, ChevronLeft, Loader2, ChevronDown, ChevronUp, RefreshCw, FileText, Edit3 } from 'lucide-react';
import { logger } from './logger';

const App: React.FC = () => {
  const [step, setStep] = useState<AppStep>(AppStep.UPLOAD);
  const [products, setProducts] = useState<ProcessedProduct[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [reviewFilter, setReviewFilter] = useState<'all' | 'incomplete'>('all');
  const [filterOriginalImages, setFilterOriginalImages] = useState<boolean>(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isBatchRunning, setIsBatchRunning] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false); // For hiding reset buttons
  const prefetchingRef = useRef<Set<string>>(new Set());
  
  // FIX: Keep a ref to products to access inside effects without adding it to dependencies
  const productsRef = useRef(products);
  useEffect(() => { productsRef.current = products; }, [products]);

  // --- INITIAL LOAD ---
  useEffect(() => {
    // 1. Config Migration: Check for the known broken key in LocalStorage and replace it
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

    logger.info(`Initializing Search Config. Key starts with: ${apiKeyToUse.substring(0, 5)}...`);
    setSearchConfig(apiKeyToUse, cxToUse);

    const savedCloud = localStorage.getItem('cloudinary_cloud_name') || 'da7wmiyra';
    const savedPreset = localStorage.getItem('cloudinary_upload_preset') || 'woocom_upload';
    setCloudinaryConfig(savedCloud, savedPreset);

    if (hasSavedState()) {
          const savedProducts = loadState();
          if (savedProducts && savedProducts.length > 0) {
              setProducts(savedProducts);
              setStep(AppStep.DASHBOARD);
          }
      } else {
          loadDefaultDataset();
      }
      
      return () => {
          prefetchingRef.current.clear();
      };
  }, []);

  const loadDefaultDataset = () => {
      try {
          const parsed = parseCSVString(DEFAULT_CSV_CONTENT);
          const initialized: ProcessedProduct[] = parsed.map(p => ({
              ...p,
              status: 'pending' as const
          }));
          setProducts(initialized);
          setStep(AppStep.DASHBOARD);
          saveState(initialized);
      } catch (e) {
          console.error("Failed to load default dataset", e);
      }
  };

  // --- AUTO SAVE ---
  useEffect(() => {
      if (products.length > 0) {
          const timeoutId = setTimeout(() => {
              saveState(products);
          }, 1000);
          return () => clearTimeout(timeoutId);
      }
  }, [products]);

  // --- PREFETCHING (Fixed Loop) ---
  useEffect(() => {
    if (step !== AppStep.PROCESS) return;
    const PREFETCH_WINDOW = 10;
    
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
                    if (p.id === product.id) {
                        return { ...p, prefetchedResults: results };
                    }
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
    
    return () => {
        prefetchingRef.current.clear();
    };
  }, [currentIndex, step, filterOriginalImages]);

  // --- HANDLERS ---
  const handleCSVImport = (newProducts: Product[], mergeMode: boolean) => {
    if (mergeMode) {
        const updatedList = [...products];
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
                };
                updatedCount++;
            } else {
                updatedList.push({ ...newP, status: 'pending' });
                addedCount++;
            }
        });
        alert(`Uppdatering klar!\n${updatedCount} uppdaterade.\n${addedCount} nya.`);
        setProducts(updatedList);
        setStep(AppStep.DASHBOARD);
    } else {
        const initialized = newProducts.map(p => ({ ...p, status: 'pending' as const }));
        setProducts(initialized);
        setStep(AppStep.CONFIGURE);
    }
  };

  const handleEditListSave = (updatedProducts: Product[]) => {
      // Cast back to ProcessedProduct ensuring status exists, default to pending if missing
      const processed = updatedProducts.map(p => {
          const existing = products.find(ep => ep.id === p.id);
          return {
              ...p,
              status: existing ? existing.status : 'pending',
              // Preserve other processed fields if they exist
              finalImageUrl: existing?.finalImageUrl,
              imageSource: existing?.imageSource,
              cloudinaryUrl: existing?.cloudinaryUrl
          } as ProcessedProduct;
      });
      setProducts(processed);
      saveState(processed);
      setStep(AppStep.DASHBOARD);
  };

  const handleConfigDone = () => setStep(AppStep.MODE_SELECT);
  const startBatchMode = () => setStep(AppStep.BATCH);
  const startManualMode = () => {
      setReviewFilter('all');
      setFilterOriginalImages(false);
      setStep(AppStep.PROCESS);
      const firstPending = products.findIndex(p => p.status !== 'completed');
      setCurrentIndex(firstPending !== -1 ? firstPending : 0);
  };

  const handleRealtimeProductUpdate = (updatedProduct: ProcessedProduct) => {
      setProducts(prev => prev.map(p => p.id === updatedProduct.id ? updatedProduct : p));
  };

  const handleReviewDuringBatch = () => {
      setReviewFilter('incomplete'); // Usually you want to see what's left or just jump in
      setStep(AppStep.PROCESS);
      // Try to jump to a pending product, or just 0
      const firstPending = products.findIndex(p => p.status !== 'completed');
      setCurrentIndex(firstPending !== -1 ? firstPending : 0);
  };

  const handleBatchComplete = (results: ProcessedProduct[]) => {
      setIsBatchRunning(false);
      setProducts(results);
      saveState(results);
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

  const handleProductComplete = (imageUrl: string) => {
    const updated = [...products];
    updated[currentIndex].finalImageUrl = imageUrl;
    updated[currentIndex].status = 'completed';
    if (imageUrl.includes('cloudinary.com')) updated[currentIndex].cloudinaryUrl = imageUrl;
    setProducts(updated);
    moveToNext(updated);
  };

  const handleProductSkip = () => {
    const updated = [...products];
    updated[currentIndex].status = 'skipped';
    setProducts(updated);
    moveToNext(updated);
  };

  const findNextIndex = (currentList: ProcessedProduct[], startIndex: number, direction: 1 | -1): number => {
      let next = startIndex + direction;
      while (next >= 0 && next < currentList.length) {
          const p = currentList[next];
          let valid = true;
          if (reviewFilter === 'incomplete' && p.status === 'completed') valid = false;
          if (valid && filterOriginalImages && p.initialImages && p.initialImages.length > 0) valid = false;
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
           if (!anyLeft) setStep(AppStep.EXPORT);
       }
    }
  };

  const moveToPrevious = () => {
    const prevIndex = findNextIndex(products, currentIndex, -1);
    if (prevIndex !== -1) setCurrentIndex(prevIndex);
  };

  const jumpToProduct = (index: number) => {
      if (index >= 0 && index < products.length) {
          setCurrentIndex(index);
          // Auto-close sidebar on mobile only
          if (window.innerWidth < 1024) setIsSidebarOpen(false);
      }
  };

  const toggleReviewFilter = () => {
      const newFilter = reviewFilter === 'all' ? 'incomplete' : 'all';
      setReviewFilter(newFilter);
      if (newFilter === 'incomplete' && products[currentIndex].status === 'completed') moveToNext(products);
  };

  const resetToDefault = () => {
      if(confirm("Vill du återställa appen till det ursprungliga Grundsortimentet? Allt ditt arbete kommer raderas.")) {
          clearState();
          loadDefaultDataset();
          setShowAdvanced(false);
      }
  }

  const resetApp = () => {
    if(confirm("Är du säker? Detta raderar all data.")) {
        clearState();
        setProducts([]);
        setCurrentIndex(0);
        setStep(AppStep.UPLOAD);
        prefetchingRef.current.clear();
        setShowAdvanced(false);
    }
  };

  const progress = products.length > 0 ? ((currentIndex + 1) / products.length) * 100 : 0;
  const currentProduct = products[currentIndex];
  const incompleteCount = products.filter(p => p.status !== 'completed').length;
  const completedCount = products.filter(p => p.status === 'completed').length;
  const missingImageCount = products.filter(p => !p.initialImages || p.initialImages.length === 0).length;

  return (
    <ErrorBoundary>
      <div className="min-h-screen flex flex-col font-sans text-stone-900 pb-20 bg-stone-50 selection:bg-emerald-200 selection:text-emerald-900">
        
        {/* HEADER */}
        <header className="bg-emerald-900 text-white h-16 flex items-center justify-between px-4 md:px-6 sticky top-0 z-30 shadow-md">
          <div className="flex items-center gap-3 cursor-pointer" onClick={() => setStep(AppStep.DASHBOARD)}>
            <div className="bg-white/10 p-1.5 rounded-lg border border-white/10">
              <ShoppingBag size={20} className="text-amber-400" />
            </div>
            <div>
              <h1 className="font-bold text-lg tracking-wide serif-font leading-none">Hasselblads</h1>
              <span className="text-[10px] text-emerald-200 uppercase tracking-widest font-medium">Bildstudio</span>
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
                  {/* Mobile Indicator */}
                  <button onClick={() => setStep(AppStep.BATCH)} className="md:hidden flex items-center justify-center w-8 h-8 bg-emerald-800 rounded-full animate-pulse mr-2 border border-emerald-700/50">
                      <Loader2 size={14} className="animate-spin text-amber-400" />
                  </button>
                </>
              )}

              <button onClick={moveToPrevious} className="p-2 text-emerald-300 hover:text-white transition-colors" title="Föregående (Ctrl+Pil Vänster)">
                <Undo2 size={20} />
              </button>
              <div className="flex-1 max-w-xl mr-auto ml-3 hidden md:block">
                  <div className="flex justify-between text-xs font-medium text-emerald-200 mb-1.5">
                    <span>
                        {reviewFilter === 'incomplete' 
                          ? `Att göra: ${incompleteCount} kvar`
                          : `Produkt ${currentIndex + 1} av ${products.length}`
                        }
                    </span>
                    {reviewFilter === 'all' && (
                        <span className="flex items-center gap-1 text-emerald-400"><Zap size={10} className="fill-current" /> Auto-buffer</span>
                    )}
                  </div>
                  <div className="h-1.5 bg-emerald-950/50 rounded-full overflow-hidden border border-white/5">
                    <div 
                      className={`h-full rounded-full transition-all duration-500 ease-out ${reviewFilter === 'incomplete' ? 'bg-amber-500' : 'bg-emerald-400'}`}
                      style={{ width: `${progress}%` }}
                    />
                  </div>
              </div>
              
              <button
                  onClick={toggleReviewFilter}
                  className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                      reviewFilter === 'incomplete' 
                      ? 'bg-amber-500/20 border-amber-500/50 text-amber-300 hover:bg-amber-500/30' 
                      : 'bg-emerald-800 border-emerald-700 text-emerald-100 hover:bg-emerald-700'
                  }`}
                  title="Visa endast produkter som ej är klara"
              >
                  {reviewFilter === 'incomplete' ? <Filter size={14} /> : <CheckCircle2 size={14} />}
                  <span className="hidden lg:inline">
                      {reviewFilter === 'incomplete' ? 'Visa: Att göra' : 'Visa: Alla'}
                  </span>
              </button>

              <div className="h-6 w-px bg-emerald-800 mx-1"></div>

              <button 
                onClick={() => setIsSidebarOpen(!isSidebarOpen)} 
                className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${isSidebarOpen ? 'bg-white text-emerald-900 shadow-md' : 'text-emerald-200 hover:bg-emerald-800'}`}
              >
                 <List size={18} />
                 <span className="hidden lg:inline">Lista</span>
              </button>

              <button onClick={() => setStep(AppStep.DASHBOARD)} className="ml-2 text-emerald-300 hover:text-white font-medium text-xs border-l border-emerald-800 pl-4">
                  Avsluta
              </button>
            </div>
          ) : (
              <button 
                  onClick={() => setStep(AppStep.CONFIGURE)}
                  className="flex items-center gap-2 text-emerald-200 hover:text-white hover:bg-white/10 px-3 py-1.5 rounded-lg transition-colors text-sm font-medium"
              >
                  <Settings size={16} /> Inställningar
              </button>
          )}
        </header>

        <main className="flex-1 p-4 md:p-8 overflow-hidden flex flex-col relative">
          <div className={`flex-1 w-full h-full transition-all duration-300 ease-in-out ${step === AppStep.PROCESS && isSidebarOpen ? 'lg:mr-80' : ''}`}>
            {/* DASHBOARD & OTHER VIEWS */}
            {step === AppStep.DASHBOARD && (
                <div className="max-w-4xl mx-auto mt-6">
                    
                    {/* HERO STATUS CARD */}
                    <div className="bg-white rounded-3xl shadow-xl shadow-stone-200/50 border border-white overflow-hidden mb-10 relative">
                        <div className="absolute top-0 left-0 w-full h-2 bg-gradient-to-r from-emerald-600 via-emerald-400 to-amber-400"></div>
                        <div className="p-6 md:p-12 text-center">
                            <h1 className="text-2xl md:text-4xl font-bold text-stone-800 mb-4 serif-font">
                                Hej! Här är status för din bildstudio.
                            </h1>
                            <p className="text-stone-500 text-sm md:text-lg mb-8 max-w-2xl mx-auto">
                                {products.length === 0 
                                    ? "Ladda upp en CSV-lista för att komma igång."
                                    : incompleteCount > 0 
                                        ? `Du har ${incompleteCount} produkter som behöver bilder. Starta motorn så fixar vi det.`
                                        : "Bra jobbat! Alla produkter är klara."}
                            </p>

                            <div className="flex justify-center gap-6 md:gap-12 mb-10">
                                <div className="text-center">
                                    <div className="text-2xl md:text-4xl font-bold text-stone-800 mb-1 font-serif">{products.length}</div>
                                    <div className="text-[10px] font-bold text-stone-400 uppercase tracking-widest flex items-center gap-1 justify-center">
                                        Totalt <Tooltip text="Antal rader i din importerade fil." />
                                    </div>
                                </div>
                                <div className="text-center">
                                    <div className="text-2xl md:text-4xl font-bold text-emerald-600 mb-1 font-serif">{completedCount}</div>
                                    <div className="text-[10px] font-bold text-emerald-600/70 uppercase tracking-widest flex items-center gap-1 justify-center">
                                        Klara <Tooltip text="Produkter som har fått en bild tilldelad." />
                                    </div>
                                </div>
                                <div className="text-center">
                                    <div className="text-2xl md:text-4xl font-bold text-amber-500 mb-1 font-serif">{incompleteCount}</div>
                                    <div className="text-[10px] font-bold text-amber-500/70 uppercase tracking-widest flex items-center gap-1 justify-center">
                                        Att göra <Tooltip text="Produkter som saknar bild eller behöver granskas." />
                                    </div>
                                </div>
                            </div>

                            {/* PRIMARY ACTION BUTTON */}
                            {products.length === 0 ? (
                                <button 
                                    onClick={() => setStep(AppStep.UPLOAD)}
                                    className="bg-emerald-900 hover:bg-emerald-800 text-white text-lg md:text-xl font-bold py-4 px-6 md:py-6 md:px-12 rounded-2xl shadow-xl shadow-emerald-900/20 hover:scale-105 transition-all duration-300 flex items-center gap-3 mx-auto"
                                >
                                    <UploadCloud size={24} className="md:w-7 md:h-7" /> Ladda upp produktlista
                                </button>
                            ) : incompleteCount > 0 ? (
                                <button 
                                    onClick={startBatchMode} 
                                    className="bg-emerald-900 hover:bg-emerald-800 text-white text-lg md:text-xl font-bold py-4 px-6 md:py-6 md:px-12 rounded-2xl shadow-xl shadow-emerald-900/20 hover:scale-105 transition-all duration-300 flex items-center gap-3 mx-auto group"
                                >
                                    <div className="bg-emerald-800 p-2 rounded-full group-hover:bg-emerald-700 transition-colors">
                                        <PlayCircle size={28} className="text-amber-400 fill-amber-400 md:w-8 md:h-8" />
                                    </div>
                                    <div className="text-left">
                                        <div className="leading-none mb-1">Starta Bildmotor</div>
                                        <div className="text-[10px] md:text-xs text-emerald-300 font-medium uppercase tracking-wider">Automatiskt läge</div>
                                    </div>
                                </button>
                            ) : (
                                <button 
                                    onClick={() => setStep(AppStep.EXPORT)} 
                                    className="bg-blue-600 hover:bg-blue-500 text-white text-lg md:text-xl font-bold py-4 px-6 md:py-6 md:px-12 rounded-2xl shadow-xl shadow-blue-600/20 hover:scale-105 transition-all duration-300 flex items-center gap-3 mx-auto"
                                >
                                    <Download size={24} className="md:w-7 md:h-7" /> Ladda ner CSV-fil
                                </button>
                            )}
                        </div>
                    </div>

                    {/* SECONDARY ACTIONS */}
                    {products.length > 0 && (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6 mb-12">
                             <button 
                                onClick={() => setStep(AppStep.UPLOAD)} 
                                className="bg-white p-6 rounded-2xl border border-stone-200 hover:border-emerald-500 shadow-sm hover:shadow-md transition-all flex items-center gap-4 text-left group"
                             >
                                <div className="bg-stone-50 p-3 rounded-full text-stone-400 group-hover:text-emerald-600 group-hover:bg-emerald-50 transition-colors">
                                    <UploadCloud size={24} />
                                </div>
                                <div>
                                    <div className="font-bold text-stone-800 group-hover:text-emerald-900">Uppdatera Sortiment</div>
                                    <div className="text-xs text-stone-400">Importera nya rader från Excel/CSV</div>
                                </div>
                             </button>

                             <button 
                                onClick={() => setStep(AppStep.EDIT_GRID)} 
                                className="bg-white p-6 rounded-2xl border border-stone-200 hover:border-amber-500 shadow-sm hover:shadow-md transition-all flex items-center gap-4 text-left group"
                             >
                                <div className="bg-stone-50 p-3 rounded-full text-stone-400 group-hover:text-amber-600 group-hover:bg-amber-50 transition-colors">
                                    <Edit3 size={24} />
                                </div>
                                <div>
                                    <div className="font-bold text-stone-800 group-hover:text-amber-900">Redigera lista</div>
                                    <div className="text-xs text-stone-400">Granska och ändra data manuellt</div>
                                </div>
                             </button>

                             <button 
                                onClick={() => setStep(AppStep.EXPORT)} 
                                className="bg-white p-6 rounded-2xl border border-stone-200 hover:border-blue-500 shadow-sm hover:shadow-md transition-all flex items-center gap-4 text-left group"
                             >
                                <div className="bg-stone-50 p-3 rounded-full text-stone-400 group-hover:text-blue-600 group-hover:bg-blue-50 transition-colors">
                                    <Download size={24} />
                                </div>
                                <div>
                                    <div className="font-bold text-stone-800 group-hover:text-blue-900">Exportera Filer</div>
                                    <div className="text-xs text-stone-400">Ladda ner färdigt material</div>
                                </div>
                             </button>
                        </div>
                    )}

                    {/* ADVANCED / DANGEROUS ZONE */}
                    <div className="mt-12 text-center">
                        <button 
                            onClick={() => setShowAdvanced(!showAdvanced)}
                            className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-stone-400 hover:text-stone-600 transition-colors mb-4"
                        >
                            {showAdvanced ? <ChevronUp size={14} /> : <ChevronDown size={14} />} 
                            Databas & Verktyg
                        </button>
                        
                        {showAdvanced && (
                            <div className="bg-stone-100/50 rounded-2xl p-6 border border-stone-200 animate-in fade-in slide-in-from-top-4">
                                <p className="text-xs text-stone-500 mb-4 max-w-md mx-auto">
                                    Varning: Dessa åtgärder påverkar din databas. Använd endast om du vill börja om från början.
                                </p>
                                <div className="flex flex-col sm:flex-row justify-center gap-4">
                                    <button onClick={resetToDefault} className="px-4 py-2 bg-white border border-stone-300 rounded-lg text-xs font-bold text-stone-600 hover:bg-stone-50 hover:text-stone-900 transition-colors flex items-center justify-center gap-2">
                                        <Database size={14} /> Återställ Demodata
                                    </button>
                                    <button onClick={resetApp} className="px-4 py-2 bg-white border border-red-200 rounded-lg text-xs font-bold text-red-500 hover:bg-red-50 hover:text-red-700 transition-colors flex items-center justify-center gap-2">
                                        <Trash2 size={14} /> Rensa Allt (Börja om)
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>

                </div>
            )}

            {step === AppStep.UPLOAD && <CSVEditor onConfirm={handleCSVImport} isMergeMode={products.length > 0} />}
            
            {step === AppStep.EDIT_GRID && (
                <CSVEditor 
                    initialProducts={products} 
                    onConfirm={(updated) => handleEditListSave(updated)} 
                />
            )}

            {step === AppStep.CONFIGURE && <CloudinaryConfig onConfigured={handleConfigDone} onSkip={handleConfigDone} />}
            {step === AppStep.MODE_SELECT && (
              <div className="max-w-3xl mx-auto mt-12 p-6 md:p-8 bg-white rounded-2xl shadow-sm border border-stone-200 text-center">
                  <h2 className="text-2xl md:text-3xl font-bold mb-8 text-emerald-950 serif-font">Hur vill du bearbeta {incompleteCount} produkter?</h2>
                  <div className="grid md:grid-cols-2 gap-6">
                      <button onClick={startBatchMode} className="bg-stone-50 hover:bg-emerald-50 border-2 border-stone-200 hover:border-emerald-500 rounded-xl p-6 md:p-8 text-left transition-all group">
                          <div className="w-14 h-14 bg-white border border-stone-200 text-emerald-600 rounded-full flex items-center justify-center mb-6 group-hover:scale-110 transition-transform shadow-sm">
                              <Rocket size={28} />
                          </div>
                          <h3 className="text-xl font-bold text-emerald-900 mb-2 serif-font">🚀 Batch-läge (Auto)</h3>
                          <p className="text-stone-500 text-sm leading-relaxed">Appen söker och sparar bilder automatiskt i bakgrunden.</p>
                      </button>
                      <button onClick={startManualMode} className="bg-stone-50 hover:bg-amber-50 border-2 border-stone-200 hover:border-amber-500 rounded-xl p-6 md:p-8 text-left transition-all group">
                          <div className="w-14 h-14 bg-white border border-stone-200 text-amber-600 rounded-full flex items-center justify-center mb-6 group-hover:scale-110 transition-transform shadow-sm">
                              <Hand size={28} />
                          </div>
                          <h3 className="text-xl font-bold text-emerald-900 mb-2 serif-font">⚡ Manuellt läge</h3>
                          <p className="text-stone-500 text-sm leading-relaxed">Du väljer bästa bilden. Appen för-laddar nästa bild blixtsnabbt.</p>
                      </button>
                  </div>
                  <div className="mt-8">
                      <button onClick={() => setStep(AppStep.DASHBOARD)} className="text-stone-400 hover:text-emerald-800 text-sm font-medium border-b border-transparent hover:border-emerald-800 transition-all">Tillbaka till Dashboard</button>
                  </div>
              </div>
            )}
            
            {/* BATCH MODE VIEW - Kept mounted if running */}
            {(step === AppStep.BATCH || isBatchRunning) && (
                <div className={step === AppStep.BATCH ? 'block' : 'hidden'}>
                    <BatchModeView 
                        products={products} 
                        onComplete={handleBatchComplete} 
                        onCancel={() => setStep(AppStep.DASHBOARD)} 
                        onStatusChange={setIsBatchRunning}
                        onProductProcessed={handleRealtimeProductUpdate}
                        onReview={handleReviewDuringBatch}
                    />
                </div>
            )}

            {step === AppStep.PROCESS && currentProduct && (
              <div className="h-full flex flex-col">
                  <ImageWorkflow 
                    key={currentProduct.id} 
                    product={currentProduct} 
                    onComplete={handleProductComplete} 
                    onSkip={handleProductSkip}
                    onPrevious={moveToPrevious}
                  />
              </div>
            )}
            {step === AppStep.EXPORT && <ExportView products={products} onReset={() => setStep(AppStep.DASHBOARD)} />}
          </div>
          
          {/* SIDEBAR */}
          {step === AppStep.PROCESS && (
              <ProductSidebar 
                products={products}
                currentIndex={currentIndex}
                isOpen={isSidebarOpen}
                onClose={() => setIsSidebarOpen(false)}
                onSelect={jumpToProduct}
              />
          )}

        </main>
        <DebugConsole />
      </div>
    </ErrorBoundary>
  );
};

export default App;