
import React, { useEffect, useRef } from 'react';
import { ProcessedProduct } from '../types';
import { CheckCircle2, AlertCircle, Circle, Image as ImageIcon, Search, X } from 'lucide-react';

interface ProductSidebarProps {
  products: ProcessedProduct[];
  currentIndex: number;
  isOpen: boolean;
  onClose: () => void;
  onSelect: (index: number) => void;
}

export const ProductSidebar: React.FC<ProductSidebarProps> = ({ 
  products, 
  currentIndex, 
  isOpen, 
  onClose, 
  onSelect 
}) => {
  const activeRef = useRef<HTMLButtonElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  // Scroll to active item when sidebar opens or index changes
  useEffect(() => {
    if (isOpen && activeRef.current && scrollContainerRef.current) {
      activeRef.current.scrollIntoView({
        behavior: 'auto',
        block: 'center',
      });
    }
  }, [isOpen, currentIndex]);

  return (
    <>
      {/* Backdrop for mobile */}
      {isOpen && (
        <div 
          className="fixed inset-0 bg-emerald-950/40 z-40 lg:hidden backdrop-blur-sm transition-opacity"
          onClick={onClose}
        />
      )}

      {/* Sidebar Panel */}
      <div className={`fixed top-16 right-0 bottom-0 w-80 bg-white border-l border-stone-200 shadow-2xl z-40 transform transition-transform duration-300 ease-in-out flex flex-col ${isOpen ? 'translate-x-0' : 'translate-x-full'}`}>
        
        <div className="p-5 border-b border-stone-100 flex items-center justify-between bg-stone-50">
          <div>
            <h3 className="font-bold text-stone-800 serif-font text-lg">Produktlista</h3>
            <p className="text-xs text-stone-500 font-medium">{products.length} artiklar totalt</p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-stone-200 rounded-full transition-colors text-stone-400 hover:text-stone-600">
            <X size={20} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-3 space-y-1 custom-scrollbar bg-stone-50/30" ref={scrollContainerRef}>
          {products.map((p, idx) => {
            const isActive = idx === currentIndex;
            const isCompleted = p.status === 'completed';
            const isSkipped = p.status === 'skipped';
            const isFailed = p.status === 'failed';
            
            return (
              <button
                key={p.id}
                ref={isActive ? activeRef : null}
                onClick={() => { onSelect(idx); }}
                className={`w-full text-left p-3 rounded-xl transition-all flex items-center gap-3 border group ${
                  isActive 
                    ? 'bg-emerald-50 border-emerald-500 shadow-md ring-1 ring-emerald-200 z-10' 
                    : 'bg-white border-transparent hover:bg-white hover:border-stone-200 hover:shadow-sm'
                }`}
              >
                <div className="shrink-0 transition-transform group-hover:scale-110">
                   {isCompleted ? <CheckCircle2 size={18} className="text-emerald-500" /> :
                    isFailed ? <AlertCircle size={18} className="text-amber-500" /> :
                    isSkipped ? <Search size={18} className="text-stone-300" /> :
                    <Circle size={18} className="text-stone-200" />}
                </div>
                <div className="min-w-0 flex-1">
                  <div className={`text-sm font-bold truncate transition-colors ${isActive ? 'text-emerald-900' : 'text-stone-700 group-hover:text-stone-900'}`}>
                    {p.product_name}
                  </div>
                  <div className="flex items-center gap-2 text-[10px] text-stone-400 group-hover:text-stone-500">
                    <span className="font-mono bg-stone-100 px-1.5 py-0.5 rounded text-stone-500">#{idx + 1}</span>
                    {p.brand && <span className="truncate">• {p.brand}</span>}
                  </div>
                </div>
                {p.finalImageUrl && (
                  <div className="w-10 h-10 rounded-lg bg-stone-100 overflow-hidden shrink-0 border border-stone-200 shadow-sm group-hover:border-emerald-200">
                    <img src={p.finalImageUrl} className="w-full h-full object-cover" alt="" />
                  </div>
                )}
              </button>
            );
          })}
        </div>
      </div>
    </>
  );
};
