
import React from 'react';
import { ProcessedProduct } from '../types';
import { Download, CheckCircle, RefreshCcw, AlertTriangle, Cloud, ArrowRight, Package } from 'lucide-react';

interface ExportViewProps {
  products: ProcessedProduct[];
  onReset: () => void;
}

const ExportView: React.FC<ExportViewProps> = ({ products, onReset }) => {
  const completedCount = products.filter(p => p.status === 'completed').length;
  const failedCount = products.filter(p => p.status === 'failed' || p.status === 'pending').length;
  const cloudCount = products.filter(p => p.finalImageUrl?.includes('cloudinary.com')).length;
  const localCount = products.filter(p => p.finalImageUrl?.startsWith('data:')).length;

  const downloadCSV = () => {
    if (products.length === 0) return;
    const sample = products[0];
    const internalKeys = ['id', 'status', 'finalImageUrl', 'originalSearchResultUrl', 'initialImages', 'imageSource', 'cloudinaryUrl', 'processingError', 'prefetchedResults'];
    const headers = Object.keys(sample).filter(k => !internalKeys.includes(k));
    const csvHeaders = [...headers, 'product_image_url'];
    
    const csvRows = products.map(p => {
      const row = headers.map(h => `"${String(p[h] || '').replace(/"/g, '""')}"`);
      row.push(`"${p.cloudinaryUrl || p.finalImageUrl || ''}"`);
      return row.join(',');
    });

    const blob = new Blob([[csvHeaders.join(','), ...csvRows].join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', 'hasselblad_products_updated.csv');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="flex flex-col items-center justify-center h-full bg-white rounded-3xl shadow-xl border border-stone-200 p-8 md:p-12 max-w-5xl mx-auto md:mt-10 animate-in slide-in-from-bottom-8 duration-700">
      
      <div className="relative mb-8">
          <div className="absolute inset-0 bg-emerald-100 rounded-full blur-xl opacity-50 animate-pulse"></div>
          <div className="w-28 h-28 bg-emerald-50 text-emerald-600 rounded-full flex items-center justify-center relative shadow-lg border-4 border-white">
            <CheckCircle size={56} className="drop-shadow-sm" />
          </div>
      </div>

      <h2 className="text-4xl md:text-5xl font-bold text-emerald-950 mb-4 serif-font text-center tracking-tight">Processen är klar</h2>
      <p className="text-stone-500 mb-12 text-center max-w-xl text-lg font-light leading-relaxed">
        Ditt sortiment är nu uppdaterat med nya bilder och all data är redo för att exporteras direkt till WooCommerce.
      </p>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 w-full mb-12">
          <div className="p-8 bg-white rounded-3xl border border-stone-100 text-center shadow-lg shadow-stone-200/50 hover:-translate-y-1 transition-transform duration-300">
              <div className="w-12 h-12 bg-stone-50 rounded-2xl flex items-center justify-center mx-auto mb-4 text-stone-400">
                  <Package size={24} />
              </div>
              <div className="text-5xl font-bold text-stone-800 serif-font mb-2">{completedCount}</div>
              <div className="text-xs text-stone-400 uppercase font-bold tracking-widest">Klara Produkter</div>
          </div>
          
          <div className="p-8 bg-emerald-900 rounded-3xl border border-emerald-800 text-center shadow-xl shadow-emerald-900/20 hover:-translate-y-1 transition-transform duration-300 relative overflow-hidden group">
              <div className="absolute top-0 right-0 p-20 bg-emerald-800 rounded-full blur-2xl -translate-y-1/2 translate-x-1/2 opacity-50 group-hover:opacity-75 transition-opacity"></div>
              <div className="relative z-10">
                  <div className="w-12 h-12 bg-emerald-800 rounded-2xl flex items-center justify-center mx-auto mb-4 text-emerald-200">
                      <Cloud size={24} />
                  </div>
                  <div className="text-5xl font-bold text-white serif-font mb-2 flex items-center justify-center gap-2">
                      {cloudCount} 
                  </div>
                  <div className="text-xs text-emerald-300 uppercase font-bold tracking-widest">Moln-länkar</div>
              </div>
          </div>
          
          <div className={`p-8 rounded-3xl border text-center shadow-lg hover:-translate-y-1 transition-transform duration-300 ${localCount > 0 ? 'bg-amber-50 border-amber-100 shadow-amber-100/50' : 'bg-white border-stone-100 shadow-stone-200/50'}`}>
               <div className={`w-12 h-12 rounded-2xl flex items-center justify-center mx-auto mb-4 ${localCount > 0 ? 'bg-amber-100 text-amber-600' : 'bg-stone-50 text-stone-400'}`}>
                  <AlertTriangle size={24} />
               </div>
               <div className={`text-5xl font-bold serif-font mb-2 ${localCount > 0 ? 'text-amber-600' : 'text-stone-300'}`}>{localCount}</div>
               <div className={`text-xs uppercase font-bold tracking-widest ${localCount > 0 ? 'text-amber-600/70' : 'text-stone-400'}`}>Lokala filer</div>
          </div>
      </div>
      
      {localCount > 0 && (
          <div className="mb-8 p-5 bg-amber-50 border border-amber-200 text-amber-900 text-sm rounded-2xl flex gap-4 items-start max-w-xl shadow-sm">
              <div className="bg-amber-100 p-2 rounded-lg shrink-0 text-amber-600">
                  <AlertTriangle size={20} />
              </div>
              <div>
                  <h4 className="font-bold mb-1">Varning: Lokala bilder</h4>
                  <p className="opacity-90 leading-relaxed">Du har {localCount} bilder som inte är uppladdade till molnet (Base64). Dessa kommer göra din CSV-fil väldigt stor. Konfigurera Cloudinary i inställningarna för att få korrekta URL:er.</p>
              </div>
          </div>
      )}

      {failedCount > 0 && (
          <div className="mb-8 p-5 bg-stone-100 border border-stone-200 text-stone-600 text-sm rounded-2xl flex gap-4 items-start max-w-xl shadow-sm">
              <div className="bg-stone-200 p-2 rounded-lg shrink-0 text-stone-500">
                  <AlertTriangle size={20} />
              </div>
               <div>
                  <h4 className="font-bold mb-1">Ej kompletta produkter</h4>
                  <p className="opacity-90 leading-relaxed">{failedCount} produkter saknar fortfarande bild (hoppades över eller misslyckades). Du kan gå tillbaka och fixa dem manuellt.</p>
              </div>
          </div>
      )}

      <div className="flex flex-col sm:flex-row gap-5 w-full sm:w-auto">
        <button onClick={onReset} className="w-full sm:w-auto flex items-center justify-center gap-2 px-8 py-5 rounded-2xl border-2 border-stone-200 text-stone-500 hover:text-emerald-900 hover:border-emerald-900 font-bold transition-all hover:bg-stone-50">
          <RefreshCcw size={20} /> Tillbaka till start
        </button>
        <button onClick={downloadCSV} className="w-full sm:w-auto flex items-center justify-center gap-3 bg-emerald-900 hover:bg-emerald-800 text-white px-12 py-5 rounded-2xl font-bold shadow-2xl shadow-emerald-900/30 transition-all hover:-translate-y-1 hover:shadow-emerald-900/40 border border-emerald-800 text-lg">
          <Download size={24} className="text-amber-400" /> Ladda ner CSV-fil
        </button>
      </div>
    </div>
  );
};

export default ExportView;
