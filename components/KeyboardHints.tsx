import React, { useState } from 'react';
import { Keyboard } from 'lucide-react';

interface KeyboardHintsProps {
  shortcuts: { key: string; action: string }[];
}

export const KeyboardHints: React.FC<KeyboardHintsProps> = ({ shortcuts }) => {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="fixed bottom-4 left-4 z-40">
      <button 
        onClick={() => setIsOpen(!isOpen)}
        className={`flex items-center gap-2 bg-white border border-stone-200 shadow-sm px-3 py-2 rounded-lg text-xs font-medium text-stone-500 hover:text-stone-800 transition-all ${isOpen ? 'bg-stone-50' : ''}`}
      >
        <Keyboard size={14} />
        <span className="hidden sm:inline">Kortkommandon</span>
      </button>

      {isOpen && (
        <div className="absolute bottom-full left-0 mb-2 bg-white rounded-xl shadow-xl border border-stone-200 p-4 min-w-[200px] animate-in slide-in-from-bottom-2 fade-in duration-200">
          <h4 className="text-xs font-bold text-stone-400 uppercase tracking-wider mb-3">Tangenter</h4>
          <div className="space-y-2">
            {shortcuts.map((s, i) => (
              <div key={i} className="flex items-center justify-between gap-4 text-xs">
                <span className="text-stone-600">{s.action}</span>
                <kbd className="px-2 py-1 bg-stone-100 border border-stone-300 rounded font-mono text-stone-800 text-[10px] min-w-[24px] text-center font-bold">
                  {s.key}
                </kbd>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};