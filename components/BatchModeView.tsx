
import React, { useState, useRef, useEffect } from 'react';
import { Play, StopCircle, CheckCircle, AlertTriangle, ArrowRight, Loader2, Image as ImageIcon, SkipForward, Zap, XCircle, Eye } from 'lucide-react';
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
}

type BatchStatus = 'idle' | 'running' | 'paused' | 'completed' | 'cancelled';

export const BatchModeView: React.FC<BatchModeViewProps> = ({
  products,
  onComplete,
  onCancel,
  onStatusChange,
  onProductProcessed,
  onReview,
  isPaused = false,
  onTogglePause
}) => {
  const [status, setStatus] = useState<BatchStatus>('idle');
  const [progress, setProgress] = useState<BatchProgress | null>(null);
  const [result, setResult] = useState<BatchResult | null>(null);
  const [startTime, setStartTime] = useState<number | null>(null);
  const [speed, setSpeed] = useState<string>('--');
  const abortControllerRef = useRef<AbortController | null>(null);

  // Notify parent of running status
  useEffect(() => {
      if (onStatusChange) {
          onStatusChange(status === 'running' || status === 'paused');
      }
  }, [status, onStatusChange]);

  // Sync pause flag from parent into local status label
  useEffect(() => {
    if (isPaused && status === 'running') setStatus('paused');
    if (!isPaused && status === 'paused') setStatus('running');
  }, [isPaused, status]);

  // Calculate speed (products per minute)
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
          delayBetweenProducts: 800, // Adjusted to avoid rate limits
          skipExistingImages: true,
          abortSignal: abortControllerRef.current.signal,
          onProductProcessed: onProductProcessed,
          isPaused: () => isPaused
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
    abortControllerRef.current?.abort();
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
    // Use dynamic speed estimate if available, otherwise fallback to 2s per item
    const msPerItem = startTime ? (Date.now() - startTime) / progress.current : 2000; 
    const remainingMs = remainingCount * msPerItem;
    return formatTime(remainingMs);
  };

  // --- RESULT VIEW (When done) ---
  if (status === 'completed' && result) {
      return (
        <div className="max-w-3xl mx-auto mt-10 bg-white rounded-2xl shadow-2xl border border-stone-200 overflow-hidden animate-in fade-in zoom-in-95 duration-500">
            <div className="bg-emerald-900 p-8 md:p-12 text-center text-white relative overflow-hidden">
                <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/cubes.png')] opacity-10"></div>
                <div className="relative z-10">
                    <div className="w-24 h-24 bg-emerald-800 rounded-full flex items-center justify-center mx-auto mb-6 shadow-lg shadow-emerald-950/30 border border-emerald-700/50">
                        <CheckCircle size={48} className="text-emerald-400" />
                    </div>
                    <h2 className="text-3xl md:text-5xl font-bold serif-font mb-4 tracking-tight text-amber-400">Bearbetning Klar</h2>
                    <p className="text-emerald-100 text-base md:text-lg font-light max-w-lg mx-auto leading-relaxed">
                        Alla {products.length} produkter är genomgångna. Nu kan du granska resultatet och exportera.
                    </p>
                </div>
            </div>
            
            <div className="p-6 md:p-10 bg-white">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 mb-10 text-center">
                    <div className="p-6 bg-emerald-50 rounded-2xl border border-emerald-100 shadow-sm group hover:border-emerald-300 transition-colors">
                        <div className="text-4xl md:text-5xl font-bold text-emerald-800 mb-2 serif-font">{result.stats.completed}</div>
                        <div className="text-xs font-bold text-emerald-700 uppercase tracking-widest flex items-center justify-center gap-1">
                            <ImageIcon size={12} /> Nya Bilder
                        </div>
                    </div>
                    <div className="p-6 bg-amber-50 rounded-2xl border border-amber-100 shadow-sm group hover:border-amber-300 transition-colors">
                        <div className="text-4xl md:text-5xl font-bold text-amber-700 mb-2 serif-font">{result.stats.failed}</div>
                        <div className="text-xs font-bold text-amber-700 uppercase tracking-widest flex items-center justify-center gap-1">
                            <AlertTriangle size={12} /> Behöver åtgärd
                        </div>
                    </div>
                    <div className="p-6 bg-stone-50 rounded-2xl border border-stone-200 shadow-sm group hover:border-stone-300 transition-colors">
                        <div className="text-4xl md:text-5xl font-bold text-stone-600 mb-2 serif-font">{result.stats.skipped}</div>
                        <div className="text-xs font-bold text-stone-500 uppercase tracking-widest flex items-center justify-center gap-1">
                            <SkipForward size={12} /> Hoppade över
                        </div>
                    </div>
                </div>

                <button
                    onClick={handleFinish}
                    className="w-full flex items-center justify-center gap-4 bg-emerald-900 hover:bg-emerald-800 text-white py-6 px-8 rounded-xl font-bold text-xl transition-all shadow-xl shadow-emerald-900/20 hover:-translate-y-1 group border border-emerald-800"
                >
                    Gå till Granskning <ArrowRight size={24} className="text-amber-400 group-hover:translate-x-1 transition-transform" />
                </button>
            </div>
        </div>
      );
  }

  // --- RUNNING / IDLE VIEW ---
  return (
    <div className="max-w-4xl mx-auto mt-6 md:mt-10 bg-white rounded-2xl shadow-xl border border-stone-200 overflow-hidden">
      <div className="bg-emerald-900 p-6 md:p-8 flex justify-between items-center relative overflow-hidden">
          <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/cubes.png')] opacity-10"></div>
          <div className="relative z-10">
            <h2 className="text-2xl md:text-3xl font-bold text-amber-400 mb-2 serif-font">
                {status === 'running' ? 'Automatisk Bearbetning' : 'Starta Batch-process'}
            </h2>
            <p className="text-emerald-100/90 font-medium text-sm md:text-lg">
                {status === 'running' 
                    ? 'AI-motorn söker och sparar bilder i bakgrunden.' 
                    : 'Låt AI beta av hela din lista automatiskt.'}
            </p>
          </div>
          <div className="flex items-center gap-3 relative z-10">
            {(status === 'running' || status === 'paused') && (
              <button
                onClick={onTogglePause}
                className="px-4 py-2 bg-white/10 hover:bg-white/20 text-white rounded-full text-xs font-bold uppercase tracking-widest border border-white/20 transition-colors"
              >
                {isPaused ? 'Återuppta' : 'Pausa'}
              </button>
            )}
            {status === 'running' && (
                <div className="hidden sm:flex items-center gap-2 px-4 py-2 bg-emerald-800/50 text-emerald-100 rounded-full text-xs font-bold uppercase tracking-widest animate-pulse border border-emerald-700/50 shadow-lg">
                    <Loader2 size={14} className="animate-spin text-amber-400" /> Körs nu
                </div>
            )}
            {status === 'paused' && (
                <div className="hidden sm:flex items-center gap-2 px-4 py-2 bg-amber-800/50 text-amber-50 rounded-full text-xs font-bold uppercase tracking-widest border border-amber-700/50 shadow-lg">
                    Pausad
                </div>
            )}
          </div>
      </div>

      <div className="p-5 md:p-8">
        
        {/* RUNNING DASHBOARD */}
        {(status === 'running' || status === 'paused') && progress ? (
            <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
                {/* Main Progress Bar Area */}
                <div className="bg-emerald-950 rounded-2xl p-5 md:p-8 text-white shadow-2xl relative overflow-hidden border border-emerald-900">
                    <div className="absolute top-0 right-0 p-40 bg-emerald-900/30 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2"></div>
                    
                    <div className="relative z-10">
                        <div className="flex justify-between items-end mb-4">
                            <div>
                                <span className="text-emerald-400 text-xs font-bold uppercase tracking-widest mb-1 block">Total Progress</span>
                                <div className="text-4xl md:text-6xl font-bold serif-font tracking-tight leading-none text-white">
                                    {progress.current} <span className="text-emerald-700 text-2xl md:text-4xl font-light">/ {progress.total}</span>
                                </div>
                            </div>
                            <div className="text-right">
                                <div className="text-xl md:text-2xl font-mono text-emerald-200 font-medium mb-1">
                                    ~{estimateTimeRemaining()}
                                </div>
                                <span className="text-emerald-500 text-xs font-bold uppercase tracking-widest">Kvarstående tid</span>
                            </div>
                        </div>

                        {/* Custom Progress Bar */}
                        <div className="w-full bg-emerald-900/50 rounded-full h-4 mb-6 overflow-hidden border border-emerald-800/50 shadow-inner">
                            <div
                                className="h-full rounded-full bg-gradient-to-r from-amber-500 via-amber-400 to-amber-300 transition-all duration-300 ease-linear shadow-[0_0_20px_rgba(245,158,11,0.6)]"
                                style={{ width: `${(progress.current / progress.total) * 100}%` }}
                            />
                        </div>
                        
                        <div className="flex flex-col sm:flex-row justify-between items-center text-sm text-emerald-100 gap-2">
                            <div className="flex items-center gap-3 bg-emerald-900/50 px-3 py-1.5 rounded-lg border border-emerald-800/50 w-full sm:w-auto">
                                <div className="relative shrink-0">
                                    <div className="w-2.5 h-2.5 bg-amber-500 rounded-full animate-ping absolute opacity-75"></div>
                                    <div className="w-2.5 h-2.5 bg-amber-500 rounded-full"></div>
                                </div>
                                <span className="opacity-80 shrink-0">Bearbetar:</span>
                                <strong className="font-medium truncate max-w-[200px] text-white">{progress.currentProduct}</strong>
                            </div>
                            
                            <div className="flex items-center gap-2 text-emerald-300 w-full sm:w-auto justify-end">
                                <Zap size={14} className="fill-emerald-300" />
                                <span className="font-mono">{speed} st/min</span>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Statistics Grid */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div className="bg-emerald-50 border border-emerald-100 p-4 md:p-5 rounded-2xl flex items-center gap-4">
                        <div className="w-12 h-12 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0 shadow-sm">
                            <ImageIcon size={24} />
                        </div>
                        <div>
                            <div className="text-3xl font-bold text-emerald-900 leading-none serif-font">{progress.completed}</div>
                            <div className="text-[10px] uppercase font-bold text-emerald-600/70 mt-1.5">Bilder Hittade</div>
                        </div>
                    </div>

                    <div className="bg-amber-50 border border-amber-100 p-4 md:p-5 rounded-2xl flex items-center gap-4">
                        <div className="w-12 h-12 rounded-full bg-amber-100 text-amber-600 flex items-center justify-center shrink-0 shadow-sm">
                            <XCircle size={24} />
                        </div>
                        <div>
                            <div className="text-3xl font-bold text-amber-900 leading-none serif-font">{progress.failed}</div>
                            <div className="text-[10px] uppercase font-bold text-amber-600/70 mt-1.5">Misslyckade</div>
                        </div>
                    </div>

                    <div className="bg-stone-50 border border-stone-200 p-4 md:p-5 rounded-2xl flex items-center gap-4">
                        <div className="w-12 h-12 rounded-full bg-stone-200 text-stone-500 flex items-center justify-center shrink-0 shadow-sm">
                            <SkipForward size={24} />
                        </div>
                        <div>
                            <div className="text-3xl font-bold text-stone-700 leading-none serif-font">{progress.skipped}</div>
                            <div className="text-[10px] uppercase font-bold text-stone-500/70 mt-1.5">Hoppade över</div>
                        </div>
                    </div>
                </div>

                <div className="flex flex-col sm:flex-row justify-center pt-2 gap-4">
                    <button onClick={handleStop} className="group flex items-center justify-center gap-2 text-stone-400 hover:text-red-500 font-medium text-sm transition-colors py-3 px-6 rounded-xl hover:bg-red-50">
                        <StopCircle size={18} className="group-hover:fill-red-100" /> Avbryt processen (pausa)
                    </button>
                    {onReview && (progress.completed > 0 || progress.failed > 0) && (
                        <button onClick={onReview} className="flex items-center justify-center gap-2 bg-white border border-emerald-200 hover:border-emerald-500 text-emerald-800 hover:text-emerald-900 font-bold text-sm transition-all py-3 px-6 rounded-xl shadow-sm hover:shadow-md">
                             <Eye size={18} /> Granska resultat hittills
                        </button>
                    )}
                </div>
            </div>
        ) : (
            /* IDLE STATE */
            <div className="space-y-10">
                <div className="bg-stone-50 border border-stone-200 rounded-2xl p-6 md:p-10 flex flex-col items-center text-center">
                    <div className="w-24 h-24 bg-white rounded-full shadow-md flex items-center justify-center mb-6 text-emerald-800 border border-stone-100">
                        <Zap size={48} className="fill-amber-400 text-amber-400" />
                    </div>
                    <h3 className="text-2xl font-bold text-emerald-950 mb-3 serif-font">Redo att bearbeta {products.length} produkter</h3>
                    <p className="text-stone-500 max-w-lg mx-auto mb-8 text-base md:text-lg leading-relaxed">
                        Appen kommer nu att gå igenom <strong>hela listan</strong> från början till slut. 
                        Produkter som redan har bild hoppas över automatiskt.
                    </p>
                    
                    <div className="flex flex-wrap justify-center gap-3 mb-10">
                        <span className="px-4 py-1.5 bg-white border border-stone-200 rounded-full text-xs font-bold text-emerald-800 uppercase tracking-wide shadow-sm">Svensk E-handel</span>
                        <span className="px-4 py-1.5 bg-white border border-stone-200 rounded-full text-xs font-bold text-emerald-800 uppercase tracking-wide shadow-sm">Smart Filtrering</span>
                        <span className="px-4 py-1.5 bg-white border border-stone-200 rounded-full text-xs font-bold text-emerald-800 uppercase tracking-wide shadow-sm">Auto-crop 1000px</span>
                    </div>

                    <div className="w-full h-px bg-stone-200 mb-8 max-w-md"></div>

                    <div className="flex flex-col-reverse sm:flex-row gap-4 w-full max-w-md">
                        <button onClick={onCancel} className="px-8 py-4 text-stone-500 font-bold hover:text-stone-800 transition-colors">
                            Tillbaka
                        </button>
                        <button onClick={handleStart} className="flex-1 bg-emerald-900 hover:bg-emerald-800 text-white py-4 px-8 rounded-xl font-bold text-lg shadow-xl shadow-emerald-900/20 transition-all hover:-translate-y-1 flex items-center justify-center gap-3 border border-emerald-800">
                            <Play size={24} className="fill-amber-400 text-amber-400" /> Starta Processen
                        </button>
                    </div>
                </div>
                
                <div className="flex items-start gap-4 p-5 bg-amber-50 border border-amber-100 rounded-xl text-sm text-amber-900/80">
                    <AlertTriangle size={20} className="shrink-0 mt-0.5 text-amber-600" />
                    <p><strong>Tips:</strong> Detta läge är helautomatiskt. Starta det och låt fliken vara öppen i bakgrunden. När allt är klart får du en sammanfattning och kan granska de bilder som behöver manuell handpåläggning.</p>
                </div>
            </div>
        )}
      </div>
    </div>
  );
};
