import { Component, type ReactNode, type ErrorInfo } from 'react';
import { RefreshCw } from 'lucide-react';

interface Props { children: ReactNode }
interface State { hasError: boolean; message: string }

export default class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, message: '' };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, message: error.message };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('ErrorBoundary caught:', error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center justify-center min-h-screen bg-slate-950 text-center px-6">
          <div className="w-16 h-16 rounded-2xl bg-red-600/20 border border-red-500/40 flex items-center justify-center mb-6">
            <RefreshCw size={28} className="text-red-400" />
          </div>
          <h1 className="text-white font-bold text-xl mb-2">Something went wrong</h1>
          <p className="text-slate-400 text-sm mb-6 max-w-xs leading-relaxed">
            {this.state.message || 'An unexpected error occurred.'}
          </p>
          <button
            onClick={() => window.location.reload()}
            className="flex items-center gap-2 px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-xl transition-colors"
          >
            <RefreshCw size={16} />
            Reload App
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
