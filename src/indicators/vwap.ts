import type { Candle } from '../types/candle';

/**
 * Classic VWAP: Σ(typical_price * volume) / Σ(volume), cumulative from the
 * start of the array. If `resetAtNewDay` is true, the accumulator resets at
 * each UTC midnight boundary.
 *
 * Returns an empty array when ALL candles have volume === 0 (e.g. forex via
 * Deriv), so callers can detect "VWAP unavailable" without checking for NaN.
 */
export function calcVWAP(candles: Candle[], resetAtNewDay = true): number[] {
  if (candles.length === 0) return [];

  // If every candle has zero volume, VWAP is undefined — return [].
  if (candles.every(c => c.volume === 0)) return [];

  const result: number[] = new Array(candles.length).fill(NaN);
  let cumPV = 0;
  let cumV  = 0;
  let prevDay: number | null = null;

  for (let i = 0; i < candles.length; i++) {
    const c = candles[i];

    if (resetAtNewDay) {
      const day = Math.floor(c.time / 86400);
      if (prevDay !== null && day !== prevDay) {
        cumPV = 0;
        cumV  = 0;
      }
      prevDay = day;
    }

    const typical = (c.high + c.low + c.close) / 3;
    cumPV += typical * c.volume;
    cumV  += c.volume;

    result[i] = cumV > 0 ? cumPV / cumV : NaN;
  }

  return result;
}
