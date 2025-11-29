import React, { useState, useRef } from 'react';
import { Product } from '../types';
import { Upload, Trash2, Plus, CheckCircle, Image as ImageIcon, FileText, RefreshCw } from 'lucide-react';
import { parseCSVString, parseCSVLine, detectSeparator } from '../utils/csvParser';

interface CSVEditorProps {
  onConfirm: (products: Product[], mergeMode: boolean) => void;
  isMergeMode?: boolean;
}

const CSVEditor: React.FC<CSVEditorProps> = ({ onConfirm, isMergeMode = false }) => {
  const [products, setProducts] = useState<Product[]>([]);
  const [headers, setHeaders] = useState<string[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

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
          id: `demo_${i}`, product_name: d.name, description: d.desc, brand: d.brand, initialImages: d.img ? [d.img] : [],
          'Namn': d.name, 'Beskrivning': d.desc, 'Varumärke': d.brand, 'Bilder': d.img
      })));
  };

  const updateProduct = (id: string, field: string, value: string) => {
    setProducts(prev => prev.map(p => p.id === id ? { ...p, [field]: value } : p));
  };

  const removeProduct = (id: string) => { setProducts(prev => prev.filter(p => p.id !== id)); };

  const addRow = () => {
    const newProduct: any = { id: `new_${Date.now()}`, product_name: 'Ny Produkt', description: '', brand: '', initialImages: [] };
    headers.forEach(h => newProduct[h] = '');
    setProducts([...products, newProduct]);
  };

  if (products.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-10 bg-white rounded-2xl shadow-sm border border-stone-200">
        <div className={`w-20 h-20 rounded-full flex items-center justify-center mb-6 shadow-sm border ${isMergeMode ? 'bg-purple-50 text-purple-600 border-purple-100' : 'bg-emerald-50 text-emerald-800 border-emerald-100'}`}>
          {isMergeMode ? <RefreshCw size={40} /> : <Upload size={40} />}
        </div>
        <h2 className="text-3xl font-bold text-emerald-950 mb-3 serif-font">
            {isMergeMode ? 'Uppdatera Sortiment' : 'Importera Grunddata'}
        </h2>
        <p className="text-stone-500 mb-8 text-center max-w-md">
            {isMergeMode 
                ? 'Ladda upp en ny CSV. Appen matchar mot Artikelnummer/Namn och bevarar dina bilder.' 
                : 'Ladda upp din produktlista (CSV) för att starta en ny databas.'
            }
        </p>
        
        <div className="flex flex-col gap-4 w-full max-w-sm">
            <button onClick={() => fileInputRef.current?.click()} className={`flex items-center justify-center gap-3 text-white font-bold py-4 px-6 rounded-xl transition-all shadow-lg hover:-translate-y-1 ${isMergeMode ? 'bg-purple-700 hover:bg-purple-800 shadow-purple-200' : 'bg-emerald-900 hover:bg-emerald-800 shadow-emerald-200'}`}>
                <Upload size={20} className="text-amber-400" /> Välj CSV-fil
            </button>
            {!isMergeMode && (
                <button onClick={loadDemoData} className="bg-white border-2 border-stone-200 hover:border-emerald-500 text-stone-600 hover:text-emerald-900 font-bold py-4 px-6 rounded-xl transition-all flex items-center justify-center gap-3">
                    <FileText size={20} /> Ladda Demodata
                </button>
            )}
            {isMergeMode && <button onClick={() => window.location.reload()} className="text-stone-400 hover:text-stone-600 text-sm mt-2 font-medium">Avbryt</button>}
        </div>
        <input type="file" accept=".csv" ref={fileInputRef} className="hidden" onChange={handleFileUpload} />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-white rounded-2xl shadow-xl border border-stone-200 overflow-hidden">
      <div className="p-6 border-b border-stone-100 flex flex-col sm:flex-row justify-between items-center gap-4 bg-stone-50">
        <div>
          <h2 className="text-2xl font-bold text-emerald-950 serif-font">{isMergeMode ? 'Granska Uppdatering' : 'Granska Import'}</h2>
          <p className="text-stone-500 font-medium">{products.length} rader hittades.</p>
        </div>
        <div className="flex gap-3">
            <button onClick={() => setProducts([])} className="text-stone-500 hover:text-stone-800 px-4 py-2 font-bold text-sm">AVBRYT</button>
            <button onClick={() => onConfirm(products, isMergeMode)} className={`flex items-center gap-2 text-white py-3 px-8 rounded-xl font-bold transition-all shadow-md hover:-translate-y-0.5 ${isMergeMode ? 'bg-purple-600 hover:bg-purple-700' : 'bg-emerald-900 hover:bg-emerald-800'}`}>
                <CheckCircle size={20} className="text-amber-400" /> {isMergeMode ? 'Slå ihop & Uppdatera' : 'Bekräfta & Spara'}
            </button>
        </div>
      </div>

      <div className="overflow-auto flex-1 bg-white">
        <table className="w-full text-left text-sm border-collapse min-w-[800px]">
          <thead className="bg-stone-50 sticky top-0 z-10 shadow-sm">
            <tr>
              {['Art.Nr', 'Produktnamn', 'Varumärke', 'Beskrivning', 'Bilder', ''].map((h, i) => (
                  <th key={i} className="p-4 font-bold text-emerald-900 border-b border-stone-200 uppercase text-xs tracking-wider">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-stone-100">
            {products.map((product) => (
              <tr key={product.id} className="hover:bg-amber-50/30 group transition-colors">
                <td className="p-4 font-mono text-stone-400 text-xs align-top pt-5">{product['Artikelnummer'] || product['sku'] || '-'}</td>
                <td className="p-4 align-top"><textarea value={product.product_name || ''} onChange={(e) => updateProduct(product.id, 'product_name', e.target.value)} rows={2} className="w-full bg-transparent focus:bg-white border-transparent focus:border-emerald-300 focus:ring-4 focus:ring-emerald-50 rounded-lg p-2 outline-none font-bold text-stone-800 resize-none transition-all" /></td>
                <td className="p-4 align-top"><input type="text" value={product.brand || ''} onChange={(e) => updateProduct(product.id, 'brand', e.target.value)} className="w-full bg-transparent focus:bg-white border-transparent focus:border-emerald-300 focus:ring-4 focus:ring-emerald-50 rounded-lg p-2 outline-none text-emerald-700 font-medium" placeholder="-" /></td>
                <td className="p-4 align-top"><textarea value={product.description || ''} onChange={(e) => updateProduct(product.id, 'description', e.target.value)} rows={2} className="w-full bg-transparent focus:bg-white border-transparent focus:border-emerald-300 focus:ring-4 focus:ring-emerald-50 rounded-lg p-2 outline-none text-stone-500 resize-none" /></td>
                <td className="p-4 align-top">
                    <div className="flex -space-x-3 hover:space-x-1 transition-all pt-1">
                        {product.initialImages && product.initialImages.length > 0 ? (
                            product.initialImages.slice(0, 3).map((img, i) => <img key={i} src={img} className="w-10 h-10 rounded-full border-2 border-white shadow-md object-cover bg-stone-200" />)
                        ) : <div className="w-10 h-10 rounded-full bg-stone-100 flex items-center justify-center text-stone-300 border-2 border-white"><ImageIcon size={16} /></div>}
                    </div>
                </td>
                <td className="p-4 text-center align-top pt-5"><button onClick={() => removeProduct(product.id)} className="text-stone-300 hover:text-red-500 transition-colors"><Trash2 size={18} /></button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="p-4 bg-stone-50 border-t border-stone-200"><button onClick={addRow} className="flex items-center gap-2 text-emerald-800 hover:text-emerald-950 font-bold text-sm uppercase tracking-wide px-2 py-1"><Plus size={18} /> Lägg till rad</button></div>
    </div>
  );
};

export default CSVEditor;