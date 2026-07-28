import type { HtfFrame } from '../store/htfContextStore';

export type MarketStructureState = 'bullish' | 'bearish' | 'ranging';

function lastFiniteLocal(arr: number[]): number | undefined {
  for (let i = arr.length - 1; i >= 0; i--) {
    if (!Number.isNaN(arr[i]) && Number.isFinite(arr[i])) return arr[i];
  }
  return undefined;
}

// Single source of truth for market-structure classification. Identical logic
// to the former internal `determineHtfBias`, but public and named ('ranging'
// instead of 'neutral') so other modules can reuse it without recomputation.
export function computeMarketStructureState(frame: HtfFrame): MarketStructureState {
  const e20 = lastFiniteLocal(frame.ema20);
  const e50 = lastFiniteLocal(frame.ema50);
  if (e20 === undefined || e50 === undefined) return 'ranging';

  const emaBias = e20 > e50 ? 'bullish' : e20 < e50 ? 'bearish' : 'ranging';

  const recentSwings = frame.swings.slice(-6);
  let hhCount = 0, lhCount = 0, hlCount = 0, llCount = 0;
  for (const s of recentSwings) {
    if (s.type === 'HH') hhCount++;
    else if (s.type === 'LH') lhCount++;
    else if (s.type === 'HL') hlCount++;
    else if (s.type === 'LL') llCount++;
  }
  const structBull = hhCount > lhCount && hlCount >= llCount;
  const structBear = llCount > hlCount && lhCount >= hhCount;

  if (emaBias === 'bullish' && structBull) return 'bullish';
  if (emaBias === 'bearish' && structBear) return 'bearish';
  if ((emaBias === 'bullish' && structBear) || (emaBias === 'bearish' && structBull)) return 'ranging';
  return emaBias === 'ranging' ? 'ranging' : emaBias;
}
