import React, { useState, useEffect, useRef } from 'react';
import CSVEditor from './components/CSVEditor';
import ImageWorkflow from './components/ImageWorkflow';
import ExportView from './components/ExportView';
import { CloudinaryConfig } from './components/CloudinaryConfig';
import { BatchModeView } from './components/BatchModeView';
import { DebugConsole } from './components/DebugConsole';
import { ErrorBoundary } from './components/ErrorBoundary';
import { Product, ProcessedProduct, AppStep } from './types';
import { searchProductImages } from './geminiService';
import { saveState, loadState, hasSavedState, clearState, getMeta } from './storageService';
import { DEFAULT_CSV_CONTENT } from './constants/defaultData';
import { parseCSVString } from './utils/csvParser';
import { Layers, Undo2, Rocket, Hand, Filter, CheckCircle2, Zap, Save, Trash2, UploadCloud, PlayCircle, Download, ImageOff, Image as ImageIcon, Database, ShoppingBag, Settings } from 'lucide-react';

const App: React.FC = () => {
  const [step, setStep] = useState<AppStep>(AppStep.UPLOAD);
  const [products, setProducts] = useState<ProcessedProduct[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [reviewFilter, setReviewFilter] = useState<'all' | 'incomplete'>('all');
  const [filterOriginalImages, setFilterOriginalImages] = useState<boolean>(false);
  const prefetchingRef = useRef<Set<string>>(new Set());

  // --- INITIAL LOAD ---
  useEffect(() => {
      if (hasSavedState()) {
          const savedProducts = loadState();
          if (savedProducts && savedProducts.length > 0) {
              setProducts(savedProducts);
              setStep(AppStep.DASHBOARD);
          }
      } else {
          loadDefaultDataset();
      }
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

  // --- PREFETCHING ---
  useEffect(() => {
    if (step !== AppStep.PROCESS) return;
    const PREFETCH_WINDOW = 10;
    const runPrefetch = async () => {
        const indicesToFetch: number[] = [];
        let count = 0;
        let lookAhead = 1;
        while (count < PREFETCH_WINDOW && (currentIndex + lookAhead) < products.length) {
            const idx = currentIndex + lookAhead;
            const p = products[idx];
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
        indicesToFetch.forEach(idx => prefetchingRef.current.add(products[idx].id));

        for (const idx of indicesToFetch) {
            const product = products[idx];
            try {
                if (!prefetchingRef.current.has(product.id)) continue;
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
  }, [currentIndex, step, products, filterOriginalImages]);

  // --- HANDLERS (Same logic, updated styling below) ---
  const handleCSVImport = (newProducts: Product[], mergeMode: boolean) => {
    if (mergeMode) {
        const updatedList = [...products];
        let addedCount = 0;
        let updatedCount = 0;
        newProducts.forEach(newP => {
            const newId = newP['Artikelnummer'] || newP.product_name;
            const existingIndex = updatedList.findIndex(p => (p['Artikelnummer'] || p.product_name) === newId);
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

  const handleConfigDone = () => setStep(AppStep.MODE_SELECT);
  const startBatchMode = () => setStep(AppStep.BATCH);
  const startManualMode = () => {
      setReviewFilter('all');
      setFilterOriginalImages(false);
      setStep(AppStep.PROCESS);
      const firstPending = products.findIndex(p => p.status !== 'completed');
      setCurrentIndex(firstPending !== -1 ? firstPending : 0);
  };

  const handleBatchComplete = (results: ProcessedProduct[]) => {
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

  const handleUndo = () => {
    const prevIndex = findNextIndex(products, currentIndex, -1);
    if (prevIndex !== -1) setCurrentIndex(prevIndex);
    else if (confirm("Vill du gå tillbaka till dashboard?")) setStep(AppStep.DASHBOARD);
  };

  const toggleReviewFilter = () => {
      const newFilter = reviewFilter === 'all' ? 'incomplete' : 'all';
      setReviewFilter(newFilter);
      if (newFilter === 'incomplete' && products[currentIndex].status === 'completed') moveToNext(products);
  };

  const toggleOriginalImageFilter = () => {
      const newVal = !filterOriginalImages;
      setFilterOriginalImages(newVal);
      if (newVal && products[currentIndex].initialImages && products[currentIndex].initialImages.length > 0) moveToNext(products);
  };

  const resetToDefault = () => {
      if(confirm("Vill du återställa appen till det ursprungliga Grundsortimentet? Allt ditt arbete kommer raderas.")) {
          clearState();
          loadDefaultDataset();
      }
  }

  const resetApp = () => {
    if(confirm("Är du säker? Detta raderar all data.")) {
        clearState();
        setProducts([]);
        setCurrentIndex(0);
        setStep(AppStep.UPLOAD);
        prefetchingRef.current.clear();
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
              <button onClick={handleUndo} className="p-2 text-emerald-300 hover:text-white transition-colors" title="Föregående">
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

        <main className="flex-1 p-4 md:p-8 overflow-hidden flex flex-col">
          <div className="flex-1 max-w-7xl mx-auto w-full h-full">
            
            {/* --- DASHBOARD VIEW --- */}
            {step === AppStep.DASHBOARD && (
                <div className="max-w-5xl mx-auto mt-6">
                    <div className="bg-white rounded-2xl shadow-lg border border-stone-200 overflow-hidden mb-8">
                        <div className="p-10 text-center border-b border-emerald-800 bg-emerald-900 relative overflow-hidden">
                            <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/cubes.png')] opacity-10"></div>
                            <div className="relative z-10">
                                <h1 className="text-4xl font-bold text-amber-400 mb-3 serif-font">Sortiment & Bildhantering</h1>
                                <p className="text-emerald-100/90 font-medium">Hantera ditt produktsortiment effektivt.</p>
                            </div>
                        </div>
                        
                        <div className="grid grid-cols-3 divide-x divide-stone-100 border-b border-stone-100">
                            <div className="p-8 text-center group hover:bg-stone-50 transition-colors cursor-default">
                                <div className="text-4xl font-bold text-stone-800 mb-1 serif-font">{products.length}</div>
                                <div className="text-xs font-bold text-stone-400 uppercase tracking-widest">Totalt antal</div>
                            </div>
                            <div className="p-8 text-center group hover:bg-emerald-50/50 transition-colors cursor-default">
                                <div className="text-4xl font-bold text-emerald-700 mb-1 serif-font">{completedCount}</div>
                                <div className="text-xs font-bold text-emerald-700/60 uppercase tracking-widest">Klara & Redo</div>
                            </div>
                            <div className="p-8 text-center group hover:bg-amber-50/50 transition-colors cursor-default">
                                <div className="text-4xl font-bold text-amber-600 mb-1 serif-font">{incompleteCount}</div>
                                <div className="text-xs font-bold text-amber-600/60 uppercase tracking-widest">Att åtgärda</div>
                            </div>
                        </div>
                        
                        <div className="bg-stone-50 p-4 text-center border-b border-stone-100 text-sm text-stone-500">
                            <span className="font-semibold text-stone-700">{missingImageCount}</span> produkter saknade bild från start.
                        </div>

                        <div className="p-8 grid md:grid-cols-2 gap-6 bg-white">
                            <button onClick={startBatchMode} className="flex items-center justify-center gap-4 bg-emerald-900 hover:bg-emerald-800 text-white p-6 rounded-xl shadow-lg hover:shadow-emerald-900/20 transition-all hover:-translate-y-1 group border border-emerald-800">
                                <div className="bg-emerald-800 p-3 rounded-full group-hover:bg-emerald-700 transition-colors">
                                  <PlayCircle size={32} className="text-amber-400" />
                                </div>
                                <div className="text-left">
                                    <div className="font-bold text-xl serif-font">Fortsätt arbeta</div>
                                    <div className="text-emerald-200 text-sm">Starta batch eller granska</div>
                                </div>
                            </button>

                            <button onClick={() => setStep(AppStep.EXPORT)} className="flex items-center justify-center gap-4 bg-white border-2 border-stone-200 hover:border-emerald-500 text-stone-700 p-6 rounded-xl transition-all hover:bg-emerald-50/30 group">
                                <div className="bg-stone-100 p-3 rounded-full group-hover:bg-white group-hover:text-emerald-600 transition-colors">
                                  <Download size={32} />
                                </div>
                                <div className="text-left">
                                    <div className="font-bold text-xl serif-font group-hover:text-emerald-900">Ladda ner CSV</div>
                                    <div className="text-stone-400 text-sm group-hover:text-emerald-700/70">Exportera färdigt material</div>
                                </div>
                            </button>

                            <button onClick={() => setStep(AppStep.UPLOAD)} className="flex items-center justify-center gap-4 bg-white border-2 border-stone-200 hover:border-blue-300 text-stone-700 p-6 rounded-xl transition-all hover:bg-blue-50/30 group">
                                <div className="bg-stone-100 p-3 rounded-full group-hover:bg-white group-hover:text-blue-600 transition-colors">
                                  <UploadCloud size={32} />
                                </div>
                                <div className="text-left">
                                    <div className="font-bold text-xl serif-font group-hover:text-blue-900">Uppdatera lista</div>
                                    <div className="text-stone-400 text-sm group-hover:text-blue-700/70">Ladda upp nya produkter</div>
                                </div>
                            </button>
                            
                            <div className="flex flex-col gap-3">
                                <button onClick={() => setStep(AppStep.CONFIGURE)} className="flex-1 flex items-center justify-center gap-3 bg-stone-50 border border-stone-200 hover:bg-stone-100 text-stone-600 p-3 rounded-xl transition-all text-sm font-medium hover:text-stone-900">
                                    <Settings size={18} /> Inställningar & API
                                </button>
                                <div className="flex gap-3">
                                  <button onClick={resetToDefault} className="flex-1 flex items-center justify-center gap-3 bg-stone-50 border border-stone-200 hover:bg-stone-100 text-stone-600 p-3 rounded-xl transition-all text-sm font-medium hover:text-stone-900">
                                      <Database size={18} /> Återställ Data
                                  </button>
                                  <button onClick={resetApp} className="flex-1 flex items-center justify-center gap-3 bg-white border border-red-100 hover:bg-red-50 text-red-400 p-3 rounded-xl transition-all text-sm font-medium hover:text-red-600 hover:border-red-200">
                                      <Trash2 size={18} /> Rensa
                                  </button>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {step === AppStep.UPLOAD && <CSVEditor onConfirm={handleCSVImport} isMergeMode={products.length > 0} />}
            {step === AppStep.CONFIGURE && <CloudinaryConfig onConfigured={handleConfigDone} onSkip={handleConfigDone} />}
            {step === AppStep.MODE_SELECT && (
              <div className="max-w-3xl mx-auto mt-12 p-8 bg-white rounded-2xl shadow-sm border border-stone-200 text-center">
                  <h2 className="text-3xl font-bold mb-8 text-emerald-950 serif-font">Hur vill du bearbeta {incompleteCount} produkter?</h2>
                  <div className="grid md:grid-cols-2 gap-6">
                      <button onClick={startBatchMode} className="bg-stone-50 hover:bg-emerald-50 border-2 border-stone-200 hover:border-emerald-500 rounded-xl p-8 text-left transition-all group">
                          <div className="w-14 h-14 bg-white border border-stone-200 text-emerald-600 rounded-full flex items-center justify-center mb-6 group-hover:scale-110 transition-transform shadow-sm">
                              <Rocket size={28} />
                          </div>
                          <h3 className="text-xl font-bold text-emerald-900 mb-2 serif-font">🚀 Batch-läge (Auto)</h3>
                          <p className="text-stone-500 text-sm leading-relaxed">Appen söker och sparar bilder automatiskt i bakgrunden.</p>
                      </button>
                      <button onClick={startManualMode} className="bg-stone-50 hover:bg-amber-50 border-2 border-stone-200 hover:border-amber-500 rounded-xl p-8 text-left transition-all group">
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
            {step === AppStep.BATCH && <BatchModeView products={products} onComplete={handleBatchComplete} onCancel={() => setStep(AppStep.DASHBOARD)} />}
            {step === AppStep.PROCESS && currentProduct && (
              <div className="h-full flex flex-col"><ImageWorkflow key={currentProduct.id} product={currentProduct} onComplete={handleProductComplete} onSkip={handleProductSkip} /></div>
            )}
            {step === AppStep.EXPORT && <ExportView products={products} onReset={() => setStep(AppStep.DASHBOARD)} />}
          </div>
        </main>
        <DebugConsole />
      </div>
    </ErrorBoundary>
  );
};

export default App;