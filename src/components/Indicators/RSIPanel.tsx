import { useIndicatorStore } from '../../store/indicatorStore';
import { useSettingsStore } from '../../store/settingsStore';

export default function RSIPanel() {
  const rsi     = useIndicatorStore(s => s.values.rsi);
  const enabled = useSettingsStore(s => s.indicators.rsi);

  if (!enabled) return null;

  const last = rsi.filter(v => !isNaN(v));
  const value = last[last.length - 1];

  if (value === undefined) return null;

  const color =
    value >= 70 ? 'text-red-400' :
    value <= 30 ? 'text-green-400' :
    'text-slate-300';

  const zone =
    value >= 70 ? 'Overbought' :
    value <= 30 ? 'Oversold' :
    'Neutral';

  return (
    <div className="flex items-center gap-2 bg-slate-800/60 rounded-lg px-2 py-1">
      <span className="text-slate-500 text-xs">RSI</span>
      <span className={`font-mono text-sm font-semibold ${color}`}>{value.toFixed(1)}</span>
      <span className={`text-xs ${color}`}>{zone}</span>
    </div>
  );
}
