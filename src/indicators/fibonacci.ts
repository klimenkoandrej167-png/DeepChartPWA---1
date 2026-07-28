export interface FibLevels {
  high:  number;
  low:   number;
  levels: { ratio: number; price: number; label: string }[];
}

const RATIOS = [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1];

export function calcFibonacci(highs: number[], lows: number[]): FibLevels {
  if (highs.length === 0) return { high: 0, low: 0, levels: [] };

  // Use last 50 bars
  const slice = Math.min(50, highs.length);
  let high = -Infinity;
  let low  =  Infinity;
  for (let i = highs.length - slice; i < highs.length; i++) {
    if (highs[i] > high) high = highs[i];
    if (lows[i]  < low)  low  = lows[i];
  }

  const range = high - low;
  const levels = RATIOS.map(r => ({
    ratio: r,
    price: high - r * range,
    label: `${(r * 100).toFixed(1)}%`,
  }));

  return { high, low, levels };
}
