import type { Candle } from '../../types/candle';
import type { PatternResult } from '../../types/pattern';

function body(c: Candle) { return Math.abs(c.close - c.open); }
function isBull(c: Candle) { return c.close >= c.open; }
function isBear(c: Candle) { return c.close < c.open; }

export function detectDoubleCandle(candles: Candle[]): PatternResult[] {
  const results: PatternResult[] = [];
  if (candles.length < 2) return results;

  for (let i = 1; i < candles.length; i++) {
    const p = candles[i - 1];
    const c = candles[i];
    const pb = body(p);
    const cb = body(c);

    // Bullish Engulfing
    if (
      isBear(p) && isBull(c) &&
      c.open < p.close && c.close > p.open &&
      cb > pb
    ) {
      results.push({ type: 'bullish_engulfing', direction: 'bullish', index: i, confidence: 78, label: 'Bullish Engulfing' });
    }

    // Bearish Engulfing
    if (
      isBull(p) && isBear(c) &&
      c.open > p.close && c.close < p.open &&
      cb > pb
    ) {
      results.push({ type: 'bearish_engulfing', direction: 'bearish', index: i, confidence: 78, label: 'Bearish Engulfing' });
    }

    // Piercing Line (bullish)
    if (
      isBear(p) && isBull(c) &&
      c.open < p.close &&
      c.close > (p.open + p.close) / 2 &&
      c.close < p.open
    ) {
      results.push({ type: 'piercing_line', direction: 'bullish', index: i, confidence: 68, label: 'Piercing Line' });
    }

    // Dark Cloud Cover (bearish)
    if (
      isBull(p) && isBear(c) &&
      c.open > p.close &&
      c.close < (p.open + p.close) / 2 &&
      c.close > p.open
    ) {
      results.push({ type: 'dark_cloud_cover', direction: 'bearish', index: i, confidence: 68, label: 'Dark Cloud Cover' });
    }

    // Bullish Harami
    if (
      isBear(p) && isBull(c) &&
      c.open > p.close && c.close < p.open &&
      cb < pb * 0.6
    ) {
      results.push({ type: 'bullish_harami', direction: 'bullish', index: i, confidence: 60, label: 'Bullish Harami' });
    }

    // Bearish Harami
    if (
      isBull(p) && isBear(c) &&
      c.open < p.close && c.close > p.open &&
      cb < pb * 0.6
    ) {
      results.push({ type: 'bearish_harami', direction: 'bearish', index: i, confidence: 60, label: 'Bearish Harami' });
    }

    // Tweezer Bottom
    if (
      isBear(p) && isBull(c) &&
      Math.abs(p.low - c.low) / p.low < 0.001
    ) {
      results.push({ type: 'tweezer_bottom', direction: 'bullish', index: i, confidence: 62, label: 'Tweezer Bottom' });
    }

    // Tweezer Top
    if (
      isBull(p) && isBear(c) &&
      Math.abs(p.high - c.high) / p.high < 0.001
    ) {
      results.push({ type: 'tweezer_top', direction: 'bearish', index: i, confidence: 62, label: 'Tweezer Top' });
    }
  }
  return results;
}
