import { useEffect, useState } from 'react';
import { Layers } from 'lucide-react';
import { useSignalStore, selectSignalsByCategory } from '../../store/signalStore';
import { cn } from '../../utils/format';

export default function StrategySignalPanel() {
  const signals = useSignalStore(s => s.signals);
  const strategySignals = selectSignalsByCategory(signals, 'strategy').slice(0, 5);
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (strategySignals.length === 0) return;
    const timers = strategySignals.map(s =>
      setTimeout(() => {
        setDismissedIds(prev => new Set(prev).add(s.id));
      }, 30000),
    );
    return () => timers.forEach(clearTimeout);
  }, [strategySignals.map(s => s.id).join(',')]);

  const visible = strategySignals.filter(s => !dismissedIds.has(s.id));
  if (visible.length === 0) return null;

  return (
    <div className="fixed bottom-3 left-3 z-40 flex flex-col gap-1.5 max-w-[280px] pointer-events-none">
      {visible.map(s => {
        const isBull = s.pattern.direction === 'bullish';
        return (
          <div
            key={s.id}
            className={cn(
              'pointer-events-auto rounded-lg border px-3 py-2 backdrop-blur-md shadow-lg',
              'bg-indigo-950/80 border-indigo-700/50',
              'transition-all duration-300',
              isBull ? 'border-l-4 border-l-indigo-500' : 'border-l-4 border-l-indigo-400',
            )}
          >
            <div className="flex items-center gap-2">
              <Layers size={14} className="text-indigo-300 flex-shrink-0" />
              <span className="text-indigo-100 text-xs font-medium truncate">{s.pattern.label}</span>
            </div>
            <div className="flex items-center gap-2 mt-0.5">
              <span className={cn(
                'text-[10px] font-bold px-1.5 py-0.5 rounded',
                isBull ? 'bg-indigo-500/30 text-indigo-200' : 'bg-indigo-400/30 text-indigo-200',
              )}>
                {isBull ? '▲ BULL' : '▼ BEAR'}
              </span>
              <span className="text-indigo-300/70 text-[10px] font-mono">{s.pattern.confidence}%</span>
              <span className="text-indigo-400/50 text-[10px]">{s.symbol} {s.interval}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
