import { useChartStore } from '../../store/chartStore';
import { intervalLabel } from '../../utils/timeframeUtils';
import { cn } from '../../utils/format';
import type { Interval } from '../../types/candle';

const INTERVALS: Interval[] = ['1min', '5min', '15min', '30min', '1h', '4h', '1day'];

export default function IntervalSelector() {
  const interval    = useChartStore(s => s.interval);
  const setInterval = useChartStore(s => s.setInterval);

  return (
    <div className="flex items-center gap-0.5 bg-slate-800 rounded-lg p-0.5 w-full">
      {INTERVALS.map(ivl => (
        <button
          key={ivl}
          onClick={() => setInterval(ivl)}
          className={cn(
            'flex-shrink-0 px-2 py-1 text-xs font-medium rounded transition-colors',
            ivl === interval
              ? 'bg-blue-600 text-white'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-700',
          )}
        >
          {intervalLabel(ivl)}
        </button>
      ))}
    </div>
  );
}
