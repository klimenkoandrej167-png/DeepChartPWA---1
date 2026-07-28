import { useIndicatorStore } from '../../store/indicatorStore';
import { useSettingsStore } from '../../store/settingsStore';
import { formatPrice } from '../../utils/format';

export default function BOSLayer() {
  const bosEvents = useIndicatorStore(s => s.values.bosEvents);
  const enabled   = useSettingsStore(s => s.indicators.bos);

  if (!enabled || bosEvents.length === 0) return null;

  return (
    <div className="absolute top-16 left-0 pointer-events-none z-10 flex flex-col gap-1 p-2">
      {bosEvents.slice(-3).map((bos, i) => (
        <div
          key={i}
          className={`text-xs px-1.5 py-0.5 rounded border font-mono ${
            bos.type === 'bullish'
              ? 'bg-blue-900/70 text-blue-300 border-blue-600/60'
              : 'bg-rose-900/70 text-rose-300 border-rose-600/60'
          }`}
        >
          BoS {bos.type === 'bullish' ? '▲' : '▼'} @ {formatPrice(bos.price)}
        </div>
      ))}
    </div>
  );
}
