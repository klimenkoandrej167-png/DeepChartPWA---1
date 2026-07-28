import type { SRLevel } from '../store/indicatorStore';

const CLUSTER_THRESHOLD_PCT = 0.003;

export function calcSupportResistance(
  highs: number[],
  lows:  number[],
  lookback = 100,
  currentPrice?: number,
): SRLevel[] {
  const n     = Math.min(lookback, highs.length);
  const start = highs.length - n;

  const candidates: number[] = [];
  for (let i = start + 2; i < highs.length - 2; i++) {
    const isLocalHigh =
      highs[i] >= highs[i - 1] && highs[i] >= highs[i - 2] &&
      highs[i] >= highs[i + 1] && highs[i] >= highs[i + 2];
    const isLocalLow =
      lows[i] <= lows[i - 1] && lows[i] <= lows[i - 2] &&
      lows[i] <= lows[i + 1] && lows[i] <= lows[i + 2];
    if (isLocalHigh) candidates.push(highs[i]);
    if (isLocalLow)  candidates.push(lows[i]);
  }

  // cluster nearby levels
  candidates.sort((a, b) => a - b);
  const clusters: { price: number; count: number }[] = [];

  for (const price of candidates) {
    const existing = clusters.find(
      c => Math.abs(c.price - price) / c.price < CLUSTER_THRESHOLD_PCT
    );
    if (existing) {
      existing.price = (existing.price * existing.count + price) / (existing.count + 1);
      existing.count++;
    } else {
      clusters.push({ price, count: 1 });
    }
  }

  const refPrice = currentPrice ?? highs[highs.length - 1];
  const withType = clusters
    .filter(c => c.count >= 2)
    .map(c => ({
      price:    c.price,
      strength: Math.min(c.count, 5),
      type:     (c.price < refPrice ? 'support' : 'resistance') as 'support' | 'resistance',
    }));

  const supports = withType.filter(l => l.type === 'support');
  const resistances = withType.filter(l => l.type === 'resistance');

  supports.sort((a, b) => b.price - a.price);
  resistances.sort((a, b) => a.price - b.price);

  return [...supports.slice(0, 10), ...resistances.slice(0, 10)] as SRLevel[];
}
