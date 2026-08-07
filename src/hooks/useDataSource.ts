import { useEffect, useRef } from 'react';
import { useChartStore } from '../store/chartStore';
import { useKeysStore } from '../store/keysStore';
import { selectDataSource } from '../api/dataRouter';
import type { DataRouter } from '../api/dataRouter';
import { compactGaps } from '../utils/compactTimeline';
import { appendCachedCandle } from '../utils/historyCache';
import { intervalToMs } from '../utils/timeframeUtils';

export function useDataSource() {
  const symbol        = useChartStore(s => s.symbol);
  const interval      = useChartStore(s => s.interval);
  const setCandles    = useChartStore(s => s.setCandles);
  const updateOrAppend = useChartStore(s => s.updateOrAppendCandle);
  const setStatus     = useChartStore(s => s.setSourceStatus);
  const setActiveSources = useChartStore(s => s.setActiveSources);

  const twelvedataKey = useKeysStore(s => s.twelvedataKey);
  const finnhubKey    = useKeysStore(s => s.finnhubKey);

  const routerRef   = useRef<DataRouter | null>(null);
  const unsubRef    = useRef<(() => void) | null>(null);
  const mountedRef  = useRef(true);
  const staleTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  useEffect(() => {
    unsubRef.current?.();
    unsubRef.current = null;
    routerRef.current = null;
    if (staleTimerRef.current) { clearInterval(staleTimerRef.current); staleTimerRef.current = null; }
    setStatus('connecting');
    setCandles([]);

    let cancelled = false;

    (async () => {
      try {
        const router = await selectDataSource({
          symbol, interval, twelvedataKey, finnhubKey,
        });
        if (cancelled) return;

        routerRef.current = router;
        setActiveSources([router.sourceName]);

        const raw = await router.fetchInitialCandles();
        if (cancelled) return;

        const candles = compactGaps(raw, interval);
        setCandles(candles);
        setStatus('live');

        const unsub = router.subscribeTicks((tick) => {
          if (cancelled) return;
          updateOrAppend(tick);
          appendCachedCandle(symbol, interval, tick);
          if (useChartStore.getState().sourceStatus === 'stale') {
            setStatus('live');
          }
        });
        unsubRef.current = unsub;

        // Stale-feed watchdog: if no tick arrives within 2× the interval
        // (clamped to [20s, 45s]), mark the feed as stale. The underlying
        // source's own watchdog handles reconnection — this is purely for
        // UI status so the user knows data isn't flowing.
        const staleThresholdMs = Math.min(Math.max(intervalToMs(interval) * 2, 20_000), 45_000);
        staleTimerRef.current = setInterval(() => {
          if (cancelled) return;
          const store = useChartStore.getState();
          if (store.sourceStatus !== 'live') return;
          if (store.lastTickAt === 0) return;
          if (Date.now() - store.lastTickAt > staleThresholdMs) {
            setStatus('stale');
          }
        }, 5_000);

      } catch (err) {
        if (!cancelled) {
          console.error('DataSource error:', err);
          setStatus('error');
        }
      }
    })();

    return () => {
      cancelled = true;
      unsubRef.current?.();
      unsubRef.current = null;
      if (staleTimerRef.current) { clearInterval(staleTimerRef.current); staleTimerRef.current = null; }
    };
  }, [symbol, interval, twelvedataKey, finnhubKey, setCandles, updateOrAppend, setStatus, setActiveSources]);
}
