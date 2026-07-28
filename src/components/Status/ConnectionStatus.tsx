import { useChartStore } from '../../store/chartStore';
import { cn, formatPrice } from '../../utils/format';
import type { SourceStatus } from '../../types/candle';

const STATUS_CONFIG: Record<SourceStatus, { label: string; dot: string; text: string }> = {
  live:       { label: 'LIVE',       dot: 'bg-green-400 animate-pulse', text: 'text-green-400' },
  connecting: { label: 'CONNECTING', dot: 'bg-yellow-400 animate-pulse', text: 'text-yellow-400' },
  error:      { label: 'ERROR',      dot: 'bg-red-400',                  text: 'text-red-400' },
  offline:    { label: 'OFFLINE',    dot: 'bg-slate-500',                text: 'text-slate-500' },
};

export default function ConnectionStatus() {
  const status  = useChartStore(s => s.sourceStatus);
  const candles = useChartStore(s => s.candles);
  const cfg     = STATUS_CONFIG[status];

  const lastPrice = candles.length > 0 ? candles[candles.length - 1].close : null;

  return (
    <div className="flex items-center gap-2">
      {lastPrice !== null && (
        <span className="text-white font-mono text-sm font-semibold">
          {formatPrice(lastPrice)}
        </span>
      )}
      <div className="flex items-center gap-1.5 bg-slate-800 rounded-full px-2 py-1">
        <span className={cn('w-1.5 h-1.5 rounded-full', cfg.dot)} />
        <span className={cn('text-xs font-medium tracking-wide', cfg.text)}>
          {cfg.label}
        </span>
      </div>
    </div>
  );
}
