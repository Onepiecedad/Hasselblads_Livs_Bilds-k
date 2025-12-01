
import React from 'react';
import { Rocket, Hand } from 'lucide-react';

interface ModeSelectViewProps {
  count: number;
  onStartBatch: () => void;
  onStartManual: () => void;
  onBack: () => void;
}

export const ModeSelectView: React.FC<ModeSelectViewProps> = ({ 
  count, 
  onStartBatch, 
  onStartManual, 
  onBack 
}) => {
  return (
    <div className="max-w-3xl mx-auto mt-12 p-6 md:p-8 bg-white rounded-2xl shadow-sm border border-stone-200 text-center animate-in fade-in zoom-in-95 duration-500">
      <h2 className="text-2xl md:text-3xl font-bold mb-8 text-emerald-950 serif-font">Hur vill du bearbeta {count} produkter?</h2>
      <div className="grid md:grid-cols-2 gap-6">
          <button onClick={onStartBatch} className="bg-stone-50 hover:bg-emerald-50 border-2 border-stone-200 hover:border-emerald-500 rounded-xl p-6 md:p-8 text-left transition-all group">
              <div className="w-14 h-14 bg-white border border-stone-200 text-emerald-600 rounded-full flex items-center justify-center mb-6 group-hover:scale-110 transition-transform shadow-sm">
                  <Rocket size={28} />
              </div>
              <h3 className="text-xl font-bold text-emerald-900 mb-2 serif-font">🚀 Batch-läge (Auto)</h3>
              <p className="text-stone-500 text-sm leading-relaxed">Appen söker och sparar bilder automatiskt i bakgrunden.</p>
          </button>
          <button onClick={onStartManual} className="bg-stone-50 hover:bg-amber-50 border-2 border-stone-200 hover:border-amber-500 rounded-xl p-6 md:p-8 text-left transition-all group">
              <div className="w-14 h-14 bg-white border border-stone-200 text-amber-600 rounded-full flex items-center justify-center mb-6 group-hover:scale-110 transition-transform shadow-sm">
                  <Hand size={28} />
              </div>
              <h3 className="text-xl font-bold text-emerald-900 mb-2 serif-font">⚡ Manuellt läge</h3>
              <p className="text-stone-500 text-sm leading-relaxed">Du väljer bästa bilden. Appen för-laddar nästa bild blixtsnabbt.</p>
          </button>
      </div>
      <div className="mt-8">
          <button onClick={onBack} className="text-stone-400 hover:text-emerald-800 text-sm font-medium border-b border-transparent hover:border-emerald-800 transition-all">Tillbaka till Dashboard</button>
      </div>
    </div>
  );
};
