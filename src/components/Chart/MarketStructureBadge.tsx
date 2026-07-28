import { useHtfContextStore } from '../../store/htfContextStore';
import { computeMarketStructureState } from '../../utils/marketStructure';

const LABELS = {
  bullish: '▲ Bullish structure',
  bearish: '▼ Bearish structure',
  ranging: '↔ Range',
} as const;

const COLORS = {
  bullish: 'text-green-400 border-green-700',
  bearish: 'text-red-400 border-red-700',
  ranging: 'text-slate-400 border-slate-700',
} as const;

export function MarketStructureBadge() {
  const h1 = useHtfContextStore(s => s.h1);
  if (!h1 || h1.candles.length === 0) return null;
  const state = computeMarketStructureState(h1);
  return (
    <div className={`px-2 py-1 rounded-md bg-slate-800 border text-xs whitespace-nowrap ${COLORS[state]}`}>
      {LABELS[state]}
    </div>
  );
}
