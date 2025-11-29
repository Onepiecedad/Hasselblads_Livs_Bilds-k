
import React from 'react';
import { ProcessedProduct } from '../types';
import { Download, CheckCircle, RefreshCcw, AlertTriangle, Cloud, ArrowRight } from 'lucide-react';

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
    <div className="flex flex-col items-center justify-center h-full bg-white rounded-2xl shadow-xl border border-stone-200 p-6 md:p-10 max-w-4xl mx-auto md:mt-10">
      <div className="w-24 h-24 bg-emerald-50 text-emerald-600 rounded-full flex items-center justify-center mb-6 shadow-sm border border-emerald-100">
        <CheckCircle size={48} />
      </div>
      <h2 className="text-3xl md:text-4xl font-bold text-emerald-950 mb-3 serif-font text-center">Processen är klar</h2>
      <p className="text-stone-500 mb-10 text-center max-w-lg text-lg">
        Ditt sortiment är nu uppdaterat med nya bilder och redo för WooCommerce.
      </p>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 w-full mb-10">
          <div className="p-6 bg-stone-50 rounded-xl border border-stone-200 text-center">
              <div className="text-4xl font-bold text-emerald-900 serif-font">{completedCount}</div>
              <div className="text-xs text-stone-400 uppercase font-bold tracking-widest mt-1">Behandlade</div>
          </div>
          <div className="p-6 bg-emerald-50 rounded-xl border border-emerald-100 text-center">
              <div className="text-4xl font-bold text-emerald-600 flex items-center justify-center gap-2 serif-font">
                  {cloudCount} <Cloud size={24} className="text-emerald-400" />
              </div>
              <div className="text-xs text-emerald-700/60 uppercase font-bold tracking-widest mt-1">Moln-länkar</div>
          </div>
          <div className="p-6 bg-amber-50 rounded-xl border border-amber-100 text-center">
               <div className="text-4xl font-bold text-amber-600 serif-font">{localCount}</div>
               <div className="text-xs text-amber-700/60 uppercase font-bold tracking-widest mt-1">Lokala filer</div>
          </div>
      </div>
      
      {localCount > 0 && (
          <div className="mb-6 p-4 bg-amber-50 border border-amber-200 text-amber-900 text-sm rounded-xl flex gap-3 items-start max-w-lg">
              <AlertTriangle className="shrink-0 mt-0.5 text-amber-600" size={20} />
              <p>Varning: {localCount} bilder är inte uppladdade till molnet (Base64). Konfigurera Cloudinary för att få korrekta URL:er till din butik.</p>
          </div>
      )}

      {failedCount > 0 && (
          <div className="mb-6 p-4 bg-stone-100 border border-stone-200 text-stone-600 text-sm rounded-xl flex gap-3 items-start max-w-lg">
              <AlertTriangle className="shrink-0 mt-0.5 text-stone-400" size={20} />
              <p>{failedCount} produkter saknar fortfarande bild (hoppades över eller misslyckades).</p>
          </div>
      )}

      <div className="flex flex-col sm:flex-row gap-4 w-full sm:w-auto">
        <button onClick={onReset} className="w-full sm:w-auto flex items-center justify-center gap-2 px-8 py-4 rounded-xl border-2 border-stone-200 text-stone-500 hover:text-emerald-900 hover:border-emerald-900 font-bold transition-colors">
          <RefreshCcw size={20} /> Tillbaka till start
        </button>
        <button onClick={downloadCSV} className="w-full sm:w-auto flex items-center justify-center gap-3 bg-emerald-900 hover:bg-emerald-800 text-white px-10 py-4 rounded-xl font-bold shadow-xl shadow-emerald-900/20 transition-all hover:-translate-y-1">
          <Download size={24} className="text-amber-400" /> Ladda ner CSV-fil
        </button>
      </div>
    </div>
  );
};

export default ExportView;
