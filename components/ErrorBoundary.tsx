import React, { ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

interface Props {
  children?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = {
      hasError: false,
      error: null
    };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('ErrorBoundary caught an error:', error, errorInfo);
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-stone-50 p-8">
          <div className="max-w-md w-full bg-white rounded-2xl shadow-xl border border-stone-200 p-8 text-center">
            <div className="w-16 h-16 bg-red-100 text-red-600 rounded-full flex items-center justify-center mx-auto mb-6">
              <AlertTriangle size={32} />
            </div>
            <h2 className="text-2xl font-bold text-stone-900 mb-3 serif-font">Något gick fel</h2>
            <p className="text-stone-500 mb-6">
              Ett oväntat fel uppstod. Ditt arbete har sparats automatiskt.
            </p>
            <div className="bg-stone-100 rounded-lg p-4 mb-6 text-left">
              <p className="text-xs font-mono text-stone-600 break-all">
                {this.state.error?.message || 'Unknown error'}
              </p>
            </div>
            <button
              onClick={this.handleReset}
              className="flex items-center justify-center gap-2 w-full bg-emerald-900 hover:bg-emerald-800 text-white py-3 px-6 rounded-xl font-bold transition-colors"
            >
              <RefreshCw size={18} /> Ladda om appen
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}