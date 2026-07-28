import type { Candle } from '../../types/candle';
import type { PatternResult } from '../../types/pattern';

const LOOKBACK = 10;

export function detectLiquiditySweep(
  candles: Candle[],
  htfSwingHigh?: number,
  htfSwingLow?: number,
): PatternResult[] {
  const results: PatternResult[] = [];
  const useHtf = htfSwingHigh !== undefined && htfSwingLow !== undefined;

  for (let i = (useHtf ? 1 : LOOKBACK + 1); i < candles.length; i++) {
    const cur = candles[i];
    const prev = candles[i - 1];

    let swingHigh: number;
    let swingLow: number;

    if (useHtf) {
      swingHigh = htfSwingHigh as number;
      swingLow  = htfSwingLow  as number;
    } else {
      // Fallback to short lookback when HTF swings are not provided
      swingHigh = -Infinity;
      swingLow  = Infinity;
      for (let j = i - LOOKBACK; j < i - 1; j++) {
        if (candles[j].high > swingHigh) swingHigh = candles[j].high;
        if (candles[j].low  < swingLow)  swingLow  = candles[j].low;
      }
    }

    // Bullish sweep: wick below swing low then close back above
    if (prev.low < swingLow && cur.close > swingLow && cur.close > cur.open) {
      results.push({
        type:       'liquidity_sweep_bullish',
        direction:  'bullish',
        index:      i,
        confidence: 75,
        label:      'Liquidity Sweep (Bull)',
      });
    }

    // Bearish sweep: wick above swing high then close back below
    if (prev.high > swingHigh && cur.close < swingHigh && cur.close < cur.open) {
      results.push({
        type:       'liquidity_sweep_bearish',
        direction:  'bearish',
        index:      i,
        confidence: 75,
        label:      'Liquidity Sweep (Bear)',
      });
    }
  }
  return results;
}
