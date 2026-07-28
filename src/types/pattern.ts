export type PatternType =
  // Single-candle
  | 'hammer' | 'inverted_hammer' | 'shooting_star' | 'hanging_man'
  | 'doji' | 'dragonfly_doji' | 'gravestone_doji' | 'long_legged_doji'
  | 'spinning_top' | 'marubozu'
  // Double-candle
  | 'bullish_engulfing' | 'bearish_engulfing'
  | 'piercing_line' | 'dark_cloud_cover'
  | 'bullish_harami' | 'bearish_harami'
  | 'tweezer_bottom' | 'tweezer_top'
  // Triple-candle
  | 'morning_star' | 'evening_star'
  | 'three_white_soldiers' | 'three_black_crows'
  | 'three_inside_up' | 'three_inside_down'
  | 'rising_three_methods' | 'falling_three_methods'
  | 'abandoned_baby_bullish' | 'abandoned_baby_bearish'
  // Advanced
  | 'pin_bar_bullish' | 'pin_bar_bearish'
  | 'inside_bar'
  | 'liquidity_sweep_bullish' | 'liquidity_sweep_bearish'
  | 'impulse_consolidation_breakout'
  // Liquidity sweep continuation/reversal (Step 3)
  | 'liquidity_sweep_continuation_bullish' | 'liquidity_sweep_continuation_bearish'
  | 'liquidity_sweep_reversal_bullish'     | 'liquidity_sweep_reversal_bearish'
  // Order block reactions (Step 4)
  | 'reaction_at_strong_ob_bullish'        | 'reaction_at_strong_ob_bearish'
  // Level reactions (Step 5)
  | 'level_reaction_vwap_bullish'          | 'level_reaction_vwap_bearish'
  | 'level_reaction_sr_bullish'            | 'level_reaction_sr_bearish'
  | 'level_reaction_fib_ote_bullish'       | 'level_reaction_fib_ote_bearish'
  | 'level_reaction_liquidity_pool_bullish'| 'level_reaction_liquidity_pool_bearish'
  // Mean reversion (Step 4)
  | 'mean_reversion_bullish' | 'mean_reversion_bearish';

export type SignalCategory = 'pattern' | 'strategy' | 'level';

export const PATTERN_CATEGORY: Record<PatternType, SignalCategory> = {
  // candlestick patterns → 'pattern'
  hammer: 'pattern', inverted_hammer: 'pattern', shooting_star: 'pattern', hanging_man: 'pattern',
  doji: 'pattern', dragonfly_doji: 'pattern', gravestone_doji: 'pattern', long_legged_doji: 'pattern',
  spinning_top: 'pattern', marubozu: 'pattern',
  bullish_engulfing: 'pattern', bearish_engulfing: 'pattern',
  piercing_line: 'pattern', dark_cloud_cover: 'pattern',
  bullish_harami: 'pattern', bearish_harami: 'pattern',
  tweezer_bottom: 'pattern', tweezer_top: 'pattern',
  morning_star: 'pattern', evening_star: 'pattern',
  three_white_soldiers: 'pattern', three_black_crows: 'pattern',
  three_inside_up: 'pattern', three_inside_down: 'pattern',
  rising_three_methods: 'pattern', falling_three_methods: 'pattern',
  abandoned_baby_bullish: 'pattern', abandoned_baby_bearish: 'pattern',
  pin_bar_bullish: 'pattern', pin_bar_bearish: 'pattern',
  inside_bar: 'pattern',
  // sweep / OB / breakout strategies → 'strategy'
  liquidity_sweep_bullish: 'strategy', liquidity_sweep_bearish: 'strategy',
  liquidity_sweep_continuation_bullish: 'strategy', liquidity_sweep_continuation_bearish: 'strategy',
  liquidity_sweep_reversal_bullish: 'strategy', liquidity_sweep_reversal_bearish: 'strategy',
  reaction_at_strong_ob_bullish: 'strategy', reaction_at_strong_ob_bearish: 'strategy',
  impulse_consolidation_breakout: 'strategy',
  // level reactions → 'level'
  level_reaction_vwap_bullish: 'level', level_reaction_vwap_bearish: 'level',
  level_reaction_sr_bullish: 'level', level_reaction_sr_bearish: 'level',
  level_reaction_fib_ote_bullish: 'level', level_reaction_fib_ote_bearish: 'level',
  level_reaction_liquidity_pool_bullish: 'level', level_reaction_liquidity_pool_bearish: 'level',
  mean_reversion_bullish: 'strategy', mean_reversion_bearish: 'strategy',
};

export type PatternDirection = 'bullish' | 'bearish' | 'neutral';

export interface PatternResult {
  type: PatternType;
  direction: PatternDirection;
  index: number;
  confidence: number;
  label: string;
  extra?: {
    entry?: number;
    sl?: number;
    tp1?: number;
    tp2?: number;
    rr?: string;
    consolidationBars?: number;
    impulseStrength?: number;
    strength?: 'weak' | 'medium' | 'strong';
  };
}
