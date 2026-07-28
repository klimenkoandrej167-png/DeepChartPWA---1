import { useCandleTimer } from '../../hooks/useCandleTimer';

export default function CandleTimer() {
  const seconds = useCandleTimer();
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;

  const label = h > 0
    ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
    : `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;

  return (
    <div className="absolute top-2 right-2 z-10 bg-slate-900/80 backdrop-blur-sm border border-slate-700 rounded px-2 py-0.5">
      <span className="text-slate-300 font-mono text-xs">{label}</span>
    </div>
  );
}
