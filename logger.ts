export type LogLevel = 'info' | 'warn' | 'error' | 'success';

export interface LogEntry {
  id: string;
  timestamp: Date;
  level: LogLevel;
  message: string;
  details?: any;
}

type LogListener = (entry: LogEntry) => void;

class LoggerService {
  private listeners: LogListener[] = [];
  private logs: LogEntry[] = [];
  private readonly MAX_LOGS = 200; // Reduced to save memory during batch

  subscribe(listener: LogListener) {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter(l => l !== listener);
    };
  }

  private emit(level: LogLevel, message: string, details?: any) {
    const entry: LogEntry = {
      id: Math.random().toString(36).substr(2, 9),
      timestamp: new Date(),
      level,
      message,
      details
    };
    this.logs.push(entry);
    // Keep max logs to prevent memory issues
    if (this.logs.length > this.MAX_LOGS) {
        this.logs = this.logs.slice(-this.MAX_LOGS);
    }
    
    this.listeners.forEach(l => l(entry));
    
    // Also log to console for devtools
    const consoleMsg = `[${level.toUpperCase()}] ${message}`;
    if (level === 'error') console.error(consoleMsg, details);
    else if (level === 'warn') console.warn(consoleMsg, details);
    else console.log(consoleMsg, details || '');
  }

  info(message: string, details?: any) { this.emit('info', message, details); }
  success(message: string, details?: any) { this.emit('success', message, details); }
  warn(message: string, details?: any) { this.emit('warn', message, details); }
  error(message: string, details?: any) { this.emit('error', message, details); }
  
  getHistory() { return this.logs; }
  clear() { 
      this.logs = []; 
      this.listeners.forEach(l => l({ 
          id: 'clear', timestamp: new Date(), level: 'info', message: '--- Log cleared ---' 
      })); 
  }
}

export const logger = new LoggerService();