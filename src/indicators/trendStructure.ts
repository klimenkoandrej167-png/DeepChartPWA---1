import type { SwingPoint } from '../store/indicatorStore';

const LOOKBACK = 5;

export function detectSwings(highs: number[], lows: number[]): SwingPoint[] {
  const swings: SwingPoint[] = [];
  const n = highs.length;

  const localHighs: number[] = [];
  const localLows:  number[] = [];
  const localHighIdx: number[] = [];
  const localLowIdx:  number[] = [];

  for (let i = LOOKBACK; i < n - LOOKBACK; i++) {
    let isHigh = true;
    let isLow  = true;
    for (let j = i - LOOKBACK; j <= i + LOOKBACK; j++) {
      if (j === i) continue;
      if (highs[j] >= highs[i]) isHigh = false;
      if (lows[j]  <= lows[i])  isLow  = false;
    }
    if (isHigh) { localHighs.push(highs[i]); localHighIdx.push(i); }
    if (isLow)  { localLows.push(lows[i]);   localLowIdx.push(i); }
  }

  // Classify HH/HL for swing highs
  for (let i = 1; i < localHighs.length; i++) {
    const type = localHighs[i] >= localHighs[i - 1] ? 'HH' : 'LH';
    swings.push({ index: localHighIdx[i], price: localHighs[i], type });
  }

  // Classify LL/HL for swing lows
  for (let i = 1; i < localLows.length; i++) {
    const type = localLows[i] <= localLows[i - 1] ? 'LL' : 'HL';
    swings.push({ index: localLowIdx[i], price: localLows[i], type });
  }

  swings.sort((a, b) => a.index - b.index);
  return swings;
}
