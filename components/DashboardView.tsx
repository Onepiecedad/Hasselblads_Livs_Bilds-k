
import React, { useState } from 'react';
import { ProcessedProduct, AppStep } from '../types';
import { 
  LayoutGrid, ArrowRight, CheckCircle2, Loader2, Zap, Hand, Rocket, 
  UploadCloud, RefreshCw, Edit3, Download, ChevronUp, ChevronDown, 
  Database, Trash2 
} from 'lucide-react';

interface DashboardViewProps {
  products: ProcessedProduct[];
  completedCount: number;
  incompleteCount: number;
  nextPendingProduct: ProcessedProduct | null;
  onStepChange: (step: AppStep) => void;
  onStartManual: () => void;
  onStartBatch: () => void;
  onFilterChange: (filter: 'all' | 'incomplete' | 'completed') => void;
  onResetDefault: () => void;
  onClearAll: () => void;
}

export const DashboardView: React.FC<DashboardViewProps> = ({
  products,
  completedCount,
  incompleteCount,
  nextPendingProduct,
  onStepChange,
  onStartManual,
  onStartBatch,
  onFilterChange,
  onResetDefault,
  onClearAll
}) => {
  const [showAdvanced, setShowAdvanced] = useState(false);

  return (
    <div className="max-w-6xl mx-auto mt-6 animate-in fade-in duration-500">
      
      {/* TOP STATS ROW */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
           {/* Card 1: Total */}
           <div 
              onClick={() => onStepChange(AppStep.EDIT_GRID)}
              className="bg-white rounded-2xl p-6 border border-stone-100 shadow-sm relative overflow-hidden group hover:shadow-xl hover:border-emerald-200 transition-all cursor-pointer"
           >
               <div className="absolute right-0 top-0 p-4 opacity-5 group-hover:opacity-10 transition-opacity">
                   <LayoutGrid size={80} />
               </div>
               <div className="flex items-center justify-between mb-2">
                  <p className="text-stone-500 text-xs font-bold uppercase tracking-wider">Totalt Sortiment</p>
                  <ArrowRight size={16} className="text-stone-300 group-hover:text-emerald-500 transform group-hover:translate-x-1 transition-all" />
               </div>
               <div className="flex items-baseline gap-2">
                   <h2 className="text-4xl font-bold text-stone-800 serif-font">{products.length}</h2>
                   <span className="text-stone-400 text-sm">produkter</span>
               </div>
               <div className="mt-4 h-1.5 w-full bg-stone-100 rounded-full overflow-hidden">
                   <div className="h-full bg-stone-800 rounded-full group-hover:bg-emerald-600 transition-colors" style={{width: '100%'}}></div>
               </div>
           </div>

           {/* Card 2: Completed */}
           <div 
              onClick={() => onFilterChange('completed')}
              className="bg-white rounded-2xl p-6 border border-emerald-100 shadow-sm relative overflow-hidden group hover:shadow-xl hover:border-emerald-300 transition-all cursor-pointer"
           >
               <div className="absolute right-0 top-0 p-4 text-emerald-600 opacity-5 group-hover:opacity-10 transition-opacity">
                   <CheckCircle2 size={80} />
               </div>
               <div className="flex items-center justify-between mb-2">
                  <p className="text-emerald-600 text-xs font-bold uppercase tracking-wider">Klara Bilder</p>
                  <ArrowRight size={16} className="text-emerald-200 group-hover:text-emerald-600 transform group-hover:translate-x-1 transition-all" />
               </div>
               <div className="flex items-baseline gap-2">
                   <h2 className="text-4xl font-bold text-emerald-700 serif-font">{completedCount}</h2>
                   <span className="text-emerald-600/60 text-sm">{products.length > 0 ? Math.round((completedCount/products.length)*100) : 0}% klart</span>
               </div>
               <div className="mt-4 h-1.5 w-full bg-emerald-100 rounded-full overflow-hidden">
                   <div className="h-full bg-emerald-500 rounded-full transition-all duration-1000" style={{width: `${products.length > 0 ? (completedCount/products.length)*100 : 0}%`}}></div>
               </div>
           </div>

           {/* Card 3: Pending */}
           <div 
              onClick={() => onFilterChange('incomplete')}
              className="bg-white rounded-2xl p-6 border border-amber-100 shadow-sm relative overflow-hidden group hover:shadow-xl hover:border-amber-300 transition-all cursor-pointer"
           >
               <div className="absolute right-0 top-0 p-4 text-amber-500 opacity-5 group-hover:opacity-10 transition-opacity">
                   <Loader2 size={80} />
               </div>
               <div className="flex items-center justify-between mb-2">
                  <p className="text-amber-600 text-xs font-bold uppercase tracking-wider">Att Göra</p>
                  <ArrowRight size={16} className="text-amber-200 group-hover:text-amber-500 transform group-hover:translate-x-1 transition-all" />
               </div>
               <div className="flex items-baseline gap-2">
                   <h2 className="text-4xl font-bold text-amber-600 serif-font">{incompleteCount}</h2>
                   <span className="text-amber-600/60 text-sm">kvar</span>
               </div>
               <div className="mt-4 h-1.5 w-full bg-amber-100 rounded-full overflow-hidden">
                   <div className="h-full bg-amber-500 rounded-full transition-all duration-1000" style={{width: `${products.length > 0 ? (incompleteCount/products.length)*100 : 0}%`}}></div>
               </div>
           </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* MAIN ACTION AREA */}
          <div className="lg:col-span-2 space-y-6">
              
              {/* NEXT UP CARD (If works remaining) */}
              {incompleteCount > 0 && nextPendingProduct && (
                  <div className="bg-gradient-to-br from-emerald-900 to-emerald-950 rounded-3xl p-8 text-white relative overflow-hidden shadow-xl shadow-emerald-900/20 group">
                      <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/cubes.png')] opacity-10"></div>
                      <div className="relative z-10 flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
                          <div>
                              <div className="flex items-center gap-2 text-emerald-300 mb-2">
                                  <Zap size={16} className="fill-current" />
                                  <span className="text-xs font-bold uppercase tracking-widest">Nästa på tur</span>
                              </div>
                              <h3 className="text-2xl font-bold serif-font mb-1">{nextPendingProduct.product_name}</h3>
                              <p className="text-emerald-200/80 text-sm max-w-md truncate">{nextPendingProduct.brand || 'Okänt varumärke'}</p>
                          </div>
                          <div className="flex gap-3 w-full md:w-auto">
                               <button 
                                  onClick={onStartManual}
                                  className="flex-1 md:flex-none bg-white/10 hover:bg-white/20 border border-white/10 text-white px-6 py-3 rounded-xl font-bold text-sm transition-all flex items-center justify-center gap-2"
                               >
                                   <Hand size={18} /> Manuellt
                               </button>
                               <button 
                                  onClick={onStartBatch}
                                  className="flex-1 md:flex-none bg-white text-emerald-900 hover:bg-emerald-50 px-6 py-3 rounded-xl font-bold text-sm transition-all shadow-lg flex items-center justify-center gap-2"
                               >
                                   <Rocket size={18} className="text-amber-500 fill-amber-500" /> Starta AI-motor
                               </button>
                          </div>
                      </div>
                  </div>
              )}

              {/* Completed State */}
              {products.length > 0 && incompleteCount === 0 && (
                  <div className="bg-emerald-50 rounded-3xl p-8 text-center border border-emerald-100">
                      <div className="w-16 h-16 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto mb-4">
                          <CheckCircle2 size={32} />
                      </div>
                      <h3 className="text-2xl font-bold text-emerald-900 serif-font mb-2">Allt klart! Bra jobbat.</h3>
                      <p className="text-emerald-800/70 mb-6">Ditt sortiment är färdigt för export.</p>
                      <button 
                          onClick={() => onStepChange(AppStep.EXPORT)}
                          className="bg-emerald-900 text-white px-8 py-3 rounded-xl font-bold hover:bg-emerald-800 transition-all shadow-lg shadow-emerald-900/20"
                      >
                          Gå till Export
                      </button>
                  </div>
              )}
              
              {/* Empty State */}
              {products.length === 0 && (
                  <div className="bg-stone-50 rounded-3xl p-12 text-center border-2 border-dashed border-stone-200 hover:border-emerald-300 transition-colors cursor-pointer group" onClick={() => onStepChange(AppStep.UPLOAD)}>
                      <div className="w-20 h-20 bg-white rounded-full flex items-center justify-center mx-auto mb-6 shadow-sm group-hover:scale-110 transition-transform">
                          <UploadCloud size={32} className="text-emerald-600" />
                      </div>
                      <h3 className="text-2xl font-bold text-stone-800 serif-font mb-2">Din studio är tom</h3>
                      <p className="text-stone-500 mb-8 max-w-md mx-auto">Ladda upp din CSV-fil för att börja bearbeta produktbilder med AI.</p>
                      <button className="bg-emerald-900 text-white px-8 py-3 rounded-xl font-bold group-hover:bg-emerald-800 transition-colors">
                          Ladda upp produktlista
                      </button>
                  </div>
              )}
          </div>

          {/* SIDEBAR TOOLS */}
          <div className="space-y-4">
              <h4 className="text-xs font-bold text-stone-400 uppercase tracking-widest mb-2">Verktyg</h4>
              
              <button onClick={() => onStepChange(AppStep.UPLOAD)} className="w-full bg-white p-4 rounded-xl border border-stone-200 hover:border-emerald-500 hover:shadow-md transition-all text-left flex items-center gap-3 group">
                  <div className="bg-stone-50 p-2 rounded-lg text-stone-500 group-hover:text-emerald-600 group-hover:bg-emerald-50 transition-colors">
                      <RefreshCw size={20} />
                  </div>
                  <div>
                      <div className="font-bold text-stone-800 text-sm">Uppdatera Data</div>
                      <div className="text-xs text-stone-400">Importera nya rader</div>
                  </div>
              </button>

              <button onClick={() => onStepChange(AppStep.EDIT_GRID)} className="w-full bg-white p-4 rounded-xl border border-stone-200 hover:border-amber-500 hover:shadow-md transition-all text-left flex items-center gap-3 group">
                  <div className="bg-stone-50 p-2 rounded-lg text-stone-500 group-hover:text-amber-600 group-hover:bg-amber-50 transition-colors">
                      <Edit3 size={20} />
                  </div>
                  <div>
                      <div className="font-bold text-stone-800 text-sm">Redigera Lista</div>
                      <div className="text-xs text-stone-400">Ändra texter & namn</div>
                  </div>
              </button>

              <button onClick={() => onStepChange(AppStep.EXPORT)} className="w-full bg-white p-4 rounded-xl border border-stone-200 hover:border-blue-500 hover:shadow-md transition-all text-left flex items-center gap-3 group">
                  <div className="bg-stone-50 p-2 rounded-lg text-stone-500 group-hover:text-blue-600 group-hover:bg-blue-50 transition-colors">
                      <Download size={20} />
                  </div>
                  <div>
                      <div className="font-bold text-stone-800 text-sm">Exportera</div>
                      <div className="text-xs text-stone-400">Ladda ner CSV</div>
                  </div>
              </button>

              {/* ADVANCED */}
              <div className="pt-6 border-t border-stone-100">
                  <button 
                      onClick={() => setShowAdvanced(!showAdvanced)}
                      className="flex items-center gap-2 text-xs font-bold text-stone-400 hover:text-stone-600 transition-colors w-full justify-between"
                  >
                      <span>AVANCERAT</span>
                      {showAdvanced ? <ChevronUp size={14} /> : <ChevronDown size={14} />} 
                  </button>
                  
                  {showAdvanced && (
                      <div className="mt-4 space-y-2 animate-in slide-in-from-top-2">
                          <button onClick={onResetDefault} className="w-full px-3 py-2 bg-stone-100 hover:bg-stone-200 rounded-lg text-xs font-bold text-stone-600 text-left flex items-center gap-2">
                              <Database size={12} /> Återställ Demodata
                          </button>
                          <button onClick={onClearAll} className="w-full px-3 py-2 bg-red-50 hover:bg-red-100 rounded-lg text-xs font-bold text-red-600 text-left flex items-center gap-2">
                              <Trash2 size={12} /> Rensa Databas
                          </button>
                      </div>
                  )}
              </div>
          </div>
      </div>
    </div>
  );
};
