import type { PatternResult } from '../types/pattern';
import type { BOSEvent } from '../store/indicatorStore';
import type { PredictionInputToggles } from '../store/settingsStore';
import type { HtfFrame } from '../store/htfContextStore';
import type { LiquidityPool } from '../indicators/liquidityPools';
import type { ActivityWindow } from '../utils/sessionRegime';
import type { VsaSignal } from '../utils/vsaClassifier';
import { detectVolatilityRegime } from '../utils/marketRegime';
import { findNearestLevel } from '../utils/tradeLevels';
import { computeMarketStructureState } from '../utils/marketStructure';

export interface DirectionInputs {
  recentSignals:      PatternResult[];
  ema9:               number[];
  ema21:              number[];
  rsi7:               number[];
  macdHist:           number[];
  bosEvents:          BOSEvent[];
  vwap:               number[];
  lastPrice:          number;
  predictionInputs:   PredictionInputToggles;
  htf:                { h1: HtfFrame; m15: HtfFrame; m5: HtfFrame };
  volumeAvailable:    boolean;
  volumeSpikeRatio:   number | null;
  impulseVelocity:   number;
  atr:                number[];
  activityWindow?:    ActivityWindow;
  vsaSignal?:         VsaSignal;
}

export interface DirectionComponents {
  structure: number; zones: number; liquidity: number;
  trigger: number; indicator: number; bos: number; macd: number;
  meanReversion: number;
  gateMultiplier: number;
}

export interface DirectionResult {
  score:         number;
  probabilityUp: number;
  color:         'green' | 'red' | 'neutral';
  components?:   DirectionComponents;
}

function clamp(n: number, lo = -1, hi = 1): number {
  if (Number.isNaN(n)) return 0;
  return Math.max(lo, Math.min(hi, n));
}

function lastFinite(arr: number[]): number | undefined {
  for (let i = arr.length - 1; i >= 0; i--) {
    if (!Number.isNaN(arr[i]) && Number.isFinite(arr[i])) return arr[i];
  }
  return undefined;
}

type Bias = 'bullish' | 'bearish' | 'neutral';

// Thin wrapper over the shared market-structure module so the bias used by the
// gate stays consistent with the public state shown to users.
function determineHtfBias(frame: HtfFrame): Bias {
  const state = computeMarketStructureState(frame);
  return state === 'ranging' ? 'neutral' : state;
}

function computeMeanReversionScore(recentSignals: PatternResult[]): number {
  let bull = 0, bear = 0;
  for (const p of recentSignals) {
    if (p.type === 'mean_reversion_bullish') bull += p.confidence / 100;
    else if (p.type === 'mean_reversion_bearish') bear += p.confidence / 100;
  }
  if (bull + bear === 0) return 0;
  return clamp(bull - bear);
}

function m15ConfirmsH1(h1Bias: Bias, m15: HtfFrame): boolean {
  if (h1Bias === 'neutral') return true;
  const recentSwings = m15.swings.slice(-4);
  if (recentSwings.length < 2) return true;

  let bullCount = 0, bearCount = 0;
  for (const s of recentSwings) {
    if (s.type === 'HH' || s.type === 'HL') bullCount++;
    else if (s.type === 'LH' || s.type === 'LL') bearCount++;
  }

  if (h1Bias === 'bullish') return bullCount >= bearCount;
  if (h1Bias === 'bearish') return bearCount >= bullCount;
  return true;
}

function computeStructureScore(m5: HtfFrame, m15: HtfFrame, bias: Bias): number {
  const m5Swings = m5.swings.slice(-6);
  const m15Swings = m15.swings.slice(-6);

  let bull = 0, bear = 0;
  for (const s of [...m5Swings, ...m15Swings]) {
    if (s.type === 'HH' || s.type === 'HL') bull++;
    else if (s.type === 'LH' || s.type === 'LL') bear++;
  }

  const total = bull + bear;
  if (total === 0) return 0;

  const recentBos = m5.bosEvents.slice(-3);
  for (const b of recentBos) {
    if (b.type === 'bullish') bull += 2;
    else bear += 2;
  }

  const raw = (bull - bear) / (bull + bear);
  if (bias !== 'neutral') {
    const agree = (bias === 'bullish' && raw > 0) || (bias === 'bearish' && raw < 0);
    return agree ? clamp(raw * 1.2) : clamp(raw * 0.6);
  }
  return clamp(raw);
}

function computeZonesScore(
  lastPrice: number,
  m15: HtfFrame,
  m5: HtfFrame,
  h1: HtfFrame,
): number {
  // Volume Profile levels (crypto only — null for forex, checked inside calcVolumeProfile)
  const vpExtras: number[] = [];
  for (const vp of [h1.volumeProfile, m15.volumeProfile]) {
    if (vp) vpExtras.push(vp.poc, vp.vah, vp.val);
  }

  // Filter out mitigated OBs and sort by size descending so findNearestLevel
  // naturally prefers larger (stronger) blocks at equal distance
  const sortedObs = [...m15.orderBlocks, ...m5.orderBlocks]
    .filter(ob => !ob.mitigated)
    .sort((a, b) => (b.top - b.bottom) - (a.top - a.bottom));

  const sources = [
    { srs: [...h1.srLevels, ...m15.srLevels] },
    { obs: sortedObs },
    { fvgs: [...m15.fvgs, ...m5.fvgs] },
    { extra: vpExtras },
  ];

  // Reuse the shared helper from tradeLevels.ts for nearest-level lookup
  const bullLevel = findNearestLevel(lastPrice, 'up', sources, Infinity);
  const bearLevel = findNearestLevel(lastPrice, 'down', sources, Infinity);

  if (bullLevel === null && bearLevel === null) return 0;

  const maxDist = 0.02;
  const bullDist = bullLevel !== null ? Math.abs(lastPrice - bullLevel) / lastPrice : Infinity;
  const bearDist = bearLevel !== null ? Math.abs(lastPrice - bearLevel) / lastPrice : Infinity;
  const bullScore = bullDist < maxDist ? (1 - bullDist / maxDist) : 0;
  const bearScore = bearDist < maxDist ? (1 - bearDist / maxDist) : 0;

  return clamp(bullScore - bearScore);
}

// Inline import to avoid circular dependency at module level
import { detectLiquiditySweepReaction } from '../patterns/advanced/liquiditySweepReaction';

const SWEEP_BULL_TYPES = new Set([
  'liquidity_sweep_bullish',
  'liquidity_sweep_continuation_bullish',
  'liquidity_sweep_reversal_bullish',
]);
const SWEEP_BEAR_TYPES = new Set([
  'liquidity_sweep_bearish',
  'liquidity_sweep_continuation_bearish',
  'liquidity_sweep_reversal_bearish',
]);

function detectLiquiditySweepSafe(candles: import('../types/candle').Candle[]): PatternResult[] {
  if (candles.length < 12) return [];
  return detectLiquiditySweepReaction(candles);
}

function computeLiquidityScore(
  recentSignals: PatternResult[],
  m5Candles: import('../types/candle').Candle[],
  m5Pools: LiquidityPool[],
  m15Pools: LiquidityPool[],
  lastPrice: number,
  m5Atr: number,
): number {
  let bull = 0, bear = 0;

  // Recent sweep events (already happened) — covers generic + continuation + reversal types
  for (const p of recentSignals) {
    if (SWEEP_BULL_TYPES.has(p.type)) bull += p.confidence / 100;
    else if (SWEEP_BEAR_TYPES.has(p.type)) bear += p.confidence / 100;
  }

  const m5Sweeps = detectLiquiditySweepSafe(m5Candles);
  for (const p of m5Sweeps.slice(-3)) {
    if (p.direction === 'bullish') bull += 0.5;
    else if (p.direction === 'bearish') bear += 0.5;
  }

  // Proximity to unswept liquidity pools (early warning, weaker)
  const proximityRange = m5Atr > 0 ? m5Atr * 1.5 : lastPrice * 0.003;
  for (const pool of [...m5Pools, ...m15Pools]) {
    if (pool.swept) continue;
    const dist = Math.abs(lastPrice - pool.price);
    if (dist > proximityRange) continue;
    const strength = (1 - dist / proximityRange) * 0.3;
    // Sell-side pool below price = likely sweep down then reversal up = weak bull
    if (pool.type === 'sell_side' && pool.price < lastPrice) bull += strength;
    // Buy-side pool above price = likely sweep up then reversal down = weak bear
    if (pool.type === 'buy_side' && pool.price > lastPrice) bear += strength;
  }

  return clamp((bull - bear) / 2);
}

function computeM1TriggerScore(
  recentSignals: PatternResult[],
  volumeAvailable: boolean,
  volumeSpikeRatio: number | null,
  impulseVelocity: number,
  predictionInputs: PredictionInputToggles,
  vsaSignal?: VsaSignal,
): number {
  let signalScore = 0;
  if (recentSignals.length > 0) {
    const avg = recentSignals.reduce((sum, p) => {
      const dir = p.direction === 'bullish' ? 1 : p.direction === 'bearish' ? -1 : 0;
      return sum + dir * (p.confidence / 100);
    }, 0) / recentSignals.length;
    signalScore = clamp(avg);
  }

  let volScore = 0;
  if (!predictionInputs.volumeSpike) {
    volScore = 0;
  } else if (volumeAvailable && volumeSpikeRatio !== null) {
    volScore = clamp((volumeSpikeRatio - 1) * 0.5);
  } else {
    volScore = clamp((impulseVelocity - 1) * 0.5);
  }

  // VSA refines confidence in the already-detected trigger: +20% when the VSA
  // signal agrees with the trigger direction, -20% when it contradicts. Does
  // not introduce a new directional vote.
  let vsaMultiplier = 1;
  if (vsaSignal === 'absorption_bullish' || vsaSignal === 'no_supply') vsaMultiplier = signalScore > 0 ? 1.2 : 0.8;
  if (vsaSignal === 'absorption_bearish' || vsaSignal === 'no_demand') vsaMultiplier = signalScore < 0 ? 1.2 : 0.8;

  return clamp((signalScore * 0.7 + signalScore * Math.abs(volScore) * 0.3 + volScore * 0.1) * vsaMultiplier);
}

function computeM1IndicatorScore(
  ema9: number[],
  ema21: number[],
  rsi7: number[],
  vwap: number[],
  lastPrice: number,
  predictionInputs: PredictionInputToggles,
): number {
  const components: { score: number; weight: number }[] = [];

  if (predictionInputs.ema) {
    const e9 = lastFinite(ema9);
    const e21 = lastFinite(ema21);
    if (e9 !== undefined && e21 !== undefined && lastPrice > 0) {
      const trend = clamp(((e9 - e21) / lastPrice) * 50);
      components.push({ score: trend, weight: 0.4 });
    }
  }

  if (predictionInputs.rsi) {
    const rsiVal = lastFinite(rsi7);
    if (rsiVal !== undefined) {
      let rsiScore: number;
      if (rsiVal > 75) rsiScore = -0.5;
      else if (rsiVal < 25) rsiScore = 0.5;
      else rsiScore = clamp((rsiVal - 50) / 25);
      components.push({ score: rsiScore, weight: 0.3 });
    }
  }

  if (predictionInputs.vwap && vwap.length > 0) {
    const vwapVal = lastFinite(vwap);
    if (vwapVal !== undefined && lastPrice > 0) {
      const vwapScore = clamp(((lastPrice - vwapVal) / lastPrice) * 30);
      components.push({ score: vwapScore, weight: 0.3 });
    }
  }

  if (components.length === 0) return 0;

  const totalWeight = components.reduce((s, c) => s + c.weight, 0);
  return clamp(components.reduce((s, c) => s + c.score * c.weight, 0) / totalWeight);
}

export function computeDirectionScore(inputs: DirectionInputs): DirectionResult {
  const pi = inputs.predictionInputs;

  // --- Level 1: Gate (H1 bias + M15 filter) ---
  const h1Bias = pi.htfBias ? determineHtfBias(inputs.htf.h1) : 'neutral';
  let gateMultiplier = 1;

  if (pi.htfBias && h1Bias !== 'neutral') {
    const m15Confirms = pi.m15Filter ? m15ConfirmsH1(h1Bias, inputs.htf.m15) : true;
    gateMultiplier = m15Confirms ? 1 : 0.4;
  }

  // --- Level 2: Structure (M5/M15) ---
  let structureScore = 0;
  let structureWeight = 0;
  if (pi.structure) {
    structureScore = computeStructureScore(inputs.htf.m5, inputs.htf.m15, h1Bias);
    structureWeight = 0.25;
  }

  // --- Level 3: Zones ---
  let zonesScore = 0;
  let zonesWeight = 0;
  if (pi.zones) {
    zonesScore = computeZonesScore(inputs.lastPrice, inputs.htf.m15, inputs.htf.m5, inputs.htf.h1);
    zonesWeight = 0.2;
  }

  // --- Level 4: Liquidity ---
  let liquidityScore = 0;
  let liquidityWeight = 0;
  if (pi.liquidity) {
    const m5AtrVal = lastFinite(inputs.htf.m5.candles.length > 0
      ? inputs.atr
      : []) ?? 0;
    liquidityScore = computeLiquidityScore(
      inputs.recentSignals, inputs.htf.m5.candles,
      inputs.htf.m5.liquidityPools, inputs.htf.m15.liquidityPools,
      inputs.lastPrice, m5AtrVal,
    );
    liquidityWeight = 0.15;
  }

  // --- Level 5: M1 Trigger ---
  let triggerScore = 0;
  let triggerWeight = 0;
  if (pi.recentSignals) {
    triggerScore = computeM1TriggerScore(
      inputs.recentSignals, inputs.volumeAvailable, inputs.volumeSpikeRatio, inputs.impulseVelocity, pi,
      inputs.vsaSignal,
    );
    triggerWeight = 0.25;
  }

  // --- Level 6: M1 Indicators ---
  const indicatorScore = computeM1IndicatorScore(
    inputs.ema9, inputs.ema21, inputs.rsi7, inputs.vwap, inputs.lastPrice, pi,
  );
  let indicatorWeight = indicatorScore !== 0 ? 0.15 : 0;

  // --- BOS on active TF ---
  let bosScore = 0;
  let bosWeight = 0;
  if (pi.bos && inputs.bosEvents.length > 0) {
    const last = inputs.bosEvents[inputs.bosEvents.length - 1];
    bosScore = last.type === 'bullish' ? 0.8 : -0.8;
    bosWeight = 0.1;
  }

  // --- MACD ---
  let macdScore = 0;
  let macdWeight = 0;
  if (pi.macd) {
    const hist = lastFinite(inputs.macdHist);
    if (hist !== undefined) {
      const recentAbs = inputs.macdHist.slice(-20).map(Math.abs).filter(v => !Number.isNaN(v));
      const scale = recentAbs.length ? recentAbs.reduce((a, b) => a + b, 0) / recentAbs.length : 1;
      macdScore = clamp(hist / (scale || 1));
      macdWeight = 0.1;
    }
  }

  // --- Step 7: Regime-based weight modifiers ---
  const regime = detectVolatilityRegime(inputs.atr);
  if (regime === 'high') {
    structureWeight *= 1.2;
    liquidityWeight *= 1.2;
  } else if (regime === 'low') {
    indicatorWeight *= 1.3;
    triggerWeight *= 0.8;
  }

  // --- Session-based module router (Module 1: triggerWeight, Module 2: liquidityWeight) ---
  // Soft rebalancing rather than hard gating: both modules stay active, only
  // their relative contribution shifts by session. Crypto has no session → no-op.
  if (inputs.activityWindow === 'breakout_favored') {
    triggerWeight *= 1.3;
    liquidityWeight *= 0.85;
  } else if (inputs.activityWindow === 'reversal_favored') {
    liquidityWeight *= 1.3;
    triggerWeight *= 0.85;
  }

  // --- Level 7: Mean Reversion (stronger in ranging structure, damped in trends) ---
  let meanReversionScore = 0;
  let meanReversionWeight = 0;
  if (pi.recentSignals) {
    meanReversionScore = computeMeanReversionScore(inputs.recentSignals);
    if (meanReversionScore !== 0) {
      const structState = computeMarketStructureState(inputs.htf.h1);
      meanReversionWeight = structState === 'ranging' ? 0.2 : 0.05;
    }
  }

  // --- Weighted sum with normalization ---
  const allComponents = [
    { score: structureScore,     weight: structureWeight },
    { score: zonesScore,         weight: zonesWeight },
    { score: liquidityScore,     weight: liquidityWeight },
    { score: triggerScore,       weight: triggerWeight },
    { score: indicatorScore,     weight: indicatorWeight },
    { score: bosScore,           weight: bosWeight },
    { score: macdScore,          weight: macdWeight },
    { score: meanReversionScore, weight: meanReversionWeight },
  ].filter(c => c.weight > 0);

  if (allComponents.length === 0) {
    return { score: 0, probabilityUp: 50, color: 'neutral' };
  }

  const totalWeight = allComponents.reduce((s, c) => s + c.weight, 0);
  const weightedSum = allComponents.reduce((s, c) => s + c.score * c.weight, 0) / totalWeight;

  const score = clamp(gateMultiplier * weightedSum);
  const probabilityUp = Math.round((score + 1) * 50);
  const color: DirectionResult['color'] =
    score > 0.05 ? 'green' : score < -0.05 ? 'red' : 'neutral';

  const components: DirectionComponents = {
    structure: structureScore, zones: zonesScore, liquidity: liquidityScore,
    trigger: triggerScore, indicator: indicatorScore, bos: bosScore, macd: macdScore,
    meanReversion: meanReversionScore,
    gateMultiplier,
  };

  return { score, probabilityUp, color, components };
}

export const FEATURE_VECTOR_KEYS = ['structure', 'zones', 'liquidity', 'trigger', 'indicator', 'bos', 'macd', 'meanReversion'] as const;

export function componentsToFeatureVector(c: DirectionComponents): number[] {
  return [c.structure, c.zones, c.liquidity, c.trigger, c.indicator, c.bos, c.macd, c.meanReversion];
}
