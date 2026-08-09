import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import {
  fitPlattScaling,
  computeBrierScore,
  baselineBrierScore,
  sigmoid,
  type CalibrationModel,
  type CalibrationSample,
} from '../utils/calibration';
import {
  fitFeatureLogisticRegression,
  type FeatureModel,
  type FeatureSample,
} from '../utils/featureCalibration';
import type { DirectionComponents } from '../utils/directionPrediction';
import { componentsToFeatureVector } from '../utils/directionPrediction';

interface Prediction {
  symbol: string;
  interval: string;
  candleTime: number;
  score: number;
  priceAtPrediction: number;
  resolved: boolean;
  correct: boolean | null;
  actualUp: boolean | null;
  components?: DirectionComponents;
}

interface CalibrationStats {
  model: CalibrationModel;
  brier: number;
  brierBaseline: number;
  sampleSize: number;
  featureModel: FeatureModel | null;
}

interface PredictionState {
  current: Record<string, Prediction>;
  history: Prediction[];
  calibration: CalibrationStats;
  recordPrediction: (p: {
    symbol: string;
    interval: string;
    candleTime: number;
    score: number;
    priceAtPrediction: number;
    components?: DirectionComponents;
  }) => void;
  resolveForCandle: (p: {
    symbol: string;
    interval: string;
    candleTime: number;
    actualClose: number;
  }) => void;
}

function key(symbol: string, interval: string): string {
  return `${symbol}_${interval}`;
}

const MAX_HISTORY_PER_PAIR = 100;
const MAX_HISTORY_TOTAL = 1000;

const DEFAULT_CALIBRATION: CalibrationStats = {
  model: { a: 2, b: 0, n: 0 },
  brier: NaN,
  brierBaseline: NaN,
  sampleSize: 0,
  featureModel: null,
};

function recalibrate(history: Prediction[]): CalibrationStats {
  const resolvedAll = history.filter(h => h.resolved && h.actualUp !== null);
  const samples: CalibrationSample[] = resolvedAll
    .map(h => ({ score: h.score, actualUp: h.actualUp as boolean }));

  const model = fitPlattScaling(samples);

  // Feature-level model — only uses records with components
  const featureSamples: FeatureSample[] = resolvedAll
    .filter(h => h.components)
    .map(h => ({ features: componentsToFeatureVector(h.components!), actualUp: h.actualUp as boolean }));

  const featureModel = fitFeatureLogisticRegression(featureSamples);

  return {
    model,
    brier: computeBrierScore(samples, model),
    brierBaseline: baselineBrierScore(samples),
    sampleSize: samples.length,
    featureModel,
  };
}

let resolveCount = 0;

export const usePredictionStore = create<PredictionState>()(
  persist(
    (set, get) => ({
      current: {},
      history: [],
      calibration: DEFAULT_CALIBRATION,

      recordPrediction({ symbol, interval, candleTime, score, priceAtPrediction, components }) {
        set((state) => ({
          current: {
            ...state.current,
            [key(symbol, interval)]: {
              symbol, interval, candleTime, score, priceAtPrediction,
              resolved: false, correct: null, actualUp: null,
              components,
            },
          },
        }));
      },

      resolveForCandle({ symbol, interval, candleTime, actualClose }) {
        const k    = key(symbol, interval);
        const pred = get().current[k];
        if (!pred || pred.resolved || pred.candleTime !== candleTime) return;

        const actualUp    = actualClose > pred.priceAtPrediction;
        const predictedUp = pred.score > 0;
        const tie      = actualClose === pred.priceAtPrediction;
        const correct  = (pred.score === 0 || tie) ? null : actualUp === predictedUp;

        const resolved: Prediction = {
          ...pred,
          resolved: true,
          correct,
          actualUp: tie ? null : actualUp,
        };

        set((state) => {
          const pairHist  = state.history.filter(h => key(h.symbol, h.interval) === k);
          const otherHist = state.history.filter(h => key(h.symbol, h.interval) !== k);
          const updatedPair = [resolved, ...pairHist].slice(0, MAX_HISTORY_PER_PAIR);
          const newHistory = [...updatedPair, ...otherHist].slice(0, MAX_HISTORY_TOTAL);

          return {
            history: newHistory,
            current: { ...state.current, [k]: resolved },
            calibration: (++resolveCount % 5 === 0) ? recalibrate(newHistory) : get().calibration,
          };
        });
      },
    }),
    {
      name: 'dc_predictions',
      version: 4,
      partialize: (s) => ({ history: s.history, calibration: s.calibration }),
      migrate: (persisted: unknown, version: number) => {
        if (version < 2) {
          return { history: [], calibration: DEFAULT_CALIBRATION };
        }
        let p = persisted as Partial<PredictionState>;
        // v2 → v3: add featureModel to calibration, keep history
        p = {
          ...p,
          calibration: {
            ...DEFAULT_CALIBRATION,
            ...(p?.calibration ?? {}),
            featureModel: null,
          },
        } as PredictionState;
        // v3 → v4: feature vector widened to 8 dims (added meanReversion). Old
        // 7-dim `components` records are incompatible with the new model — strip
        // them (raw score/outcome history for 1D Platt calibration is retained)
        // and reset the feature model so it retrains on new 8-dim samples only.
        if (version < 4) {
          const history = (p.history ?? []).map(h =>
            h.components && Object.keys(h.components).length < 8 ? { ...h, components: undefined } : h
          );
          const cal = p.calibration as Partial<CalibrationStats> | undefined;
          p = { ...p, history, calibration: { ...DEFAULT_CALIBRATION, ...cal, featureModel: null } } as PredictionState;
        }
        return p as PredictionState;
      },
      onRehydrateStorage: () => (state) => {
        if (state) state.calibration = recalibrate(state.history);
      },
    },
  ),
);

export { sigmoid };
