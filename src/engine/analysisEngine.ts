import type { Candle, Interval } from '../types/candle';
import type { PatternResult } from '../types/pattern';
import type { IndicatorValues, SwingPoint } from '../store/indicatorStore';
import type { HtfFrame } from '../store/htfContextStore';
import type { PredictionInputToggles } from '../store/settingsStore';
import type { StrategyToggles } from '../store/strategiesStore';
import type { DirectionComponents } from '../utils/directionPrediction';

import { calcEMA } from '../indicators/ema';
import { calcRSI } from '../indicators/rsi';
import { calcATR } from '../indicators/atr';
import { calcMACD } from '../indicators/macd';
import { calcBollingerBands } from '../indicators/bollingerBands';
import { calcFibonacci } from '../indicators/fibonacci';
import { calcVWAP } from '../indicators/vwap';
import { calcImpulseVelocity, calcImpulseVelocitySeries } from '../utils/impulseVelocity';
import { detectSwings } from '../indicators/trendStructure';
import { calcSupportResistance } from '../indicators/supportResistance';
import { calcSmartMoney } from '../indicators/superOrderBlock';
import { computeDirectionScore } from '../utils/directionPrediction';
import { getActivityWindow } from '../utils/sessionRegime';
import { classifyVsaBar } from '../utils/vsaClassifier';
import { runAllDetectors } from '../patterns/index';
import { filterByStrategyToggles } from '../store/strategiesStore';
import { detectLiquiditySweepReaction } from '../patterns/advanced/liquiditySweepReaction';
import { detectImpulseBreakout } from '../patterns/advanced/impulseBreakout';
import { scoreOrderBlocks } from '../utils/orderBlockStrength';
import { detectStrongOrderBlockReactionWith } from '../patterns/advanced/strongOrderBlockReaction';
import { isCrypto } from '../utils/symbolUtils';

export interface EngineInput {
  candles:          Candle[];
  symbol:           string;
  interval:         Interval;
  predictionInputs:  PredictionInputToggles;
  strategies:        StrategyToggles;
  htf:              { h1: HtfFrame; m15: HtfFrame; m5: HtfFrame };
  /** Optional: level-reaction signals accumulated since last candle close (live hook only) */
  levelSignals?:    PatternResult[];
}

export interface EngineOutput {
  indicators:       IndicatorValues;
  patterns:         PatternResult[];
  obReactionSignals: PatternResult[];
  icbSignals:       PatternResult[];
  m5Sweeps:         PatternResult[];
  allRecent:        PatternResult[];
  directionScore:   number;
  components?:       DirectionComponents;
  lastPrice:        number;
  lastCandle:       Candle;
}

/**
 * Pure analysis engine extracted from usePatternDetection.ts.
 * Computes all indicators, runs all pattern detectors, and calculates the
 * direction score. No React, Zustand, audio, or side effects.
 *
 * The live hook wraps this with React state management, sound alerts,
 * prediction recording, and priority alert dispatch.
 * The backtest engine calls this directly for each historical bar.
 */
export function runEngine(input: EngineInput): EngineOutput {
  const { candles, symbol, predictionInputs, strategies, htf, levelSignals } = input;

  const closes = candles.map(c => c.close);
  const highs  = candles.map(c => c.high);
  const lows   = candles.map(c => c.low);

  // --- Indicators ---
  const ema20  = calcEMA(closes, 20);
  const ema50  = calcEMA(closes, 50);
  const ema200 = calcEMA(closes, 200);
  const rsi    = calcRSI(closes);
  const atr    = calcATR(candles);
  const macd   = calcMACD(closes);
  const bb     = calcBollingerBands(closes);
  const fib    = calcFibonacci(highs, lows);
  const swings = detectSwings(highs, lows);
  const srLevels = calcSupportResistance(highs, lows, 100, closes[closes.length - 1]);
  const sm     = calcSmartMoney(candles);

  const ema9  = calcEMA(closes, 9);
  const ema21 = calcEMA(closes, 21);
  const rsi7  = calcRSI(closes, 7);
  const vwap  = calcVWAP(candles);
  const impulseVel = calcImpulseVelocity(candles);
  const impulseVelSeries = calcImpulseVelocitySeries(candles);

  const indicators: IndicatorValues = {
    ema20, ema50, ema200,
    rsi, atr,
    macd: { macd: macd.macd, signal: macd.signal, hist: macd.hist },
    bb:   { upper: bb.upper, middle: bb.middle, lower: bb.lower },
    fibLevels: fib.levels.map(l => l.price),
    swings,
    srLevels,
    orderBlocks:     sm.orderBlocks,
    fvgs:            sm.fvgs,
    rejectionBlocks: sm.rejectionBlocks,
    bosEvents:       sm.bosEvents,
    ema9, ema21, rsi7, vwap,
  };

  // --- Pattern detection ---
  const patterns = filterByStrategyToggles(runAllDetectors(candles), strategies);
  const last = candles[candles.length - 1];

  // HTF swings (priority H1, fallback M15) for hour-scale liquidity sweep detection
  const htfSwings: { high?: number; low?: number } = (() => {
    const pickHigh = (swings: SwingPoint[]): number | undefined => {
      for (let i = swings.length - 1; i >= 0; i--) {
        if (swings[i].type === 'HH' || swings[i].type === 'LH') return swings[i].price;
      }
      return undefined;
    };
    const pickLow = (swings: SwingPoint[]): number | undefined => {
      for (let i = swings.length - 1; i >= 0; i--) {
        if (swings[i].type === 'HL' || swings[i].type === 'LL') return swings[i].price;
      }
      return undefined;
    };
    const h1HasSwings = htf.h1.swings.length > 0;
    const frame = h1HasSwings ? htf.h1 : htf.m15;
    return { high: pickHigh(frame.swings), low: pickLow(frame.swings) };
  })();

  const m5Sweeps = filterByStrategyToggles(detectLiquiditySweepReaction(
    htf.m5.candles,
    htf.m5.liquidityPools,
    atr,
    htfSwings.high,
    htfSwings.low,
  ), strategies);
  const scoredObs = scoreOrderBlocks(sm.orderBlocks, sm.fvgs, sm.bosEvents, candles, atr, htf.m5.liquidityPools);
  const obReactionSignals = detectStrongOrderBlockReactionWith(candles, scoredObs, atr);

  const icbWithVolumeGate = filterByStrategyToggles(detectImpulseBreakout(candles, impulseVelSeries), strategies);

  // --- Volume / VSA ---
  const volumeAvailable = candles.slice(-20).some(c => c.volume > 0);

  let volumeSpikeRatio: number | null = null;
  if (volumeAvailable) {
    const recent = candles.slice(-21, -1);
    const avgVol = recent.reduce((s, c) => s + c.volume, 0) / (recent.length || 1);
    volumeSpikeRatio = avgVol > 0 ? last.volume / avgVol : null;
  }

  const recentForVsa = candles.slice(-21, -1);
  const avgVolumeForVsa = recentForVsa.reduce((s, c) => s + c.volume, 0) / (recentForVsa.length || 1);
  const avgRangeForVsa = recentForVsa.reduce((s, c) => s + (c.high - c.low), 0) / (recentForVsa.length || 1);
  const vsaSignal = volumeAvailable ? classifyVsaBar(last, avgVolumeForVsa, avgRangeForVsa) : undefined;

  const activityWindow = isCrypto(symbol) ? undefined : getActivityWindow();

  // --- Assemble recent signals for direction score ---
  const patternsWithoutICB = patterns.filter(p => p.type !== 'impulse_consolidation_breakout');
  const allRecent = [
    ...patternsWithoutICB.slice(0, 5),
    ...icbWithVolumeGate.slice(-2),
    ...m5Sweeps.slice(-3),
    ...obReactionSignals.slice(-2),
    ...(levelSignals ?? []).slice(-3),
  ];

  const { score, components } = computeDirectionScore({
    recentSignals: allRecent,
    ema9, ema21, rsi7,
    macdHist: macd.hist,
    bosEvents: sm.bosEvents,
    vwap,
    lastPrice: last.close,
    predictionInputs,
    htf: { h1: htf.h1, m15: htf.m15, m5: htf.m5 },
    volumeAvailable,
    volumeSpikeRatio,
    impulseVelocity: impulseVel,
    atr,
    activityWindow,
    vsaSignal,
  });

  return {
    indicators,
    patterns,
    obReactionSignals,
    icbSignals: icbWithVolumeGate,
    m5Sweeps,
    allRecent,
    directionScore: score,
    components,
    lastPrice: last.close,
    lastCandle: last,
  };
}
