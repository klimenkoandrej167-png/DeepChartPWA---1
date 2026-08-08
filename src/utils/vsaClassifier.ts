import type { Candle } from '../types/candle';

export type VsaSignal =
  | 'absorption_bullish'
  | 'absorption_bearish'
  | 'no_demand'
  | 'no_supply'
  | 'neutral';

const HIGH_VOL_MULT = 1.5;
const LOW_VOL_MULT = 0.7;
const NARROW_RANGE_MULT = 0.7;

// Simplified effort/result heuristic (not full Wyckoff VSA — no multi-bar
// context or phase classification). Compares the current bar's volume and
// range against rolling averages to flag absorption or no-demand/no-supply.
export function classifyVsaBar(
  candle: Candle,
  avgVolume: number,
  avgRange: number,
  impulseVelocity?: number,
): VsaSignal {
  if (avgRange <= 0) return 'neutral';

  const range = candle.high - candle.low;
  const isBull = candle.close > candle.open;
  const isBear = candle.close < candle.open;

  // Volume unavailable (forex via Deriv where volume is always 0) —
  // use impulse velocity as a body-size proxy to detect weak moves
  if (avgVolume <= 0) {
    if (impulseVelocity !== undefined && impulseVelocity < 0.7 && range < avgRange * NARROW_RANGE_MULT) {
      if (isBull) return 'no_demand';
      if (isBear) return 'no_supply';
    }
    return 'neutral';
  }

  // Effort vs Result: high volume, narrow range = absorption by a larger player
  if (candle.volume > avgVolume * HIGH_VOL_MULT && range < avgRange * NARROW_RANGE_MULT) {
    if (isBull) return 'absorption_bearish'; // strong bull bar but weak result = hidden selling
    if (isBear) return 'absorption_bullish'; // strong bear bar but weak result = hidden buying
  }

  // No Demand / No Supply: low volume, narrow range = weak move
  if (candle.volume < avgVolume * LOW_VOL_MULT && range < avgRange * NARROW_RANGE_MULT) {
    if (isBull) return 'no_demand';   // weak rise without volume → bearish undertone
    if (isBear) return 'no_supply';   // weak fall without volume → bullish undertone
  }

  return 'neutral';
}
