import { useEffect, useRef } from 'react';
import { useChartStore } from '../store/chartStore';
import { useIndicatorStore } from '../store/indicatorStore';
import { useSignalStore } from '../store/signalStore';
import { useSettingsStore } from '../store/settingsStore';
import { useStrategiesStore, filterByStrategyToggles } from '../store/strategiesStore';
import { useAudioAlert } from './useAudioAlert';
import { runAllDetectors } from '../patterns/index';
import { intervalToMs } from '../utils/timeframeUtils';
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
import { computeDirectionScore, componentsToFeatureVector } from '../utils/directionPrediction';
import { getActivityWindow } from '../utils/sessionRegime';
import { classifyVsaBar } from '../utils/vsaClassifier';
import { usePredictionStore } from '../store/predictionStore';
import { useHtfContextStore } from '../store/htfContextStore';
import { usePriorityAlertStore } from '../store/priorityAlertStore';
import { detectLiquiditySweepReaction } from '../patterns/advanced/liquiditySweepReaction';
import { detectImpulseBreakout } from '../patterns/advanced/impulseBreakout';
import { calibratedProbability, sigmoid } from '../utils/calibration';
import { computeRecommendedExpirySeconds } from '../utils/recommendedExpiry';
import { estimateTradeLevels } from '../utils/tradeLevels';
import { scoreOrderBlocks } from '../utils/orderBlockStrength';
import { detectStrongOrderBlockReactionWith } from '../patterns/advanced/strongOrderBlockReaction';
import { detectLevelReactions } from '../patterns/levels/levelReaction';
import { estimateSpread } from '../utils/spreadEstimate';
import { getCurrentSession } from '../utils/marketHours';
import { isCrypto } from '../utils/symbolUtils';
import { useSweepChochTracker } from './useSweepChochTracker';
import type { Candle } from '../types/candle';
import type { PatternResult } from '../types/pattern';
import type { SwingPoint } from '../store/indicatorStore';

const PRE_CLOSE_TRIGGER_SECONDS = 5;
const LIGHT_ANALYSIS_INTERVAL_MS = 2000;
const CLOSE_WINDOW_MIN_CONFIDENCE = 75;

export function usePatternDetection() {
  const candles  = useChartStore(s => s.candles);
  const symbol   = useChartStore(s => s.symbol);
  const interval = useChartStore(s => s.interval);

  const setValues = useIndicatorStore(s => s.setValues);
  const reset     = useIndicatorStore(s => s.reset);

  const addSignal = useSignalStore(s => s.addSignal);

  const soundEnabled = useSettingsStore(s => s.soundEnabled);
  const predictionInputs  = useSettingsStore(s => s.predictionInputs);
  const customSpreadOverrides = useSettingsStore(s => s.customSpreadOverrides);
  const strictAsianSession = useSettingsStore(s => s.strictAsianSession);
  const strategies = useStrategiesStore(s => s.enabled);
  const { playBullish, playBearish } = useAudioAlert();

  const recordPrediction  = usePredictionStore(s => s.recordPrediction);
  const resolvePrediction = usePredictionStore(s => s.resolveForCandle);

  const lastPatternsRef  = useRef<Set<string>>(new Set());
  const firedCandleRef   = useRef<number>(-1);
  const prevSymbolRef    = useRef(symbol);
  const prevIntervalRef  = useRef(interval);
  const candlesRef       = useRef(candles);
  candlesRef.current     = candles;
  const levelSignalsThisCandleRef = useRef<PatternResult[]>([]);
  const chochTracker = useSweepChochTracker();

  useEffect(() => {
    if (prevSymbolRef.current !== symbol || prevIntervalRef.current !== interval) {
      prevSymbolRef.current   = symbol;
      prevIntervalRef.current = interval;
      firedCandleRef.current  = -1;
      lastPatternsRef.current = new Set();
      reset();
    }
  }, [symbol, interval, reset]);

  const analysisRef = useRef<(c: Candle[], preClose: boolean) => void>(null!);

  analysisRef.current = (finalizedCandles: Candle[], isPreClose: boolean) => {
    const closes = finalizedCandles.map(c => c.close);
    const highs  = finalizedCandles.map(c => c.high);
    const lows   = finalizedCandles.map(c => c.low);

    const ema20  = calcEMA(closes, 20);
    const ema50  = calcEMA(closes, 50);
    const ema200 = calcEMA(closes, 200);
    const rsi    = calcRSI(closes);
    const atr    = calcATR(finalizedCandles);
    const macd   = calcMACD(closes);
    const bb     = calcBollingerBands(closes);
    const fib    = calcFibonacci(highs, lows);
    const swings = detectSwings(highs, lows);
    const srLevels = calcSupportResistance(highs, lows, 100, closes[closes.length - 1]);
    const sm     = calcSmartMoney(finalizedCandles);

    const ema9  = calcEMA(closes, 9);
    const ema21 = calcEMA(closes, 21);
    const rsi7  = calcRSI(closes, 7);
    const vwap  = calcVWAP(finalizedCandles);
    const impulseVel = calcImpulseVelocity(finalizedCandles);
    const impulseVelSeries = calcImpulseVelocitySeries(finalizedCandles);

    setValues({
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
    });

    const patterns = filterByStrategyToggles(runAllDetectors(finalizedCandles), strategies);
    const last = finalizedCandles[finalizedCandles.length - 1];

    const htfState = useHtfContextStore.getState();

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
      const h1HasSwings = htfState.h1.swings.length > 0;
      const frame = h1HasSwings ? htfState.h1 : htfState.m15;
      return { high: pickHigh(frame.swings), low: pickLow(frame.swings) };
    })();

    const m5Sweeps = filterByStrategyToggles(detectLiquiditySweepReaction(
      htfState.m5.candles,
      htfState.m5.liquidityPools,
      atr,
      htfSwings.high,
      htfSwings.low,
    ), strategies);
    const scoredObs = scoreOrderBlocks(sm.orderBlocks, sm.fvgs, sm.bosEvents, finalizedCandles, atr, htfState.m5.liquidityPools);
    const obReactionSignals = detectStrongOrderBlockReactionWith(finalizedCandles, scoredObs, atr);

    // Volume-gated ICB for official scoring (uses impulseVelocity proxy on forex)
    const icbWithVolumeGate = filterByStrategyToggles(detectImpulseBreakout(finalizedCandles, impulseVelSeries), strategies);

    // CHoCH confirmation: state-machine waits up to MAX_WAIT_BARS for structure break
    const confirmedChoch = chochTracker.update(htfState.m5.candles, m5Sweeps, htfState.m5.swings);

    const allSignalsForDispatch = [...patterns, ...obReactionSignals, ...confirmedChoch];
    const newSignals = allSignalsForDispatch.filter(p => {
      const k = `${p.type}_${p.index}`;
      if (lastPatternsRef.current.has(k)) return false;
      lastPatternsRef.current.add(k);
      return true;
    });

    for (const p of newSignals) {
      if (p.confidence < CLOSE_WINDOW_MIN_CONFIDENCE) continue; // gate display only
      const id = `${p.type}_${p.index}_${Date.now()}`;
      const signal = {
        id,
        pattern:    p,
        symbol,
        interval,
        candleTime: finalizedCandles[p.index]?.time ?? last.time,
        createdAt:  Date.now(),
        preClose:   isPreClose,
      };
      addSignal(signal);
      if (soundEnabled) {
        if (p.direction === 'bullish')  playBullish();
        else if (p.direction === 'bearish') playBearish();
      }
    }

    const volumeAvailable = finalizedCandles.slice(-20).some(c => c.volume > 0);

    let volumeSpikeRatio: number | null = null;
    if (volumeAvailable) {
      const recent = finalizedCandles.slice(-21, -1);
      const avgVol = recent.reduce((s, c) => s + c.volume, 0) / (recent.length || 1);
      volumeSpikeRatio = avgVol > 0 ? last.volume / avgVol : null;
    }

    // VSA classification of the current bar — only meaningful where volume is real (crypto)
    const recentForVsa = finalizedCandles.slice(-21, -1);
    const avgVolumeForVsa = recentForVsa.reduce((s, c) => s + c.volume, 0) / (recentForVsa.length || 1);
    const avgRangeForVsa = recentForVsa.reduce((s, c) => s + (c.high - c.low), 0) / (recentForVsa.length || 1);
    const vsaSignal = volumeAvailable ? classifyVsaBar(last, avgVolumeForVsa, avgRangeForVsa) : undefined;

    // Session router: crypto has no session concept → disabled (undefined)
    const activityWindow = isCrypto(symbol) ? undefined : getActivityWindow();

    const patternsWithoutICB = patterns.filter(p => p.type !== 'impulse_consolidation_breakout');
    const allRecent = [
      ...patternsWithoutICB.slice(0, 5),
      ...icbWithVolumeGate.slice(-2),
      ...m5Sweeps.slice(-3),
      ...obReactionSignals.slice(-2),
      ...confirmedChoch,
      ...levelSignalsThisCandleRef.current.slice(-3),
    ];
    levelSignalsThisCandleRef.current = [];

    const { score, components } = computeDirectionScore({
      recentSignals: allRecent,
      ema9, ema21, rsi7,
      macdHist: macd.hist,
      bosEvents: sm.bosEvents,
      vwap,
      lastPrice: last.close,
      predictionInputs,
      htf: { h1: htfState.h1, m15: htfState.m15, m5: htfState.m5 },
      volumeAvailable,
      volumeSpikeRatio,
      impulseVelocity: impulseVel,
      atr,
      activityWindow,
      vsaSignal,
    });

    recordPrediction({ symbol, interval, candleTime: last.time, score, priceAtPrediction: last.close, components });

    maybeUpdatePriorityAlert(
      score,
      symbol,
      interval,
      last.close,
      allRecent,
      htfState,
      atr,
      soundEnabled,
      playBullish,
      playBearish,
      customSpreadOverrides,
      strictAsianSession,
      components,
    );
  };

  useEffect(() => {
    const id = setInterval(() => {
      const cs = candlesRef.current;
      if (cs.length < 10) return;
      const last = cs[cs.length - 1];
      if (!last) return;

      const ivlSec     = intervalToMs(interval) / 1000;
      const candleEnd  = (last.time + ivlSec) * 1000;
      const secondsLeft = Math.max(0, Math.floor((candleEnd - Date.now()) / 1000));

      if (secondsLeft <= PRE_CLOSE_TRIGGER_SECONDS && firedCandleRef.current !== last.time) {
        firedCandleRef.current = last.time;

        const prev = cs[cs.length - 2];
        if (prev) {
          resolvePrediction({ symbol, interval, candleTime: prev.time, actualClose: prev.close });
        }

        analysisRef.current(cs, true);
      }
    }, 1000);

    return () => clearInterval(id);
  }, [interval, symbol, resolvePrediction]);

  // Light analysis pass — every 2s, uses only cached store values (no heavy recomputation)
  useEffect(() => {
    const id = setInterval(() => {
      const cs = candlesRef.current;
      if (cs.length < 10) return;
      const last = cs[cs.length - 1];
      if (!last) return;

      const ivlSec = intervalToMs(interval) / 1000;
      const candleEnd = (last.time + ivlSec) * 1000;
      const secondsLeft = Math.max(0, Math.floor((candleEnd - Date.now()) / 1000));

      const indState = useIndicatorStore.getState().values;
      const htfState = useHtfContextStore.getState();

      const levelSignals = detectLevelReactions({
        candles: cs,
        vwap: indState.vwap ?? [],
        srLevels: indState.srLevels,
        liquidityPools: htfState.m5.liquidityPools ?? [],
        atr: indState.atr,
      });

      const inCloseWindow = secondsLeft <= PRE_CLOSE_TRIGGER_SECONDS;

      for (const p of levelSignals) {
        const k = `${p.type}_${p.index}`;
        if (lastPatternsRef.current.has(k)) continue;
        lastPatternsRef.current.add(k);

        // Always feed scoring data; the close-window gate filters display/history only
        levelSignalsThisCandleRef.current.push(p);
        if (levelSignalsThisCandleRef.current.length > 20) levelSignalsThisCandleRef.current.shift();

        if (inCloseWindow && p.confidence < CLOSE_WINDOW_MIN_CONFIDENCE) continue;

        const id2 = `${p.type}_${p.index}_${Date.now()}`;
        const signal = {
          id: id2,
          pattern: p,
          symbol,
          interval,
          candleTime: cs[p.index]?.time ?? last.time,
          createdAt: Date.now(),
          preClose: inCloseWindow,
        };
        addSignal(signal);
      }
    }, LIGHT_ANALYSIS_INTERVAL_MS);

    return () => clearInterval(id);
  }, [interval, symbol, addSignal]);
}

const PRIORITY_ALERT_THRESHOLD = 75;
const ASIAN_SESSION_THRESHOLD_BOOST = 5;
const MIN_RR = 1.2;
const MIN_REWARD_TO_SPREAD = 3;

function buildReasonLabel(
  htf: { h1: import('../store/htfContextStore').HtfFrame; m15: import('../store/htfContextStore').HtfFrame; m5: import('../store/htfContextStore').HtfFrame },
  recentSignals: import('../types/pattern').PatternResult[],
): string {
  const parts: string[] = [];

  const h1Ema20 = htf.h1.ema20[htf.h1.ema20.length - 1];
  const h1Ema50 = htf.h1.ema50[htf.h1.ema50.length - 1];
  if (Number.isFinite(h1Ema20) && Number.isFinite(h1Ema50)) {
    parts.push(h1Ema20 > h1Ema50 ? 'H1 bullish trend' : 'H1 bearish trend');
  }

  const sweep = recentSignals.find(p => p.type.startsWith('liquidity_sweep'));
  if (sweep) parts.push(sweep.label);

  const choch = recentSignals.find(p => p.label === 'Confirmed CHoCH after Liquidity Sweep');
  if (choch) parts.push('Confirmed CHoCH');

  const levelReaction = recentSignals.find(p => p.type.startsWith('level_reaction_'));
  if (levelReaction) parts.push(levelReaction.label);

  const bos = recentSignals.find(p => p.type === 'impulse_consolidation_breakout');
  if (bos) parts.push(bos.label);

  return parts.length > 0 ? parts.join(' + ') : 'M1 trigger';
}

function maybeUpdatePriorityAlert(
  score: number,
  symbol: string,
  interval: import('../types/candle').Interval,
  lastPrice: number,
  recentSignals: import('../types/pattern').PatternResult[],
  htf: { h1: import('../store/htfContextStore').HtfFrame; m15: import('../store/htfContextStore').HtfFrame; m5: import('../store/htfContextStore').HtfFrame },
  atr: number[],
  soundEnabled: boolean,
  playBullish: () => void,
  playBearish: () => void,
  customSpreadOverrides: Record<string, number>,
  strictAsianSession: boolean,
  components?: import('../utils/directionPrediction').DirectionResult['components'],
) {
  // --- Session filter (Step 7) ---
  if (!isCrypto(symbol)) {
    const session = getCurrentSession();
    if (session === 'closed') return;

    // Raise threshold during Tokyo session for non-Asian pairs
    if (strictAsianSession && session === 'tokyo') {
      const upper = symbol.toUpperCase().replace('/', '');
      const isAsianPair = upper.includes('JPY') || upper === 'AUDUSD' || upper === 'NZDUSD';
      if (!isAsianPair) {
        if (score < (PRIORITY_ALERT_THRESHOLD + ASIAN_SESSION_THRESHOLD_BOOST) / 100) return;
      }
    }
  }

  const { calibration } = usePredictionStore.getState();

  let probUp: number;
  if (calibration.featureModel && components) {
    const fm = calibration.featureModel;
    const fv = componentsToFeatureVector(components);
    let z = fm.bias;
    for (let i = 0; i < fm.weights.length && i < fv.length; i++) {
      z += fm.weights[i] * fv[i];
    }
    probUp = sigmoid(z);
  } else if (calibration.sampleSize >= 20) {
    probUp = calibratedProbability(score, calibration.model);
  } else {
    probUp = (score + 1) / 2;
  }
  const probability = Math.round(probUp * 100);

  if (probability < PRIORITY_ALERT_THRESHOLD) return;

  const direction: 'up' | 'down' = score > 0 ? 'up' : 'down';

  // --- EV / RR filter (Step 2) ---
  // Use native pattern levels (measured-move based) when the trigger pattern provides them
  const triggerPattern = recentSignals.find(p => p.type === 'impulse_consolidation_breakout' && p.extra?.sl !== undefined && p.extra?.tp1 !== undefined);
  const nativeLevels = triggerPattern?.extra
    ? { sl: triggerPattern.extra.sl as number, tp: triggerPattern.extra.tp1 as number }
    : undefined;
  const levels = estimateTradeLevels({ direction, lastPrice, atr, htf, nativeLevels });
  if (levels.rr < MIN_RR) return;

  const ev = (probability / 100) * levels.rewardDistance - (1 - probability / 100) * levels.riskDistance;
  const evPct = ev / lastPrice;
  if (evPct <= 0) return;

  // --- Spread gate (Step 3) ---
  const spread = estimateSpread(symbol, lastPrice, customSpreadOverrides);
  if (levels.rewardDistance < spread * MIN_REWARD_TO_SPREAD) return;

  const { current, setAlert } = usePriorityAlertStore.getState();

  const now = Date.now();
  if (current && now < current.expiresAt) {
    if (current.direction === direction) return;
    if (probability <= current.probability) return;
  }

  const triggerPatternForExpiry = recentSignals[0];
  const expirySeconds = computeRecommendedExpirySeconds({
    interval,
    atr,
    lastPrice,
    patternType: triggerPatternForExpiry?.type ?? 'doji',
  });

  setAlert({
    id: `${symbol}_${interval}_${now}`,
    direction,
    symbol,
    interval,
    probability,
    createdAt: now,
    expiresAt: now + expirySeconds * 1000,
    recommendedExpirySeconds: expirySeconds,
    reasonLabel: buildReasonLabel(htf, recentSignals),
    rr: levels.rr,
    expectedValuePct: evPct,
  });

  if (soundEnabled) {
    if (direction === 'up') playBullish();
    else playBearish();
  }
}
