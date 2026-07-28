import type { Candle } from '../../types/candle';
import type { PatternResult } from '../../types/pattern';
import type { LiquidityPool } from '../../indicators/liquidityPools';
import { detectLiquiditySweep } from './liquiditySweep';

const CONTINUATION_SEARCH_ATR_MULT = 3;

export function detectLiquiditySweepReaction(
  candles: Candle[],
  pools: LiquidityPool[] = [],
  atr: number[] = [],
  htfSwingHigh?: number,
  htfSwingLow?: number,
): PatternResult[] {
  const baseSweeps = detectLiquiditySweep(candles, htfSwingHigh, htfSwingLow);
  if (baseSweeps.length === 0) return [];

  const lastAtr = atr.length ? atr[atr.length - 1] : undefined;
  if (!lastAtr || pools.length === 0) {
    return baseSweeps;
  }

  const searchRange = lastAtr * CONTINUATION_SEARCH_ATR_MULT;

  return baseSweeps.map(p => {
    const sweptPrice = candles[p.index]?.close ?? 0;
    const isBull = p.direction === 'bullish';

    const nextPool = pools.find(pool => {
      if (pool.swept) return false;
      if (isBull && pool.type !== 'buy_side') return false;
      if (!isBull && pool.type !== 'sell_side') return false;
      const dist = Math.abs(pool.price - sweptPrice);
      if (dist > searchRange) return false;
      return isBull ? pool.price > sweptPrice : pool.price < sweptPrice;
    });

    const scenario = nextPool ? 'reversal' : 'continuation';
    const newType = isBull
      ? (scenario === 'reversal' ? 'liquidity_sweep_reversal_bullish' : 'liquidity_sweep_continuation_bullish')
      : (scenario === 'reversal' ? 'liquidity_sweep_reversal_bearish' : 'liquidity_sweep_continuation_bearish');

    return {
      ...p,
      type: newType as PatternResult['type'],
      label: scenario === 'reversal' ? 'Liquidity Sweep — Reversal' : 'Liquidity Sweep — Continuation',
      confidence: scenario === 'reversal' ? Math.min(95, p.confidence + 10) : p.confidence,
    };
  });
}
