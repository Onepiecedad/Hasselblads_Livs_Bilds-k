
import React, { useState, useRef, useEffect } from 'react';
import { Product } from '../types';
import { Upload, Trash2, Plus, CheckCircle, Image as ImageIcon, FileText, RefreshCw, Search, AlertCircle, X, Edit3, ArrowRight, Sparkles, Loader2, StopCircle } from 'lucide-react';
import { parseCSVString, parseCSVLine, detectSeparator } from '../utils/csvParser';
import { Tooltip } from './Tooltip';
import { generateProductDescription } from '../geminiService';

interface CSVEditorProps {
  onConfirm: (products: Product[], mergeMode: boolean) => void;
  isMergeMode?: boolean;
  initialProducts?: Product[];
  onSelectProduct?: (product: Product) => void;
}

const CSVEditor: React.FC<CSVEditorProps> = ({ onConfirm, isMergeMode = false, initialProducts, onSelectProduct }) => {
  const [products, setProducts] = useState<Product[]>([]);
  const [headers, setHeaders] = useState<string[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  
  // AI Batch State
  const [isGenerating, setIsGenerating] = useState(false);
  const [genProgress, setGenProgress] = useState({ current: 0, total: 0 });
  const abortGenRef = useRef<boolean>(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
      if (initialProducts && initialProducts.length > 0) {
          setProducts(initialProducts);
          if (initialProducts[0].csvData) {
              setHeaders(Object.keys(initialProducts[0].csvData));
          }
      }
  }, [initialProducts]);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => { parseCSV(event.target?.result as string); };
    reader.readAsText(file);
  };

  const parseCSV = (text: string) => {
    const lines = text.split('\n').filter(l => l.trim());
    if (lines.length < 2) return;
    const separator = detectSeparator(lines[0]);
    const headers = parseCSVLine(lines[0], separator);
    setHeaders(headers);
    setProducts(parseCSVString(text));
  };

  const loadDemoData = () => {
      const demoHeaders = ['Namn', 'Beskrivning', 'Varumärke', 'Bilder'];
      const demoData = [
          { name: 'Cannoli 1st', desc: 'Krispig cannoli fylld med kräm.', brand: 'Dolce del sole', img: '' },
          { name: 'Apelsin Bollo', desc: 'Saftiga apelsiner från Bollo, Sydafrika.', brand: 'Bollo', img: '' },
          { name: 'Avokado Idag', desc: 'Ätmogen avokado.', brand: '', img: 'https://hasselbladslivs.se/wp-content/uploads/2025/04/avokado.jpg' },
      ];
      setHeaders(demoHeaders);
      setProducts(demoData.map((d, i) => ({
          id: `demo_${i}`, 
          product_name: d.name, 
          description: d.desc, 
          brand: d.brand, 
          initialImages: d.img ? [d.img] : [],
          csvData: { 'Namn': d.name, 'Beskrivning': d.desc, 'Varumärke': d.brand, 'Bilder': d.img }
      })));
  };

  const updateProduct = (id: string, field: string, value: string, isCsvData: boolean = false) => {
    setProducts(prev => prev.map(p => {
        if (p.id !== id) return p;
        if (isCsvData) {
            return { ...p, csvData: { ...p.csvData, [field]: value } };
        }
        return { ...p, [field]: value as string };
    }));
  };

  const removeProduct = (id: string) => { setProducts(prev => prev.filter(p => p.id !== id)); };

  const addRow = () => {
    const newProduct: Product = { 
        id: `new_${Date.now()}`, 
        product_name: 'Ny Produkt', 
        description: '', 
        brand: '', 
        initialImages: [],
        csvData: {} 
    };
    headers.forEach(h => {
        if(newProduct.csvData) newProduct.csvData[h] = '';
    });
    setProducts(prev => [newProduct, ...prev]); 
    setSearchTerm('');
  };

  const handleBatchGenerateDescriptions = async () => {
      // Find products with empty descriptions
      const targets = products.filter(p => !p.description || p.description.trim().length < 5);
      
      if (targets.length === 0) {
          alert("Alla produkter har redan beskrivningar!");
          return;
      }

      if (!confirm(`Hittade ${targets.length} produkter som saknar (eller har kort) beskrivning. Vill du att AI genererar texter för dessa?`)) {
          return;
      }

      setIsGenerating(true);
      setGenProgress({ current: 0, total: targets.length });
      abortGenRef.current = false;

      // Process sequentially to avoid rate limits
      for (let i = 0; i < targets.length; i++) {
          if (abortGenRef.current) break;

          const p = targets[i];
          setGenProgress({ current: i + 1, total: targets.length });

          try {
              const newDesc = await generateProductDescription(p.product_name, p.brand, p.csvData);
              
              setProducts(prev => prev.map(current => {
                  if (current.id === p.id) {
                      return { ...current, description: newDesc };
                  }
                  return current;
              }));

              // Small delay to be polite to API
              await new Promise(r => setTimeout(r, 500));

          } catch (error) {
              console.error("Failed to generate desc for", p.product_name);
          }
      }

      setIsGenerating(false);
  };

  const cancelGeneration = () => {
      abortGenRef.current = true;
      setIsGenerating(false);
  };

  const filteredProducts = products.filter(p => 
    p.product_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (p.brand && p.brand.toLowerCase().includes(searchTerm.toLowerCase())) ||
    (p.csvData && Object.values(p.csvData).some((v: any) => String(v).toLowerCase().includes(searchTerm.toLowerCase())))
  );

  // --- UPLOAD STATE ---
  if (products.length === 0 && !initialProducts) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-6 md:p-12 bg-white rounded-3xl shadow-xl border border-stone-200 animate-in fade-in zoom-in-95 duration-500">
        <div className={`w-24 h-24 rounded-full flex items-center justify-center mb-8 shadow-lg border-4 border-white ${isMergeMode ? 'bg-purple-100 text-purple-600' : 'bg-emerald-50 text-emerald-800'}`}>
          {isMergeMode ? <RefreshCw size={40} /> : <Upload size={40} />}
        </div>
        <h2 className="text-3xl md:text-5xl font-bold text-emerald-950 mb-6 serif-font text-center tracking-tight">
            {isMergeMode ? 'Uppdatera Sortiment' : 'Importera Grunddata'}
        </h2>
        <p className="text-stone-500 mb-12 text-center max-w-lg text-lg leading-relaxed font-light">
            {isMergeMode 
                ? 'Ladda upp en ny CSV. Appen matchar mot Artikelnummer/Namn och bevarar dina bilder.' 
                : 'Ladda upp din produktlista (CSV) för att starta. Appen analyserar och förbereder din bildstudio.'
            }
        </p>
        
        <div className="flex flex-col gap-4 w-full max-w-md group">
            <button 
                onClick={() => fileInputRef.current?.click()} 
                className={`relative overflow-hidden flex items-center justify-center gap-3 text-white font-bold py-5 px-8 rounded-2xl transition-all shadow-xl hover:-translate-y-1 ${isMergeMode ? 'bg-purple-700 hover:bg-purple-800 shadow-purple-900/20' : 'bg-emerald-900 hover:bg-emerald-800 shadow-emerald-900/20'}`}
            >
                <div className="absolute inset-0 bg-white/10 translate-y-full group-hover:translate-y-0 transition-transform duration-300"></div>
                <Upload size={24} className="text-amber-400 relative z-10" /> 
                <span className="relative z-10 text-lg">Välj CSV-fil från datorn</span>
            </button>
            
            {!isMergeMode && (
                <button onClick={loadDemoData} className="bg-stone-50 hover:bg-white border-2 border-dashed border-stone-300 hover:border-emerald-400 text-stone-500 hover:text-emerald-700 font-bold py-4 px-6 rounded-2xl transition-all flex items-center justify-center gap-3 mt-2">
                    <FileText size={20} /> Ladda exempeldata
                </button>
            )}
            {isMergeMode && <button onClick={() => window.location.reload()} className="text-stone-400 hover:text-stone-600 text-sm mt-4 font-medium">Avbryt</button>}
        </div>
        <input type="file" accept=".csv" ref={fileInputRef} className="hidden" onChange={handleFileUpload} />
        
        <div className="mt-10 text-xs text-stone-400 flex items-center gap-2 bg-stone-50 px-4 py-2 rounded-full border border-stone-100">
             <AlertCircle size={14} /> <span>Tips: Se till att filen är sparad som CSV (UTF-8)</span>
        </div>
      </div>
    );
  }

  // --- EDITOR / PREVIEW STATE ---
  return (
    <div className="flex flex-col h-full bg-white rounded-2xl shadow-xl border border-stone-200 overflow-hidden animate-in slide-in-from-bottom-4 duration-500 relative">
      
      {/* AI PROCESSING MODAL OVERLAY */}
      {isGenerating && (
          <div className="absolute inset-0 z-50 bg-emerald-900/90 backdrop-blur-sm flex items-center justify-center animate-in fade-in duration-300">
              <div className="bg-white p-8 rounded-3xl shadow-2xl max-w-md w-full text-center">
                  <div className="w-16 h-16 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto mb-6 animate-pulse">
                      <Sparkles size={32} />
                  </div>
                  <h3 className="text-2xl font-bold text-emerald-950 mb-2 serif-font">AI Skriver Texter</h3>
                  <p className="text-stone-500 mb-6">Genererar säljande beskrivningar till ditt sortiment...</p>
                  
                  <div className="w-full bg-stone-100 rounded-full h-4 mb-2 overflow-hidden">
                      <div 
                        className="bg-emerald-500 h-full rounded-full transition-all duration-300"
                        style={{ width: `${(genProgress.current / genProgress.total) * 100}%` }}
                      ></div>
                  </div>
                  <div className="flex justify-between text-xs font-bold text-stone-400 uppercase tracking-widest mb-8">
                      <span>{genProgress.current} av {genProgress.total}</span>
                      <span>{Math.round((genProgress.current / genProgress.total) * 100)}%</span>
                  </div>

                  <button onClick={cancelGeneration} className="text-red-500 hover:text-red-700 font-bold text-sm flex items-center justify-center gap-2 mx-auto">
                      <StopCircle size={16} /> Avbryt
                  </button>
              </div>
          </div>
      )}

      {/* TOOLBAR */}
      <div className="p-4 md:p-6 border-b border-stone-100 flex flex-col xl:flex-row justify-between items-center gap-6 bg-stone-50/50 backdrop-blur-md">
        <div className="flex items-center gap-4 w-full xl:w-auto">
             <div className="w-12 h-12 bg-white rounded-xl shadow-sm border border-stone-200 flex items-center justify-center text-emerald-800 shrink-0">
                 {initialProducts ? <Edit3 size={24} /> : <FileText size={24} />}
             </div>
             <div>
                <h2 className="text-xl font-bold text-emerald-950 serif-font flex items-center gap-3">
                    {initialProducts ? 'Redigera Lista' : isMergeMode ? 'Granska Uppdatering' : 'Förhandsgranska'}
                    <span className="bg-emerald-100 text-emerald-800 text-[10px] px-2.5 py-1 rounded-full uppercase tracking-wider font-bold border border-emerald-200">
                        {products.length} rader
                    </span>
                </h2>
                <p className="text-xs text-stone-500 font-medium mt-0.5">
                    {initialProducts ? 'Ändra data direkt i tabellen.' : 'Kontrollera att kolumnerna hamnat rätt.'}
                </p>
             </div>
        </div>

        <div className="flex flex-col sm:flex-row items-center gap-3 w-full xl:w-auto">
            <div className="relative flex-1 w-full sm:w-72 group">
                <Search size={16} className="absolute left-3 top-3.5 text-stone-400 group-focus-within:text-emerald-600 transition-colors" />
                <input 
                    type="text" 
                    placeholder="Sök på namn, art.nr..." 
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="w-full bg-white border border-stone-200 rounded-xl pl-10 pr-10 py-3 text-sm focus:border-emerald-500 focus:ring-4 focus:ring-emerald-50 outline-none transition-all shadow-sm"
                />
                {searchTerm && (
                    <button onClick={() => setSearchTerm('')} className="absolute right-3 top-3.5 text-stone-400 hover:text-stone-600">
                        <X size={14} />
                    </button>
                )}
            </div>
            
            <div className="h-8 w-px bg-stone-200 mx-2 hidden sm:block"></div>

            <div className="flex items-center gap-3 w-full sm:w-auto">
                {/* AI BATCH BUTTON */}
                <button 
                    onClick={handleBatchGenerateDescriptions}
                    className="hidden lg:flex items-center gap-2 bg-white hover:bg-indigo-50 text-indigo-900 border border-indigo-200 hover:border-indigo-300 px-4 py-3 rounded-xl font-bold text-sm transition-all shadow-sm hover:shadow-md whitespace-nowrap group"
                    title="Generera beskrivningar för tomma fält"
                >
                    <Sparkles size={16} className="text-indigo-500 group-hover:scale-110 transition-transform" />
                    <span>AI-Texter</span>
                </button>

                <button onClick={() => initialProducts ? onConfirm(products, false) : setProducts([])} className="text-stone-500 hover:text-stone-800 hover:bg-stone-100 px-5 py-3 rounded-xl font-bold text-sm transition-all whitespace-nowrap">
                    {initialProducts ? 'Avbryt' : 'Rensa'}
                </button>
                <button onClick={() => onConfirm(products, isMergeMode)} className={`flex-1 sm:flex-none flex items-center justify-center gap-2 text-white py-3 px-8 rounded-xl font-bold transition-all shadow-lg hover:-translate-y-0.5 whitespace-nowrap ${isMergeMode ? 'bg-purple-700 hover:bg-purple-800 shadow-purple-900/20' : 'bg-emerald-900 hover:bg-emerald-800 shadow-emerald-900/20'}`}>
                    <CheckCircle size={18} className="text-amber-400" /> 
                    <span>{initialProducts ? 'Spara Ändringar' : (isMergeMode ? 'Uppdatera' : 'Godkänn & Starta')}</span>
                </button>
            </div>
        </div>
      </div>

      {/* TABLE */}
      <div className="overflow-auto flex-1 bg-white custom-scrollbar relative">
        <table className="w-full text-left text-sm border-collapse min-w-[1000px]">
          <thead className="bg-stone-50/95 sticky top-0 z-20 shadow-sm backdrop-blur-sm">
            <tr>
              <th className="p-4 font-bold text-stone-400 border-b border-stone-200 w-16 text-center font-mono text-xs">#</th>
              {['Art.Nr', 'Produktnamn', 'Varumärke', 'Beskrivning', 'Bilder', 'Åtgärd'].map((h, i) => (
                  <th key={i} className="p-4 font-bold text-emerald-900 border-b border-stone-200 uppercase text-[11px] tracking-widest">
                      {h} {h === 'Produktnamn' && <span className="text-red-500">*</span>}
                  </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-stone-100">
            {filteredProducts.length === 0 ? (
                <tr>
                    <td colSpan={7} className="p-20 text-center">
                        <div className="flex flex-col items-center justify-center text-stone-400">
                            <Search size={48} className="mb-4 opacity-20" />
                            <p className="text-lg font-medium">Inga produkter hittades</p>
                            <p className="text-sm">Prova att söka efter något annat.</p>
                        </div>
                    </td>
                </tr>
            ) : filteredProducts.map((product, idx) => {
              const artNr = product.csvData ? (product.csvData['Artikelnummer'] || product.csvData['sku'] || product.csvData['Art.nr'] || '-') : '-';
              const hasName = product.product_name && product.product_name.trim().length > 0;
              
              return (
                <tr key={product.id} className="group transition-colors hover:bg-emerald-50/30">
                  <td className="p-4 text-stone-400 text-xs font-mono text-center pt-5 group-hover:text-emerald-600">{idx + 1}</td>
                  <td className="p-4 font-mono text-stone-500 text-xs align-top pt-5 group-hover:text-stone-800">{artNr}</td>
                  <td className="p-4 align-top w-[25%]">
                      <textarea 
                        value={product.product_name || ''} 
                        onChange={(e) => updateProduct(product.id, 'product_name', e.target.value)} 
                        rows={1} 
                        placeholder="Saknar namn..."
                        className={`w-full bg-transparent border-b border-transparent focus:border-emerald-500 focus:bg-white rounded px-2 py-1 outline-none font-bold text-stone-800 resize-none transition-all min-h-[40px] focus:shadow-sm focus:ring-2 focus:ring-emerald-50 ${!hasName ? 'bg-red-50 border-red-300' : ''}`} 
                      />
                  </td>
                  <td className="p-4 align-top w-[15%]">
                      <input 
                        type="text" 
                        value={product.brand || ''} 
                        onChange={(e) => updateProduct(product.id, 'brand', e.target.value)} 
                        className="w-full bg-transparent border-b border-transparent focus:border-emerald-500 focus:bg-white rounded px-2 py-1 outline-none text-emerald-700 font-medium placeholder-stone-300 focus:shadow-sm focus:ring-2 focus:ring-emerald-50 transition-all" 
                        placeholder="-" 
                      />
                  </td>
                  <td className="p-4 align-top w-[30%]">
                      <textarea 
                        value={product.description || ''} 
                        onChange={(e) => updateProduct(product.id, 'description', e.target.value)} 
                        rows={2} 
                        className="w-full bg-transparent border-b border-transparent focus:border-emerald-500 focus:bg-white rounded px-2 py-1 outline-none text-stone-500 resize-none placeholder-stone-300 text-xs leading-relaxed focus:shadow-sm focus:ring-2 focus:ring-emerald-50 transition-all" 
                        placeholder="Ingen beskrivning"
                      />
                  </td>
                  <td className="p-4 align-top">
                      <div className="flex -space-x-3 hover:space-x-1 transition-all pt-1">
                          {product.initialImages && product.initialImages.length > 0 ? (
                              product.initialImages.slice(0, 3).map((img, i) => (
                                <div key={i} className="relative w-10 h-10 rounded-full border-2 border-white shadow-md overflow-hidden bg-stone-100 hover:scale-110 hover:z-10 transition-transform">
                                    <img src={img} className="w-full h-full object-cover" alt="" />
                                </div>
                              ))
                          ) : <div className="w-10 h-10 rounded-full bg-stone-100 flex items-center justify-center text-stone-300 border-2 border-white"><ImageIcon size={16} /></div>}
                      </div>
                  </td>
                  <td className="p-4 align-top pt-3 text-right">
                      <div className="flex items-center gap-1 justify-end opacity-0 group-hover:opacity-100 transition-opacity">
                        {onSelectProduct && initialProducts && (
                            <button 
                                onClick={() => onSelectProduct(product)}
                                className="bg-emerald-100 text-emerald-700 hover:bg-emerald-200 p-2 rounded-lg transition-colors shadow-sm"
                                title="Öppna produktkort"
                            >
                                <ArrowRight size={16} />
                            </button>
                        )}
                        <button onClick={() => removeProduct(product.id)} className="bg-stone-100 text-stone-400 hover:bg-red-100 hover:text-red-600 p-2 rounded-lg transition-colors shadow-sm" title="Ta bort rad">
                            <Trash2 size={16} />
                        </button>
                      </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="p-4 bg-stone-50 border-t border-stone-200 flex justify-center">
          <button onClick={addRow} className="flex items-center gap-2 text-stone-600 hover:text-emerald-800 font-bold text-xs uppercase tracking-widest px-6 py-3 rounded-xl hover:bg-white border border-transparent hover:border-stone-200 hover:shadow-sm transition-all">
              <Plus size={16} /> Lägg till produkt manuellt
          </button>
      </div>
    </div>
  );
};

export default CSVEditor;
