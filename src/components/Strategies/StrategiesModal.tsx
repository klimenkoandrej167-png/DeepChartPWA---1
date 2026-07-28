import { X } from 'lucide-react';
import { useStrategiesStore, type StrategyToggles } from '../../store/strategiesStore';
import { cn } from '../../utils/format';

interface Props {
  onClose: () => void;
}

const STRATEGY_LABELS: Record<keyof StrategyToggles, { label: string; desc: string }> = {
  candlestickSingle: { label: 'Single-candle patterns', desc: 'Hammer, Doji, Marubozu, Shooting Star…' },
  candlestickDouble: { label: 'Double-candle patterns', desc: 'Engulfing, Harami, Piercing Line, Tweezer…' },
  candlestickTriple: { label: 'Triple-candle patterns', desc: 'Morning/Evening Star, Three Soldiers/Crows…' },
  pinBar:            { label: 'Pin Bar', desc: 'Rejection wick reversal pattern' },
  insideBar:         { label: 'Inside Bar', desc: 'Consolidation inside previous range' },
  liquiditySweep:    { label: 'Liquidity Sweep', desc: 'Stop-hunt wick beyond recent high/low' },
  impulseConsolidationBreakout: {
    label: 'Impulse → Consolidation → Breakout',
    desc:  'ICB continuation pattern with Entry / SL / TP1 / TP2 / RR',
  },
};

export default function StrategiesModal({ onClose }: Props) {
  const { enabled, toggle } = useStrategiesStore();
  const keys = Object.keys(STRATEGY_LABELS) as (keyof StrategyToggles)[];
  const activeCount = keys.filter(k => enabled[k]).length;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-slate-900 border border-slate-700 rounded-t-2xl sm:rounded-2xl w-full sm:max-w-md max-h-[90vh] flex flex-col shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-700/50 flex-shrink-0">
          <div>
            <h2 className="text-white font-semibold">Strategies</h2>
            <p className="text-slate-500 text-xs mt-0.5">{activeCount}/{keys.length} active</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white p-1 rounded-lg transition-colors">
            <X size={18} />
          </button>
        </div>

        {/* Strategy list */}
        <div className="overflow-y-auto flex-1 px-4 py-4 space-y-1">
          {keys.map(key => (
            <div
              key={key}
              className="flex items-center justify-between py-2.5 border-b border-slate-800/60 last:border-0"
            >
              <div className="pr-3 min-w-0">
                <div className="text-slate-200 text-sm font-medium">{STRATEGY_LABELS[key].label}</div>
                <div className="text-slate-500 text-xs mt-0.5">{STRATEGY_LABELS[key].desc}</div>
              </div>
              <button
                onClick={() => toggle(key)}
                className={cn(
                  'relative w-11 h-6 rounded-full transition-colors flex-shrink-0',
                  enabled[key] ? 'bg-blue-600' : 'bg-slate-600',
                )}
                aria-pressed={enabled[key]}
              >
                <span
                  className={cn(
                    'absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform',
                    enabled[key] ? 'translate-x-5' : 'translate-x-0',
                  )}
                />
              </button>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="px-4 py-3 border-t border-slate-700/50 flex-shrink-0">
          <button
            onClick={onClose}
            className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-xl transition-colors"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
