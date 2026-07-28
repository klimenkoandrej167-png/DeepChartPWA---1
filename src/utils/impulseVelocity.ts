import type { Candle } from '../types/candle';
import { calcATR } from '../indicators/atr';

/**
 * Proxy for "speed of price movement" when real volume is unavailable
 * (e.g. forex via Deriv where volume is always 0).
 *
 * Compares the average absolute body size of the last `lookback` candles
 * to ATR, then compares the latest candle's body to that average.
 *
 * Returns a ratio where:
 *   > 1  → impulsive acceleration (latest candle is larger than recent average)
 *   < 1  → deceleration / consolidation
 *   ≈ 1  → normal pace
 *
 * Does NOT depend on volume at all.
 */
export function calcImpulseVelocity(candles: Candle[], lookback = 10): number {
  if (candles.length < 2) return 1;

  const atr = calcATR(candles);
  const lastAtr = atr[atr.length - 1];
  if (!lastAtr || !Number.isFinite(lastAtr) || lastAtr === 0) return 1;

  const slice = candles.slice(-lookback);
  const avgBody = slice.reduce((s, c) => s + Math.abs(c.close - c.open), 0) / slice.length;
  if (avgBody === 0) return 1;

  const lastBody = Math.abs(candles[candles.length - 1].close - candles[candles.length - 1].open);

  // Normalize: how does the latest candle's body compare to the recent average,
  // scaled by ATR so it's comparable across different volatility regimes.
  const avgRatio = avgBody / lastAtr;
  const lastRatio = lastBody / lastAtr;

  return avgRatio > 0 ? lastRatio / avgRatio : 1;
}

/**
 * Per-candle impulse velocity series (same definition as calcImpulseVelocity,
 * but evaluated at each index using a trailing lookback window).
 * Used as a volume proxy for the ICB volume gate on forex where volume is always 0.
 */
export function calcImpulseVelocitySeries(candles: Candle[], lookback = 10): number[] {
  const n = candles.length;
  const atr = calcATR(candles);
  const out = new Array<number>(n).fill(1);

  for (let i = 0; i < n; i++) {
    const a = atr[i];
    if (!a || !Number.isFinite(a) || a === 0) { out[i] = 1; continue; }
    const start = Math.max(0, i - lookback + 1);
    const slice = candles.slice(start, i + 1);
    if (slice.length === 0) { out[i] = 1; continue; }
    const avgBody = slice.reduce((s, c) => s + Math.abs(c.close - c.open), 0) / slice.length;
    if (avgBody === 0) { out[i] = 1; continue; }
    const body = Math.abs(candles[i].close - candles[i].open);
    const avgRatio = avgBody / a;
    const curRatio = body / a;
    out[i] = avgRatio > 0 ? curRatio / avgRatio : 1;
  }
  return out;
}
