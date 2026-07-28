import { create } from 'zustand';
import type { Candle, SourceStatus, DataSourceName, Interval } from '../types/candle';

const MAX_CANDLES = 1500;

interface ChartState {
  symbol: string;
  interval: Interval;
  candles: Candle[];
  sourceStatus: SourceStatus;
  activeSources: DataSourceName[];

  setSymbol: (s: string) => void;
  setInterval: (i: Interval) => void;
  setCandles: (c: Candle[]) => void;
  updateOrAppendCandle: (c: Candle) => void;
  setSourceStatus: (s: SourceStatus) => void;
  setActiveSources: (s: DataSourceName[]) => void;
}

export const useChartStore = create<ChartState>()((set) => ({
  symbol:       'BTCUSDT',
  interval:     '1h',
  candles:      [],
  sourceStatus: 'connecting',
  activeSources: [],

  setSymbol:        (symbol) => set({ symbol }),
  setInterval:      (interval) => set({ interval }),
  setCandles:       (candles) => set({ candles: candles.slice(-MAX_CANDLES) }),
  setSourceStatus:  (sourceStatus) => set({ sourceStatus }),
  setActiveSources: (activeSources) => set({ activeSources }),

  updateOrAppendCandle(c) {
    set((s) => {
      const arr = s.candles;
      if (arr.length === 0) return { candles: [c] };

      const last = arr[arr.length - 1];

      // Same candle — merge (live tick updating current bar)
      if (last.time === c.time) {
        const merged = {
          time:   last.time,
          open:   last.open,
          high:   Math.max(last.high, c.high),
          low:    Math.min(last.low, c.low),
          close:  c.close,
          volume: (last.volume ?? 0) + (c.volume ?? 0),
        };
        const next = [...arr];
        next[next.length - 1] = merged;
        return { candles: next };
      }

      // New candle — only append if it's actually newer
      if (c.time > last.time) {
        const next = [...arr, c];
        if (next.length > MAX_CANDLES) next.splice(0, next.length - MAX_CANDLES);
        return { candles: next };
      }

      // Stale tick (time < last) — ignore, don't create duplicates
      return s;
    });
  },
}));
