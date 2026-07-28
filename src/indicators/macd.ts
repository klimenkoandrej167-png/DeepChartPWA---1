import { calcEMA } from './ema';

export interface MACDResult {
  macd:   number[];
  signal: number[];
  hist:   number[];
}

export function calcMACD(
  closes: number[],
  fastPeriod = 12,
  slowPeriod = 26,
  signalPeriod = 9,
): MACDResult {
  const fast   = calcEMA(closes, fastPeriod);
  const slow   = calcEMA(closes, slowPeriod);
  const n      = closes.length;
  const macdLine: number[] = new Array(n).fill(NaN);

  for (let i = 0; i < n; i++) {
    if (!isNaN(fast[i]) && !isNaN(slow[i])) {
      macdLine[i] = fast[i] - slow[i];
    }
  }

  // compute signal EMA over macdLine (strip NaNs for EMA seed)
  const validMacd = macdLine.filter(v => !isNaN(v));
  const signalRaw = calcEMA(validMacd, signalPeriod);

  // align back to full array length
  const signalLine: number[] = new Array(n).fill(NaN);
  const histLine:   number[] = new Array(n).fill(NaN);
  let si = 0;
  for (let i = 0; i < n; i++) {
    if (!isNaN(macdLine[i])) {
      if (!isNaN(signalRaw[si])) {
        signalLine[i] = signalRaw[si];
        histLine[i]   = macdLine[i] - signalRaw[si];
      }
      si++;
    }
  }

  return { macd: macdLine, signal: signalLine, hist: histLine };
}
