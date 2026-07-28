import { useState, useEffect, useRef } from 'react';
import { useChartStore } from '../store/chartStore';
import { intervalToMs } from '../utils/timeframeUtils';
import { isCrypto } from '../utils/symbolUtils';
import { isForexMarketOpen } from '../utils/marketHours';

export function useCandleTimer(): number {
  const candles  = useChartStore(s => s.candles);
  const interval = useChartStore(s => s.interval);
  const symbol    = useChartStore(s => s.symbol);
  const [secondsLeft, setSecondsLeft] = useState(0);

  const candlesRef = useRef(candles);
  candlesRef.current = candles;

  useEffect(() => {
    function update() {
      const cs = candlesRef.current;
      if (cs.length === 0) {
        setSecondsLeft(0);
        return;
      }

      // When the forex market is closed, don't count down — show 0.
      if (!isCrypto(symbol) && !isForexMarketOpen()) {
        setSecondsLeft(0);
        return;
      }

      const last      = cs[cs.length - 1];
      const ivlMs     = intervalToMs(interval);
      const candleEnd = (last.time + Math.floor(ivlMs / 1000)) * 1000;
      const diff      = candleEnd - Date.now();
      setSecondsLeft(Math.max(0, Math.floor(diff / 1000)));
    }

    update();
    const id = setInterval(update, 1000);
    return () => clearInterval(id);
  }, [interval, symbol]);

  return secondsLeft;
}
