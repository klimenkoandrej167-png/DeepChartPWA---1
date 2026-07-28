import type { Candle } from '../types/candle';
import type { OrderBlock, FVG, BOSEvent } from '../store/indicatorStore';
import type { LiquidityPool } from '../indicators/liquidityPools';
import { calcFibonacci } from '../indicators/fibonacci';

export type OBStrength = 'weak' | 'medium' | 'strong';

export interface ScoredOrderBlock extends OrderBlock {
  strengthScore: number;
  strength: OBStrength;
}

const STRONG_OB_THRESHOLD = 60;
const MEDIUM_OB_THRESHOLD = 35;

export function scoreOrderBlocks(
  orderBlocks: OrderBlock[],
  fvgs: FVG[],
  bosEvents: BOSEvent[],
  candles: Candle[],
  atr: number[],
  pools: LiquidityPool[],
): ScoredOrderBlock[] {
  const lastAtr = atr.length ? atr[atr.length - 1] : 0;
  const fib = calcFibonacci(candles.map(c => c.high), candles.map(c => c.low));
  const oteRatios = [0.62, 0.705, 0.79];
  const fibRange = fib.high - fib.low;

  return orderBlocks.map(ob => {
    let score = 0;

    const obSize = ob.top - ob.bottom;
    if (lastAtr > 0 && obSize > 1.2 * lastAtr) score += 20;

    const nearbyFvg = fvgs.find(f =>
      f.type === ob.type && Math.abs(f.time - ob.time) <= 3 * 60_000
    );
    if (nearbyFvg) score += 25;

    const bosAfter = bosEvents.find(b => b.type === ob.type && b.time >= ob.time);
    if (bosAfter) score += 20;

    if (fibRange > 0) {
      const mid = (ob.top + ob.bottom) / 2;
      const inOte = oteRatios.some(r => {
        const level = fib.high - r * fibRange;
        return Math.abs(mid - level) < 0.15 * fibRange;
      });
      if (inOte) score += 20;
    }

    if (lastAtr > 0) {
      const mid = (ob.top + ob.bottom) / 2;
      const nearbyPool = pools.find(p => !p.swept && Math.abs(p.price - mid) < lastAtr);
      if (nearbyPool) score += 15;
    }

    const strength: OBStrength =
      score >= STRONG_OB_THRESHOLD ? 'strong' :
      score >= MEDIUM_OB_THRESHOLD ? 'medium' : 'weak';
    return { ...ob, strengthScore: score, strength };
  });
}
