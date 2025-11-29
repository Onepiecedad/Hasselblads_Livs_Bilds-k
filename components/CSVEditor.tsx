import React, { useState, useRef, useEffect } from 'react';
import { Product } from '../types';
import { Upload, Trash2, Plus, CheckCircle, Image as ImageIcon, FileText, RefreshCw, Search, AlertCircle, X, Edit3 } from 'lucide-react';
import { parseCSVString, parseCSVLine, detectSeparator } from '../utils/csvParser';
import { Tooltip } from './Tooltip';

interface CSVEditorProps {
  onConfirm: (products: Product[], mergeMode: boolean) => void;
  isMergeMode?: boolean;
  initialProducts?: Product[];
}

const CSVEditor: React.FC<CSVEditorProps> = ({ onConfirm, isMergeMode = false, initialProducts }) => {
  const [products, setProducts] = useState<Product[]>([]);
  const [headers, setHeaders] = useState<string[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
      if (initialProducts && initialProducts.length > 0) {
          setProducts(initialProducts);
          // Try to restore headers from the first product's csvData if available
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
    setProducts(prev => [newProduct, ...prev]); // Add to top
    setSearchTerm(''); // Clear search to show the new item
  };

  const filteredProducts = products.filter(p => 
    p.product_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (p.brand && p.brand.toLowerCase().includes(searchTerm.toLowerCase())) ||
    (p.csvData && Object.values(p.csvData).some((v: any) => String(v).toLowerCase().includes(searchTerm.toLowerCase())))
  );

  // --- UPLOAD STATE ---
  if (products.length === 0 && !initialProducts) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-6 md:p-10 bg-white rounded-2xl shadow-sm border border-stone-200 animate-in fade-in zoom-in-95 duration-300">
        <div className={`w-24 h-24 rounded-full flex items-center justify-center mb-6 shadow-sm border ${isMergeMode ? 'bg-purple-50 text-purple-600 border-purple-100' : 'bg-emerald-50 text-emerald-800 border-emerald-100'}`}>
          {isMergeMode ? <RefreshCw size={48} /> : <Upload size={48} />}
        </div>
        <h2 className="text-3xl md:text-4xl font-bold text-emerald-950 mb-4 serif-font text-center">
            {isMergeMode ? 'Uppdatera Sortiment' : 'Importera Grunddata'}
        </h2>
        <p className="text-stone-500 mb-10 text-center max-w-md text-base md:text-lg leading-relaxed">
            {isMergeMode 
                ? 'Ladda upp en ny CSV. Appen matchar mot Artikelnummer/Namn och bevarar dina bilder.' 
                : 'Ladda upp din produktlista (CSV) för att starta en ny databas.'
            }
        </p>
        
        <div className="flex flex-col gap-4 w-full max-w-sm">
            <button onClick={() => fileInputRef.current?.click()} className={`flex items-center justify-center gap-3 text-white font-bold py-4 px-6 rounded-xl transition-all shadow-xl hover:-translate-y-1 ${isMergeMode ? 'bg-purple-700 hover:bg-purple-800 shadow-purple-200' : 'bg-emerald-900 hover:bg-emerald-800 shadow-emerald-200'}`}>
                <Upload size={24} className="text-amber-400" /> Välj CSV-fil
            </button>
            {!isMergeMode && (
                <button onClick={loadDemoData} className="bg-white border-2 border-stone-200 hover:border-emerald-500 text-stone-600 hover:text-emerald-900 font-bold py-4 px-6 rounded-xl transition-all flex items-center justify-center gap-3">
                    <FileText size={20} /> Ladda Demodata
                </button>
            )}
            {isMergeMode && <button onClick={() => window.location.reload()} className="text-stone-400 hover:text-stone-600 text-sm mt-2 font-medium">Avbryt</button>}
        </div>
        <input type="file" accept=".csv" ref={fileInputRef} className="hidden" onChange={handleFileUpload} />
        
        <div className="mt-8 text-xs text-stone-400 flex items-center gap-2 bg-stone-50 px-3 py-2 rounded-lg border border-stone-100">
             <AlertCircle size={14} /> Tips: Se till att filen är sparad som CSV (UTF-8)
        </div>
      </div>
    );
  }

  // --- EDITOR / PREVIEW STATE ---
  return (
    <div className="flex flex-col h-full bg-white rounded-2xl shadow-xl border border-stone-200 overflow-hidden animate-in slide-in-from-bottom-4 duration-500">
      {/* TOOLBAR */}
      <div className="p-4 md:p-6 border-b border-stone-100 flex flex-col md:flex-row justify-between items-center gap-4 bg-stone-50">
        <div className="flex items-center gap-4 w-full md:w-auto">
             <div className="w-12 h-12 bg-white rounded-xl shadow-sm border border-stone-200 flex items-center justify-center text-emerald-800">
                 {initialProducts ? <Edit3 size={24} /> : <FileText size={24} />}
             </div>
             <div>
                <h2 className="text-xl font-bold text-emerald-950 serif-font flex items-center gap-2">
                    {initialProducts ? 'Redigera Lista' : isMergeMode ? 'Granska Uppdatering' : 'Förhandsgranska'}
                    <span className="bg-emerald-100 text-emerald-800 text-[10px] px-2 py-0.5 rounded-full uppercase tracking-wider font-bold">
                        {products.length} st
                    </span>
                </h2>
                <p className="text-xs text-stone-500 font-medium">
                    {initialProducts ? 'Ändra data direkt i tabellen.' : 'Kontrollera att kolumnerna hamnat rätt.'}
                </p>
             </div>
        </div>

        <div className="flex items-center gap-3 w-full md:w-auto">
            <div className="relative flex-1 md:w-64">
                <Search size={16} className="absolute left-3 top-3 text-stone-400" />
                <input 
                    type="text" 
                    placeholder="Sök produkt..." 
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="w-full bg-white border border-stone-300 rounded-xl pl-9 pr-8 py-2.5 text-sm focus:border-emerald-500 focus:ring-1 focus:ring-emerald-200 outline-none transition-all"
                />
                {searchTerm && (
                    <button onClick={() => setSearchTerm('')} className="absolute right-3 top-3 text-stone-400 hover:text-stone-600">
                        <X size={14} />
                    </button>
                )}
            </div>
            
            <div className="h-8 w-px bg-stone-300 mx-2 hidden md:block"></div>

            <button onClick={() => initialProducts ? onConfirm(products, false) : setProducts([])} className="text-stone-500 hover:text-emerald-900 px-4 py-2 font-bold text-sm transition-colors whitespace-nowrap">
                {initialProducts ? 'Avbryt' : 'Avbryt'}
            </button>
            <button onClick={() => onConfirm(products, isMergeMode)} className={`flex items-center gap-2 text-white py-2.5 px-6 rounded-xl font-bold transition-all shadow-md hover:-translate-y-0.5 whitespace-nowrap ${isMergeMode ? 'bg-purple-600 hover:bg-purple-700' : 'bg-emerald-900 hover:bg-emerald-800'}`}>
                <CheckCircle size={18} className="text-amber-400" /> 
                <span>{initialProducts ? 'Spara Ändringar' : (isMergeMode ? 'Uppdatera' : 'Starta')}</span>
            </button>
        </div>
      </div>

      {/* TABLE */}
      <div className="overflow-auto flex-1 bg-white custom-scrollbar">
        <table className="w-full text-left text-sm border-collapse min-w-[800px]">
          <thead className="bg-white sticky top-0 z-20 shadow-sm ring-1 ring-black/5">
            <tr>
              <th className="p-4 font-bold text-stone-500 bg-stone-50/95 backdrop-blur border-b border-stone-200 w-16 text-center">#</th>
              {['Art.Nr', 'Produktnamn', 'Varumärke', 'Beskrivning', 'Bilder', ''].map((h, i) => (
                  <th key={i} className="p-4 font-bold text-emerald-900 bg-stone-50/95 backdrop-blur border-b border-stone-200 uppercase text-xs tracking-wider">
                      {h} {h === 'Produktnamn' && <span className="text-red-500">*</span>}
                  </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-stone-100">
            {filteredProducts.length === 0 ? (
                <tr>
                    <td colSpan={7} className="p-12 text-center text-stone-400 italic">
                        Inga produkter matchade din sökning.
                    </td>
                </tr>
            ) : filteredProducts.map((product, idx) => {
              const artNr = product.csvData ? (product.csvData['Artikelnummer'] || product.csvData['sku'] || product.csvData['Art.nr'] || '-') : '-';
              const hasName = product.product_name && product.product_name.trim().length > 0;
              
              return (
                <tr key={product.id} className="hover:bg-amber-50/30 group transition-colors">
                  <td className="p-4 text-stone-400 text-xs font-mono text-center pt-5">{idx + 1}</td>
                  <td className="p-4 font-mono text-stone-500 text-xs align-top pt-5">{artNr}</td>
                  <td className="p-4 align-top">
                      <textarea 
                        value={product.product_name || ''} 
                        onChange={(e) => updateProduct(product.id, 'product_name', e.target.value)} 
                        rows={2} 
                        placeholder="Saknar namn..."
                        className={`w-full bg-transparent focus:bg-white border focus:ring-4 focus:ring-emerald-50 rounded-lg p-2 outline-none font-bold text-stone-800 resize-none transition-all ${!hasName ? 'border-red-300 bg-red-50' : 'border-transparent focus:border-emerald-300'}`} 
                      />
                  </td>
                  <td className="p-4 align-top">
                      <input 
                        type="text" 
                        value={product.brand || ''} 
                        onChange={(e) => updateProduct(product.id, 'brand', e.target.value)} 
                        className="w-full bg-transparent focus:bg-white border-transparent focus:border-emerald-300 focus:ring-4 focus:ring-emerald-50 rounded-lg p-2 outline-none text-emerald-700 font-medium placeholder-stone-300" 
                        placeholder="-" 
                      />
                  </td>
                  <td className="p-4 align-top">
                      <textarea 
                        value={product.description || ''} 
                        onChange={(e) => updateProduct(product.id, 'description', e.target.value)} 
                        rows={2} 
                        className="w-full bg-transparent focus:bg-white border-transparent focus:border-emerald-300 focus:ring-4 focus:ring-emerald-50 rounded-lg p-2 outline-none text-stone-500 resize-none placeholder-stone-300" 
                        placeholder="Ingen beskrivning"
                      />
                  </td>
                  <td className="p-4 align-top">
                      <div className="flex -space-x-3 hover:space-x-1 transition-all pt-1">
                          {product.initialImages && product.initialImages.length > 0 ? (
                              product.initialImages.slice(0, 3).map((img, i) => <img key={i} src={img} className="w-10 h-10 rounded-full border-2 border-white shadow-md object-cover bg-stone-200" alt="" />)
                          ) : <div className="w-10 h-10 rounded-full bg-stone-100 flex items-center justify-center text-stone-300 border-2 border-white"><ImageIcon size={16} /></div>}
                      </div>
                  </td>
                  <td className="p-4 text-center align-top pt-5">
                      <button onClick={() => removeProduct(product.id)} className="text-stone-300 hover:text-red-500 transition-colors p-2 rounded-lg hover:bg-red-50" title="Ta bort rad">
                          <Trash2 size={18} />
                      </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="p-3 bg-stone-50 border-t border-stone-200 flex justify-center">
          <button onClick={addRow} className="flex items-center gap-2 text-emerald-800 hover:text-emerald-950 font-bold text-xs uppercase tracking-widest px-4 py-2 rounded-lg hover:bg-emerald-100/50 transition-colors">
              <Plus size={16} /> Lägg till produkt manuellt
          </button>
      </div>
    </div>
  );
};

export default CSVEditor;