import { Activity } from 'lucide-react';
import { useSignalStore, selectSignalsByCategory } from '../../store/signalStore';
import { cn } from '../../utils/format';

export default function LevelReactionTicker() {
  const signals = useSignalStore(s => s.signals);
  const levelSignals = selectSignalsByCategory(signals, 'level').slice(0, 4);

  if (levelSignals.length === 0) return null;

  return (
    <div className="flex items-center gap-1.5 px-3 py-1 bg-slate-900/40 border-b border-slate-700/20 flex-shrink-0 overflow-x-auto">
      <Activity size={12} className="text-amber-400/60 flex-shrink-0" />
      {levelSignals.map(s => {
        const isBull = s.pattern.direction === 'bullish';
        return (
          <div
            key={s.id}
            className={cn(
              'flex items-center gap-1 rounded-full px-2 py-0.5 flex-shrink-0',
              isBull
                ? 'bg-amber-900/30 border border-amber-700/30'
                : 'bg-slate-700/30 border border-slate-600/30',
            )}
          >
            <span className={cn(
              'text-[10px] font-semibold',
              isBull ? 'text-amber-300' : 'text-slate-300',
            )}>
              {isBull ? '▲' : '▼'}
            </span>
            <span className="text-slate-300 text-[10px] truncate max-w-[120px]">
              {s.pattern.label}
            </span>
          </div>
        );
      })}
    </div>
  );
}
