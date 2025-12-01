
import React, { useState, useRef, useEffect } from 'react';
import { Play, StopCircle, CheckCircle, AlertTriangle, ArrowRight, Loader2, Image as ImageIcon, SkipForward, Zap, XCircle, Eye, PauseCircle, X } from 'lucide-react';
import { Product, ProcessedProduct } from '../types';
import { runBatchProcess, BatchProgress, BatchResult } from '../batchProcessor';

interface BatchModeViewProps {
  products: Product[];
  onComplete: (results: ProcessedProduct[]) => void;
  onCancel: () => void;
  onStatusChange?: (isRunning: boolean) => void;
  onProductProcessed?: (product: ProcessedProduct) => void;
  onReview?: () => void;
  isPaused?: boolean;
  onTogglePause?: () => void;
  onSelectProduct?: (product: ProcessedProduct) => void;
}

type BatchStatus = 'idle' | 'running' | 'paused' | 'completed' | 'cancelled';
type ListModalType = 'completed' | 'failed' | 'skipped';

export const BatchModeView: React.FC<BatchModeViewProps> = ({
  products,
  onComplete,
  onCancel,
  onStatusChange,
  onProductProcessed,
  onReview,
  isPaused,
  onTogglePause,
  onSelectProduct
}) => {
  const [status, setStatus] = useState<BatchStatus>('idle');
  const [progress, setProgress] = useState<BatchProgress | null>(null);
  const [result, setResult] = useState<BatchResult | null>(null);
  const [startTime, setStartTime] = useState<number | null>(null);
  const [speed, setSpeed] = useState<string>('--');
  const [showListModal, setShowListModal] = useState<ListModalType | null>(null);
  
  const abortControllerRef = useRef<AbortController | null>(null);
  const isPausedRef = useRef(isPaused);

  useEffect(() => {
      isPausedRef.current = isPaused;
      if (status === 'running' && isPaused) setStatus('paused');
      if (status === 'paused' && !isPaused) setStatus('running');
  }, [isPaused, status]);

  useEffect(() => {
      if (onStatusChange) {
          onStatusChange(status === 'running' || status === 'paused');
      }
  }, [status, onStatusChange]);

  useEffect(() => {
      if (status === 'running' && progress && startTime && progress.current > 0) {
          const elapsedSeconds = (Date.now() - startTime) / 1000;
          const itemsPerMinute = (progress.current / elapsedSeconds) * 60;
          setSpeed(itemsPerMinute.toFixed(1));
      }
  }, [progress, status, startTime]);

  const handleStart = async () => {
    setStatus('running');
    setStartTime(Date.now());
    abortControllerRef.current = new AbortController();

    try {
      const batchResult = await runBatchProcess(
        products,
        (prog) => setProgress(prog),
        {
          delayBetweenProducts: 800,
          skipExistingImages: true,
          abortSignal: abortControllerRef.current.signal,
          onProductProcessed: onProductProcessed,
          checkPauseState: () => !!isPausedRef.current
        }
      );

      setResult(batchResult);
      setStatus('completed');
    } catch (error) {
      console.error('Batch process error:', error);
      setStatus('cancelled');
    }
  };

  const handleStop = () => {
    if (abortControllerRef.current) {
        abortControllerRef.current.abort();
    }
    setStatus('cancelled');
  };

  const handleFinish = () => {
    if (result) {
      onComplete(result.products);
    }
  };

  const formatTime = (ms: number): string => {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
    return `${seconds}s`;
  };

  const estimateTimeRemaining = (): string => {
    if (!progress || progress.current === 0) return 'Beräknar...';
    const remainingCount = progress.total - progress.current;
    const msPerItem = startTime ? (Date.now() - startTime) / progress.current : 2000; 
    const remainingMs = remainingCount * msPerItem;
    return formatTime(remainingMs);
  };

  const getFilteredList = (type: ListModalType) => {
      const items = products as ProcessedProduct[];
      switch (type) {
          case 'completed': return items.filter(p => p.status === 'completed' && p.imageSource !== 'csv');
          case 'failed': return items.filter(p => p.status === 'failed');
          case 'skipped': return items.filter(p => p.status === 'skipped' || (p.status === 'completed' && p.imageSource === 'csv'));
          default: return [];
      }
  };

  const getModalTitle = (type: ListModalType) => {
      switch (type) {
          case 'completed': return 'Hittade / Genererade Bilder';
          case 'failed': return 'Misslyckade Produkter';
          case 'skipped': return 'Hoppade över (Befintlig bild)';
          default: return '';
      }
  };

  // --- RESULT VIEW (When done) ---
  if (status === 'completed' && result) {
      return (
        <div className="max-w-4xl mx-auto mt-10 bg-white rounded-3xl shadow-2xl border border-stone-200 overflow-hidden animate-in fade-in zoom-in-95 duration-500">
            <div className="bg-emerald-950 p-12 text-center text-white relative overflow-hidden">
                <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/cubes.png')] opacity-10"></div>
                <div className="relative z-10">
                    <div className="w-24 h-24 bg-emerald-800 rounded-full flex items-center justify-center mx-auto mb-6 shadow-2xl border-4 border-emerald-900/50">
                        <CheckCircle size={48} className="text-amber-400" />
                    </div>
                    <h2 className="text-4xl md:text-5xl font-bold serif-font mb-4 tracking-tight text-white">Bearbetning Klar</h2>
                    <p className="text-emerald-200 text-lg font-light max-w-lg mx-auto leading-relaxed">
                        Alla {products.length} produkter är genomgångna. Nu kan du granska resultatet och exportera.
                    </p>
                </div>
            </div>
            
            <div className="p-10 bg-white">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 mb-12 text-center">
                    <div className="p-8 bg-emerald-50 rounded-3xl border border-emerald-100 shadow-sm hover:shadow-md transition-shadow">
                        <div className="text-5xl font-bold text-emerald-800 mb-2 serif-font">{result.stats.completed}</div>
                        <div className="text-xs font-bold text-emerald-700 uppercase tracking-widest flex items-center justify-center gap-1.5">
                            <ImageIcon size={14} /> Nya Bilder
                        </div>
                    </div>
                    <div className="p-8 bg-amber-50 rounded-3xl border border-amber-100 shadow-sm hover:shadow-md transition-shadow">
                        <div className="text-5xl font-bold text-amber-700 mb-2 serif-font">{result.stats.failed}</div>
                        <div className="text-xs font-bold text-amber-700 uppercase tracking-widest flex items-center justify-center gap-1.5">
                            <AlertTriangle size={14} /> Behöver åtgärd
                        </div>
                    </div>
                    <div className="p-8 bg-stone-50 rounded-3xl border border-stone-200 shadow-sm hover:shadow-md transition-shadow">
                        <div className="text-5xl font-bold text-stone-600 mb-2 serif-font">{result.stats.skipped}</div>
                        <div className="text-xs font-bold text-stone-500 uppercase tracking-widest flex items-center justify-center gap-1.5">
                            <SkipForward size={14} /> Hoppade över
                        </div>
                    </div>
                </div>

                <button
                    onClick={handleFinish}
                    className="w-full flex items-center justify-center gap-4 bg-emerald-900 hover:bg-emerald-800 text-white py-6 px-8 rounded-2xl font-bold text-xl transition-all shadow-2xl shadow-emerald-900/20 hover:-translate-y-1 group border border-emerald-800"
                >
                    Gå till Granskning <ArrowRight size={24} className="text-amber-400 group-hover:translate-x-2 transition-transform" />
                </button>
            </div>
        </div>
      );
  }

  // --- RUNNING / IDLE VIEW ---
  return (
    <div className="max-w-4xl mx-auto mt-6 md:mt-10 bg-white rounded-3xl shadow-xl border border-stone-200 overflow-hidden relative">
      <div className="bg-emerald-950 p-8 flex justify-between items-center relative overflow-hidden">
          <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/cubes.png')] opacity-10"></div>
          <div className="relative z-10">
            <h2 className="text-3xl font-bold text-white mb-2 serif-font tracking-wide">
                {status === 'running' || status === 'paused' ? 'Automatisk Bearbetning' : 'Starta Batch-process'}
            </h2>
            <p className="text-emerald-200/80 font-medium text-lg">
                {status === 'running' || status === 'paused'
                    ? 'AI-motorn söker och sparar bilder i bakgrunden.' 
                    : 'Låt AI beta av hela din lista automatiskt.'}
            </p>
          </div>
          {(status === 'running' || status === 'paused') && (
              <div className={`relative z-10 hidden sm:flex items-center gap-2 px-5 py-2.5 rounded-full text-xs font-bold uppercase tracking-widest border shadow-lg transition-colors ${status === 'paused' ? 'bg-amber-500/90 text-white border-amber-400' : 'bg-emerald-800/80 text-emerald-100 border-emerald-700/50 backdrop-blur-sm animate-pulse'}`}>
                  {status === 'paused' ? <PauseCircle size={14} /> : <Loader2 size={14} className="animate-spin text-amber-400" />} 
                  {status === 'paused' ? 'Pausad' : 'Körs nu'}
              </div>
          )}
      </div>

      <div className="p-8">
        
        {/* RUNNING DASHBOARD */}
        {(status === 'running' || status === 'paused') && progress ? (
            <div className="space-y-10 animate-in fade-in slide-in-from-bottom-4 duration-500">
                {/* Main Progress Bar Area */}
                <div className="bg-emerald-900 rounded-3xl p-8 text-white shadow-2xl relative overflow-hidden border border-emerald-800">
                    <div className="absolute top-0 right-0 p-48 bg-emerald-500/20 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2"></div>
                    <div className="absolute bottom-0 left-0 p-32 bg-amber-500/10 rounded-full blur-3xl translate-y-1/2 -translate-x-1/2"></div>
                    
                    <div className="relative z-10">
                        <div className="flex justify-between items-end mb-6">
                            <div>
                                <span className="text-emerald-300 text-xs font-bold uppercase tracking-widest mb-2 block">Total Progress</span>
                                <div className="text-6xl font-bold serif-font tracking-tight leading-none text-white drop-shadow-sm">
                                    {progress.current} <span className="text-emerald-600/60 text-3xl font-light">/ {progress.total}</span>
                                </div>
                            </div>
                            <div className="text-right">
                                <div className="text-3xl font-mono text-emerald-200 font-medium mb-1 tracking-tight">
                                    ~{estimateTimeRemaining()}
                                </div>
                                <span className="text-emerald-500 text-xs font-bold uppercase tracking-widest">Kvarstående tid</span>
                            </div>
                        </div>

                        {/* Custom Progress Bar */}
                        <div className="w-full bg-emerald-950/50 rounded-full h-5 mb-8 overflow-hidden border border-emerald-800/30 shadow-inner p-0.5">
                            <div
                                className={`h-full rounded-full bg-gradient-to-r transition-all duration-300 ease-linear shadow-[0_0_20px_rgba(245,158,11,0.5)] ${status === 'paused' ? 'from-stone-500 via-stone-400 to-stone-300' : 'from-amber-500 via-amber-400 to-amber-300'}`}
                                style={{ width: `${(progress.current / progress.total) * 100}%` }}
                            />
                        </div>
                        
                        <div className="flex flex-col sm:flex-row justify-between items-center text-sm text-emerald-100 gap-4">
                            <div className="flex items-center gap-3 bg-white/5 px-4 py-2 rounded-xl border border-white/10 w-full sm:w-auto backdrop-blur-sm">
                                <div className="relative shrink-0">
                                    <div className={`w-3 h-3 rounded-full absolute opacity-75 ${status === 'running' ? 'bg-amber-500 animate-ping' : 'bg-stone-500'}`}></div>
                                    <div className={`w-3 h-3 rounded-full ${status === 'running' ? 'bg-amber-500' : 'bg-stone-500'}`}></div>
                                </div>
                                <span className="opacity-70 shrink-0 uppercase text-[10px] font-bold tracking-wider">Bearbetar:</span>
                                <strong className="font-medium truncate max-w-[250px] text-white text-base serif-font">{progress.currentProduct}</strong>
                            </div>
                            
                            <div className="flex items-center gap-2 text-emerald-200 w-full sm:w-auto justify-end bg-white/5 px-3 py-1.5 rounded-lg border border-white/5">
                                <Zap size={14} className="fill-emerald-200" />
                                <span className="font-mono font-bold">{speed} st/min</span>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Statistics Grid - Clickable */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
                    <button 
                        onClick={() => setShowListModal('completed')}
                        className="bg-emerald-50 border border-emerald-100 p-6 rounded-2xl flex items-center gap-5 hover:bg-emerald-100 hover:border-emerald-300 hover:shadow-lg transition-all text-left group"
                    >
                        <div className="w-14 h-14 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0 shadow-sm group-hover:scale-110 transition-transform bg-white border border-emerald-200">
                            <ImageIcon size={28} />
                        </div>
                        <div>
                            <div className="text-4xl font-bold text-emerald-900 leading-none serif-font">{progress.completed}</div>
                            <div className="text-[10px] uppercase font-bold text-emerald-600/70 mt-2 tracking-wider">Nya Bilder</div>
                        </div>
                    </button>

                    <button 
                        onClick={() => setShowListModal('failed')}
                        className="bg-amber-50 border border-amber-100 p-6 rounded-2xl flex items-center gap-5 hover:bg-amber-100 hover:border-amber-300 hover:shadow-lg transition-all text-left group"
                    >
                        <div className="w-14 h-14 rounded-full bg-amber-100 text-amber-600 flex items-center justify-center shrink-0 shadow-sm group-hover:scale-110 transition-transform bg-white border border-amber-200">
                            <XCircle size={28} />
                        </div>
                        <div>
                            <div className="text-4xl font-bold text-amber-900 leading-none serif-font">{progress.failed}</div>
                            <div className="text-[10px] uppercase font-bold text-amber-600/70 mt-2 tracking-wider">Misslyckade</div>
                        </div>
                    </button>

                    <button 
                        onClick={() => setShowListModal('skipped')}
                        className="bg-stone-50 border border-stone-200 p-6 rounded-2xl flex items-center gap-5 hover:bg-stone-100 hover:border-stone-300 hover:shadow-lg transition-all text-left group"
                    >
                        <div className="w-14 h-14 rounded-full bg-stone-200 text-stone-500 flex items-center justify-center shrink-0 shadow-sm group-hover:scale-110 transition-transform bg-white border border-stone-300">
                            <SkipForward size={28} />
                        </div>
                        <div>
                            <div className="text-4xl font-bold text-stone-700 leading-none serif-font">{progress.skipped}</div>
                            <div className="text-[10px] uppercase font-bold text-stone-500/70 mt-2 tracking-wider">Hoppade över</div>
                        </div>
                    </button>
                </div>

                <div className="flex flex-col sm:flex-row justify-center pt-6 gap-4 border-t border-stone-100">
                    {onTogglePause && (
                        <button onClick={onTogglePause} className="group flex items-center justify-center gap-2 bg-stone-100 hover:bg-stone-200 text-stone-600 font-bold text-sm transition-colors py-4 px-8 rounded-xl border border-stone-200">
                            {status === 'paused' ? (
                                <><Play size={18} className="fill-stone-600" /> Återuppta</>
                            ) : (
                                <><PauseCircle size={18} /> Pausa</>
                            )}
                        </button>
                    )}
                    <button onClick={handleStop} className="group flex items-center justify-center gap-2 text-stone-400 hover:text-red-500 font-bold text-sm transition-colors py-4 px-8 rounded-xl hover:bg-red-50 border border-transparent hover:border-red-100">
                        <StopCircle size={18} className="group-hover:fill-red-100" /> Avsluta helt
                    </button>
                    {onReview && (progress.completed > 0 || progress.failed > 0) && (
                        <button onClick={onReview} className="flex items-center justify-center gap-2 bg-white border-2 border-emerald-100 hover:border-emerald-500 text-emerald-800 hover:text-emerald-900 font-bold text-sm transition-all py-4 px-8 rounded-xl shadow-sm hover:shadow-lg">
                             <Eye size={18} /> Granska resultat hittills
                        </button>
                    )}
                </div>
            </div>
        ) : (
            /* IDLE STATE */
            <div className="space-y-12 py-8">
                <div className="bg-gradient-to-b from-stone-50 to-white border border-stone-100 rounded-3xl p-10 flex flex-col items-center text-center shadow-inner">
                    <div className="w-28 h-28 bg-white rounded-full shadow-xl flex items-center justify-center mb-8 text-emerald-800 border-4 border-white ring-1 ring-stone-100">
                        <Zap size={64} className="fill-amber-400 text-amber-400 drop-shadow-sm" />
                    </div>
                    <h3 className="text-3xl font-bold text-emerald-950 mb-4 serif-font">Redo att bearbeta {products.length} produkter</h3>
                    <p className="text-stone-500 max-w-lg mx-auto mb-10 text-lg leading-relaxed font-light">
                        Appen kommer nu att gå igenom <strong>hela listan</strong> från början till slut. 
                        Produkter som redan har bild hoppas över automatiskt.
                    </p>
                    
                    <div className="flex flex-wrap justify-center gap-4 mb-12">
                        <span className="px-5 py-2 bg-white border border-stone-200 rounded-full text-xs font-bold text-emerald-800 uppercase tracking-widest shadow-sm flex items-center gap-2"><CheckCircle size={14} className="text-emerald-500" /> Svensk E-handel</span>
                        <span className="px-5 py-2 bg-white border border-stone-200 rounded-full text-xs font-bold text-emerald-800 uppercase tracking-widest shadow-sm flex items-center gap-2"><CheckCircle size={14} className="text-emerald-500" /> Smart Filtrering</span>
                        <span className="px-5 py-2 bg-white border border-stone-200 rounded-full text-xs font-bold text-emerald-800 uppercase tracking-widest shadow-sm flex items-center gap-2"><CheckCircle size={14} className="text-emerald-500" /> Auto-crop</span>
                    </div>

                    <div className="flex flex-col-reverse sm:flex-row gap-4 w-full max-w-lg">
                        <button onClick={onCancel} className="px-8 py-5 text-stone-500 font-bold hover:text-stone-800 transition-colors bg-stone-50 rounded-2xl hover:bg-stone-100">
                            Tillbaka
                        </button>
                        <button onClick={handleStart} className="flex-1 bg-emerald-900 hover:bg-emerald-800 text-white py-5 px-8 rounded-2xl font-bold text-lg shadow-2xl shadow-emerald-900/20 transition-all hover:-translate-y-1 flex items-center justify-center gap-3 border border-emerald-800 active:scale-95">
                            <Play size={24} className="fill-amber-400 text-amber-400" /> Starta Processen
                        </button>
                    </div>
                </div>
                
                <div className="flex items-start gap-4 p-6 bg-amber-50 border border-amber-100 rounded-2xl text-sm text-amber-900/80 max-w-2xl mx-auto shadow-sm">
                    <AlertTriangle size={24} className="shrink-0 mt-0.5 text-amber-500" />
                    <p className="leading-relaxed"><strong>Tips:</strong> Detta läge är helautomatiskt. Starta det och låt fliken vara öppen i bakgrunden. När allt är klart får du en sammanfattning och kan granska de bilder som behöver manuell handpåläggning.</p>
                </div>
            </div>
        )}

        {/* Modal List */}
        {showListModal && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-emerald-950/80 backdrop-blur-sm p-4 animate-in fade-in duration-200" onClick={() => setShowListModal(null)}>
                <div className="bg-white rounded-3xl shadow-2xl w-full max-w-xl max-h-[80vh] flex flex-col overflow-hidden animate-in zoom-in-95 duration-300 border border-white/20" onClick={e => e.stopPropagation()}>
                    <div className="p-6 border-b border-stone-100 flex justify-between items-center bg-stone-50">
                        <h3 className="font-bold text-stone-800 flex items-center gap-3 text-lg serif-font">
                           {showListModal === 'completed' && <ImageIcon size={20} className="text-emerald-600" />}
                           {showListModal === 'failed' && <XCircle size={20} className="text-amber-600" />}
                           {showListModal === 'skipped' && <SkipForward size={20} className="text-stone-400" />}
                           {getModalTitle(showListModal)}
                           <span className="text-xs font-bold text-stone-500 ml-2 bg-white px-3 py-1 rounded-full border border-stone-200 shadow-sm">
                               {getFilteredList(showListModal).length} st
                           </span>
                        </h3>
                        <button onClick={() => setShowListModal(null)} className="p-2 hover:bg-stone-200 rounded-full transition-colors text-stone-400 hover:text-stone-600">
                            <X size={20}/>
                        </button>
                    </div>
                    <div className="overflow-y-auto p-4 space-y-2 custom-scrollbar bg-stone-50/50">
                        {getFilteredList(showListModal).length === 0 ? (
                            <div className="p-12 text-center text-stone-400 italic">Inga produkter i denna lista.</div>
                        ) : (
                            getFilteredList(showListModal).map((p) => (
                                <div 
                                    key={p.id} 
                                    onClick={() => onSelectProduct?.(p)}
                                    className="flex items-center gap-4 p-3 hover:bg-white rounded-2xl border border-transparent hover:border-stone-100 hover:shadow-sm transition-all cursor-pointer group bg-white/50"
                                    title="Klicka för att granska denna produkt"
                                >
                                    <div className="w-12 h-12 rounded-xl bg-white shrink-0 border border-stone-200 overflow-hidden flex items-center justify-center shadow-sm group-hover:border-emerald-200 transition-colors">
                                        {p.finalImageUrl ? (
                                            <img src={p.finalImageUrl} alt="" className="w-full h-full object-cover" />
                                        ) : (
                                            <ImageIcon size={16} className="text-stone-300" />
                                        )}
                                    </div>
                                    <div className="min-w-0 flex-1">
                                        <div className="text-sm font-bold text-stone-800 truncate group-hover:text-emerald-900 transition-colors">{p.product_name}</div>
                                        <div className="text-xs text-stone-400 truncate font-medium">{p.brand}</div>
                                    </div>
                                    {p.processingError ? (
                                        <div className="max-w-[120px] text-[10px] font-medium text-red-600 leading-tight bg-red-50 px-2 py-1 rounded-lg border border-red-100">
                                            {p.processingError}
                                        </div>
                                    ) : (
                                        <div className="w-8 h-8 rounded-full bg-stone-100 flex items-center justify-center text-stone-300 group-hover:bg-emerald-100 group-hover:text-emerald-600 transition-all opacity-0 group-hover:opacity-100 transform translate-x-2 group-hover:translate-x-0">
                                             <ArrowRight size={16} />
                                        </div>
                                    )}
                                </div>
                            ))
                        )}
                    </div>
                </div>
            </div>
        )}
      </div>
    </div>
  );
};
