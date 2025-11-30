import React, { useState, useEffect, useRef } from 'react';
import { Terminal, ChevronDown, Trash2 } from 'lucide-react';
import { logger, LogEntry } from '../logger';

export const DebugConsole: React.FC = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const endRef = useRef<HTMLDivElement>(null);
  const [copyStatus, setCopyStatus] = useState<'idle' | 'done' | 'error'>('idle');

  useEffect(() => {
    setLogs(logger.getHistory());
    const unsubscribe = logger.subscribe((entry) => {
        if (entry.id === 'clear') {
            setLogs([]);
        } else {
            // Functional update to avoid dependency issues
            // Limit to last 100 logs in the UI to prevent DOM performance issues
            setLogs(prev => {
                const newLogs = [...prev, entry];
                if (newLogs.length > 100) return newLogs.slice(-100);
                return newLogs;
            });
        }
    });
    return unsubscribe;
  }, []);

  useEffect(() => {
      if (isOpen && endRef.current) {
          endRef.current.scrollIntoView({ behavior: 'smooth' });
      }
  }, [logs, isOpen]);

  const toggle = () => setIsOpen(!isOpen);
  const handleCopy = async () => {
    try {
      const text = logs.map(l => {
        const time = l.timestamp.toLocaleTimeString('sv-SE').split(' ')[0] + '.' + String(l.timestamp.getMilliseconds()).padStart(3, '0');
        const level = l.level.toUpperCase();
        const msg = l.message;
        const details = l.details ? (typeof l.details === 'object' ? JSON.stringify(l.details) : String(l.details)) : '';
        return `${time} [${level}] ${msg}${details ? ' | ' + details : ''}`;
      }).join('\n');
      await navigator.clipboard.writeText(text);
      setCopyStatus('done');
      setTimeout(() => setCopyStatus('idle'), 1500);
    } catch {
      setCopyStatus('error');
      setTimeout(() => setCopyStatus('idle'), 1500);
    }
  };

  if (!isOpen) {
      return (
          <button 
            onClick={toggle}
            className="fixed bottom-4 right-4 bg-slate-800 text-white p-3 rounded-full shadow-lg hover:bg-slate-700 z-50 transition-all border border-slate-600"
            title="Open Debug Console"
          >
              <Terminal size={20} />
          </button>
      );
  }

  return (
    <div className="fixed bottom-0 left-0 right-0 h-72 bg-slate-900 text-slate-200 shadow-2xl z-50 flex flex-col font-mono text-xs border-t border-slate-700">
      <div className="flex items-center justify-between p-2 bg-slate-800 border-b border-slate-700">
          <div className="flex items-center gap-2">
              <Terminal size={14} className="text-blue-400" />
              <span className="font-bold text-slate-100">System Log / Debug</span>
              <span className="bg-slate-700 px-2 py-0.5 rounded-full text-[10px] text-slate-300">
                  Showing last {logs.length} events
              </span>
          </div>
          <div className="flex items-center gap-2">
              <button
                onClick={handleCopy}
                className="p-1 hover:text-emerald-400 transition-colors text-slate-200"
                title="Kopiera alla loggar"
              >
                {copyStatus === 'done' ? 'Kopierad' : copyStatus === 'error' ? 'Fel' : 'Kopiera'}
              </button>
              <button onClick={() => logger.clear()} className="p-1 hover:text-red-400 transition-colors" title="Clear Log"><Trash2 size={14} /></button>
              <button onClick={toggle} className="p-1 hover:text-white transition-colors" title="Close"><ChevronDown size={16} /></button>
          </div>
      </div>
      <div className="flex-1 overflow-y-auto p-2 space-y-0.5 bg-[#0d1117]">
          {logs.length === 0 && (
              <div className="text-slate-600 italic p-2 text-center">Inget att visa än...</div>
          )}
          {logs.map((log) => (
              <div key={log.id} className="flex gap-2 hover:bg-white/5 p-1 rounded transition-colors break-words">
                  <span className="text-slate-500 shrink-0 select-none">
                      {log.timestamp.toLocaleTimeString('sv-SE').split(' ')[0]}.{String(log.timestamp.getMilliseconds()).padStart(3, '0')}
                  </span>
                  <span className={`font-bold shrink-0 w-16 uppercase text-[10px] pt-0.5 ${
                      log.level === 'error' ? 'text-red-500' :
                      log.level === 'warn' ? 'text-yellow-500' :
                      log.level === 'success' ? 'text-green-500' : 'text-blue-400'
                  }`}>
                      {log.level}
                  </span>
                  <span className={`flex-1 ${log.level === 'error' ? 'text-red-200' : 'text-slate-300'}`}>
                    {log.message}
                    {log.details && (
                        <div className="mt-0.5 ml-2 text-slate-500 border-l-2 border-slate-700 pl-2 text-[10px] font-sans">
                            {typeof log.details === 'object' ? JSON.stringify(log.details) : String(log.details)}
                        </div>
                    )}
                  </span>
              </div>
          ))}
          <div ref={endRef} />
      </div>
    </div>
  );
};
