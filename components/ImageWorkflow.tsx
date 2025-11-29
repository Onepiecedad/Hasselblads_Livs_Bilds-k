import React, { useState, useEffect, useRef } from 'react';
import { ProcessedProduct, SearchResult, ChatMessage } from '../types';
import { searchProductImages, editProductImage, urlToBase64 } from '../geminiService';
import { uploadToCloudinary, isCloudinaryConfigured } from '../cloudinaryService';
import { TEMPLATES } from '../constants';
import { Image as ImageIcon, Loader2, ArrowRight, SkipForward, AlertCircle, Wand2, RefreshCw, Upload, LayoutTemplate, ImageOff, Search, Save, X, Plus, CheckCircle2 } from 'lucide-react';
import { KeyboardHints } from './KeyboardHints';

interface ImageWorkflowProps {
  product: ProcessedProduct;
  onComplete: (imageUrl: string) => void;
  onSkip: () => void;
}

interface ImageResultItemProps {
  res: SearchResult;
  idx: number;
  isSelected: boolean;
  onClick: () => void;
}

const ImageResultItem: React.FC<ImageResultItemProps> = ({ res, idx, isSelected, onClick }) => {
    const [error, setError] = useState(false);

    return (
        <div 
            onClick={onClick}
            className={`group relative aspect-square bg-white rounded-xl overflow-hidden cursor-pointer shadow-sm transition-all border ${
                isSelected 
                ? 'ring-4 ring-amber-500 border-amber-500 scale-[1.02] z-10 shadow-lg' 
                : 'hover:shadow-md hover:ring-2 hover:ring-emerald-200 border-stone-200'
            }`}
        >
            <div className={`absolute top-2 right-2 text-white text-[10px] font-bold px-1.5 py-0.5 rounded backdrop-blur-sm z-20 transition-opacity ${isSelected ? 'bg-amber-600 opacity-100' : 'bg-black/50 opacity-0 group-hover:opacity-100'}`}>
                {idx + 1}
            </div>

            {error ? (
                <div className="w-full h-full flex flex-col items-center justify-center bg-stone-50 text-stone-300">
                    <ImageOff size={24} />
                    <span className="text-[10px] mt-1 text-stone-400">Bild saknas</span>
                </div>
            ) : (
                <img 
                    src={res.url} 
                    alt={res.title} 
                    className="w-full h-full object-contain p-3" 
                    onError={() => setError(true)}
                    referrerPolicy="no-referrer"
                />
            )}
            {!error && (
                <>
                    <div className="absolute inset-0 bg-emerald-900/0 group-hover:bg-emerald-900/5 transition-colors" />
                    <div className="absolute bottom-0 left-0 right-0 p-2 bg-gradient-to-t from-black/60 to-transparent opacity-0 group-hover:opacity-100 transition-opacity">
                        <p className="text-white text-[10px] font-medium truncate">{res.source}</p>
                    </div>
                </>
            )}
        </div>
    );
};

const ImageWorkflow: React.FC<ImageWorkflowProps> = ({ product, onComplete, onSkip }) => {
  const [step, setStep] = useState<'SEARCH' | 'EDIT' | 'TEMPLATES'>('SEARCH');
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [selectedImageUrl, setSelectedImageUrl] = useState<string | null>(null);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isEditable, setIsEditable] = useState(true);
  const [searchAttempts, setSearchAttempts] = useState(0);
  const [statusMsg, setStatusMsg] = useState('');
  const [customSearchQuery, setCustomSearchQuery] = useState(product.product_name);
  const [searchChips, setSearchChips] = useState<{label: string, active: boolean}[]>([]);

  const scrollRef = useRef<HTMLDivElement>(null);
  const resultsContainerRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const isMountedRef = useRef(true);

  const shortcuts = [
      { key: '1-9', action: 'Välj bild' },
      { key: 'Enter', action: 'Spara & Nästa' },
      { key: '→', action: 'Hoppa över' },
  ];

  useEffect(() => {
    isMountedRef.current = true;

    let initialResults: SearchResult[] = [];
    if (product.prefetchedResults && product.prefetchedResults.length > 0) {
        initialResults = product.prefetchedResults;
    } else if (product.initialImages && product.initialImages.length > 0) {
        initialResults = product.initialImages.map((url, i) => ({
            url: url, title: `Startbild ${i+1}`, source: 'CSV Import'
        }));
    }
    setSearchResults(initialResults);
    setSearchAttempts(0);
    setStatusMsg('');
    setCustomSearchQuery(product.product_name);

    const words = product.product_name.split(' ').filter(w => w.length > 1);
    if (product.brand) words.push(product.brand);
    const uniqueChips = [...new Set(words)].map(w => ({ label: w, active: true }));
    setSearchChips(uniqueChips);

    if (initialResults.length === 0 && step === 'SEARCH' && product.status !== 'failed') {
      performSearch(product.product_name);
    }
    setSelectedImage(null);
    setSelectedImageUrl(null);

    return () => {
      isMountedRef.current = false;
      abortControllerRef.current?.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [product.id]);

  useEffect(() => {
      const handleKeyDown = (e: KeyboardEvent) => {
          if (document.activeElement?.tagName === 'INPUT' || document.activeElement?.tagName === 'TEXTAREA') return;
          if (step === 'SEARCH' && !isLoading) {
              const num = parseInt(e.key);
              if (!isNaN(num) && num > 0 && num <= searchResults.length) handleImageSelect(searchResults[num - 1].url);
          }
          if (e.key === 'Enter') {
              if (selectedImageUrl || selectedImage) finalizeImage();
          }
          if (e.key === 'ArrowRight' && !selectedImageUrl && !selectedImage) onSkip();
      };
      window.addEventListener('keydown', handleKeyDown);
      return () => window.removeEventListener('keydown', handleKeyDown);
  }, [searchResults, selectedImageUrl, selectedImage, step, isLoading, onSkip, finalizeImage]);

  useEffect(() => { if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight; }, [chatMessages]);

  const performSearch = async (overrideQuery?: string) => {
    if (!isMountedRef.current || isLoading) return; // Prevent duplicate searches
    setIsLoading(true);
    setError(null);
    setStatusMsg('');
    const queryToUse = overrideQuery || customSearchQuery;
    try {
      const isRetry = searchAttempts > 0;
      const isCustom = queryToUse !== product.product_name;
      const results = await searchProductImages(product.product_name, product.brand, product.description, isRetry, isCustom ? queryToUse : undefined);
      if (!isMountedRef.current) return;
      setSearchResults(prev => {
          const existingUrls = new Set(prev.map(r => r.url.toLowerCase().trim()));
          const newUnique = results.filter(r => !existingUrls.has(r.url.toLowerCase().trim()));
          if (newUnique.length > 0) setStatusMsg(`Hittade ${newUnique.length} nya bilder.`);
          else if (isRetry || isCustom) setStatusMsg("Inga nya bilder hittades.");
          return [...prev, ...newUnique];
      });
      if (results.length === 0 && searchResults.length === 0) setError("Inga bilder hittades.");
      setSearchAttempts(prev => prev + 1);
    } catch (err) {
      if (isMountedRef.current) setError("Sökning misslyckades.");
    } finally {
      if (isMountedRef.current) setIsLoading(false);
    }
  };

  const handleImageSelect = async (url: string) => {
    if (!isMountedRef.current) return;
    setIsLoading(true);
    setSelectedImageUrl(url);
    setIsEditable(true);
    try {
      const base64DataUri = await urlToBase64(url);
      if (!isMountedRef.current) return;
      setSelectedImage(base64DataUri);
      setStep('EDIT');
    } catch (e: any) {
      if (!isMountedRef.current) return;
      if (e.message === 'CORS_ERROR') {
         setSelectedImageUrl(url); setSelectedImage(null); setIsEditable(false); setStep('EDIT');
      } else { setError("Kunde inte ladda bilden."); }
    } finally {
      if (isMountedRef.current) setIsLoading(false);
    }
  };

  const handleChipClick = (index: number) => {
      if (isLoading) return; // Prevent changes during search
      const newChips = [...searchChips];
      newChips[index].active = !newChips[index].active;
      setSearchChips(newChips);
      const newQuery = newChips.filter(c => c.active).map(c => c.label).join(' ');
      setCustomSearchQuery(newQuery);
      performSearch(newQuery);
  };

  const handleGenerateNew = () => {
    setSelectedImage(null); setSelectedImageUrl(null); setStep('EDIT'); setIsEditable(true);
    setChatMessages([{ role: 'model', text: 'Redo att generera. Vad vill du skapa?' }]);
  };

  const handleTemplateSelect = (template: typeof TEMPLATES[0]) => {
      setSelectedImage(null); setSelectedImageUrl(null); setStep('EDIT'); setIsEditable(true);
      setChatMessages([{ role: 'model', text: `Skapar bild med mall: ${template.label}...` }]);
      handleSendMessage(`Create a ${template.prompt} of a product named "${product.product_name}".`);
  };

  const handleUploadClick = () => { fileInputRef.current?.click(); };
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file size (10MB limit)
    const maxSize = 10 * 1024 * 1024;
    if (file.size > maxSize) {
      setError('Filen är för stor (max 10MB). Välj en mindre bild.');
      e.target.value = '';
      return;
    }

    // Validate file type
    if (!file.type.startsWith('image/')) {
      setError('Endast bildfiler är tillåtna.');
      e.target.value = '';
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const result = event.target?.result as string;
      setSelectedImage(result); setSelectedImageUrl(null); setStep('EDIT'); setIsEditable(true);
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const handleSendMessage = async (directPrompt?: string) => {
    if (!isMountedRef.current) return;
    const textToSend = directPrompt || chatInput;
    if (!textToSend.trim()) return;
    if (!directPrompt) { setChatMessages(prev => [...prev, { role: 'user', text: textToSend }]); setChatInput(''); }
    setIsLoading(true);
    try {
      const newImageBase64 = await editProductImage(selectedImage, textToSend);
      if (!isMountedRef.current) return;
      if (newImageBase64) {
         setSelectedImage(newImageBase64); setSelectedImageUrl(null); setIsEditable(true);
         setChatMessages(prev => [...prev, { role: 'model', text: 'Fixat! Nöjd?', image: newImageBase64, isImageGeneration: true }]);
      } else {
         setChatMessages(prev => [...prev, { role: 'model', text: 'Kunde inte generera bild. Prova igen.' }]);
      }
    } catch (err) {
      if (isMountedRef.current) setChatMessages(prev => [...prev, { role: 'model', text: 'Något gick fel.' }]);
    } finally {
      if (isMountedRef.current) setIsLoading(false);
    }
  };

  const finalizeImage = async () => {
    setIsSaving(true);
    let finalUrl = '';
    try {
        if (selectedImage) finalUrl = selectedImage; else if (selectedImageUrl) finalUrl = selectedImageUrl;
        if (!finalUrl) { setIsSaving(false); return; }
        if (isCloudinaryConfigured()) {
            try {
                const uploadSource = selectedImage || finalUrl;
                const cloudUrl = await uploadToCloudinary(uploadSource);
                finalUrl = cloudUrl; 
            } catch (cloudError) { console.warn('Cloudinary upload failed, falling back to local.', cloudError); }
        }
        onComplete(finalUrl);
    } catch (e) { setError('Kunde inte spara bilden.'); setIsSaving(false); }
  };

  if (step === 'SEARCH' || step === 'TEMPLATES') {
    return (
      <div className="flex flex-col h-full bg-stone-50/50">
        <div className="mb-2 px-4 py-4 bg-white border-b border-stone-200 sticky top-0 z-10 shadow-sm">
           <div className="flex justify-between items-start">
               <div>
                   <h3 className="text-2xl font-bold text-emerald-950 leading-tight serif-font">{product.product_name}</h3>
                   <div className="flex items-center gap-3 mt-1.5">
                        {product.brand && (
                                <span className="bg-amber-100 text-amber-900 text-[10px] font-bold px-2 py-0.5 rounded uppercase tracking-widest border border-amber-200">
                                    {product.brand}
                                </span>
                        )}
                        <p className="text-stone-500 text-sm truncate max-w-lg">{product.description}</p>
                   </div>
               </div>
               <div className="text-right">
                   <div className="text-[10px] text-stone-400 font-mono bg-stone-100 px-2 py-1 rounded">
                       [1-9] Välj | [Enter] Spara
                   </div>
               </div>
           </div>
        </div>

        {error && (
          <div className="mx-4 mb-4 p-3 bg-red-50 text-red-800 rounded-lg flex items-center gap-2 border border-red-100 text-sm">
            <AlertCircle size={16} /> <span>{error}</span>
          </div>
        )}

        {step === 'SEARCH' && (
             <div className="mb-4 px-4">
                <div className="flex gap-2 mb-3">
                    <div className="relative flex-1">
                        <input 
                            ref={searchInputRef} type="text" value={customSearchQuery}
                            onChange={(e) => setCustomSearchQuery(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && performSearch()}
                            placeholder="Sök..."
                            className="w-full bg-white border border-stone-300 rounded-lg pl-10 pr-3 py-2.5 text-sm focus:border-emerald-600 focus:ring-1 focus:ring-emerald-200 outline-none transition-all shadow-sm font-medium"
                        />
                        <Search size={18} className="absolute left-3 top-2.5 text-stone-400" />
                    </div>
                    <button onClick={() => performSearch()} disabled={isLoading} className="bg-emerald-900 hover:bg-emerald-800 text-white px-5 py-2 rounded-lg text-sm font-bold transition-colors disabled:opacity-70 shadow-sm">
                        Sök
                    </button>
                </div>
                <div className="flex flex-wrap gap-2">
                    {searchChips.map((chip, idx) => (
                        <button key={idx} onClick={() => handleChipClick(idx)}
                            className={`text-[11px] px-2.5 py-1 rounded-full border transition-all flex items-center gap-1 font-medium ${
                                chip.active 
                                ? 'bg-stone-800 text-white border-stone-800 hover:bg-stone-700' 
                                : 'bg-white text-stone-400 border-stone-200 hover:border-stone-400 decoration-stone-400 line-through'
                            }`}
                        >
                            {chip.active ? <CheckCircle2 size={12} /> : <X size={12} />} {chip.label}
                        </button>
                    ))}
                    <button onClick={() => setStep('TEMPLATES')} className="text-[11px] px-2.5 py-1 rounded-full border border-blue-200 text-blue-700 bg-blue-50 hover:bg-blue-100 flex items-center gap-1 font-medium">
                        <LayoutTemplate size={12} /> Mallar
                    </button>
                </div>
             </div>
        )}

        {step === 'TEMPLATES' ? (
             <div className="flex-1 overflow-y-auto custom-scrollbar p-4 pt-0">
                 <button onClick={() => setStep('SEARCH')} className="mb-4 text-xs text-stone-500 flex items-center gap-1 hover:text-stone-800 font-medium">
                     <ArrowRight className="rotate-180" size={14} /> Tillbaka till sök
                 </button>
                <div className="grid grid-cols-2 gap-4 pb-4">
                    {TEMPLATES.map(t => (
                        <div key={t.id} onClick={() => handleTemplateSelect(t)} className="bg-white p-4 rounded-xl border border-stone-200 hover:border-emerald-500 hover:shadow-lg hover:shadow-emerald-500/10 cursor-pointer transition-all flex flex-col items-center text-center group">
                            <div className="w-12 h-12 bg-emerald-50 text-emerald-700 rounded-full flex items-center justify-center mb-3 group-hover:scale-110 transition-transform">
                                <LayoutTemplate size={24} />
                            </div>
                            <h4 className="font-bold text-emerald-950 text-sm serif-font">{t.label}</h4>
                            <p className="text-xs text-stone-500 mt-1 line-clamp-2">{t.prompt}</p>
                        </div>
                    ))}
                </div>
             </div>
        ) : (
             isLoading && searchResults.length === 0 ? (
                <div className="flex-1 flex flex-col items-center justify-center text-stone-400">
                    <Loader2 className="w-10 h-10 animate-spin text-emerald-600 mb-3" />
                    <p className="text-sm font-medium text-stone-500 animate-pulse">Hämtar bilder...</p>
                </div>
                ) : (
                <div className="flex-1 overflow-y-auto px-4 custom-scrollbar pb-20" ref={resultsContainerRef}>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 pb-4">
                    <div onClick={handleGenerateNew} className="aspect-square bg-white border-2 border-dashed border-emerald-200 hover:border-emerald-500 hover:bg-emerald-50 rounded-xl flex flex-col items-center justify-center text-emerald-600 cursor-pointer transition-all group">
                        <Wand2 size={24} className="mb-2 group-hover:scale-110 transition-transform" />
                        <span className="text-xs font-bold uppercase tracking-wide">Generera</span>
                    </div>
                    <div onClick={handleUploadClick} className="aspect-square bg-white border-2 border-dashed border-stone-300 hover:border-stone-500 hover:bg-stone-50 rounded-xl flex flex-col items-center justify-center text-stone-500 cursor-pointer transition-all group">
                        <Upload size={24} className="mb-2 group-hover:scale-110 transition-transform" />
                        <span className="text-xs font-bold uppercase tracking-wide">Ladda upp</span>
                        <input type="file" ref={fileInputRef} className="hidden" accept="image/*" onChange={handleFileChange} />
                    </div>
                    {searchResults.map((res, idx) => (
                        <ImageResultItem key={`${res.url}-${idx}`} res={res} idx={idx} isSelected={false} onClick={() => handleImageSelect(res.url)} />
                    ))}
                    </div>
                </div>
            )
        )}

        <div className="mt-auto p-4 border-t border-stone-200 flex justify-between gap-4 bg-white sticky bottom-0 z-20 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)]">
           <button onClick={onSkip} className="flex items-center gap-2 text-stone-500 hover:text-stone-800 px-5 py-2.5 bg-stone-100 hover:bg-stone-200 rounded-lg text-sm font-bold transition-colors">
             <SkipForward size={18} /> Hoppa över
           </button>
           {step === 'SEARCH' && (
             <button onClick={() => performSearch()} disabled={isLoading} className="flex items-center gap-2 text-emerald-700 hover:text-emerald-900 text-sm font-bold">
                <RefreshCw size={16} className={isLoading ? 'animate-spin' : ''} /> Ladda fler
             </button>
           )}
        </div>
        <KeyboardHints shortcuts={shortcuts} />
      </div>
    );
  }

  // --- EDIT VIEW ---
  const displayImage = selectedImageUrl || selectedImage;
  return (
    <div className="flex flex-col h-full bg-stone-50/50">
      <div className="flex-1 flex flex-col md:flex-row gap-6 overflow-hidden p-6">
        <div className="h-64 shrink-0 md:h-auto md:flex-1 bg-white rounded-2xl flex items-center justify-center p-8 relative overflow-hidden shadow-sm border border-stone-200 group">
           <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/cubes.png')] opacity-[0.03] pointer-events-none"></div>
           {displayImage ? (
             <img src={displayImage} className="w-full h-full object-contain drop-shadow-2xl transition-transform duration-500" alt="Selected" />
           ) : (
             <div className="text-stone-300 text-center max-w-xs">
               <Wand2 className="w-16 h-16 mx-auto mb-4 opacity-50" />
               <p className="font-serif italic">Ingen bild vald.</p>
             </div>
           )}
        </div>

        <div className="flex-1 md:w-96 md:h-auto flex flex-col bg-white border border-stone-200 rounded-2xl shadow-lg overflow-hidden">
          <div className="bg-stone-50 px-5 py-3 border-b border-stone-200 flex items-center justify-between">
            <div className="flex items-center gap-2">
                <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse"></div>
                <span className="text-xs font-bold text-stone-600 uppercase tracking-widest">AI Editor</span>
            </div>
            <button onClick={() => setStep('SEARCH')} className="text-xs text-stone-400 hover:text-emerald-700 font-medium transition-colors">Byt bild</button>
          </div>
          <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-white" ref={scrollRef}>
            {chatMessages.map((msg, i) => (
              <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[90%] p-3 rounded-2xl text-sm leading-relaxed shadow-sm ${msg.role === 'user' ? 'bg-emerald-900 text-white rounded-br-none' : 'bg-stone-100 text-stone-800 rounded-bl-none border border-stone-100'}`}>
                  {msg.text}
                </div>
              </div>
            ))}
            {isLoading && <div className="flex justify-start"><div className="bg-stone-50 p-3 rounded-2xl rounded-bl-none text-stone-500 flex items-center gap-2"><Loader2 className="animate-spin w-4 h-4 text-emerald-600" /><span className="text-xs font-medium">Jobbar...</span></div></div>}
          </div>
          <div className="p-3 bg-stone-50 border-t border-stone-200">
            <div className="flex gap-2 relative">
              <input type="text" value={chatInput} disabled={!isEditable || isLoading} onChange={(e) => setChatInput(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleSendMessage()} placeholder="T.ex. 'Ta bort bakgrunden'" className="flex-1 bg-white border border-stone-300 rounded-lg pl-3 pr-10 py-3 text-sm focus:border-emerald-500 outline-none disabled:bg-stone-100 shadow-sm" />
              <button onClick={() => handleSendMessage()} disabled={!isEditable || isLoading || !chatInput.trim()} className="absolute right-1.5 top-1.5 bottom-1.5 bg-emerald-900 text-white p-2 rounded-md hover:bg-emerald-800 disabled:opacity-0 transition-all"><ArrowRight size={16} /></button>
            </div>
          </div>
        </div>
      </div>

      <div className="mt-auto p-4 border-t border-stone-200 flex justify-between items-center bg-white">
        <button onClick={() => setStep('SEARCH')} disabled={isSaving} className="text-stone-400 hover:text-emerald-900 text-sm font-bold flex items-center gap-2 transition-colors uppercase tracking-wide">
          ← Tillbaka
        </button>
        <button onClick={finalizeImage} disabled={!displayImage || isSaving} className="flex items-center gap-2 bg-amber-500 hover:bg-amber-600 text-white px-8 py-3 rounded-lg font-bold shadow-lg shadow-amber-200 transition-all hover:-translate-y-0.5 disabled:opacity-50 disabled:shadow-none min-w-[160px] justify-center">
            {isSaving ? <><Loader2 className="animate-spin" size={18} /> Sparar...</> : <>Spara & Nästa <ArrowRight size={18} /></>}
        </button>
      </div>
    </div>
  );
};

export default ImageWorkflow;