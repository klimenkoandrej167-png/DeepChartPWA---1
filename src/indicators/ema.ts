export function calcEMA(data: number[], period: number): number[] {
  if (data.length < period) return [];
  const k = 2 / (period + 1);
  const result: number[] = new Array(data.length).fill(NaN);

  // seed with SMA
  let sum = 0;
  for (let i = 0; i < period; i++) sum += data[i];
  let prev = sum / period;
  result[period - 1] = prev;

  for (let i = period; i < data.length; i++) {
    prev = data[i] * k + prev * (1 - k);
    result[i] = prev;
  }
  return result;
}
