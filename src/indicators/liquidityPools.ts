import type { Candle } from '../types/candle';

export interface LiquidityPool {
  price: number;
  type: 'buy_side' | 'sell_side';
  touches: number;
  swept: boolean;
  time: number;
}

const CLUSTER_TOLERANCE = 0.0008;

export function detectLiquidityPools(
  candles: Candle[],
  tolerancePct = CLUSTER_TOLERANCE,
  lookback = 60,
): LiquidityPool[] {
  if (candles.length < 10) return [];

  const start = Math.max(0, candles.length - lookback);
  const slice = candles.slice(start);

  const localHighs: { price: number; index: number }[] = [];
  const localLows: { price: number; index: number }[] = [];

  for (let i = 2; i < slice.length - 2; i++) {
    if (
      slice[i].high >= slice[i - 1].high && slice[i].high >= slice[i - 2].high &&
      slice[i].high >= slice[i + 1].high && slice[i].high >= slice[i + 2].high
    ) {
      localHighs.push({ price: slice[i].high, index: i });
    }
    if (
      slice[i].low <= slice[i - 1].low && slice[i].low <= slice[i - 2].low &&
      slice[i].low <= slice[i + 1].low && slice[i].low <= slice[i + 2].low
    ) {
      localLows.push({ price: slice[i].low, index: i });
    }
  }

  function cluster(points: { price: number; index: number }[], side: 'buy_side' | 'sell_side'): LiquidityPool[] {
    const sorted = [...points].sort((a, b) => a.price - b.price);
    const clusters: { prices: number[]; indices: number[] }[] = [];

    for (const pt of sorted) {
      const existing = clusters.find(c => {
        const avg = c.prices.reduce((a, b) => a + b, 0) / c.prices.length;
        return Math.abs(avg - pt.price) / avg < tolerancePct;
      });
      if (existing) {
        existing.prices.push(pt.price);
        existing.indices.push(pt.index);
      } else {
        clusters.push({ prices: [pt.price], indices: [pt.index] });
      }
    }

    return clusters
      .filter(c => c.prices.length >= 2)
      .map(c => {
        const avgPrice = c.prices.reduce((a, b) => a + b, 0) / c.prices.length;
        const lastTouchIndex = Math.max(...c.indices);
        const lastTouchTime = slice[lastTouchIndex].time;

        let swept = false;
        for (let j = lastTouchIndex + 1; j < slice.length; j++) {
          if (side === 'buy_side' && slice[j].close > avgPrice * (1 + tolerancePct)) {
            swept = true;
            break;
          }
          if (side === 'sell_side' && slice[j].close < avgPrice * (1 - tolerancePct)) {
            swept = true;
            break;
          }
        }

        return {
          price: avgPrice,
          type: side,
          touches: c.prices.length,
          swept,
          time: lastTouchTime,
        };
      });
  }

  return [...cluster(localHighs, 'buy_side'), ...cluster(localLows, 'sell_side')];
}
