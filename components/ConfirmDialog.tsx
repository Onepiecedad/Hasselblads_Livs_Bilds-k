import React from 'react';
import { AlertTriangle, X } from 'lucide-react';

interface ConfirmDialogProps {
  isOpen: boolean;
  title: string;
  message: string;
  confirmLabel: string;
  cancelLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
  variant?: 'danger' | 'warning' | 'info';
}

export const ConfirmDialog: React.FC<ConfirmDialogProps> = ({
  isOpen,
  title,
  message,
  confirmLabel,
  cancelLabel,
  onConfirm,
  onCancel,
  variant = 'warning'
}) => {
  if (!isOpen) return null;

  const confirmColors = {
    danger: 'bg-red-600 hover:bg-red-700 text-white',
    warning: 'bg-amber-500 hover:bg-amber-600 text-white',
    info: 'bg-emerald-900 hover:bg-emerald-800 text-white'
  };

  const iconColors = {
    danger: 'text-red-600 bg-red-100',
    warning: 'text-amber-600 bg-amber-100',
    info: 'text-emerald-600 bg-emerald-100'
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-stone-900/50 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-200">
        <div className="p-6">
          <div className="flex items-start gap-4">
            <div className={`w-12 h-12 rounded-full flex items-center justify-center shrink-0 ${iconColors[variant]}`}>
              <AlertTriangle size={24} />
            </div>
            <div className="flex-1">
              <h3 className="text-lg font-bold text-stone-900 serif-font mb-2">{title}</h3>
              <p className="text-stone-500 text-sm leading-relaxed">{message}</p>
            </div>
            <button onClick={onCancel} className="text-stone-400 hover:text-stone-600 transition-colors">
              <X size={20} />
            </button>
          </div>
        </div>
        <div className="p-4 bg-stone-50 border-t border-stone-100 flex gap-3 justify-end">
          <button 
            onClick={onCancel}
            className="px-4 py-2 text-sm font-bold text-stone-600 hover:text-stone-800 hover:bg-stone-200/50 rounded-lg transition-colors"
          >
            {cancelLabel}
          </button>
          <button 
            onClick={onConfirm}
            className={`px-6 py-2 text-sm font-bold rounded-lg shadow-sm transition-all hover:-translate-y-0.5 ${confirmColors[variant]}`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
};