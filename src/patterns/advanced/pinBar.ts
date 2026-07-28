import type { Candle } from '../../types/candle';
import type { PatternResult } from '../../types/pattern';

function body(c: Candle) { return Math.abs(c.close - c.open); }
function upperWick(c: Candle) { return c.high - Math.max(c.open, c.close); }
function lowerWick(c: Candle) { return Math.min(c.open, c.close) - c.low; }

export function detectPinBar(candles: Candle[]): PatternResult[] {
  const results: PatternResult[] = [];

  for (let i = 1; i < candles.length; i++) {
    const c = candles[i];
    const b  = body(c);
    const uw = upperWick(c);
    const lw = lowerWick(c);
    if (b === 0) continue;

    // Bearish pin bar: long upper wick >= 2x body
    if (uw >= 2 * b && lw < 0.5 * b) {
      results.push({
        type:       'pin_bar_bearish',
        direction:  'bearish',
        index:      i,
        confidence: 72,
        label:      'Bearish Pin Bar',
      });
    }

    // Bullish pin bar: long lower wick >= 2x body
    if (lw >= 2 * b && uw < 0.5 * b) {
      results.push({
        type:       'pin_bar_bullish',
        direction:  'bullish',
        index:      i,
        confidence: 72,
        label:      'Bullish Pin Bar',
      });
    }
  }
  return results;
}
