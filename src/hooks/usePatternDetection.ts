import { useEffect, useRef } from 'react';
import { useChartStore } from '../store/chartStore';
import { useIndicatorStore } from '../store/indicatorStore';
import { useSignalStore } from '../store/signalStore';
import { useSettingsStore } from '../store/settingsStore';
import { useStrategiesStore } from '../store/strategiesStore';
import { useAudioAlert } from './useAudioAlert';
import { intervalToMs } from '../utils/timeframeUtils';
import { usePredictionStore } from '../store/predictionStore';
import { useHtfContextStore } from '../store/htfContextStore';
import { usePriorityAlertStore } from '../store/priorityAlertStore';
import { calibratedProbability, sigmoid } from '../utils/calibration';
import { computeRecommendedExpirySeconds } from '../utils/recommendedExpiry';
import { estimateTradeLevels } from '../utils/tradeLevels';
import { detectLevelReactions } from '../patterns/levels/levelReaction';
import { estimateSpread } from '../utils/spreadEstimate';
import { getCurrentSession } from '../utils/marketHours';
import { isCrypto } from '../utils/symbolUtils';
import { componentsToFeatureVector } from '../utils/directionPrediction';
import { useSweepChochTracker } from './useSweepChochTracker';
import { runEngine } from '../engine/analysisEngine';
import type { Candle } from '../types/candle';
import type { PatternResult } from '../types/pattern';

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
  const prevM5SweepsRef = useRef<PatternResult[]>([]);
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
    const htfState = useHtfContextStore.getState();

    // CHoCH tracker is stateful and depends on real-time m5 sweeps.
    // Feed it the sweeps from the PREVIOUS analysis pass (stored in ref),
    // so confirmed CHoCH signals are available to the engine for the
    // direction score's liquidity component — matching original behavior.
    const confirmedChoch = chochTracker.update(
      htfState.m5.candles,
      prevM5SweepsRef.current,
      htfState.m5.swings,
    );

    const result = runEngine({
      candles: finalizedCandles,
      symbol,
      interval,
      predictionInputs,
      strategies,
      htf: { h1: htfState.h1, m15: htfState.m15, m5: htfState.m5 },
      confirmedChoch,
      levelSignals: levelSignalsThisCandleRef.current,
    });

    // Store this pass's m5 sweeps for the next analysis cycle.
    prevM5SweepsRef.current = result.m5Sweeps;

    setValues(result.indicators);

    const allSignalsForDispatch = [
      ...result.patterns,
      ...result.obReactionSignals,
      ...confirmedChoch,
    ];
    const newSignals = allSignalsForDispatch.filter(p => {
      const k = `${p.type}_${p.index}`;
      if (lastPatternsRef.current.has(k)) return false;
      lastPatternsRef.current.add(k);
      return true;
    });

    for (const p of newSignals) {
      if (p.confidence < CLOSE_WINDOW_MIN_CONFIDENCE) continue;
      const id = `${p.type}_${p.index}_${Date.now()}`;
      const signal = {
        id,
        pattern:    p,
        symbol,
        interval,
        candleTime: finalizedCandles[p.index]?.time ?? result.lastCandle.time,
        createdAt:  Date.now(),
        preClose:   isPreClose,
      };
      addSignal(signal);
      if (soundEnabled) {
        if (p.direction === 'bullish')  playBullish();
        else if (p.direction === 'bearish') playBearish();
      }
    }

    recordPrediction({
      symbol,
      interval,
      candleTime: result.lastCandle.time,
      score: result.directionScore,
      priceAtPrediction: result.lastPrice,
      components: result.components,
    });

    maybeUpdatePriorityAlert(
      result.directionScore,
      symbol,
      interval,
      result.lastPrice,
      result.allRecent,
      htfState,
      result.indicators.atr,
      soundEnabled,
      playBullish,
      playBearish,
      customSpreadOverrides,
      strictAsianSession,
      result.components,
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
  if (!isCrypto(symbol)) {
    const session = getCurrentSession();
    if (session === 'closed') return;

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

  const triggerPattern = recentSignals.find(p => p.type === 'impulse_consolidation_breakout' && p.extra?.sl !== undefined && p.extra?.tp1 !== undefined);
  const nativeLevels = triggerPattern?.extra
    ? { sl: triggerPattern.extra.sl as number, tp: triggerPattern.extra.tp1 as number }
    : undefined;
  const levels = estimateTradeLevels({ direction, lastPrice, atr, htf, nativeLevels });
  if (levels.rr < MIN_RR) return;

  const ev = (probability / 100) * levels.rewardDistance - (1 - probability / 100) * levels.riskDistance;
  const evPct = ev / lastPrice;
  if (evPct <= 0) return;

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
