import { useState } from 'react';
import { cn, formatPrice } from '../../utils/format';
import type { Signal } from '../../store/signalStore';

interface Props {
  signal: Signal;
}

const DIRECTION_STYLES = {
  bullish: {
    card:  'border-green-700/50 bg-gradient-to-r from-green-900/20 to-transparent',
    badge: 'bg-green-900/60 text-green-300 border border-green-700/50',
    dot:   'bg-green-400',
  },
  bearish: {
    card:  'border-red-700/50 bg-gradient-to-r from-red-900/20 to-transparent',
    badge: 'bg-red-900/60 text-red-300 border border-red-700/50',
    dot:   'bg-red-400',
  },
  neutral: {
    card:  'border-slate-700/50 bg-transparent',
    badge: 'bg-slate-700/60 text-slate-300 border border-slate-600/50',
    dot:   'bg-slate-400',
  },
};

export default function SignalTile({ signal }: Props) {
  const [expanded, setExpanded] = useState(false);
  const { pattern } = signal;
  const styles = DIRECTION_STYLES[pattern.direction];
  const isICB = pattern.type === 'impulse_consolidation_breakout';

  const time = new Date(signal.candleTime * 1000);
  const timeLabel = time.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const dateLabel = time.toLocaleDateString([], { month: 'short', day: 'numeric' });

  return (
    <div
      className={cn(
        'border rounded-xl p-3 cursor-pointer transition-all hover:border-opacity-80',
        styles.card,
      )}
      onClick={() => setExpanded(e => !e)}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className={cn('w-2 h-2 rounded-full flex-shrink-0', styles.dot)} />
          <span className="text-white font-medium text-sm truncate">{pattern.label}</span>
          {isICB && (
            <span className="text-xs bg-blue-900/60 text-blue-300 border border-blue-700/40 px-1.5 py-0.5 rounded-full flex-shrink-0">
              ICB
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <span className={cn('text-xs px-1.5 py-0.5 rounded-full', styles.badge)}>
            {pattern.confidence}%
          </span>
          <span className="text-slate-500 text-xs">{timeLabel}</span>
        </div>
      </div>

      <div className="flex items-center gap-2 mt-1">
        <span className="text-slate-400 text-xs font-mono">{signal.symbol}</span>
        <span className="text-slate-600 text-xs">{signal.interval}</span>
        <span className="text-slate-600 text-xs">{dateLabel}</span>
      </div>

      {expanded && isICB && pattern.extra && (
        <div className="mt-2 pt-2 border-t border-slate-700/50 grid grid-cols-2 gap-1.5">
          {pattern.extra.entry !== undefined && (
            <div className="text-xs">
              <span className="text-slate-500">Entry: </span>
              <span className="text-white font-mono">{formatPrice(pattern.extra.entry)}</span>
            </div>
          )}
          {pattern.extra.sl !== undefined && (
            <div className="text-xs">
              <span className="text-slate-500">SL: </span>
              <span className="text-red-400 font-mono">{formatPrice(pattern.extra.sl)}</span>
            </div>
          )}
          {pattern.extra.tp1 !== undefined && (
            <div className="text-xs">
              <span className="text-slate-500">TP1: </span>
              <span className="text-green-400 font-mono">{formatPrice(pattern.extra.tp1)}</span>
            </div>
          )}
          {pattern.extra.tp2 !== undefined && (
            <div className="text-xs">
              <span className="text-slate-500">TP2: </span>
              <span className="text-green-300 font-mono">{formatPrice(pattern.extra.tp2)}</span>
            </div>
          )}
          {pattern.extra.rr && (
            <div className="text-xs col-span-2">
              <span className="text-slate-500">R:R </span>
              <span className="text-blue-400 font-mono">{pattern.extra.rr}</span>
            </div>
          )}
          {pattern.extra.consolidationBars !== undefined && (
            <div className="text-xs">
              <span className="text-slate-500">Con Bars: </span>
              <span className="text-slate-300">{pattern.extra.consolidationBars}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
