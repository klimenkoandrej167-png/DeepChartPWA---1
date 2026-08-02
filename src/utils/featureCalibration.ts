import { FEATURE_VECTOR_KEYS } from './directionPrediction';

export interface FeatureSample {
  features: number[];
  actualUp: boolean;
}

export interface FeatureModel {
  weights: number[];
  bias: number;
  n: number;
}

export const MIN_FEATURE_SAMPLES = 60;
const L2_LAMBDA = 0.01;

/**
 * Single source of truth for feature names — imported from directionPrediction.ts
 * so it always matches the feature vector produced by componentsToFeatureVector().
 */
const FEATURE_NAMES: string[] = [...FEATURE_VECTOR_KEYS];

export function featureNames(): string[] {
  return FEATURE_NAMES;
}

function sigmoid(x: number): number {
  if (x < -30) return 0;
  if (x > 30) return 1;
  return 1 / (1 + Math.exp(-x));
}

export function fitFeatureLogisticRegression(
  samples: FeatureSample[],
  opts?: { lr?: number; iters?: number },
): FeatureModel | null {
  const n = samples.length;
  if (n < MIN_FEATURE_SAMPLES) return null;

  const dim = samples[0].features.length;
  const lr = opts?.lr ?? 0.05;
  const iters = opts?.iters ?? 600;

  const weights = new Array(dim).fill(0);
  let bias = 0;

  for (let it = 0; it < iters; it++) {
    const gradW = new Array(dim).fill(0);
    let gradB = 0;

    for (const s of samples) {
      let z = bias;
      for (let i = 0; i < dim; i++) z += weights[i] * s.features[i];
      const p = sigmoid(z);
      const err = p - (s.actualUp ? 1 : 0);
      for (let i = 0; i < dim; i++) gradW[i] += err * s.features[i];
      gradB += err;
    }

    for (let i = 0; i < dim; i++) {
      weights[i] -= lr * (gradW[i] / n + L2_LAMBDA * weights[i]);
    }
    bias -= lr * (gradB / n);
  }

  return { weights, bias, n };
}
