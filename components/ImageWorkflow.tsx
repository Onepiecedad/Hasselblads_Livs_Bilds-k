
import React, { useState, useEffect, useRef } from 'react';
import { ProcessedProduct, SearchResult, ChatMessage } from '../types';
import { searchProductImages, editProductImage, urlToBase64, generateProductImage } from '../geminiService';
import { uploadToCloudinary, isCloudinaryConfigured } from '../cloudinaryService';
import { TEMPLATES } from '../constants';
import { Image as ImageIcon, Loader2, ArrowRight, SkipForward, AlertCircle, Wand2, RefreshCw, Upload, LayoutTemplate, ImageOff, Search, Save, X, Plus, CheckCircle2, ChevronLeft, Sparkles, Camera, Undo2, Redo2, Grid, MessageSquarePlus, Tag, Info, DollarSign, Package, BarChart } from 'lucide-react';
import { Tooltip } from './Tooltip';

interface ImageWorkflowProps {
  product: ProcessedProduct;
  onComplete: (imageUrl: string, updatedMetadata?: Partial<ProcessedProduct>) => void;
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
            className={`group relative bg-white rounded-xl overflow-hidden cursor-pointer shadow-sm transition-all duration-300 flex-shrink-0 ${
                small ? 'w-20 h-20' : 'aspect-square'
            } ${
                isSelected 
                ? 'ring-[3px] ring-emerald-500 shadow-xl scale-[0.98] z-10' 
                : 'hover:shadow-lg hover:-translate-y-1 hover:ring-2 hover:ring-emerald-100 border border-stone-100'
            }`}
        >
            {!small && (
                <div className={`absolute top-2 right-2 text-white text-[10px] font-bold px-2 py-0.5 rounded-full backdrop-blur-md z-20 transition-all ${isSelected ? 'bg-emerald-600 opacity-100' : 'bg-black/40 opacity-0 group-hover:opacity-100'}`}>
                    #{idx + 1}
                </div>
            )}

            {error ? (
                <div className="w-full h-full flex flex-col items-center justify-center bg-stone-50 text-stone-300">
                    <ImageOff size={small ? 16 : 32} />
                    {!small && <span className="text-[10px] mt-2 font-medium text-stone-400">Bild saknas</span>}
                </div>
            ) : (
                <img 
                    src={res.url} 
                    alt={res.title} 
                    className="w-full h-full object-contain p-2 bg-white" 
                    onError={() => setError(true)}
                    referrerPolicy="no-referrer"
                />
            )}
            {!error && !small && (
                <>
                    <div className="absolute inset-0 bg-emerald-900/0 group-hover:bg-emerald-900/5 transition-colors" />
                    <div className="absolute bottom-0 left-0 right-0 p-3 bg-gradient-to-t from-black/80 to-transparent opacity-0 group-hover:opacity-100 transition-all duration-300 translate-y-2 group-hover:translate-y-0">
                        <p className="text-white text-[10px] font-medium truncate">{res.source}</p>
                    </div>
                </>
            )}
        </div>
    );
};

const ImageWorkflow: React.FC<ImageWorkflowProps> = ({ product, onComplete, onSkip, onPrevious }) => {
  const [step, setStep] = useState<'SEARCH' | 'EDIT' | 'TEMPLATES' | 'GENERATE'>('SEARCH');
  const [lastStep, setLastStep] = useState<'SEARCH' | 'TEMPLATES' | 'GENERATE'>('SEARCH'); 
  
  // IMAGE STATE
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false); 
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [selectedImageUrl, setSelectedImageUrl] = useState<string | null>(null);
  const [hasEdits, setHasEdits] = useState(false); 
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isEditable, setIsEditable] = useState(true);
  const [searchAttempts, setSearchAttempts] = useState(0);
  const [statusMsg, setStatusMsg] = useState('');
  const [customSearchQuery, setCustomSearchQuery] = useState(product.product_name);
  const [searchChips, setSearchChips] = useState<{label: string, active: boolean}[]>([]);
  const [generationPrompt, setGenerationPrompt] = useState('');
  const [history, setHistory] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);

  // DATA FORM STATE
  const [formData, setFormData] = useState({
      product_name: product.product_name || '',
      brand: product.brand || '',
      description: product.description || '',
      sku: product.csvData?.['Artikelnummer'] || product.csvData?.['sku'] || '',
      price: product.csvData?.['Pris'] || product.csvData?.['Regular Price'] || product.csvData?.['Ordinarie pris'] || '',
      sale_price: product.csvData?.['Sale Price'] || product.csvData?.['Rabatterat pris'] || '',
      stock_qty: product.csvData?.['Lagersaldo'] || product.csvData?.['Stock'] || '',
      categories: product.csvData?.['Huvudkategori'] || product.csvData?.['Categories'] || '',
      extra_csv_fields: product.csvData || {}
  });

  const scrollRef = useRef<HTMLDivElement>(null);
  const resultsContainerRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  
  const isMounted = useRef(true);

  useEffect(() => {
    isMounted.current = true;
    return () => { isMounted.current = false; };
  }, []);

  useEffect(() => {
    // 1. Image Init
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
    setGenerationPrompt(`Photorealistic professional studio photography of ${product.product_name}. Pure white background. Soft commercial lighting. 4k resolution. Sharp focus on the product.`);

    const words = product.product_name.split(' ').filter(w => w.length > 1);
    if (product.brand) words.push(product.brand);
    const uniqueChips = [...new Set(words)].map(w => ({ label: w, active: true }));
    setSearchChips(uniqueChips);

    if (initialResults.length === 0 && step === 'SEARCH' && product.status !== 'failed') {
      performSearch(product.product_name);
    }
    
    if (product.finalImageUrl) {
        if (product.finalImageUrl.startsWith('data:')) {
             setSelectedImage(product.finalImageUrl);
             initHistory(product.finalImageUrl);
        } else {
             setSelectedImageUrl(product.finalImageUrl);
        }
    } else {
        setSelectedImage(null);
        setSelectedImageUrl(null);
        setHistory([]);
        setHistoryIndex(-1);
    }
    
    setHasEdits(false);
    setStep('SEARCH'); 
    setLastStep('SEARCH');

    // 2. Form Init
    setFormData({
      product_name: product.product_name || '',
      brand: product.brand || '',
      description: product.description || '',
      sku: product.csvData?.['Artikelnummer'] || product.csvData?.['sku'] || product.csvData?.['Art.nr'] || '',
      price: product.csvData?.['Pris'] || product.csvData?.['Regular Price'] || product.csvData?.['Ordinarie pris'] || '',
      sale_price: product.csvData?.['Sale Price'] || product.csvData?.['Rabatterat pris'] || '',
      stock_qty: product.csvData?.['Lagersaldo'] || product.csvData?.['Stock'] || product.csvData?.['Lagerstatus'] || '',
      categories: product.csvData?.['Huvudkategori'] || product.csvData?.['Categories'] || '',
      extra_csv_fields: product.csvData || {}
    });

  }, [product.id]);

  useEffect(() => {
      const handleKeyDown = (e: KeyboardEvent) => {
          if (document.activeElement?.tagName === 'INPUT' || document.activeElement?.tagName === 'TEXTAREA') return;
          if (step === 'SEARCH' && !isLoading) {
              const num = parseInt(e.key);
              if (!isNaN(num) && num > 0 && num <= searchResults.length) handleImageSelect(searchResults[num - 1].url);
          }
          if (e.key === 'ArrowRight' && !selectedImageUrl && !selectedImage && step === 'SEARCH') onSkip();
          if (e.key === 'ArrowLeft' && !selectedImageUrl && !selectedImage && step === 'SEARCH') onPrevious();
          
          if (step === 'EDIT' && (e.metaKey || e.ctrlKey) && e.key === 'z') {
              e.preventDefault();
              if (e.shiftKey) handleRedo();
              else handleUndo();
          }
      };
      window.addEventListener('keydown', handleKeyDown);
      return () => window.removeEventListener('keydown', handleKeyDown);
  }, [searchResults, selectedImageUrl, selectedImage, step, isLoading, onSkip, onPrevious, historyIndex, history]);

  useEffect(() => { if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight; }, [chatMessages]);

  const changeStep = (newStep: 'SEARCH' | 'EDIT' | 'TEMPLATES' | 'GENERATE') => {
      if (step !== 'EDIT' && newStep !== 'EDIT') {
          setLastStep(newStep as 'SEARCH' | 'TEMPLATES' | 'GENERATE');
      }
      setStep(newStep);
  };

  const handleFormChange = (field: string, value: string) => {
      setFormData(prev => ({ ...prev, [field]: value }));
  };

  const initHistory = (initialImage: string) => {
      setHistory([initialImage]);
      setHistoryIndex(0);
  };

  const pushToHistory = (newImage: string) => {
      const newHistory = history.slice(0, historyIndex + 1);
      newHistory.push(newImage);
      setHistory(newHistory);
      setHistoryIndex(newHistory.length - 1);
      setSelectedImage(newImage);
      setHasEdits(true);
  };

  const handleUndo = () => {
      if (historyIndex > 0) {
          const newIndex = historyIndex - 1;
          setHistoryIndex(newIndex);
          setSelectedImage(history[newIndex]);
          if (newIndex === 0) setHasEdits(false);
      }
  };

  const handleRedo = () => {
      if (historyIndex < history.length - 1) {
          const newIndex = historyIndex + 1;
          setHistoryIndex(newIndex);
          setSelectedImage(history[newIndex]);
          setHasEdits(true);
      }
  };

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
    setHasEdits(false); 
    setIsEditable(true);
    setChatMessages([]);
    try {
      const base64DataUri = await urlToBase64(url);
      if (!isMounted.current) return;
      setSelectedImage(base64DataUri);
      initHistory(base64DataUri);
      setStep('EDIT');
    } catch (e: any) {
      if (!isMounted.current) return;
      if (e.message === 'CORS_ERROR' || e.message === 'TIMEOUT' || e.message === 'URL_IS_HTML') {
         setSelectedImageUrl(url); 
         setSelectedImage(null); 
         setIsEditable(false); 
         setStep('EDIT');
         setHistory([]);
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
      setHasEdits(true); 
      
      try {
          const generatedBase64 = await generateProductImage(product.product_name, generationPrompt);
          if (!isMounted.current) return;
          
          setSelectedImage(generatedBase64);
          initHistory(generatedBase64);
          setStep('EDIT');
          setIsEditable(true);
          setChatMessages([{ role: 'model', text: 'Här är en nyskapad studiobild.' }]);

      } catch (err: any) {
          if (isMounted.current) setError("Kunde inte generera bild. Försök igen.");
      } finally {
          if (isMounted.current) setIsLoading(false);
      }
  };

  const handleStandardPolish = () => {
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
          setSelectedImage(result); 
          setSelectedImageUrl(null); 
          initHistory(result);
          setHasEdits(true);
          setStep('EDIT'); 
          setIsEditable(true);
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
         pushToHistory(newImageBase64);
         setSelectedImageUrl(null); 
         setIsEditable(true); 
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
        let uploadSource = '';
        if (selectedImageUrl && !hasEdits) {
            uploadSource = selectedImageUrl;
        } else {
            uploadSource = selectedImage || selectedImageUrl || '';
        }

        if (uploadSource) {
            if (isCloudinaryConfigured()) {
                try {
                    const cloudUrl = await uploadToCloudinary(uploadSource);
                    finalUrl = cloudUrl; 
                } catch (cloudError) { 
                    console.warn('Cloudinary upload failed, falling back to local.', cloudError);
                    finalUrl = hasEdits ? (selectedImage || '') : (selectedImageUrl || selectedImage || '');
                }
            } else {
                 finalUrl = hasEdits ? (selectedImage || '') : (selectedImageUrl || selectedImage || '');
            }
        }
        
        const updatedCsvData = { ...formData.extra_csv_fields };
        
        if (formData.sku) updatedCsvData['Artikelnummer'] = formData.sku;
        if (formData.price) updatedCsvData['Ordinarie pris'] = formData.price;
        if (formData.sale_price) updatedCsvData['Rabatterat pris'] = formData.sale_price;
        if (formData.stock_qty) updatedCsvData['Lagersaldo'] = formData.stock_qty;
        if (formData.categories) updatedCsvData['Huvudkategori'] = formData.categories;
        
        updatedCsvData['Namn'] = formData.product_name;
        updatedCsvData['Varumärke'] = formData.brand;
        updatedCsvData['Beskrivning'] = formData.description;

        const updatedMetadata: Partial<ProcessedProduct> = {
            product_name: formData.product_name,
            brand: formData.brand,
            description: formData.description,
            csvData: updatedCsvData
        };

        if(isMounted.current) {
             onComplete(finalUrl || product.finalImageUrl || '', updatedMetadata);
        }

    } catch (e) { 
        if (isMounted.current) { setError('Kunde inte spara produkten.'); setIsSaving(false); }
    }
  };

  const handleTemplateSelect = (template: typeof TEMPLATES[0]) => {
    setSelectedImage(null); 
    setSelectedImageUrl(null); 
    setHasEdits(true);
    setHistory([]);
    setHistoryIndex(-1);
    setStep('EDIT'); 
    setIsEditable(true);
    setChatMessages([{ role: 'model', text: `Skapar bild med mall: ${template.label}...` }]);
    handleSendMessage(`Create a ${template.prompt} of a product named "${product.product_name}".`);
  };

  return (
    <div className="flex flex-col h-full bg-stone-50">
      
      {/* GLOBAL HEADER */}
      <div className="p-4 bg-emerald-950 border-b border-emerald-900 flex justify-between items-center text-white shrink-0 sticky top-0 z-30 shadow-md">
          <button onClick={onPrevious} className="flex items-center gap-2 text-emerald-200 hover:text-white transition-colors hover:bg-white/10 px-3 py-1.5 rounded-lg">
              <ChevronLeft size={20} /> <span className="font-bold text-sm hidden md:inline">Föregående</span>
          </button>
          
          <div className="text-center">
              <h3 className="font-bold text-base md:text-lg text-white line-clamp-1 max-w-md serif-font tracking-wide">{formData.product_name || product.product_name}</h3>
              <p className="text-[10px] text-emerald-400 uppercase tracking-widest font-medium">Produktredigering</p>
          </div>

          <div className="flex items-center gap-3">
              <button 
                onClick={onSkip}
                className="text-emerald-300 hover:text-white text-xs font-bold px-3 py-2 rounded-lg hover:bg-white/10 transition-colors"
              >
                  Hoppa över
              </button>
              <button 
                onClick={finalizeImage} 
                disabled={isSaving}
                className={`flex items-center gap-2 px-6 py-2.5 rounded-xl font-bold transition-all shadow-lg ${isSaving ? 'bg-emerald-900 text-emerald-400' : 'bg-white text-emerald-900 hover:bg-emerald-50 hover:-translate-y-0.5'}`}
              >
                  {isSaving ? <Loader2 size={18} className="animate-spin" /> : <Save size={18} />}
                  <span>{isSaving ? 'Sparar...' : 'Spara Allt'}</span>
              </button>
          </div>
      </div>

      <div className="flex-1 overflow-hidden">
          <div className="h-full flex flex-col xl:flex-row">
              
              {/* LEFT COLUMN: IMAGE WORKFLOW (60%) */}
              <div className="flex-1 flex flex-col border-r border-stone-200 bg-white relative">
                 
                 {/* Image Toolbar */}
                 <div className="p-3 border-b border-stone-100 flex items-center justify-center gap-2 bg-stone-50/50 backdrop-blur-md sticky top-0 z-20">
                    <div className="flex bg-white rounded-xl shadow-sm border border-stone-200 p-1">
                        <button onClick={() => changeStep('SEARCH')} className={`px-4 py-2 rounded-lg text-xs font-bold flex items-center gap-2 transition-all ${step === 'SEARCH' ? 'bg-emerald-100 text-emerald-800 shadow-sm' : 'text-stone-500 hover:bg-stone-50'}`}>
                            <Search size={14} /> Sök
                        </button>
                        <button onClick={() => changeStep('GENERATE')} className={`px-4 py-2 rounded-lg text-xs font-bold flex items-center gap-2 transition-all ${step === 'GENERATE' ? 'bg-emerald-100 text-emerald-800 shadow-sm' : 'text-stone-500 hover:bg-stone-50'}`}>
                            <MessageSquarePlus size={14} /> Generera
                        </button>
                        <button onClick={() => changeStep('TEMPLATES')} className={`px-4 py-2 rounded-lg text-xs font-bold flex items-center gap-2 transition-all ${step === 'TEMPLATES' ? 'bg-emerald-100 text-emerald-800 shadow-sm' : 'text-stone-500 hover:bg-stone-50'}`}>
                            <LayoutTemplate size={14} /> Mallar
                        </button>
                        {(selectedImage || selectedImageUrl) && (
                             <button onClick={() => changeStep('EDIT')} className={`px-4 py-2 rounded-lg text-xs font-bold flex items-center gap-2 transition-all ${step === 'EDIT' ? 'bg-emerald-100 text-emerald-800 shadow-sm' : 'text-stone-500 hover:bg-stone-50'}`}>
                                <Wand2 size={14} /> Redigera
                             </button>
                        )}
                    </div>
                    
                    <button onClick={handleUploadClick} className="ml-2 px-4 py-2.5 rounded-xl text-xs font-bold flex items-center gap-2 text-stone-600 bg-white border border-stone-200 hover:border-emerald-300 hover:text-emerald-800 transition-all shadow-sm">
                        <Upload size={14} /> Ladda upp
                        <input type="file" ref={fileInputRef} className="hidden" accept="image/*" onChange={handleFileChange} />
                    </button>
                 </div>

                 {/* Canvas / Workspace */}
                 <div className="flex-1 relative overflow-y-auto bg-stone-50/50 custom-scrollbar">
                    
                    {error && (
                      <div className="mx-4 mt-4 p-4 bg-red-50 text-red-700 rounded-xl flex items-center gap-3 border border-red-100 text-sm shadow-sm animate-in slide-in-from-top-2">
                        <AlertCircle size={18} /> <span className="font-medium">{error}</span>
                      </div>
                    )}

                    {/* VIEW: SEARCH */}
                    {step === 'SEARCH' && (
                        <div className="p-6 md:p-8 pb-20 max-w-5xl mx-auto">
                             <div className="flex gap-3 mb-6">
                                <div className="relative flex-1 group">
                                    <input 
                                        ref={searchInputRef} type="text" value={customSearchQuery}
                                        onChange={(e) => setCustomSearchQuery(e.target.value)}
                                        onKeyDown={(e) => e.key === 'Enter' && performSearch()}
                                        placeholder="Sök produktbilder..."
                                        className="w-full bg-white border border-stone-200 rounded-xl pl-12 pr-4 py-3.5 text-sm font-medium focus:border-emerald-500 focus:ring-4 focus:ring-emerald-50 outline-none transition-all shadow-sm group-hover:border-emerald-300"
                                    />
                                    <Search size={20} className="absolute left-4 top-3.5 text-stone-400 group-focus-within:text-emerald-600 transition-colors" />
                                </div>
                                <button onClick={() => performSearch()} disabled={isLoading} className="bg-emerald-900 hover:bg-emerald-800 text-white px-8 py-3 rounded-xl text-sm font-bold transition-all shadow-lg shadow-emerald-900/10 active:scale-95">
                                    {isLoading ? <Loader2 className="animate-spin" /> : 'Sök'}
                                </button>
                            </div>
                            
                            {/* Chips */}
                            <div className="flex flex-wrap gap-2 mb-8">
                                {searchChips.map((chip, idx) => (
                                    <button key={idx} onClick={() => handleChipClick(idx)}
                                        className={`text-[11px] px-3 py-1.5 rounded-full border transition-all flex items-center gap-1.5 font-bold uppercase tracking-wider ${
                                            chip.active 
                                            ? 'bg-emerald-100 text-emerald-800 border-emerald-200 shadow-sm' 
                                            : 'bg-white text-stone-400 border-stone-100 line-through decoration-stone-400'
                                        }`}
                                    >
                                        {chip.active ? <CheckCircle2 size={12} /> : <X size={12} />} {chip.label}
                                    </button>
                                ))}
                            </div>

                            {/* Grid */}
                            {isLoading && searchResults.length === 0 ? (
                                <div className="flex flex-col items-center justify-center py-20 text-stone-400 animate-in fade-in duration-500">
                                    <div className="relative">
                                        <div className="w-16 h-16 border-4 border-emerald-100 rounded-full animate-spin border-t-emerald-600 mb-6"></div>
                                        <div className="absolute inset-0 flex items-center justify-center">
                                            <Search size={20} className="text-emerald-600" />
                                        </div>
                                    </div>
                                    <p className="text-lg font-medium text-stone-600">Söker efter bilder...</p>
                                    <p className="text-sm text-stone-400">Letar på Google & butiker</p>
                                </div>
                            ) : (
                                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6" ref={resultsContainerRef}>
                                    {searchResults.length === 0 && !isLoading && (
                                        <div className="col-span-full text-center py-20 text-stone-400">
                                            <div className="w-20 h-20 bg-stone-100 rounded-full flex items-center justify-center mx-auto mb-4">
                                                <Search size={32} className="opacity-30" />
                                            </div>
                                            <p className="font-bold text-lg text-stone-500">Inga resultat hittades</p>
                                            <p>Prova att ändra sökorden ovan.</p>
                                        </div>
                                    )}
                                    {searchResults.map((res, idx) => (
                                        <ImageResultItem key={`${res.url}-${idx}`} res={res} idx={idx} isSelected={false} onClick={() => handleImageSelect(res.url)} />
                                    ))}
                                </div>
                            )}
                        </div>
                    )}

                    {/* VIEW: GENERATE */}
                    {step === 'GENERATE' && (
                        <div className="p-8 max-w-2xl mx-auto h-full flex flex-col justify-center">
                            <div className="bg-white p-8 rounded-3xl border border-stone-200 shadow-xl relative overflow-hidden">
                                <div className="absolute top-0 right-0 p-32 bg-emerald-50 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2 opacity-50"></div>
                                
                                <div className="relative z-10">
                                    <div className="flex items-center gap-3 mb-6 text-emerald-900">
                                        <div className="w-10 h-10 bg-emerald-100 rounded-full flex items-center justify-center text-emerald-600">
                                            <Sparkles size={20} />
                                        </div>
                                        <div>
                                            <h3 className="font-bold text-lg serif-font">AI Studio Generator</h3>
                                            <p className="text-xs text-stone-500 uppercase tracking-widest font-bold">Skapa ny bild från text</p>
                                        </div>
                                    </div>
                                    
                                    <textarea 
                                        value={generationPrompt}
                                        onChange={(e) => setGenerationPrompt(e.target.value)}
                                        rows={4}
                                        className="w-full bg-stone-50 border border-stone-200 rounded-2xl p-5 text-sm focus:border-emerald-500 focus:ring-4 focus:ring-emerald-50 outline-none font-medium text-stone-800 mb-6 resize-none shadow-inner"
                                        placeholder="Beskriv bilden du vill skapa..."
                                    />
                                    
                                    <button 
                                        onClick={handleStandardGenerate} 
                                        disabled={isLoading || !generationPrompt.trim()}
                                        className="w-full bg-emerald-900 hover:bg-emerald-800 text-white py-4 rounded-xl font-bold transition-all shadow-lg shadow-emerald-900/20 flex items-center justify-center gap-3 disabled:opacity-70 disabled:shadow-none hover:-translate-y-1 active:scale-95"
                                    >
                                        {isLoading ? <Loader2 size={20} className="animate-spin" /> : <Wand2 size={20} className="text-amber-400" />}
                                        {isLoading ? 'Genererar bild...' : 'Skapa Studiobild'}
                                    </button>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* VIEW: TEMPLATES */}
                    {step === 'TEMPLATES' && (
                        <div className="p-8 grid grid-cols-2 lg:grid-cols-3 gap-6 max-w-5xl mx-auto">
                            {TEMPLATES.map(t => (
                                <div key={t.id} onClick={() => handleTemplateSelect(t)} className="bg-white p-8 rounded-2xl border border-stone-200 hover:border-emerald-500 hover:ring-4 hover:ring-emerald-50 cursor-pointer transition-all flex flex-col items-center text-center group shadow-sm hover:shadow-xl">
                                    <div className="w-16 h-16 bg-stone-50 text-emerald-800 rounded-full flex items-center justify-center mb-6 group-hover:scale-110 group-hover:bg-emerald-100 transition-all duration-300">
                                        <LayoutTemplate size={28} />
                                    </div>
                                    <h4 className="font-bold text-emerald-950 text-lg serif-font mb-2 group-hover:text-emerald-700">{t.label}</h4>
                                    <p className="text-xs text-stone-500 leading-relaxed font-medium">{t.prompt}</p>
                                </div>
                            ))}
                        </div>
                    )}

                    {/* VIEW: EDIT / PREVIEW */}
                    {step === 'EDIT' && (
                        <div className="h-full flex flex-col">
                            <div className="flex-1 bg-[url('https://www.transparenttextures.com/patterns/cubes.png')] bg-stone-100 relative flex items-center justify-center p-8">
                                {(selectedImage || selectedImageUrl) ? (
                                    <div className="relative shadow-2xl shadow-black/10 group rounded-xl overflow-hidden bg-white">
                                        <img 
                                            src={selectedImage || selectedImageUrl || ''} 
                                            className="max-w-full max-h-[50vh] object-contain" 
                                            alt="Editing" 
                                        />
                                        
                                        {/* Overlay controls */}
                                        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex gap-3 z-20">
                                            <button onClick={handleUndo} disabled={historyIndex <= 0} className="p-3 bg-white/90 text-stone-800 rounded-full hover:bg-white disabled:opacity-50 disabled:cursor-not-allowed shadow-lg backdrop-blur-sm border border-stone-100 transition-transform active:scale-90">
                                                <Undo2 size={18} />
                                            </button>
                                            <button onClick={handleStandardPolish} className="px-5 py-3 bg-emerald-900/90 text-white rounded-full hover:bg-emerald-800 font-bold text-xs backdrop-blur-sm flex items-center gap-2 shadow-xl shadow-emerald-900/20 border border-white/10 transition-transform hover:-translate-y-1">
                                                <Wand2 size={14} className="text-amber-400" /> Auto-Fix
                                            </button>
                                            <button onClick={handleRedo} disabled={historyIndex >= history.length - 1} className="p-3 bg-white/90 text-stone-800 rounded-full hover:bg-white disabled:opacity-50 disabled:cursor-not-allowed shadow-lg backdrop-blur-sm border border-stone-100 transition-transform active:scale-90">
                                                <Redo2 size={18} />
                                            </button>
                                        </div>
                                    </div>
                                ) : (
                                    <div className="text-center text-stone-400">
                                        <ImageOff size={48} className="mx-auto mb-2 opacity-30" />
                                        <p>Ingen bild vald</p>
                                    </div>
                                )}
                            </div>
                            
                            {/* Chat Interface */}
                            <div className="h-72 bg-white border-t border-stone-200 flex flex-col shadow-[0_-5px_20px_rgba(0,0,0,0.02)] z-10">
                                <div className="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar bg-stone-50/50" ref={scrollRef}>
                                    {chatMessages.length === 0 && (
                                        <div className="text-center py-8">
                                            <div className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-50 text-emerald-800 rounded-full text-xs font-bold border border-emerald-100 mb-2">
                                                <Sparkles size={12} /> AI Editor
                                            </div>
                                            <p className="text-stone-400 text-sm">Skriv instruktioner för att ändra bilden.</p>
                                            <div className="flex justify-center gap-2 mt-3">
                                                <span className="text-[10px] bg-white border border-stone-200 px-2 py-1 rounded-md text-stone-500">"Ta bort bakgrunden"</span>
                                                <span className="text-[10px] bg-white border border-stone-200 px-2 py-1 rounded-md text-stone-500">"Gör ljusare"</span>
                                            </div>
                                        </div>
                                    )}
                                    {chatMessages.map((msg, i) => (
                                        <div key={i} className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'} animate-in slide-in-from-bottom-2 duration-300`}>
                                            <div className={`max-w-[85%] rounded-2xl px-5 py-3 text-sm shadow-sm leading-relaxed ${
                                                msg.role === 'user' 
                                                ? 'bg-emerald-600 text-white rounded-br-sm' 
                                                : 'bg-white text-stone-800 border border-stone-200 rounded-bl-sm'
                                            }`}>
                                                {msg.text}
                                            </div>
                                        </div>
                                    ))}
                                    {isLoading && (
                                        <div className="flex justify-start animate-in fade-in">
                                            <div className="bg-white border border-stone-200 rounded-2xl rounded-bl-sm px-4 py-3 shadow-sm flex items-center gap-2">
                                                <Loader2 size={14} className="animate-spin text-emerald-600" />
                                                <span className="text-xs font-medium text-stone-500">Arbetar...</span>
                                            </div>
                                        </div>
                                    )}
                                </div>
                                <div className="p-4 bg-white border-t border-stone-100">
                                    <div className="relative group">
                                        <input 
                                            type="text" 
                                            value={chatInput}
                                            onChange={(e) => setChatInput(e.target.value)}
                                            onKeyDown={(e) => e.key === 'Enter' && !isLoading && handleSendMessage()}
                                            placeholder="Beskriv ändring..."
                                            disabled={!isEditable || isLoading}
                                            className="w-full bg-stone-50 border border-stone-200 rounded-xl pl-5 pr-12 py-3.5 text-sm focus:ring-2 focus:ring-emerald-500 focus:bg-white outline-none transition-all placeholder-stone-400 font-medium"
                                        />
                                        <button 
                                            onClick={() => handleSendMessage()}
                                            disabled={!chatInput.trim() || isLoading}
                                            className="absolute right-2 top-2 p-2 bg-emerald-900 text-white rounded-lg hover:bg-emerald-700 disabled:opacity-50 disabled:bg-stone-300 transition-all hover:scale-105 active:scale-95 shadow-md"
                                        >
                                            <ArrowRight size={16} />
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}
                 </div>
              </div>

              {/* RIGHT COLUMN: DATA FORM (40%) */}
              <div className="w-full xl:w-[420px] bg-stone-50/50 border-l border-stone-200 flex flex-col overflow-y-auto custom-scrollbar shadow-2xl z-20">
                  <div className="p-6 border-b border-stone-200 bg-white sticky top-0 z-10 shadow-sm">
                      <h4 className="font-bold text-stone-800 flex items-center gap-2 serif-font text-lg">
                          <Tag size={20} className="text-emerald-600" />
                          Produktkort
                      </h4>
                      <p className="text-xs text-stone-500 mt-1 font-medium">Redigera masterdata för export.</p>
                  </div>

                  <div className="p-6 space-y-8">
                      {/* Basic Info */}
                      <div className="space-y-5">
                          <div className="bg-white p-5 rounded-2xl border border-stone-200 shadow-sm hover:shadow-md transition-shadow group focus-within:ring-2 focus-within:ring-emerald-100">
                              <label className="text-[10px] font-bold text-stone-400 uppercase tracking-widest mb-2 block">Produktnamn</label>
                              <textarea 
                                  value={formData.product_name} 
                                  onChange={(e) => handleFormChange('product_name', e.target.value)}
                                  rows={2}
                                  className="w-full bg-transparent border-none p-0 text-base font-bold text-stone-800 focus:ring-0 outline-none resize-none placeholder-stone-300"
                                  placeholder="Ange produktnamn..."
                              />
                          </div>

                          <div className="grid grid-cols-2 gap-4">
                              <div className="bg-white p-4 rounded-xl border border-stone-200 shadow-sm hover:shadow-md transition-shadow">
                                  <label className="text-[10px] font-bold text-stone-400 uppercase tracking-widest mb-1 block">Art.nr / SKU</label>
                                  <div className="relative">
                                      <Package size={14} className="absolute left-0 top-3 text-emerald-600" />
                                      <input 
                                          type="text" 
                                          value={formData.sku}
                                          onChange={(e) => handleFormChange('sku', e.target.value)}
                                          className="w-full bg-transparent border-none pl-6 py-2 text-sm font-mono font-medium text-stone-700 focus:ring-0 outline-none"
                                          placeholder="-"
                                      />
                                  </div>
                              </div>
                              <div className="bg-white p-4 rounded-xl border border-stone-200 shadow-sm hover:shadow-md transition-shadow">
                                  <label className="text-[10px] font-bold text-stone-400 uppercase tracking-widest mb-1 block">Varumärke</label>
                                  <input 
                                      type="text" 
                                      value={formData.brand}
                                      onChange={(e) => handleFormChange('brand', e.target.value)}
                                      className="w-full bg-transparent border-none p-2 text-sm font-bold text-stone-800 focus:ring-0 outline-none"
                                      placeholder="-"
                                  />
                              </div>
                          </div>
                          
                          <div className="bg-white p-5 rounded-2xl border border-stone-200 shadow-sm hover:shadow-md transition-shadow">
                              <label className="text-[10px] font-bold text-stone-400 uppercase tracking-widest mb-2 block">Beskrivning</label>
                              <textarea 
                                  value={formData.description} 
                                  onChange={(e) => handleFormChange('description', e.target.value)}
                                  rows={6}
                                  className="w-full bg-transparent border-none p-0 text-sm text-stone-600 focus:ring-0 outline-none resize-y leading-relaxed placeholder-stone-300"
                                  placeholder="Skriv en säljande beskrivning..."
                              />
                          </div>
                      </div>

                      <div className="flex items-center gap-4">
                        <div className="h-px bg-stone-200 flex-1"></div>
                        <span className="text-[10px] font-bold text-stone-300 uppercase tracking-widest bg-stone-50 px-2">WooCommerce</span>
                        <div className="h-px bg-stone-200 flex-1"></div>
                      </div>

                      {/* WooCommerce Data */}
                      <div className="space-y-5">
                          <div className="grid grid-cols-2 gap-4">
                              <div className="bg-white p-4 rounded-xl border border-stone-200 shadow-sm relative overflow-hidden">
                                  <label className="text-[10px] font-bold text-stone-400 uppercase tracking-widest mb-1 block">Pris</label>
                                  <div className="flex items-baseline gap-1">
                                      <span className="text-stone-400 text-sm">kr</span>
                                      <input 
                                          type="text" 
                                          value={formData.price}
                                          onChange={(e) => handleFormChange('price', e.target.value)}
                                          className="w-full bg-transparent border-none p-0 text-lg font-bold text-stone-800 focus:ring-0 outline-none"
                                          placeholder="0"
                                      />
                                  </div>
                              </div>
                              <div className="bg-white p-4 rounded-xl border border-amber-200 shadow-sm relative overflow-hidden bg-amber-50/30">
                                  <label className="text-[10px] font-bold text-amber-600/70 uppercase tracking-widest mb-1 block">Rea-pris</label>
                                  <div className="flex items-baseline gap-1">
                                      <span className="text-amber-500 text-sm">kr</span>
                                      <input 
                                          type="text" 
                                          value={formData.sale_price}
                                          onChange={(e) => handleFormChange('sale_price', e.target.value)}
                                          className="w-full bg-transparent border-none p-0 text-lg font-bold text-amber-700 focus:ring-0 outline-none"
                                          placeholder="-"
                                      />
                                  </div>
                              </div>
                          </div>

                          <div className="bg-white p-4 rounded-xl border border-stone-200 shadow-sm">
                              <label className="text-[10px] font-bold text-stone-400 uppercase tracking-widest mb-1 block">Lagersaldo</label>
                              <input 
                                  type="text" 
                                  value={formData.stock_qty}
                                  onChange={(e) => handleFormChange('stock_qty', e.target.value)}
                                  placeholder="Antal..."
                                  className="w-full bg-transparent border-none p-1 text-sm font-medium text-stone-700 focus:ring-0 outline-none"
                              />
                          </div>
                          
                          <div className="bg-white p-4 rounded-xl border border-stone-200 shadow-sm">
                              <label className="text-[10px] font-bold text-stone-400 uppercase tracking-widest mb-1 block">Kategorier</label>
                              <input 
                                  type="text" 
                                  value={formData.categories}
                                  onChange={(e) => handleFormChange('categories', e.target.value)}
                                  placeholder="Kläder > Herr > Skjortor"
                                  className="w-full bg-transparent border-none p-1 text-sm font-medium text-stone-700 focus:ring-0 outline-none"
                              />
                          </div>
                      </div>
                  </div>
              </div>

          </div>
      </div>
    </div>
  );
};

export default ImageWorkflow;
