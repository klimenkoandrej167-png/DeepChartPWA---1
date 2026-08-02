import { useEffect, useRef } from 'react';
import { useChartStore } from '../store/chartStore';
import { useKeysStore } from '../store/keysStore';
import { selectDataSource } from '../api/dataRouter';
import type { DataRouter } from '../api/dataRouter';
import { compactGaps } from '../utils/compactTimeline';
import { appendCachedCandle } from '../utils/historyCache';

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

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  useEffect(() => {
    unsubRef.current?.();
    unsubRef.current = null;
    routerRef.current = null;
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
          // Append new closed candles to IndexedDB cache
          appendCachedCandle(symbol, interval, tick);
        });
        unsubRef.current = unsub;

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
    };
  }, [symbol, interval, twelvedataKey, finnhubKey, setCandles, updateOrAppend, setStatus, setActiveSources]);
}
