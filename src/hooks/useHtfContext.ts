import { useEffect, useRef } from 'react';
import { useChartStore } from '../store/chartStore';
import { useKeysStore } from '../store/keysStore';
import { useHtfContextStore, HTF_INTERVAL_MAP, type HtfTf } from '../store/htfContextStore';
import { selectDataSource } from '../api/dataRouter';
import { calcEMA } from '../indicators/ema';
import { detectSwings } from '../indicators/trendStructure';
import { calcSupportResistance } from '../indicators/supportResistance';
import { calcSmartMoney } from '../indicators/superOrderBlock';
import { calcVolumeProfile } from '../indicators/volumeProfile';
import { detectLiquidityPools } from '../indicators/liquidityPools';
import type { Candle } from '../types/candle';

function computeFrameData(candles: Candle[], symbol: string) {
  if (candles.length < 10) return null;

  const closes = candles.map(c => c.close);
  const highs  = candles.map(c => c.high);
  const lows   = candles.map(c => c.low);

  const ema20 = calcEMA(closes, 20);
  const ema50 = calcEMA(closes, 50);
  const swings = detectSwings(highs, lows);
  const srLevels = calcSupportResistance(highs, lows, 100, closes[closes.length - 1]);
  const sm = calcSmartMoney(candles);
  const volumeProfile = calcVolumeProfile(candles, symbol);
  const liquidityPools = detectLiquidityPools(candles);

  return { ema20, ema50, swings, srLevels, ...sm, volumeProfile, liquidityPools };
}

export function useHtfContext() {
  const symbol = useChartStore(s => s.symbol);
  const { twelvedataKey, finnhubKey } = useKeysStore();
  const setFrame = useHtfContextStore(s => s.setFrame);
  const reset     = useHtfContextStore(s => s.reset);

  const symbolRef = useRef(symbol);
  symbolRef.current = symbol;

  useEffect(() => {
    reset();

    const tfs: HtfTf[] = ['h1', 'm15', 'm5'];
    const unsubs: (() => void)[] = [];
    let cancelled = false;

    for (const tf of tfs) {
      const interval = HTF_INTERVAL_MAP[tf];
      let unsub: (() => void) | null = null;

      setFrame(tf, { status: 'connecting' });

      (async () => {
        try {
          const router = await selectDataSource({ symbol, interval, twelvedataKey, finnhubKey });
          if (cancelled || symbolRef.current !== symbol) return;

          const raw = await router.fetchInitialCandles();
          if (cancelled || symbolRef.current !== symbol) return;

          const computed = computeFrameData(raw, symbol);
          setFrame(tf, {
            candles: raw,
            ...(computed ?? {}),
            status: 'live',
          });

          // Throttle: defer heavy recompute on unclosed-candle updates to ≤1/sec.
          // New-candle events recompute immediately (rare, cheap).
          const lastComputeRef = { time: 0 };
          const pendingRecomputeRef = { timer: null as ReturnType<typeof setTimeout> | null };

          unsub = router.subscribeTicks((tick) => {
            if (cancelled || symbolRef.current !== symbol) return;
            const store = useHtfContextStore.getState();
            const prev = store[tf].candles;
            const last = prev[prev.length - 1];

            const isCandleClose = last && tick.time > last.time;
            let updated: Candle[];

            if (last && tick.time === last.time) {
              updated = [...prev.slice(0, -1), tick];
            } else if (isCandleClose) {
              updated = [...prev, tick].slice(-500);
            } else {
              return;
            }

            if (isCandleClose) {
              // New candle — recompute immediately, cancel any pending throttle
              if (pendingRecomputeRef.timer) {
                clearTimeout(pendingRecomputeRef.timer);
                pendingRecomputeRef.timer = null;
              }
              const c = computeFrameData(updated, symbol);
              setFrame(tf, { candles: updated, ...(c ?? {}), status: 'live' });
              lastComputeRef.time = Date.now();
            } else {
              // Unclosed candle update — update candles immediately, throttle the heavy recompute
              setFrame(tf, { candles: updated, status: 'live' });

              const elapsed = Date.now() - lastComputeRef.time;
              if (elapsed >= 1000) {
                lastComputeRef.time = Date.now();
                const c = computeFrameData(updated, symbol);
                setFrame(tf, { candles: updated, ...(c ?? {}), status: 'live' });
              } else if (!pendingRecomputeRef.timer) {
                const delay = 1000 - elapsed;
                pendingRecomputeRef.timer = setTimeout(() => {
                  if (cancelled || symbolRef.current !== symbol) return;
                  pendingRecomputeRef.timer = null;
                  lastComputeRef.time = Date.now();
                  const cur = useHtfContextStore.getState()[tf].candles;
                  const c = computeFrameData(cur, symbol);
                  setFrame(tf, { candles: cur, ...(c ?? {}), status: 'live' });
                }, delay);
              }
            }
          });
        } catch (err) {
          if (!cancelled && symbolRef.current === symbol) {
            console.warn(`HTF ${tf} failed:`, err);
            setFrame(tf, { status: 'error' });
          }
        }
      })();

      unsubs.push(() => { unsub?.(); });
    }

    return () => {
      cancelled = true;
      unsubs.forEach(u => u());
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [symbol, twelvedataKey, finnhubKey]);
}
