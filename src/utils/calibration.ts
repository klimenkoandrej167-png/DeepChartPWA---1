/**
 * Statistical calibration for the direction-prediction score.
 *
 * The raw `score` produced by `computeDirectionScore()` (-1..+1) is a
 * hand-weighted heuristic, not a fitted probability. This module turns the
 * accumulated history of (score, actual outcome) pairs into:
 *
 *  1. A calibrated probability via 1D logistic regression (Platt scaling):
 *       P(up) = sigmoid(a * score + b)
 *     `a` and `b` are fit from real resolved predictions instead of assuming
 *     the naive linear mapping (score + 1) / 2.
 *
 *  2. A Brier score — the mean squared error between predicted probability
 *     and the actual binary outcome (0 = best possible, 0.25 = coin-flip
 *     baseline for a model that always predicts 50%).
 *
 *  3. A reliability curve — buckets predictions by predicted probability and
 *     compares it to the observed frequency of "up" in each bucket. A
 *     perfectly calibrated model has actualProb ≈ predictedProb in every
 *     bucket.
 *
 * Known simplification: calibration is fit globally across all symbols and
 * timeframes rather than per-pair, because any single pair/timeframe rarely
 * accumulates enough resolved samples on its own. If per-pair behavior
 * diverges significantly, this is the first place to split.
 */

export interface CalibrationSample {
  score: number;
  actualUp: boolean;
}

export interface CalibrationModel {
  a: number;
  b: number;
  n: number;
}

/** Minimum resolved samples required before we trust a fitted model over the prior. */
export const MIN_CALIBRATION_SAMPLES = 20;

/**
 * Prior model: approximates the original naive mapping (score+1)/2 in the
 * mid-range (small |score|), so the indicator doesn't visibly jump the
 * moment calibration switches on with too little data.
 */
const PRIOR_MODEL: CalibrationModel = { a: 2, b: 0, n: 0 };

export function sigmoid(x: number): number {
  return 1 / (1 + Math.exp(-x));
}

/**
 * Fits P(up) = sigmoid(a*score + b) via batch gradient descent on logistic loss.
 * Cheap enough to re-run on every resolved prediction — history is capped
 * (see predictionStore), so this is at most a few hundred points.
 */
export function fitPlattScaling(
  samples: CalibrationSample[],
  opts?: { lr?: number; iters?: number },
): CalibrationModel {
  const n = samples.length;
  if (n < MIN_CALIBRATION_SAMPLES) return { ...PRIOR_MODEL, n };

  const lr = opts?.lr ?? 0.1;
  const iters = opts?.iters ?? 400;

  let a = PRIOR_MODEL.a;
  let b = PRIOR_MODEL.b;

  for (let it = 0; it < iters; it++) {
    let gradA = 0;
    let gradB = 0;
    for (const s of samples) {
      const y = s.actualUp ? 1 : 0;
      const p = sigmoid(a * s.score + b);
      const err = p - y;
      gradA += err * s.score;
      gradB += err;
    }
    a -= lr * (gradA / n);
    b -= lr * (gradB / n);
  }

  return { a, b, n };
}

export function calibratedProbability(score: number, model: CalibrationModel): number {
  return sigmoid(model.a * score + model.b);
}

/** Brier score of the calibrated model against real outcomes. Lower is better; 0.25 = coin flip. */
export function computeBrierScore(samples: CalibrationSample[], model: CalibrationModel): number {
  if (samples.length === 0) return NaN;
  const sum = samples.reduce((acc, s) => {
    const p = calibratedProbability(s.score, model);
    const y = s.actualUp ? 1 : 0;
    return acc + (p - y) ** 2;
  }, 0);
  return sum / samples.length;
}

/** Brier score of the original naive linear mapping, kept for side-by-side comparison. */
export function baselineBrierScore(samples: CalibrationSample[]): number {
  if (samples.length === 0) return NaN;
  const sum = samples.reduce((acc, s) => {
    const p = (s.score + 1) / 2;
    const y = s.actualUp ? 1 : 0;
    return acc + (p - y) ** 2;
  }, 0);
  return sum / samples.length;
}

export interface CalibrationBucket {
  bucketLabel: string;
  predictedProb: number;
  actualProb: number;
  count: number;
}

/** Groups samples into `bins` equal-width probability buckets for a reliability diagram. */
export function computeCalibrationCurve(
  samples: CalibrationSample[],
  model: CalibrationModel,
  bins = 10,
): CalibrationBucket[] {
  const acc = Array.from({ length: bins }, () => ({ predSum: 0, actualSum: 0, count: 0 }));

  for (const s of samples) {
    const p = calibratedProbability(s.score, model);
    let idx = Math.floor(p * bins);
    if (idx >= bins) idx = bins - 1;
    if (idx < 0) idx = 0;
    acc[idx].predSum += p;
    acc[idx].actualSum += s.actualUp ? 1 : 0;
    acc[idx].count += 1;
  }

  return acc.map((b, i) => ({
    bucketLabel: `${Math.round((i / bins) * 100)}–${Math.round(((i + 1) / bins) * 100)}%`,
    predictedProb: b.count ? b.predSum / b.count : (i + 0.5) / bins,
    actualProb: b.count ? b.actualSum / b.count : 0,
    count: b.count,
  }));
}
