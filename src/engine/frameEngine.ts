import type { Candle } from '../types/candle';
import { calcEMA } from '../indicators/ema';
import { calcATR } from '../indicators/atr';
import { detectSwings } from '../indicators/trendStructure';
import { calcSupportResistance } from '../indicators/supportResistance';
import { calcSmartMoney } from '../indicators/superOrderBlock';
import { calcVolumeProfile } from '../indicators/volumeProfile';
import { detectLiquidityPools } from '../indicators/liquidityPools';

/**
 * Pure function extracted from useHtfContext.ts — computes all indicators for
 * a single HTF frame from raw candles. No React or Zustand dependency.
 * Used by both the live hook and the backtest engine.
 */
export function computeFrameData(candles: Candle[], symbol: string) {
  if (candles.length < 10) return null;

  const closes = candles.map(c => c.close);
  const highs  = candles.map(c => c.high);
  const lows   = candles.map(c => c.low);

  const ema20 = calcEMA(closes, 20);
  const ema50 = calcEMA(closes, 50);
  const atr = calcATR(candles);
  const swings = detectSwings(highs, lows);
  const srLevels = calcSupportResistance(highs, lows, 100, closes[closes.length - 1]);
  const sm = calcSmartMoney(candles);
  const volumeProfile = calcVolumeProfile(candles, symbol);
  const liquidityPools = detectLiquidityPools(candles);

  return { ema20, ema50, atr, swings, srLevels, ...sm, volumeProfile, liquidityPools };
}
