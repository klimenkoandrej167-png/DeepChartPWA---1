import { useState, useEffect, useRef } from 'react';
import { useChartStore } from '../store/chartStore';
import { intervalToMs } from '../utils/timeframeUtils';
import { isCrypto } from '../utils/symbolUtils';
import { isForexMarketOpen } from '../utils/marketHours';

export interface CandleTimerState {
  seconds: number;
  waiting: boolean;
}

export function useCandleTimer(): CandleTimerState {
  const candles  = useChartStore(s => s.candles);
  const interval = useChartStore(s => s.interval);
  const symbol   = useChartStore(s => s.symbol);
  const [state, setState] = useState<CandleTimerState>({ seconds: 0, waiting: false });

  const candlesRef = useRef(candles);
  candlesRef.current = candles;

  useEffect(() => {
    function update() {
      const cs = candlesRef.current;
      if (cs.length === 0) {
        setState({ seconds: 0, waiting: false });
        return;
      }

      if (!isCrypto(symbol) && !isForexMarketOpen()) {
        setState({ seconds: 0, waiting: false });
        return;
      }

      const last      = cs[cs.length - 1];
      const ivlMs     = intervalToMs(interval);
      const ivlSec    = Math.floor(ivlMs / 1000);
      const candleEnd = (last.time + ivlSec) * 1000;
      const diff      = candleEnd - Date.now();

      if (diff > 0) {
        setState({ seconds: Math.floor(diff / 1000), waiting: false });
      } else {
        setState({ seconds: 0, waiting: true });
      }
    }

    update();
    const id = setInterval(update, 1000);
    return () => clearInterval(id);
  }, [interval, symbol]);

  return state;
}
