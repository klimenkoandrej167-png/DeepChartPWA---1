import { z } from 'zod';
import type { Candle } from '../../types/candle';

const ICBConfigSchema = z.object({
  minImpulseBars:           z.number().int().min(2).default(3),
  maxImpulseBars:           z.number().int().min(2).default(8),
  minImpulseBodyPct:        z.number().min(0.0001).default(0.001),
  minConsolidationBars:     z.number().int().min(1).default(1),
  maxConsolidationBars:     z.number().int().min(1).default(12),
  maxConsolidationBodyRatio: z.number().min(0).default(0.5),
  minBreakoutBodyRatio:     z.number().min(0).default(0.3),
  requireOppositeColor:     z.boolean().default(true),
  slBufferPct:              z.number().min(0).default(0.0005),
  tp2Multiplier:            z.number().min(1).default(1.618),
  minRiskReward:            z.number().min(0.5).default(1.5),
  minConfidence:            z.number().min(0).max(100).default(55),
  volSpikeMultiplier:       z.number().min(1).default(2.5),
  requireVolumeConfirmation: z.boolean().default(true),
});

type ICBConfig = z.infer<typeof ICBConfigSchema>;

export interface PatternMatch {
  direction:          'bullish' | 'bearish';
  breakoutIndex:      number;
  impulseStart:       number;
  consolidationStart: number;
  consolidationEnd:   number;
  consolidationBars:  number;
  impulseStrength:    number;
  entry:  number;
  sl:     number;
  tp1:    number;
  tp2:    number;
  rr:     string;
  confidence: number;
}

const body    = (c: Candle) => Math.abs(c.close - c.open);
const isBull  = (c: Candle) => c.close > c.open;
const isBear  = (c: Candle) => c.close < c.open;
const avg     = (nums: number[]) =>
  nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : 0;
const clamp01 = (n: number) =>
  Number.isNaN(n) ? 0 : Math.max(0, Math.min(1, n));

export function detectICB(
  candles: Candle[],
  rawConfig: Partial<ICBConfig> = {},
  impulseVelocity?: number[], // proxy for forex where volume is always 0
): PatternMatch[] {
  const cfg = ICBConfigSchema.parse(rawConfig);
  const n   = candles.length;
  const results: PatternMatch[] = [];
  if (n < cfg.minImpulseBars + cfg.minConsolidationBars + 2) return results;

  for (const direction of ['bullish', 'bearish'] as const) {
    const sameDir = direction === 'bullish' ? isBull : isBear;
    const oppDir  = direction === 'bullish' ? isBear : isBull;

    for (let impulseStart = 0; impulseStart < n; impulseStart++) {
      if (!sameDir(candles[impulseStart])) continue;

      // 1. Impulse: consecutive same-direction candles
      let impulseEnd = impulseStart;
      while (
        impulseEnd + 1 < n &&
        sameDir(candles[impulseEnd + 1]) &&
        impulseEnd - impulseStart + 1 < cfg.maxImpulseBars
      ) impulseEnd++;

      const impulseLen = impulseEnd - impulseStart + 1;
      if (impulseLen < cfg.minImpulseBars) continue;

      const impulseCandles = candles.slice(impulseStart, impulseEnd + 1);
      const impHigh  = Math.max(...impulseCandles.map(c => c.high));
      const impLow   = Math.min(...impulseCandles.map(c => c.low));
      const impOpen  = impulseCandles[0].open;
      const impClose = impulseCandles[impulseCandles.length - 1].close;
      const impMovePct = Math.abs(impClose - impOpen) / impOpen;
      if (impMovePct < cfg.minImpulseBodyPct) continue;
      const impAvgBody = avg(impulseCandles.map(body));

      // 2. Consolidation: starts immediately after impulse, variable length
      const consolStart = impulseEnd + 1;
      let consolEnd = -1;

      for (let j = consolStart; j < n && j - consolStart < cfg.maxConsolidationBars; j++) {
        const c = candles[j];
        if (cfg.requireOppositeColor && !oppDir(c)) break;

        const breaksBack = direction === 'bullish'
          ? c.close < impLow
          : c.close > impHigh;
        if (breaksBack) { consolEnd = -1; break; }

        if (body(c) > impAvgBody * cfg.maxConsolidationBodyRatio) break;
        consolEnd = j;
      }

      if (consolEnd < consolStart) continue;
      const consolBars = consolEnd - consolStart + 1;
      if (consolBars < cfg.minConsolidationBars) continue;

      // 3. Breakout: next candle closes beyond consolidation zone
      const breakoutIndex = consolEnd + 1;
      if (breakoutIndex >= n) continue;

      const bo            = candles[breakoutIndex];
      const consolCandles = candles.slice(consolStart, consolEnd + 1);
      const consolHigh    = Math.max(...consolCandles.map(c => c.high));
      const consolLow     = Math.min(...consolCandles.map(c => c.low));

      const validBreakout = direction === 'bullish'
        ? sameDir(bo) && bo.close > consolHigh
        : sameDir(bo) && bo.close < consolLow;
      if (!validBreakout) continue;
      if (body(bo) < impAvgBody * cfg.minBreakoutBodyRatio) continue;

      // Volume gate: require confirmation when real volume is available;
      // fall back to impulse-velocity proxy for forex (volume always 0).
      if (cfg.requireVolumeConfirmation) {
        const recentVols = candles.slice(Math.max(0, breakoutIndex - 20), breakoutIndex).map(c => c.volume);
        const avgVol = avg(recentVols);
        const hasRealVolume = avgVol > 0;

        if (hasRealVolume) {
          if (bo.volume < avgVol * cfg.volSpikeMultiplier) continue;
        } else if (impulseVelocity && impulseVelocity[breakoutIndex] !== undefined) {
          if (impulseVelocity[breakoutIndex] < cfg.volSpikeMultiplier * 0.6) continue;
        }
        // if neither volume nor impulseVelocity is available, gate is skipped
      }

      // 4. Trade levels
      const entry = bo.close;
      const sl = direction === 'bullish'
        ? consolLow  * (1 - cfg.slBufferPct)
        : consolHigh * (1 + cfg.slBufferPct);
      const risk = Math.abs(entry - sl);
      if (risk === 0) continue;

      const measuredMove = impHigh - impLow;
      const tp1 = direction === 'bullish'
        ? entry + measuredMove
        : entry - measuredMove;
      const tp2 = direction === 'bullish'
        ? entry + measuredMove * cfg.tp2Multiplier
        : entry - measuredMove * cfg.tp2Multiplier;

      const reward      = Math.abs(tp1 - entry);
      const riskReward  = reward / risk;
      if (riskReward < cfg.minRiskReward) continue;

      // 5. Confidence (0–100)
      const impulseStrength = impMovePct / cfg.minImpulseBodyPct;
      const consolAvgBody   = avg(consolCandles.map(body));
      const tightness       = clamp01(1 - consolAvgBody / (impAvgBody * cfg.maxConsolidationBodyRatio || 1));
      const breakoutStrength = clamp01(body(bo) / (impAvgBody || 1));
      const consolBonus     = clamp01(1 / consolBars);
      const rrQuality       = clamp01((riskReward - cfg.minRiskReward) / cfg.minRiskReward);

      const confidence = Math.round(
        clamp01(
          clamp01(impulseStrength / 4) * 0.30 +
          tightness                     * 0.25 +
          breakoutStrength              * 0.20 +
          consolBonus                   * 0.15 +
          rrQuality                     * 0.10,
        ) * 100,
      );
      if (confidence < cfg.minConfidence) continue;

      results.push({
        direction,
        breakoutIndex,
        impulseStart,
        consolidationStart: consolStart,
        consolidationEnd:   consolEnd,
        consolidationBars:  consolBars,
        impulseStrength,
        entry,
        sl,
        tp1,
        tp2,
        rr: `1:${riskReward.toFixed(2)}`,
        confidence,
      });
    }
  }

  return results;
}
