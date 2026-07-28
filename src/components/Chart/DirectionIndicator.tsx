import { useEffect, useState } from 'react';
import { useChartStore } from '../../store/chartStore';
import { usePredictionStore } from '../../store/predictionStore';
import { calibratedProbability, MIN_CALIBRATION_SAMPLES } from '../../utils/calibration';
import { cn } from '../../utils/format';
import PredictionCalibrationPanel from './PredictionCalibrationPanel';

export default function DirectionIndicator() {
  const symbol      = useChartStore(s => s.symbol);
  const interval    = useChartStore(s => s.interval);
  const current     = usePredictionStore(s => s.current[`${symbol}_${interval}`]);
  const calibration = usePredictionStore(s => s.calibration);
  const [blink, setBlink] = useState(false);
  const [panelOpen, setPanelOpen] = useState(false);

  const candleTime = current?.candleTime;
  const score      = current?.score;

  useEffect(() => {
    if (candleTime === undefined) return;
    setBlink(true);
    const t = setTimeout(() => setBlink(false), 4500);
    return () => clearTimeout(t);
  }, [candleTime, score]);

  if (!current) return null;

  const isCalibrated = calibration.sampleSize >= MIN_CALIBRATION_SAMPLES;

  // Prefer the fitted (Platt-scaled) probability once enough resolved history exists;
  // otherwise fall back to the naive linear mapping, which the calibration model's
  // prior approximates, so the number doesn't jump the instant calibration kicks in.
  const probUp = isCalibrated
    ? Math.round(calibratedProbability(current.score, calibration.model) * 100)
    : Math.round((current.score + 1) * 50);

  const isGreen = current.score > 0.05;
  const isRed   = current.score < -0.05;

  return (
    <>
      <button
        type="button"
        onClick={() => setPanelOpen(true)}
        className={cn(
          'flex items-center gap-1 rounded-full px-2 py-0.5 border transition-colors flex-shrink-0',
          isGreen
            ? 'bg-green-900/60 border-green-700/60'
            : isRed
            ? 'bg-red-900/60 border-red-700/60'
            : 'bg-slate-800/60 border-slate-600/40',
          blink && (isGreen || isRed) && 'animate-pulse',
        )}
        title={
          isCalibrated
            ? `Calibrated probability (Platt scaling, n=${calibration.sampleSize}). Tap for details.`
            : `Weighted heuristic score, not yet calibrated (need ${MIN_CALIBRATION_SAMPLES}+ resolved predictions). Tap for details.`
        }
      >
        <span
          className={cn(
            'w-1.5 h-1.5 rounded-full flex-shrink-0',
            isGreen ? 'bg-green-400' : isRed ? 'bg-red-400' : 'bg-slate-400',
          )}
        />
        <span
          className={cn(
            'font-mono text-[10px] font-semibold',
            isGreen ? 'text-green-300' : isRed ? 'text-red-300' : 'text-slate-300',
          )}
        >
          {probUp}%{isGreen ? '▲' : isRed ? '▼' : ''}
          {!isCalibrated && <sup className="ml-0.5 text-slate-500">~</sup>}
        </span>
      </button>

      {panelOpen && <PredictionCalibrationPanel onClose={() => setPanelOpen(false)} />}
    </>
  );
}
