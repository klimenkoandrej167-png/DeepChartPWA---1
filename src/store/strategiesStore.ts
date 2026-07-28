import { create } from 'zustand';
import { persist } from 'zustand/middleware';

/** Visibility toggles — control which strategy signals are SHOWN in the UI, not whether they are detected. */
export interface StrategyToggles {
  candlestickSingle: boolean;
  candlestickDouble: boolean;
  candlestickTriple: boolean;
  pinBar: boolean;
  insideBar: boolean;
  liquiditySweep: boolean;
  impulseConsolidationBreakout: boolean;
}

const DEFAULT_STRATEGIES: StrategyToggles = {
  candlestickSingle: true,
  candlestickDouble: true,
  candlestickTriple: true,
  pinBar: true,
  insideBar: true,
  liquiditySweep: true,
  impulseConsolidationBreakout: true,
};

interface StrategiesState {
  enabled: StrategyToggles;
  toggle: (key: keyof StrategyToggles) => void;
  set: (key: keyof StrategyToggles, v: boolean) => void;
}

export const useStrategiesStore = create<StrategiesState>()(
  persist(
    (set) => ({
      enabled: DEFAULT_STRATEGIES,
      toggle(key) {
        set((s) => ({ enabled: { ...s.enabled, [key]: !s.enabled[key] } }));
      },
      set(key, v) {
        set((s) => ({ enabled: { ...s.enabled, [key]: v } }));
      },
    }),
    { name: 'dc_strategies' },
  ),
);
