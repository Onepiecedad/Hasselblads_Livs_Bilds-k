import React, { useState, useEffect, useRef } from 'react';
import { ProcessedProduct, SearchResult, ChatMessage } from '../types';
import { searchProductImages, editProductImage, urlToBase64, generateProductImage } from '../geminiService';
import { uploadToCloudinary, isCloudinaryConfigured } from '../cloudinaryService';
import { TEMPLATES } from '../constants';
import { Image as ImageIcon, Loader2, ArrowRight, SkipForward, AlertCircle, Wand2, RefreshCw, Upload, LayoutTemplate, ImageOff, Search, Save, X, Plus, CheckCircle2, ChevronLeft, ZoomIn, Sparkles, Camera } from 'lucide-react';
import { Tooltip } from './Tooltip';

interface ImageWorkflowProps {
  product: ProcessedProduct;
  onComplete: (imageUrl: string) => void;
  onSkip: () => void;
  onPrevious: () => void;
}

interface ImageResultItemProps {
  res: SearchResult;
  idx: number;
  isSelected: boolean;
  onClick: () => void;
  small?: boolean;
}

const ImageResultItem: React.FC<ImageResultItemProps> = ({ res, idx, isSelected, onClick, small = false }) => {
    const [error, setError] = useState(false);

    return (
        <div 
            onClick={onClick}
            className={`group relative bg-white rounded-xl overflow-hidden cursor-pointer shadow-sm transition-all border flex-shrink-0 ${
                small ? 'w-20 h-20' : 'aspect-square'
            } ${
                isSelected 
                ? 'ring-4 ring-amber-500 border-amber-500 scale-[0.98] z-10 shadow-lg' 
                : 'hover:shadow-md hover:ring-2 hover:ring-emerald-200 border-stone-200'
            }`}
        >
            {!small && (
                <div className={`absolute top-2 right-2 text-white text-[10px] font-bold px-1.5 py-0.5 rounded backdrop-blur-sm z-20 transition-opacity ${isSelected ? 'bg-amber-600 opacity-100' : 'bg-black/50 opacity-0 group-hover:opacity-100'}`}>
                    {idx + 1}
                </div>
            )}

            {error ? (
                <div className="w-full h-full flex flex-col items-center justify-center bg-stone-50 text-stone-300">
                    <ImageOff size={small ? 16 : 24} />
                    {!small && <span className="text-[10px] mt-1 text-stone-400">Bild saknas</span>}
                </div>
            ) : (
                <img 
                    src={res.url} 
                    alt={res.title} 
                    className="w-full h-full object-contain p-1.5" 
                    onError={() => setError(true)}
                    referrerPolicy="no-referrer"
                />
            )}
            {!error && !small && (
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

const ImageWorkflow: React.FC<ImageWorkflowProps> = ({ product, onComplete, onSkip, onPrevious }) => {
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

  // Zoom State
  const [zoomState, setZoomState] = useState({ show: false, x: 0, y: 0 });
  const [isZoomLocked, setIsZoomLocked] = useState(false);
  const imageContainerRef = useRef<HTMLDivElement>(null);

  const scrollRef = useRef<HTMLDivElement>(null);
  const resultsContainerRef = useRef<HTMLDivElement>(null);
  const galleryScrollRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  
  // Track mount status to prevent setting state on unmounted component
  const isMounted = useRef(true);

  useEffect(() => {
    isMounted.current = true;
    return () => { isMounted.current = false; };
  }, []);

  useEffect(() => {
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
    setStep('SEARCH'); // Ensure reset to SEARCH on new product
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
          if (e.key === 'ArrowLeft' && !selectedImageUrl && !selectedImage) onPrevious();
      };
      window.addEventListener('keydown', handleKeyDown);
      return () => window.removeEventListener('keydown', handleKeyDown);
  }, [searchResults, selectedImageUrl, selectedImage, step, isLoading, onSkip, onPrevious]);

  useEffect(() => { if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight; }, [chatMessages]);

  const performSearch = async (overrideQuery?: string) => {
    setIsLoading(true);
    setError(null);
    setStatusMsg('');
    const queryToUse = overrideQuery || customSearchQuery;
    try {
      const isRetry = searchAttempts > 0;
      const isCustom = queryToUse !== product.product_name;
      const results = await searchProductImages(product.product_name, product.brand, product.description, isRetry, isCustom ? queryToUse : undefined);
      
      if (!isMounted.current) return;

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
        if (isMounted.current) setError("Sökning misslyckades."); 
    } finally { 
        if (isMounted.current) setIsLoading(false); 
    }
  };

  const handleImageSelect = async (url: string) => {
    setIsLoading(true);
    setSelectedImageUrl(url);
    setIsEditable(true);
    setChatMessages([]); // Reset chat
    try {
      const base64DataUri = await urlToBase64(url);
      if (!isMounted.current) return;
      setSelectedImage(base64DataUri);
      setStep('EDIT');
    } catch (e: any) {
      if (!isMounted.current) return;
      if (e.message === 'CORS_ERROR' || e.message === 'TIMEOUT' || e.message === 'URL_IS_HTML') {
         // Fallback: If we can't download it (CORS/Proxy fail), keep the URL and let Cloudinary try backend upload
         setSelectedImageUrl(url); 
         setSelectedImage(null); 
         setIsEditable(false); 
         setStep('EDIT');
      } else { 
         setError("Kunde inte ladda bilden."); 
      }
    } finally { 
        if (isMounted.current) setIsLoading(false); 
    }
  };

  const handleChipClick = (index: number) => {
      const newChips = [...searchChips];
      newChips[index].active = !newChips[index].active;
      setSearchChips(newChips);
      const newQuery = newChips.filter(c => c.active).map(c => c.label).join(' ');
      setCustomSearchQuery(newQuery);
      performSearch(newQuery);
  };

  const handleStandardGenerate = async () => {
      setIsLoading(true);
      setError(null);
      setSelectedImage(null);
      setSelectedImageUrl(null);
      
      try {
          // Immediately generate image from scratch
          const generatedBase64 = await generateProductImage(product.product_name);
          if (!isMounted.current) return;
          
          setSelectedImage(generatedBase64);
          setStep('EDIT');
          setIsEditable(true);
          setChatMessages([{ role: 'model', text: 'Här är en nyskapad studiobild av produkten.' }]);

      } catch (err: any) {
          if (isMounted.current) setError("Kunde inte generera bild. Försök igen.");
      } finally {
          if (isMounted.current) setIsLoading(false);
      }
  };

  const handleStandardPolish = () => {
      // "Magic Button" prompt
      const STANDARD_POLISH_PROMPT = "Professional studio retouch. Pure white background, soft commercial lighting, realistic soft shadows under the object. Remove any text, logos or watermarks. Make the product look fresh and high quality. No text overlay.";
      handleSendMessage(STANDARD_POLISH_PROMPT);
  };

  const handleUploadClick = () => { fileInputRef.current?.click(); };
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      const result = event.target?.result as string;
      if(isMounted.current) {
          setSelectedImage(result); setSelectedImageUrl(null); setStep('EDIT'); setIsEditable(true);
          setChatMessages([]);
      }
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const handleSendMessage = async (directPrompt?: string) => {
    const textToSend = directPrompt || chatInput;
    if (!textToSend.trim()) return;
    if (!directPrompt) { setChatMessages(prev => [...prev, { role: 'user', text: textToSend }]); setChatInput(''); }
    else { setChatMessages(prev => [...prev, { role: 'user', text: '🪄 Applicerar studio-retuschering...' }]); }
    
    setIsLoading(true);
    try {
      const newImageBase64 = await editProductImage(selectedImage, textToSend);
      if (!isMounted.current) return;
      
      if (newImageBase64) {
         setSelectedImage(newImageBase64); setSelectedImageUrl(null); setIsEditable(true); 
         setChatMessages(prev => [...prev, { role: 'model', text: 'Klar! Hur ser det ut?', image: newImageBase64, isImageGeneration: true }]);
      } else {
         setChatMessages(prev => [...prev, { role: 'model', text: 'Kunde inte generera bild. Prova igen.' }]);
      }
    } catch (err) { 
        if (isMounted.current) setChatMessages(prev => [...prev, { role: 'model', text: 'Något gick fel.' }]); 
    } finally { 
        if (isMounted.current) setIsLoading(false); 
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
        if(isMounted.current) onComplete(finalUrl);
    } catch (e) { 
        if (isMounted.current) { setError('Kunde inte spara bilden.'); setIsSaving(false); }
    }
  };

  // Zoom handlers
  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!imageContainerRef.current || isZoomLocked) return;
    const { left, top, width, height } = imageContainerRef.current.getBoundingClientRect();
    const x = ((e.clientX - left) / width) * 100;
    const y = ((e.clientY - top) / height) * 100;
    setZoomState({ show: true, x, y });
  };

  const handleMouseEnter = () => {
      if (!isZoomLocked) setZoomState(prev => ({ ...prev, show: true }));
  };

  const handleMouseLeave = () => {
      if (!isZoomLocked) setZoomState(prev => ({ ...prev, show: false }));
  };

  const toggleZoomLock = (e: React.MouseEvent) => {
      e.stopPropagation(); // Prevent bubbling if necessary
      if (isZoomLocked) {
          setIsZoomLocked(false);
          setZoomState(prev => ({ ...prev, show: false }));
      } else {
          // Snap to center or keep current position if hovering
          setIsZoomLocked(true);
          setZoomState(prev => ({ ...prev, show: true }));
      }
  };

  const handleTemplateSelect = (template: typeof TEMPLATES[0]) => {
    setSelectedImage(null); setSelectedImageUrl(null); setStep('EDIT'); setIsEditable(true);
    setChatMessages([{ role: 'model', text: `Skapar bild med mall: ${template.label}...` }]);
    handleSendMessage(`Create a ${template.prompt} of a product named "${product.product_name}".`);
  };

  if (step === 'SEARCH' || step === 'TEMPLATES') {
    return (
      <div className="flex flex-col h-full bg-stone-50/50">
        <div className="mb-2 px-4 py-4 bg-white border-b border-stone-200 sticky top-0 z-10 shadow-sm">
           <div className="flex justify-between items-start">
               <div>
                   <h3 className="text-lg md:text-2xl font-bold text-emerald-950 leading-tight serif-font">{product.product_name}</h3>
                   <div className="flex flex-wrap items-center gap-2 md:gap-3 mt-1.5">
                        {product.brand && (
                                <span className="bg-amber-100 text-amber-900 text-[10px] font-bold px-2 py-0.5 rounded uppercase tracking-widest border border-amber-200">
                                    {product.brand}
                                </span>
                        )}
                        <p className="text-stone-500 text-xs md:text-sm truncate max-w-lg">{product.description}</p>
                   </div>
               </div>
               <div className="text-right hidden sm:block">
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
                    
                    {/* STANDARD MAGIC BUTTON */}
                    <div 
                        onClick={handleStandardGenerate} 
                        className="aspect-square bg-gradient-to-br from-emerald-50 to-emerald-100 border-2 border-emerald-300 hover:border-emerald-500 rounded-xl flex flex-col items-center justify-center text-emerald-800 cursor-pointer transition-all group shadow-sm hover:shadow-md relative overflow-hidden"
                    >
                         <div className="absolute inset-0 bg-white/50 opacity-0 group-hover:opacity-100 transition-opacity"></div>
                         <div className="relative z-10 flex flex-col items-center text-center p-2">
                             <div className="bg-white p-3 rounded-full shadow-sm mb-2 group-hover:scale-110 transition-transform text-emerald-600">
                                 <Sparkles size={24} className="fill-emerald-100" />
                             </div>
                             <span className="text-sm font-bold leading-tight">Skapa<br/>Studiobild</span>
                             <span className="text-[10px] text-emerald-600 mt-1 uppercase font-bold tracking-wide">AI Auto</span>
                         </div>
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

        <div className="mt-auto p-3 md:p-4 border-t border-stone-200 flex justify-between gap-4 bg-white sticky bottom-0 z-20 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)]">
           <div className="flex gap-2">
               <button onClick={onPrevious} className="flex items-center gap-2 text-stone-500 hover:text-stone-800 px-3 md:px-4 py-2.5 bg-stone-100 hover:bg-stone-200 rounded-lg text-xs md:text-sm font-bold transition-colors">
                 <ChevronLeft size={18} /> <span className="hidden sm:inline">Föregående</span>
               </button>
               <button onClick={onSkip} className="flex items-center gap-2 text-stone-500 hover:text-stone-800 px-3 md:px-4 py-2.5 bg-stone-100 hover:bg-stone-200 rounded-lg text-xs md:text-sm font-bold transition-colors">
                 <SkipForward size={18} /> <span className="hidden sm:inline">Hoppa över</span>
               </button>
           </div>
           {step === 'SEARCH' && (
             <button onClick={() => performSearch()} disabled={isLoading} className="flex items-center gap-2 text-emerald-700 hover:text-emerald-900 text-sm font-bold">
                <RefreshCw size={16} className={isLoading ? 'animate-spin' : ''} /> <span className="hidden sm:inline">Ladda fler</span>
             </button>
           )}
        </div>
      </div>
    );
  }

  // --- EDIT VIEW ---
  const displayImage = selectedImageUrl || selectedImage;
  return (
    <div className="flex flex-col h-full bg-stone-50/50">
      
      {/* GALLERY STRIP */}
      <div className="bg-white border-b border-stone-200 p-3 shadow-sm z-10">
          <div className="flex items-center gap-3 overflow-x-auto pb-1 custom-scrollbar" ref={galleryScrollRef}>
              <span className="text-[10px] font-bold text-stone-400 uppercase tracking-widest shrink-0 mr-1">Galleri</span>
              {searchResults.map((res, idx) => (
                  <ImageResultItem 
                      key={`thumb-${idx}`} 
                      res={res} 
                      idx={idx} 
                      isSelected={res.url === selectedImageUrl} 
                      onClick={() => handleImageSelect(res.url)} 
                      small={true}
                  />
              ))}
              <button 
                  onClick={() => performSearch()} 
                  disabled={isLoading}
                  className="w-20 h-20 shrink-0 bg-stone-50 border border-stone-200 hover:border-emerald-400 hover:bg-emerald-50 rounded-xl flex flex-col items-center justify-center text-stone-400 hover:text-emerald-600 transition-colors gap-1"
              >
                  <RefreshCw size={16} className={isLoading ? 'animate-spin' : ''} />
                  <span className="text-[10px] font-bold">Fler</span>
              </button>
          </div>
      </div>

      <div className="flex-1 flex flex-col md:flex-row gap-4 md:gap-6 overflow-hidden p-4 md:p-6">
        {/* IMAGE PREVIEW WITH ZOOM */}
        <div 
           ref={imageContainerRef}
           className={`h-64 shrink-0 md:h-auto md:flex-1 bg-white rounded-2xl flex items-center justify-center p-4 md:p-8 relative overflow-hidden shadow-sm border border-stone-200 group transition-colors ${zoomState.show ? 'cursor-zoom-in' : ''}`}
           onMouseMove={handleMouseMove}
           onMouseEnter={handleMouseEnter}
           onMouseLeave={handleMouseLeave}
           onClick={toggleZoomLock}
        >
           <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/cubes.png')] opacity-[0.03] pointer-events-none"></div>
           
           {displayImage ? (
             <>
                <img 
                    src={displayImage} 
                    className="w-full h-full object-contain drop-shadow-2xl z-10" 
                    alt="Selected" 
                    style={{
                        transformOrigin: zoomState.show ? `${zoomState.x}% ${zoomState.y}%` : 'center center',
                        transform: zoomState.show ? 'scale(2)' : 'scale(1)',
                        // Snappy transition when panning (zoomed), smooth when resetting
                        transition: zoomState.show ? 'transform 0.1s ease-out' : 'transform 0.4s ease-out'
                    }}
                />
                
                {/* Zoom Hint Overlay */}
                {!zoomState.show && (
                    <div className="absolute top-4 right-4 bg-white/90 p-2 rounded-full shadow-sm text-stone-400 pointer-events-none z-20">
                        <ZoomIn size={16} />
                    </div>
                )}
             </>
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
            <button onClick={() => setStep('SEARCH')} className="text-xs text-stone-400 hover:text-emerald-700 font-medium transition-colors">Visa alla (Grid)</button>
          </div>
          
          <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-white custom-scrollbar" ref={scrollRef}>
            {chatMessages.length === 0 && (
                <div className="text-center text-stone-400 py-10">
                    <Sparkles className="w-12 h-12 mx-auto mb-3 opacity-20" />
                    <p className="text-sm">Välj en åtgärd nedan eller skriv vad du vill fixa.</p>
                </div>
            )}
            {chatMessages.map((msg, i) => (
              <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[90%] p-3 rounded-2xl text-sm leading-relaxed shadow-sm ${msg.role === 'user' ? 'bg-emerald-900 text-white rounded-br-none' : 'bg-stone-100 text-stone-800 rounded-bl-none border border-stone-100'}`}>
                  {msg.text}
                </div>
              </div>
            ))}
            {isLoading && <div className="flex justify-start"><div className="bg-stone-50 p-3 rounded-2xl rounded-bl-none text-stone-500 flex items-center gap-2"><Loader2 className="animate-spin w-4 h-4 text-emerald-600" /><span className="text-xs font-medium">Jobbar...</span></div></div>}
          </div>
          
          {/* QUICK ACTIONS */}
          <div className="px-4 py-2 border-t border-stone-100 flex gap-2 overflow-x-auto">
             <button 
                onClick={handleStandardPolish}
                disabled={isLoading || !isEditable}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-50 border border-emerald-200 rounded-lg text-emerald-800 text-xs font-bold whitespace-nowrap hover:bg-emerald-100 transition-colors"
             >
                <Camera size={14} /> 📸 Studio-fix <Tooltip text="Gör bakgrunden vit, ta bort text och fixa ljuset automatiskt." />
             </button>
             <button 
                onClick={() => handleSendMessage("Remove background and make it pure white")}
                disabled={isLoading || !isEditable}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-stone-50 border border-stone-200 rounded-lg text-stone-600 text-xs font-medium whitespace-nowrap hover:bg-stone-100 transition-colors"
             >
                <div className="w-3 h-3 border border-stone-400 bg-white rounded-sm"></div> Vit bakgrund
             </button>
          </div>

          <div className="p-3 bg-stone-50 border-t border-stone-200">
            <div className="flex gap-2 relative">
              <input type="text" value={chatInput} disabled={!isEditable || isLoading} onChange={(e) => setChatInput(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleSendMessage()} placeholder="T.ex. 'Ta bort texten'" className="flex-1 bg-white border border-stone-300 rounded-lg pl-3 pr-10 py-3 text-sm focus:border-emerald-500 outline-none disabled:bg-stone-100 shadow-sm" />
              <button onClick={() => handleSendMessage()} disabled={!isEditable || isLoading || !chatInput.trim()} className="absolute right-1.5 top-1.5 bottom-1.5 bg-emerald-900 text-white p-2 rounded-md hover:bg-emerald-800 disabled:opacity-0 transition-all"><ArrowRight size={16} /></button>
            </div>
          </div>
        </div>
      </div>

      <div className="mt-auto p-3 md:p-4 border-t border-stone-200 flex justify-between items-center bg-white sticky bottom-0 z-20">
        <button onClick={() => setStep('SEARCH')} disabled={isSaving} className="text-stone-400 hover:text-emerald-900 text-xs md:text-sm font-bold flex items-center gap-2 transition-colors uppercase tracking-wide">
          <ChevronLeft size={16} /> Tillbaka
        </button>
        <button onClick={finalizeImage} disabled={!displayImage || isSaving} className="flex items-center gap-2 bg-amber-500 hover:bg-amber-600 text-white px-6 md:px-8 py-3 rounded-lg font-bold shadow-lg shadow-amber-200 transition-all hover:-translate-y-0.5 disabled:opacity-50 disabled:shadow-none min-w-[140px] md:min-w-[160px] justify-center text-sm md:text-base">
            {isSaving ? <><Loader2 className="animate-spin" size={18} /> Sparar...</> : <>Spara & Nästa <ArrowRight size={18} /></>}
        </button>
      </div>
    </div>
  );
};

export default ImageWorkflow;