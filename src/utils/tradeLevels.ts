import type { HtfFrame } from '../store/htfContextStore';
import type { SRLevel, OrderBlock, FVG } from '../store/indicatorStore';

export const SL_ATR_MULT = 1.2;
const TP_MAX_ATR_MULT = 3; // beyond this, fall back to volatility-based TP
const TP_FALLBACK_ATR_MULT = 2;

export interface EstimatedTradeLevels {
  entry: number;
  stopLoss: number;
  takeProfit: number;
  riskDistance: number;
  rewardDistance: number;
  rr: number;
}

function lastFinite(arr: number[]): number | undefined {
  for (let i = arr.length - 1; i >= 0; i--) {
    if (!Number.isNaN(arr[i]) && Number.isFinite(arr[i])) return arr[i];
  }
  return undefined;
}

/** Shared helper: find the nearest price level to `entry` in the direction of the trade. */
export function findNearestLevel(
  entry: number,
  direction: 'up' | 'down',
  sources: { srs?: SRLevel[]; obs?: OrderBlock[]; fvgs?: FVG[]; extra?: number[] }[],
  atr: number,
): number | null {
  let best: number | null = null;
  let bestDist = Infinity;
  const maxDist = atr * TP_MAX_ATR_MULT;

  for (const src of sources) {
    if (src.srs) {
      for (const sr of src.srs) {
        const dist = Math.abs(entry - sr.price);
        if (dist < bestDist && dist <= maxDist) {
          if ((direction === 'up' && sr.price > entry) || (direction === 'down' && sr.price < entry)) {
            best = sr.price;
            bestDist = dist;
          }
        }
      }
    }
    if (src.obs) {
      for (const ob of src.obs) {
        if (ob.mitigated) continue;
        const mid = (ob.top + ob.bottom) / 2;
        const dist = Math.abs(entry - mid);
        if (dist < bestDist && dist <= maxDist) {
          if ((direction === 'up' && ob.type === 'bullish' && mid > entry) ||
              (direction === 'down' && ob.type === 'bearish' && mid < entry)) {
            best = mid;
            bestDist = dist;
          }
        }
      }
    }
    if (src.fvgs) {
      for (const f of src.fvgs) {
        if (f.broken) continue;
        const mid = (f.top + f.bottom) / 2;
        const dist = Math.abs(entry - mid);
        if (dist < bestDist && dist <= maxDist) {
          if ((direction === 'up' && f.type === 'bullish' && mid > entry) ||
              (direction === 'down' && f.type === 'bearish' && mid < entry)) {
            best = mid;
            bestDist = dist;
          }
        }
      }
    }
    if (src.extra) {
      for (const price of src.extra) {
        const dist = Math.abs(entry - price);
        if (dist < bestDist && dist <= maxDist) {
          if ((direction === 'up' && price > entry) || (direction === 'down' && price < entry)) {
            best = price;
            bestDist = dist;
          }
        }
      }
    }
  }

  return best;
}

export function estimateTradeLevels(params: {
  direction: 'up' | 'down';
  lastPrice: number;
  atr: number[];
  htf: { h1: HtfFrame; m15: HtfFrame; m5: HtfFrame };
  nativeLevels?: { sl: number; tp: number };
}): EstimatedTradeLevels {
  const { direction, lastPrice, htf, nativeLevels } = params;
  const atrVal = lastFinite(params.atr) ?? 0;
  const entry = lastPrice;

  if (atrVal <= 0 || entry <= 0) {
    return { entry, stopLoss: entry, takeProfit: entry, riskDistance: 0, rewardDistance: 0, rr: 0 };
  }

  // Prefer native pattern levels (measured-move based) when provided and valid
  if (nativeLevels && Number.isFinite(nativeLevels.sl) && Number.isFinite(nativeLevels.tp)) {
    const riskDistance = Math.abs(entry - nativeLevels.sl);
    const rewardDistance = Math.abs(nativeLevels.tp - entry);
    if (riskDistance > 0) {
      return {
        entry,
        stopLoss: nativeLevels.sl,
        takeProfit: nativeLevels.tp,
        riskDistance,
        rewardDistance,
        rr: rewardDistance / riskDistance,
      };
    }
  }

  const slDist = SL_ATR_MULT * atrVal;
  const stopLoss = direction === 'up' ? entry - slDist : entry + slDist;

  // Find nearest opposing level for TP
  const tpLevel = findNearestLevel(
    entry,
    direction,
    [
      { srs: [...htf.m15.srLevels, ...htf.h1.srLevels] },
      { obs: [...htf.m15.orderBlocks, ...htf.m5.orderBlocks] },
      { fvgs: [...htf.m15.fvgs, ...htf.m5.fvgs] },
    ],
    atrVal,
  );

  const takeProfit = tpLevel ?? (direction === 'up' ? entry + TP_FALLBACK_ATR_MULT * atrVal : entry - TP_FALLBACK_ATR_MULT * atrVal);
  const riskDistance = Math.abs(entry - stopLoss);
  const rewardDistance = Math.abs(takeProfit - entry);
  const rr = riskDistance > 0 ? rewardDistance / riskDistance : 0;

  return { entry, stopLoss, takeProfit, riskDistance, rewardDistance, rr };
}
