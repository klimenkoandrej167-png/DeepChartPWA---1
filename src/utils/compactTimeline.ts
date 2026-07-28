import type { Candle, Interval } from '../types/candle';
import { intervalToMs } from './timeframeUtils';

/**
 * Removes gaps in candle history caused by market closures (weekends, holidays).
 *
 * Shifts timestamps of historical candles so each is spaced exactly one
 * interval apart, but **keeps the last candle's real timestamp** — the timer
 * and live tick subscription depend on it being the true open_time.
 *
 * Only compacts gaps significantly larger than the normal interval (> 2x),
 * so minor irregularities are preserved.
 *
 * Returns the compacted candles and the total shift that was applied to
 * candles *before* the last one. Live ticks need no adjustment because
 * they use the same real open_time as the last candle.
 */
export function compactGaps(
  candles: Candle[],
  interval: Interval,
): Candle[] {
  if (candles.length < 3) return candles;

  const intervalSec = intervalToMs(interval) / 1000;
  const gapThreshold = intervalSec * 2;

  // Work backwards from the last candle, which keeps its real time.
  const last = candles[candles.length - 1];
  const result: Candle[] = [last];

  for (let i = candles.length - 2; i >= 0; i--) {
    const curr = candles[i];
    const next = result[0]; // the candle we just placed (one newer)

    const actualGap = next.time - curr.time;

    if (actualGap > gapThreshold) {
      // Gap detected — compress to exactly one interval
      result.unshift({
        ...curr,
        time: next.time - intervalSec,
      });
    } else {
      result.unshift(curr);
    }
  }

  return result;
}
