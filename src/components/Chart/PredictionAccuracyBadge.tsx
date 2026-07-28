import { useMemo, useState } from 'react';
import { useChartStore } from '../../store/chartStore';
import { usePredictionStore } from '../../store/predictionStore';
import PredictionCalibrationPanel from './PredictionCalibrationPanel';

export default function PredictionAccuracyBadge() {
  const symbol      = useChartStore(s => s.symbol);
  const interval    = useChartStore(s => s.interval);
  const history     = usePredictionStore(s => s.history);
  const calibration = usePredictionStore(s => s.calibration);
  const [panelOpen, setPanelOpen] = useState(false);

  const stats = useMemo(() => {
    const resolved = history.filter(
      h =>
        h.symbol === symbol &&
        h.interval === interval &&
        h.resolved &&
        h.correct !== null,
    );
    const correct = resolved.filter(h => h.correct).length;
    return { total: resolved.length, correct };
  }, [history, symbol, interval]);

  if (stats.total === 0) return null;

  const pct   = Math.round((stats.correct / stats.total) * 100);
  const color =
    pct >= 60 ? 'text-green-400' : pct >= 40 ? 'text-slate-400' : 'text-red-400';

  const brierLabel = Number.isNaN(calibration.brier) ? '—' : calibration.brier.toFixed(3);

  return (
    <>
      <button
        type="button"
        onClick={() => setPanelOpen(true)}
        className="flex items-center gap-1 bg-slate-800/60 border border-slate-700/40 rounded-full px-2 py-0.5 flex-shrink-0"
        title={`Win rate for ${symbol} ${interval}. Global Brier score: ${brierLabel} (0=perfect, 0.25=coin flip). Tap for details.`}
      >
        <span className="text-slate-500 text-[10px]">Acc</span>
        <span className={`font-mono text-[10px] font-semibold ${color}`}>
          {pct}%
        </span>
      </button>

      {panelOpen && <PredictionCalibrationPanel onClose={() => setPanelOpen(false)} />}
    </>
  );
}
