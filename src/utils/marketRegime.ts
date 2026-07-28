export type VolatilityRegime = 'low' | 'normal' | 'high';

export function detectVolatilityRegime(atr: number[], lookback = 200): VolatilityRegime {
  const valid = atr.slice(-lookback).filter(v => !Number.isNaN(v) && Number.isFinite(v) && v > 0);
  if (valid.length < 20) return 'normal';

  const current = valid[valid.length - 1];
  const sorted = [...valid].sort((a, b) => a - b);
  const p30 = sorted[Math.floor(sorted.length * 0.3)];
  const p70 = sorted[Math.floor(sorted.length * 0.7)];

  if (current < p30) return 'low';
  if (current > p70) return 'high';
  return 'normal';
}
