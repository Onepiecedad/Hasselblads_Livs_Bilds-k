
import React from 'react';
import { HelpCircle } from 'lucide-react';

interface TooltipProps {
  text: string;
  size?: number;
}

export const Tooltip: React.FC<TooltipProps> = ({ text, size = 16 }) => {
  return (
    <div className="group relative inline-block ml-1.5 align-middle z-10">
      <HelpCircle 
        size={size} 
        className="text-stone-300 hover:text-emerald-600 transition-colors cursor-help" 
      />
      <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-64 p-3 bg-stone-800 text-white text-xs rounded-xl opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 shadow-xl pointer-events-none text-center leading-relaxed">
        {text}
        <div className="absolute top-full left-1/2 -translate-x-1/2 -mt-1 border-4 border-transparent border-t-stone-800"></div>
      </div>
    </div>
  );
};
