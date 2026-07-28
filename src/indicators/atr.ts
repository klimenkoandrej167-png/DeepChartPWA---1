import type { Candle } from '../types/candle';

export function calcATR(candles: Candle[], period = 14): number[] {
  if (candles.length < period + 1) return [];
  const result: number[] = new Array(candles.length).fill(NaN);
  const trs: number[] = [];

  for (let i = 1; i < candles.length; i++) {
    const c = candles[i];
    const prev = candles[i - 1];
    const tr = Math.max(
      c.high - c.low,
      Math.abs(c.high - prev.close),
      Math.abs(c.low  - prev.close),
    );
    trs.push(tr);
  }

  let atr = trs.slice(0, period).reduce((s, v) => s + v, 0) / period;
  result[period] = atr;

  for (let i = period; i < trs.length; i++) {
    atr = (atr * (period - 1) + trs[i]) / period;
    result[i + 1] = atr;
  }
  return result;
}
