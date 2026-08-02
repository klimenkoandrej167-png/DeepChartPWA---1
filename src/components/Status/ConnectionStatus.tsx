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
  const activeSources = useChartStore(s => s.activeSources);
  const cfg = STATUS_CONFIG[status];

  const lastPrice = candles.length > 0 ? candles[candles.length - 1].close : null;

  // When the server-side proxy is the active source, updates arrive via REST
  // polling (not WebSocket), so latency is higher. Show a warning badge so the
  // user knows the chart isn't frozen — it's just updating more slowly.
  const isProxy = activeSources.includes('proxy');

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
      {isProxy && (
        <div
          className="flex items-center gap-1 bg-amber-500/15 border border-amber-500/30 rounded-full px-2 py-1"
          title="Updates are slower because the server-side proxy uses REST polling instead of a live WebSocket connection"
        >
          <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
          <span className="text-xs font-medium text-amber-400 tracking-wide">
            SLOW UPDATES
          </span>
        </div>
      )}
    </div>
  );
}
