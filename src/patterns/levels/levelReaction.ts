import type { Candle } from '../../types/candle';
import type { PatternResult } from '../../types/pattern';
import type { SRLevel } from '../../store/indicatorStore';
import type { LiquidityPool } from '../../indicators/liquidityPools';
import { calcFibonacci } from '../../indicators/fibonacci';

const TOUCH_TOLERANCE_ATR_MULT = 0.25;
const OTE_RATIOS = [0.62, 0.705, 0.79];

export function detectLevelReactions(params: {
  candles: Candle[];
  vwap: number[];
  srLevels: SRLevel[];
  liquidityPools: LiquidityPool[];
  atr: number[];
}): PatternResult[] {
  const { candles, vwap, srLevels, liquidityPools, atr } = params;
  if (candles.length < 3) return [];

  const last = candles[candles.length - 1];
  const prev = candles[candles.length - 2];
  const lastAtr = atr.length ? atr[atr.length - 1] : 0;
  if (lastAtr <= 0) return [];
  const tolerance = lastAtr * TOUCH_TOLERANCE_ATR_MULT;

  const bullReaction = last.close > last.open && last.close > prev.close;
  const bearReaction = last.close < last.open && last.close < prev.close;
  const results: PatternResult[] = [];

  const vwapVal = vwap.length ? vwap[vwap.length - 1] : undefined;
  if (vwapVal !== undefined && Math.abs(last.low - vwapVal) < tolerance && bullReaction) {
    results.push({ type: 'level_reaction_vwap_bullish', direction: 'bullish', index: candles.length - 1, confidence: 55, label: 'Reaction at VWAP' });
  }
  if (vwapVal !== undefined && Math.abs(last.high - vwapVal) < tolerance && bearReaction) {
    results.push({ type: 'level_reaction_vwap_bearish', direction: 'bearish', index: candles.length - 1, confidence: 55, label: 'Reaction at VWAP' });
  }

  for (const sr of srLevels) {
    if (Math.abs(last.low - sr.price) < tolerance && bullReaction && sr.type !== 'resistance') {
      results.push({ type: 'level_reaction_sr_bullish', direction: 'bullish', index: candles.length - 1, confidence: 55 + Math.min(15, Math.max(0, Number.isFinite(sr.strength) ? sr.strength : 0)), label: 'Reaction at S/R' });
    }
    if (Math.abs(last.high - sr.price) < tolerance && bearReaction && sr.type !== 'support') {
      results.push({ type: 'level_reaction_sr_bearish', direction: 'bearish', index: candles.length - 1, confidence: 55 + Math.min(15, Math.max(0, Number.isFinite(sr.strength) ? sr.strength : 0)), label: 'Reaction at S/R' });
    }
  }

  const fib = calcFibonacci(candles.map(c => c.high), candles.map(c => c.low));
  const fibRange = fib.high - fib.low;
  if (fibRange > 0) {
    for (const r of OTE_RATIOS) {
      const level = fib.high - r * fibRange;
      if (Math.abs(last.low - level) < tolerance && bullReaction) {
        results.push({ type: 'level_reaction_fib_ote_bullish', direction: 'bullish', index: candles.length - 1, confidence: 55, label: `Reaction at OTE ${(r * 100).toFixed(1)}%` });
      }
      if (Math.abs(last.high - level) < tolerance && bearReaction) {
        results.push({ type: 'level_reaction_fib_ote_bearish', direction: 'bearish', index: candles.length - 1, confidence: 55, label: `Reaction at OTE ${(r * 100).toFixed(1)}%` });
      }
    }
  }

  for (const pool of liquidityPools) {
    if (pool.swept) continue;
    if (pool.type === 'sell_side' && Math.abs(last.low - pool.price) < tolerance && bullReaction) {
      results.push({ type: 'level_reaction_liquidity_pool_bullish', direction: 'bullish', index: candles.length - 1, confidence: 50, label: 'Near Unswept Liquidity Pool' });
    }
    if (pool.type === 'buy_side' && Math.abs(last.high - pool.price) < tolerance && bearReaction) {
      results.push({ type: 'level_reaction_liquidity_pool_bearish', direction: 'bearish', index: candles.length - 1, confidence: 50, label: 'Near Unswept Liquidity Pool' });
    }
  }

  return results;
}
