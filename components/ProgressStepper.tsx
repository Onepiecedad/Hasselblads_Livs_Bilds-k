import React from 'react';
import { AppStep } from '../types';
import { Check } from 'lucide-react';

interface ProgressStepperProps {
  currentStep: AppStep;
}

const STEPS = [
  { key: AppStep.UPLOAD, label: 'Ladda CSV', number: 1 },
  { key: AppStep.CONFIGURE, label: 'Konfigurera', number: 2 },
  { key: AppStep.MODE_SELECT, label: 'Välj läge', number: 3 },
  { key: AppStep.BATCH, label: 'Bearbeta', number: 4, altKeys: [AppStep.PROCESS] },
  { key: AppStep.EXPORT, label: 'Exportera', number: 5 },
];

export const ProgressStepper: React.FC<ProgressStepperProps> = ({ currentStep }) => {
  const currentIndex = STEPS.findIndex(s => s.key === currentStep || s.altKeys?.includes(currentStep));

  return (
    <div className="w-full bg-white border-b border-stone-100 py-4 px-4 overflow-x-auto">
      <div className="max-w-4xl mx-auto flex items-center justify-between min-w-[500px]">
        {STEPS.map((step, idx) => {
          const isActive = idx === currentIndex;
          const isCompleted = idx < currentIndex;
          const isPending = idx > currentIndex;

          return (
            <div key={step.key} className="flex flex-col items-center relative flex-1">
              {/* Connector Line */}
              {idx !== 0 && (
                <div 
                  className={`absolute top-4 -left-1/2 w-full h-[2px] -z-10 transition-colors duration-500 ${
                    isCompleted || isActive ? 'bg-emerald-500' : 'bg-stone-200'
                  }`} 
                />
              )}

              <div 
                className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-all duration-300 border-2 ${
                  isCompleted 
                    ? 'bg-emerald-500 border-emerald-500 text-white' 
                    : isActive 
                        ? 'bg-white border-emerald-600 text-emerald-800 scale-110 shadow-md' 
                        : 'bg-white border-stone-200 text-stone-300'
                }`}
              >
                {isCompleted ? <Check size={14} /> : step.number}
              </div>
              <span className={`text-[10px] uppercase tracking-wider font-bold mt-2 transition-colors ${
                  isActive ? 'text-emerald-900' : isCompleted ? 'text-emerald-600' : 'text-stone-300'
              }`}>
                {step.label}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
};