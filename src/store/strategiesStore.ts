import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { PatternType } from '../types/pattern';

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

const PATTERN_TO_STRATEGY: Partial<Record<PatternType, keyof StrategyToggles>> = {
  // Single-candle
  hammer: 'candlestickSingle',
  inverted_hammer: 'candlestickSingle',
  shooting_star: 'candlestickSingle',
  hanging_man: 'candlestickSingle',
  doji: 'candlestickSingle',
  dragonfly_doji: 'candlestickSingle',
  gravestone_doji: 'candlestickSingle',
  long_legged_doji: 'candlestickSingle',
  spinning_top: 'candlestickSingle',
  marubozu: 'candlestickSingle',
  // Double-candle
  bullish_engulfing: 'candlestickDouble',
  bearish_engulfing: 'candlestickDouble',
  piercing_line: 'candlestickDouble',
  dark_cloud_cover: 'candlestickDouble',
  bullish_harami: 'candlestickDouble',
  bearish_harami: 'candlestickDouble',
  tweezer_bottom: 'candlestickDouble',
  tweezer_top: 'candlestickDouble',
  // Triple-candle
  morning_star: 'candlestickTriple',
  evening_star: 'candlestickTriple',
  three_white_soldiers: 'candlestickTriple',
  three_black_crows: 'candlestickTriple',
  three_inside_up: 'candlestickTriple',
  three_inside_down: 'candlestickTriple',
  rising_three_methods: 'candlestickTriple',
  falling_three_methods: 'candlestickTriple',
  abandoned_baby_bullish: 'candlestickTriple',
  abandoned_baby_bearish: 'candlestickTriple',
  // Advanced
  pin_bar_bullish: 'pinBar',
  pin_bar_bearish: 'pinBar',
  inside_bar: 'insideBar',
  liquidity_sweep_bullish: 'liquiditySweep',
  liquidity_sweep_bearish: 'liquiditySweep',
  liquidity_sweep_continuation_bullish: 'liquiditySweep',
  liquidity_sweep_continuation_bearish: 'liquiditySweep',
  liquidity_sweep_reversal_bullish: 'liquiditySweep',
  liquidity_sweep_reversal_bearish: 'liquiditySweep',
  impulse_consolidation_breakout: 'impulseConsolidationBreakout',
};

/**
 * Filter pattern results by the user's strategy toggles. Patterns without a
 * corresponding toggle (order block reactions, level reactions, mean reversion,
 * confirmed CHoCH) are always kept — there is no UI control for them.
 */
export function filterByStrategyToggles<T extends { type: PatternType }>(
  patterns: T[],
  enabled: StrategyToggles,
): T[] {
  return patterns.filter(p => {
    const key = PATTERN_TO_STRATEGY[p.type];
    if (key === undefined) return true;
    return enabled[key];
  });
}
