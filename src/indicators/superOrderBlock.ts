import type { Candle } from '../types/candle';
import type { OrderBlock, FVG, RejectionBlock, BOSEvent } from '../store/indicatorStore';

export interface SmartMoneyResult {
  orderBlocks:     OrderBlock[];
  fvgs:            FVG[];
  rejectionBlocks: RejectionBlock[];
  bosEvents:       BOSEvent[];
}

const isUp   = (c: Candle) => c.close > c.open;
const isDown = (c: Candle) => c.close < c.open;

const PIVOT_LOOKUP = 2;

export function calcSmartMoney(candles: Candle[]): SmartMoneyResult {
  const orderBlocks:     OrderBlock[]     = [];
  const fvgs:            FVG[]            = [];
  const rejectionBlocks: RejectionBlock[] = [];
  const bosEvents:       BOSEvent[]       = [];

  const n = candles.length;
  if (n < 2 * PIVOT_LOOKUP + 5) {
    return { orderBlocks, fvgs, rejectionBlocks, bosEvents };
  }

  // ---------- Order Blocks ----------
  for (let i = 2; i < n; i++) {
    const obCandle = candles[i - 2];
    const brCandle = candles[i - 1];

    // Bullish OB: bearish candle followed by bullish breakout above it
    if (isDown(obCandle) && isUp(brCandle) && brCandle.close > obCandle.high) {
      const top    = obCandle.high;
      const bottom = Math.min(obCandle.low, brCandle.low);
      let endTime: number | null = null;
      for (let j = i; j < n; j++) {
        const c = candles[j];
        if ((c.high > bottom && c.low < bottom) || (c.high > top && c.low < top)) {
          endTime = c.time;
          break;
        }
      }
      orderBlocks.push({
        top, bottom,
        time: obCandle.time,
        type: 'bullish',
        mitigated: endTime !== null,
        endTime,
      });
    }

    // Bearish OB: bullish candle followed by bearish breakdown below it
    if (isUp(obCandle) && isDown(brCandle) && brCandle.close < obCandle.low) {
      const top    = Math.max(obCandle.high, brCandle.high);
      const bottom = obCandle.low;
      let endTime: number | null = null;
      for (let j = i; j < n; j++) {
        const c = candles[j];
        if ((c.high > bottom && c.low < bottom) || (c.high > top && c.low < top)) {
          endTime = c.time;
          break;
        }
      }
      orderBlocks.push({
        top, bottom,
        time: obCandle.time,
        type: 'bearish',
        mitigated: endTime !== null,
        endTime,
      });
    }
  }

  // ---------- Fair Value Gaps ----------
  for (let i = 2; i < n; i++) {
    const left = candles[i - 2];
    const cur  = candles[i];

    // Bullish FVG: gap up
    if (cur.low > left.high) {
      let endTime: number | null = null;
      for (let j = i + 1; j < n; j++) {
        if (candles[j].close < left.high) { endTime = candles[j].time; break; }
      }
      fvgs.push({
        top: cur.low, bottom: left.high,
        time: left.time,
        type: 'bullish',
        broken: endTime !== null,
        endTime,
      });
    }

    // Bearish FVG: gap down
    if (cur.high < left.low) {
      let endTime: number | null = null;
      for (let j = i + 1; j < n; j++) {
        if (candles[j].close > left.low) { endTime = candles[j].time; break; }
      }
      fvgs.push({
        top: left.low, bottom: cur.high,
        time: left.time,
        type: 'bearish',
        broken: endTime !== null,
        endTime,
      });
    }
  }

  // ---------- Rejection Blocks ----------
  for (let i = 2; i < n; i++) {
    const obCandle = candles[i - 2];
    const brCandle = candles[i - 1];

    const isDownRjbOb = isUp(obCandle) && isDown(brCandle) && brCandle.close < obCandle.low;
    if (isDownRjbOb) {
      const rjb1 = brCandle.high < (obCandle.close + 0.2 * (obCandle.high - obCandle.close));
      const rjb2 = brCandle.high > obCandle.high;
      if (rjb1) {
        rejectionBlocks.push({ top: obCandle.high, bottom: obCandle.close, time: obCandle.time, type: 'bearish' });
      } else if (rjb2) {
        rejectionBlocks.push({ top: brCandle.high, bottom: brCandle.open, time: brCandle.time, type: 'bearish' });
      }
    }

    const isUpRjbOb = isDown(obCandle) && isUp(brCandle) && brCandle.close > obCandle.high;
    if (isUpRjbOb) {
      const rjb1 = brCandle.low > (obCandle.close - 0.2 * (obCandle.close - obCandle.low));
      const rjb2 = brCandle.low < obCandle.low;
      if (rjb1) {
        rejectionBlocks.push({ top: obCandle.close, bottom: obCandle.low, time: obCandle.time, type: 'bullish' });
      } else if (rjb2) {
        rejectionBlocks.push({ top: brCandle.open, bottom: brCandle.low, time: brCandle.time, type: 'bullish' });
      }
    }
  }

  // ---------- Break of Structure ----------
  let lastPivotHigh: number | null = null;
  let lastPivotLow:  number | null = null;

  for (let i = PIVOT_LOOKUP; i < n - PIVOT_LOOKUP; i++) {
    const window    = candles.slice(i - PIVOT_LOOKUP, i + PIVOT_LOOKUP + 1);
    const isPivHigh = window.every(c => c.high <= candles[i].high);
    const isPivLow  = window.every(c => c.low  >= candles[i].low);

    const confirmBar = i + PIVOT_LOOKUP;
    if (confirmBar >= n) continue;

    if (isPivHigh) lastPivotHigh = candles[i].high;
    if (isPivLow)  lastPivotLow  = candles[i].low;

    const cur  = candles[confirmBar];
    const prev = candles[confirmBar - 1];

    if (lastPivotHigh !== null && prev && prev.close <= lastPivotHigh && cur.close > lastPivotHigh) {
      bosEvents.push({ price: lastPivotHigh, time: cur.time, type: 'bullish' });
    }
    if (lastPivotLow !== null && prev && prev.close >= lastPivotLow && cur.close < lastPivotLow) {
      bosEvents.push({ price: lastPivotLow, time: cur.time, type: 'bearish' });
    }
  }

  return {
    orderBlocks:     orderBlocks.slice(-30),
    fvgs:            fvgs.slice(-30),
    rejectionBlocks: rejectionBlocks.slice(-30),
    bosEvents:       bosEvents.slice(-30),
  };
}
