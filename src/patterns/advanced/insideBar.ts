import type { Candle } from '../../types/candle';
import type { PatternResult } from '../../types/pattern';

export function detectInsideBar(candles: Candle[]): PatternResult[] {
  const results: PatternResult[] = [];

  for (let i = 1; i < candles.length; i++) {
    const mother = candles[i - 1];
    const inside = candles[i];

    if (
      inside.high <= mother.high &&
      inside.low  >= mother.low
    ) {
      results.push({
        type:       'inside_bar',
        direction:  'neutral',
        index:      i,
        confidence: 58,
        label:      'Inside Bar',
      });
    }
  }
  return results;
}
