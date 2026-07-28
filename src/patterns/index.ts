import type { Candle } from '../types/candle';
import type { PatternResult } from '../types/pattern';
import { detectSingleCandle } from './candlestick/single';
import { detectDoubleCandle } from './candlestick/double';
import { detectTripleCandle } from './candlestick/triple';
import { detectPinBar } from './advanced/pinBar';
import { detectInsideBar } from './advanced/insideBar';
import { detectLiquiditySweepReaction } from './advanced/liquiditySweepReaction';
import { detectImpulseBreakout } from './advanced/impulseBreakout';
import { detectStrongOrderBlockReaction } from './advanced/strongOrderBlockReaction';
import { detectMeanReversion } from './advanced/meanReversion';

export function runAllDetectors(candles: Candle[]): PatternResult[] {
  if (candles.length < 10) return [];

  const all: PatternResult[] = [
    ...detectSingleCandle(candles),
    ...detectDoubleCandle(candles),
    ...detectTripleCandle(candles),
    ...detectPinBar(candles),
    ...detectInsideBar(candles),
    ...detectLiquiditySweepReaction(candles),
    ...detectImpulseBreakout(candles),
    ...detectStrongOrderBlockReaction(candles),
    ...detectMeanReversion(candles),
  ];

  all.sort((a, b) => b.index - a.index);
  const seen = new Set<string>();
  const deduped: PatternResult[] = [];
  for (const p of all) {
    const key = `${p.index}_${p.type}`;
    if (!seen.has(key)) {
      seen.add(key);
      deduped.push(p);
    }
  }

  return deduped;
}
