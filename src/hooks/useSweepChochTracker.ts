import { useRef } from 'react';
import type { Candle } from '../types/candle';
import type { PatternResult } from '../types/pattern';
import type { SwingPoint } from '../store/indicatorStore';

interface PendingSweep {
  direction: 'bullish' | 'bearish';
  sweptExtreme: number;
  structureLevel: number;
  detectedAtIndex: number;
  detectedAtTime: number;
  barsWaited: number;
}

const MAX_WAIT_BARS = 10;

function isHighSwing(sw: SwingPoint): boolean {
  return sw.type === 'HH' || sw.type === 'LH';
}

function isLowSwing(sw: SwingPoint): boolean {
  return sw.type === 'HL' || sw.type === 'LL';
}

export function useSweepChochTracker() {
  const pendingRef = useRef<PendingSweep[]>([]);

  function update(
    candles: Candle[],
    freshSweeps: PatternResult[],
    swings: SwingPoint[],
  ): PatternResult[] {
    const confirmed: PatternResult[] = [];
    const last = candles[candles.length - 1];
    if (!last) return confirmed;

    for (const s of freshSweeps) {
      const sweepTime = candles[s.index]?.time;
      if (sweepTime === undefined) continue;

      const already = pendingRef.current.some(p => p.detectedAtTime === sweepTime);
      if (already) continue;

      // For a bearish sweep (sweep up then reversal down), structure must break a swing low below.
      // For a bullish sweep (sweep down then reversal up), structure must break a swing high above.
      const relevantSwing = s.direction === 'bearish'
        ? [...swings].reverse().find(sw => isLowSwing(sw) && sw.index < s.index)
        : [...swings].reverse().find(sw => isHighSwing(sw) && sw.index < s.index);
      if (!relevantSwing) continue;

      const sweptExtreme = s.direction === 'bearish'
        ? (candles[s.index]?.high ?? last.close)
        : (candles[s.index]?.low ?? last.close);

      pendingRef.current.push({
        direction: s.direction === 'bearish' ? 'bearish' : 'bullish',
        sweptExtreme,
        structureLevel: relevantSwing.price,
        detectedAtIndex: s.index,
        detectedAtTime: candles[s.index]?.time ?? last.time,
        barsWaited: 0,
      });
    }

    pendingRef.current = pendingRef.current.filter(p => {
      p.barsWaited++;
      if (p.barsWaited > MAX_WAIT_BARS) return false;

      const brokenDown = p.direction === 'bearish' && last.close < p.structureLevel;
      const brokenUp   = p.direction === 'bullish' && last.close > p.structureLevel;

      if (brokenDown || brokenUp) {
        confirmed.push({
          type: p.direction === 'bearish' ? 'liquidity_sweep_reversal_bearish' : 'liquidity_sweep_reversal_bullish',
          direction: p.direction,
          index: candles.length - 1,
          confidence: 85,
          label: 'Confirmed CHoCH after Liquidity Sweep',
          extra: { sweptExtreme: p.sweptExtreme, structureLevel: p.structureLevel } as PatternResult['extra'],
        });
        return false;
      }
      return true;
    });

    return confirmed;
  }

  return { update };
}
