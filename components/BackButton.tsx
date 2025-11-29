import React from 'react';
import { ArrowLeft } from 'lucide-react';

interface BackButtonProps {
  onClick: () => void;
  label?: string;
}

export const BackButton: React.FC<BackButtonProps> = ({ onClick, label = 'Tillbaka' }) => {
  return (
    <button 
      onClick={onClick}
      className="group flex items-center gap-2 text-stone-400 hover:text-emerald-900 font-medium text-sm transition-colors mb-4 pl-1"
    >
      <div className="p-1 rounded-full group-hover:bg-emerald-50 transition-colors">
        <ArrowLeft size={16} />
      </div>
      {label}
    </button>
  );
};