// PatternOverlay uses lightweight-charts markers API via ChartWidget — 
// this component handles displaying a legend of recent patterns on the chart area
import { useSignalStore } from '../../store/signalStore';
import { cn } from '../../utils/format';

export default function PatternOverlay() {
  const signals = useSignalStore(s => s.signals);
  const recent  = signals.slice(0, 3);

  if (recent.length === 0) return null;

  return (
    <div className="absolute top-2 left-2 z-10 flex flex-col gap-1 pointer-events-none">
      {recent.map(sig => (
        <div
          key={sig.id}
          className={cn(
            'text-xs px-2 py-0.5 rounded-full font-medium border',
            sig.pattern.direction === 'bullish'
              ? 'bg-green-900/80 text-green-300 border-green-600/50'
              : sig.pattern.direction === 'bearish'
                ? 'bg-red-900/80 text-red-300 border-red-600/50'
                : 'bg-slate-800/80 text-slate-300 border-slate-600/50',
          )}
        >
          {sig.pattern.label}
        </div>
      ))}
    </div>
  );
}
