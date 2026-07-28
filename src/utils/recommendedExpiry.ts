import type { Interval } from '../types/candle';
import type { PatternType } from '../types/pattern';
import { intervalToMs } from './timeframeUtils';

/**
 * Computes a recommended expiration time in seconds based on the active
 * interval, ATR-based volatility, and the triggering pattern type.
 */
const BASE_CANDLES_BY_TYPE: Partial<Record<PatternType, number>> = {
  liquidity_sweep_bullish: 2, liquidity_sweep_bearish: 2,
  liquidity_sweep_continuation_bullish: 3, liquidity_sweep_continuation_bearish: 3,
  liquidity_sweep_reversal_bullish: 4, liquidity_sweep_reversal_bearish: 4,
  reaction_at_strong_ob_bullish: 3, reaction_at_strong_ob_bearish: 3,
  pin_bar_bullish: 2, pin_bar_bearish: 2,
  impulse_consolidation_breakout: 4,
  level_reaction_vwap_bullish: 2, level_reaction_vwap_bearish: 2,
  level_reaction_sr_bullish: 2, level_reaction_sr_bearish: 2,
  level_reaction_fib_ote_bullish: 3, level_reaction_fib_ote_bearish: 3,
  level_reaction_liquidity_pool_bullish: 2, level_reaction_liquidity_pool_bearish: 2,
};
const DEFAULT_BASE_CANDLES = 3;

export function computeRecommendedExpirySeconds(params: {
  interval: Interval;
  atr: number[];
  lastPrice: number;
  patternType: PatternType;
}): number {
  const { interval, atr, lastPrice, patternType } = params;

  let baseCandles = BASE_CANDLES_BY_TYPE[patternType] ?? DEFAULT_BASE_CANDLES;

  // Volatility adjustment: if current relative ATR is above the median of
  // the last 50 values, reduce by 1 candle (minimum 1).
  const recentAtr = atr.slice(-50).filter(v => !Number.isNaN(v) && Number.isFinite(v));
  if (recentAtr.length >= 10 && lastPrice > 0) {
    const sorted = [...recentAtr].sort((a, b) => a - b);
    const median = sorted[Math.floor(sorted.length / 2)];
    const currentAtr = atr[atr.length - 1];

    if (Number.isFinite(currentAtr) && currentAtr / lastPrice > median / lastPrice) {
      baseCandles = Math.max(1, baseCandles - 1);
    }
  }

  const intervalSec = intervalToMs(interval) / 1000;
  return baseCandles * intervalSec;
}
