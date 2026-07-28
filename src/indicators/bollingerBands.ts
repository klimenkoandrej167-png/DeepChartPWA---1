export interface BollingerBands {
  upper:  number[];
  middle: number[];
  lower:  number[];
}

export function calcBollingerBands(
  closes: number[],
  period = 20,
  stdDevMult = 2,
): BollingerBands {
  const upper:  number[] = new Array(closes.length).fill(NaN);
  const middle: number[] = new Array(closes.length).fill(NaN);
  const lower:  number[] = new Array(closes.length).fill(NaN);

  for (let i = period - 1; i < closes.length; i++) {
    const slice = closes.slice(i - period + 1, i + 1);
    const sma   = slice.reduce((s, v) => s + v, 0) / period;
    const variance = slice.reduce((s, v) => s + (v - sma) ** 2, 0) / period;
    const sd    = Math.sqrt(variance);

    middle[i] = sma;
    upper[i]  = sma + stdDevMult * sd;
    lower[i]  = sma - stdDevMult * sd;
  }

  return { upper, middle, lower };
}
