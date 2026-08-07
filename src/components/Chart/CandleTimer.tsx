import { useCandleTimer } from '../../hooks/useCandleTimer';
import { useChartStore } from '../../store/chartStore';

export default function CandleTimer() {
  const seconds = useCandleTimer();
  const status = useChartStore(s => s.sourceStatus);
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;

  const label = h > 0
    ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
    : `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;

  const isStale = status === 'stale';

  return (
    <div className={`absolute top-2 right-2 z-10 backdrop-blur-sm border rounded px-2 py-0.5 ${isStale ? 'bg-orange-950/80 border-orange-700' : 'bg-slate-900/80 border-slate-700'}`}>
      <span className={`font-mono text-xs ${isStale ? 'text-orange-400' : 'text-slate-300'}`}>
        {isStale ? `STALE ${label}` : label}
      </span>
    </div>
  );
}
