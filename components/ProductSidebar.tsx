
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
          className="fixed inset-0 bg-black/20 z-40 lg:hidden backdrop-blur-sm"
          onClick={onClose}
        />
      )}

      {/* Sidebar Panel */}
      <div className={`fixed top-16 right-0 bottom-0 w-80 bg-white border-l border-stone-200 shadow-2xl z-40 transform transition-transform duration-300 ease-in-out flex flex-col ${isOpen ? 'translate-x-0' : 'translate-x-full'}`}>
        
        <div className="p-4 border-b border-stone-100 flex items-center justify-between bg-stone-50">
          <div>
            <h3 className="font-bold text-stone-800 serif-font">Produktlista</h3>
            <p className="text-xs text-stone-500">{products.length} artiklar totalt</p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-stone-200 rounded-full transition-colors">
            <X size={18} className="text-stone-500" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-2 space-y-1 custom-scrollbar" ref={scrollContainerRef}>
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
                className={`w-full text-left p-3 rounded-xl transition-all flex items-center gap-3 border ${
                  isActive 
                    ? 'bg-emerald-50 border-emerald-500 shadow-sm ring-1 ring-emerald-200' 
                    : 'bg-white border-transparent hover:bg-stone-50 hover:border-stone-200'
                }`}
              >
                <div className="shrink-0">
                   {isCompleted ? <CheckCircle2 size={16} className="text-emerald-500" /> :
                    isFailed ? <AlertCircle size={16} className="text-amber-500" /> :
                    isSkipped ? <Search size={16} className="text-stone-300" /> :
                    <Circle size={16} className="text-stone-200" />}
                </div>
                <div className="min-w-0 flex-1">
                  <div className={`text-sm font-medium truncate ${isActive ? 'text-emerald-900' : 'text-stone-700'}`}>
                    {p.product_name}
                  </div>
                  <div className="flex items-center gap-2 text-[10px] text-stone-400">
                    <span className="font-mono">#{idx + 1}</span>
                    {p.brand && <span className="truncate">• {p.brand}</span>}
                  </div>
                </div>
                {p.finalImageUrl && (
                  <div className="w-8 h-8 rounded bg-stone-100 overflow-hidden shrink-0 border border-stone-100">
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
