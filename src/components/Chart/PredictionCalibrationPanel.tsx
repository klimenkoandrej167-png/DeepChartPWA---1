import { useMemo } from 'react';
import { X } from 'lucide-react';
import { usePredictionStore } from '../../store/predictionStore';
import {
  computeCalibrationCurve,
  MIN_CALIBRATION_SAMPLES,
  type CalibrationSample,
} from '../../utils/calibration';
import { featureNames, MIN_FEATURE_SAMPLES } from '../../utils/featureCalibration';

interface Props {
  onClose: () => void;
}

const CHART_W = 280;
const CHART_H = 180;
const PAD = 24;

export default function PredictionCalibrationPanel({ onClose }: Props) {
  const history     = usePredictionStore(s => s.history);
  const calibration = usePredictionStore(s => s.calibration);

  const samples: CalibrationSample[] = useMemo(
    () =>
      history
        .filter((h): h is typeof h & { actualUp: boolean } => h.resolved && h.actualUp !== null)
        .map(h => ({ score: h.score, actualUp: h.actualUp as boolean })),
    [history],
  );

  const curve = useMemo(
    () => computeCalibrationCurve(samples, calibration.model, 10),
    [samples, calibration.model],
  );

  const isCalibrated = calibration.sampleSize >= MIN_CALIBRATION_SAMPLES;
  const hasFeatureModel = calibration.featureModel !== null;
  const plotW = CHART_W - PAD * 2;
  const plotH = CHART_H - PAD * 2;
  const toX = (v: number) => PAD + v * plotW;
  const toY = (v: number) => PAD + (1 - v) * plotH;

  const diagonal = `M ${toX(0)} ${toY(0)} L ${toX(1)} ${toY(1)}`;
  const maxCount = Math.max(1, ...curve.map(b => b.count));

  const names = featureNames();
  const weights = calibration.featureModel?.weights ?? [];
  const maxAbsWeight = Math.max(0.01, ...weights.map(Math.abs));

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-slate-900 border border-slate-700 rounded-t-2xl sm:rounded-2xl w-full sm:max-w-md max-h-[90vh] flex flex-col shadow-2xl">
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-700/50">
          <h2 className="text-white font-semibold">Prediction Calibration</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-white p-1">
            <X size={18} />
          </button>
        </div>

        <div className="overflow-y-auto flex-1 px-4 py-4 space-y-5">
          {/* Status */}
          <section>
            <p className="text-slate-400 text-xs leading-relaxed">
              The direction score is a hand-weighted heuristic (pattern signals, EMA trend, RSI,
              MACD, BOS), not a fitted probability. This panel fits a real probability curve
              (Platt scaling / logistic regression) from resolved predictions, and shows how well
              it actually tracks outcomes.
            </p>
          </section>

          {/* Stats */}
          <section className="grid grid-cols-2 gap-3">
            <Stat label="Resolved samples" value={String(calibration.sampleSize)} />
            <Stat
              label="Status"
              value={isCalibrated ? 'Calibrated' : `Needs ${MIN_CALIBRATION_SAMPLES}+`}
              highlight={isCalibrated}
            />
            <Stat
              label="Brier (calibrated)"
              value={Number.isNaN(calibration.brier) ? '—' : calibration.brier.toFixed(3)}
              sub="lower is better, 0.25 = coin flip"
            />
            <Stat
              label="Brier (naive linear)"
              value={Number.isNaN(calibration.brierBaseline) ? '—' : calibration.brierBaseline.toFixed(3)}
              sub="old (score+1)/2 mapping"
            />
          </section>

          {/* Reliability diagram */}
          <section>
            <h3 className="text-slate-300 text-xs font-semibold uppercase tracking-wider mb-2">
              Reliability curve
            </h3>
            {samples.length === 0 ? (
              <p className="text-slate-500 text-xs">No resolved predictions yet.</p>
            ) : (
              <svg viewBox={`0 0 ${CHART_W} ${CHART_H}`} className="w-full h-auto">
                <line x1={PAD} y1={toY(0)} x2={PAD} y2={toY(1)} stroke="#475569" strokeWidth="1" />
                <line x1={PAD} y1={toY(0)} x2={CHART_W - PAD} y2={toY(0)} stroke="#475569" strokeWidth="1" />
                <path d={diagonal} stroke="#475569" strokeWidth="1" strokeDasharray="4 3" fill="none" />
                {curve.filter(b => b.count > 0).map((b, i) => (
                  <circle
                    key={i}
                    cx={toX(b.predictedProb)}
                    cy={toY(b.actualProb)}
                    r={3 + (b.count / maxCount) * 5}
                    fill="#38bdf8"
                    fillOpacity={0.75}
                  />
                ))}
                <text x={PAD} y={CHART_H - 4} fontSize="8" fill="#64748b">0%</text>
                <text x={CHART_W - PAD - 20} y={CHART_H - 4} fontSize="8" fill="#64748b">predicted 100%</text>
                <text x={2} y={PAD} fontSize="8" fill="#64748b" transform={`rotate(-90 10 ${PAD})`}>actual</text>
              </svg>
            )}
            <p className="text-slate-600 text-xs mt-2">
              Dot near the dashed diagonal = well calibrated at that confidence level. Dot size = sample count in that bucket.
            </p>
          </section>

          {/* Feature weights */}
          <section>
            <h3 className="text-slate-300 text-xs font-semibold uppercase tracking-wider mb-2">
              Factor weights
            </h3>
            {hasFeatureModel ? (
              <div className="space-y-1.5">
                {names.map((name, i) => {
                  const w = weights[i] ?? 0;
                  const pct = Math.abs(w) / maxAbsWeight;
                  const isPos = w >= 0;
                  return (
                    <div key={name} className="flex items-center gap-2">
                      <span className="text-slate-400 text-[10px] w-20 capitalize">{name}</span>
                      <div className="flex-1 h-3 bg-slate-800 rounded-full overflow-hidden relative">
                        <div
                          className={`h-full rounded-full ${isPos ? 'bg-green-500' : 'bg-red-500'}`}
                          style={{ width: `${pct * 100}%` }}
                        />
                      </div>
                      <span className={`font-mono text-[10px] w-12 text-right ${isPos ? 'text-green-400' : 'text-red-400'}`}>
                        {w >= 0 ? '+' : ''}{w.toFixed(3)}
                      </span>
                    </div>
                  );
                })}
                <p className="text-slate-600 text-[9px] mt-2">
                  Learned from {calibration.featureModel?.n ?? 0} resolved predictions with component data.
                  Green = bullish predictor, red = bearish.
                </p>
              </div>
            ) : (
              <p className="text-slate-500 text-xs">
                Needs {MIN_FEATURE_SAMPLES}+ resolved predictions with component data to train multi-factor model.
              </p>
            )}
          </section>
        </div>

        <div className="px-4 py-3 border-t border-slate-700/50">
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

function Stat({ label, value, sub, highlight }: { label: string; value: string; sub?: string; highlight?: boolean }) {
  return (
    <div className="bg-slate-800/50 border border-slate-700/40 rounded-lg px-3 py-2">
      <div className="text-slate-500 text-[10px] uppercase tracking-wide">{label}</div>
      <div className={`font-mono text-sm font-semibold ${highlight ? 'text-green-400' : 'text-white'}`}>
        {value}
      </div>
      {sub && <div className="text-slate-600 text-[9px] mt-0.5">{sub}</div>}
    </div>
  );
}
