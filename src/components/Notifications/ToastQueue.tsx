import { useState, useEffect, useCallback } from 'react';
import { useSignalStore, type Toast } from '../../store/signalStore';
import { PATTERN_CATEGORY } from '../../types/pattern';
import { cn } from '../../utils/format';

const DURATION = 4000;

function ToastItem({ toast, onRemove }: { toast: Toast; onRemove: (id: string) => void }) {
  const [visible, setVisible] = useState(false);
  const { signal } = toast;
  const { pattern } = signal;

  useEffect(() => {
    const show = requestAnimationFrame(() => setVisible(true));
    const hide = setTimeout(() => {
      setVisible(false);
      setTimeout(() => onRemove(toast.id), 300);
    }, DURATION);
    return () => { cancelAnimationFrame(show); clearTimeout(hide); };
  }, [toast.id, onRemove]);

  return (
    <div
      className={cn(
        'flex items-center gap-2 bg-slate-800 border rounded-xl px-3 py-2.5 shadow-xl transition-all duration-300',
        pattern.direction === 'bullish' ? 'border-green-600/60' :
        pattern.direction === 'bearish' ? 'border-red-600/60'   : 'border-slate-600/60',
        visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-2',
      )}
    >
      <span className={cn(
        'w-2 h-2 rounded-full flex-shrink-0',
        pattern.direction === 'bullish' ? 'bg-green-400' :
        pattern.direction === 'bearish' ? 'bg-red-400'   : 'bg-slate-400',
      )} />
      <div className="min-w-0">
        <p className="text-white text-sm font-medium truncate">{pattern.label}</p>
        <p className="text-slate-400 text-xs">{signal.symbol} · {signal.interval} · {pattern.confidence}%</p>
      </div>
      <button
        onClick={() => onRemove(toast.id)}
        className="ml-2 text-slate-500 hover:text-slate-300 flex-shrink-0 text-lg leading-none"
      >
        ×
      </button>
    </div>
  );
}

export default function ToastQueue() {
  const toasts     = useSignalStore(s => s.toasts);
  const removeToast = useSignalStore(s => s.removeToast);

  const patternToasts = toasts.filter(t => PATTERN_CATEGORY[t.signal.pattern.type] === 'pattern');

  const handleRemove = useCallback((id: string) => {
    removeToast(id);
  }, [removeToast]);

  return (
    <div className="fixed bottom-20 right-3 left-3 z-50 flex flex-col gap-2 pointer-events-none">
      <div className="flex flex-col gap-2 items-end pointer-events-auto">
        {patternToasts.map(t => (
          <ToastItem key={t.id} toast={t} onRemove={handleRemove} />
        ))}
      </div>
    </div>
  );
}
