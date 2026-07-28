import type { Candle } from '../types/candle';
import { isCrypto } from '../utils/symbolUtils';

export interface VolumeProfileResult {
  poc: number;
  vah: number;
  val: number;
  bins: { priceLow: number; priceHigh: number; volume: number }[];
}

export function calcVolumeProfile(
  candles: Candle[],
  symbol: string,
  binCount = 24,
  valueAreaPct = 0.70,
): VolumeProfileResult | null {
  if (candles.length < 20) return null;

  // Forex via Deriv always has volume: 0 — VP would be meaningless
  if (!isCrypto(symbol)) return null;

  const totalVolume = candles.reduce((s, c) => s + c.volume, 0);
  if (totalVolume <= 0) return null;

  let minLow = Infinity;
  let maxHigh = -Infinity;
  for (const c of candles) {
    if (c.low < minLow) minLow = c.low;
    if (c.high > maxHigh) maxHigh = c.high;
  }

  if (minLow >= maxHigh) return null;

  const binSize = (maxHigh - minLow) / binCount;
  const bins = Array.from({ length: binCount }, (_, i) => ({
    priceLow: minLow + i * binSize,
    priceHigh: minLow + (i + 1) * binSize,
    volume: 0,
  }));

  for (const c of candles) {
    if (c.volume <= 0) continue;
    const startBin = Math.floor((c.low - minLow) / binSize);
    const endBin = Math.floor((c.high - minLow) / binSize);
    const numBins = Math.max(1, endBin - startBin + 1);
    const volPerBin = c.volume / numBins;

    for (let b = Math.max(0, startBin); b <= Math.min(binCount - 1, endBin); b++) {
      bins[b].volume += volPerBin;
    }
  }

  let pocIdx = 0;
  let maxVol = 0;
  for (let i = 0; i < bins.length; i++) {
    if (bins[i].volume > maxVol) {
      maxVol = bins[i].volume;
      pocIdx = i;
    }
  }

  const poc = (bins[pocIdx].priceLow + bins[pocIdx].priceHigh) / 2;

  // Expand value area from POC
  const targetVolume = totalVolume * valueAreaPct;
  let vaVolume = bins[pocIdx].volume;
  let vaLow = pocIdx;
  let vaHigh = pocIdx;

  while (vaVolume < targetVolume && (vaLow > 0 || vaHigh < binCount - 1)) {
    const downVol = vaLow > 0 ? bins[vaLow - 1].volume : -1;
    const upVol = vaHigh < binCount - 1 ? bins[vaHigh + 1].volume : -1;

    if (downVol >= upVol && downVol >= 0) {
      vaLow--;
      vaVolume += bins[vaLow].volume;
    } else if (upVol >= 0) {
      vaHigh++;
      vaVolume += bins[vaHigh].volume;
    } else {
      break;
    }
  }

  const vah = (bins[vaHigh].priceLow + bins[vaHigh].priceHigh) / 2;
  const val = (bins[vaLow].priceLow + bins[vaLow].priceHigh) / 2;

  return { poc, vah, val, bins };
}
