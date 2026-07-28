import type { Candle } from '../../types/candle';
import type { PatternResult } from '../../types/pattern';
import type { ScoredOrderBlock } from '../../utils/orderBlockStrength';

const TOUCH_TOLERANCE_ATR_MULT = 0.3;

export function detectStrongOrderBlockReactionWith(
  candles: Candle[],
  scoredBlocks: ScoredOrderBlock[],
  atr: number[],
): PatternResult[] {
  if (candles.length < 3) return [];
  const strongBlocks = scoredBlocks.filter(b => b.strength === 'strong' && !b.mitigated);
  if (strongBlocks.length === 0) return [];

  const last = candles[candles.length - 1];
  const prev = candles[candles.length - 2];
  const lastAtr = atr.length ? atr[atr.length - 1] : 0;
  if (lastAtr <= 0) return [];

  const tolerance = lastAtr * TOUCH_TOLERANCE_ATR_MULT;
  const results: PatternResult[] = [];

  for (const ob of strongBlocks) {
    const touchedBull = ob.type === 'bullish' && last.low <= ob.top + tolerance && last.low >= ob.bottom - tolerance;
    const touchedBear = ob.type === 'bearish' && last.high >= ob.bottom - tolerance && last.high <= ob.top + tolerance;
    if (!touchedBull && !touchedBear) continue;

    const bullEngulf = last.close > last.open && last.close > prev.open && last.open < prev.close;
    const bearEngulf = last.close < last.open && last.close < prev.open && last.open > prev.close;

    if (touchedBull && bullEngulf) {
      results.push({
        type: 'reaction_at_strong_ob_bullish',
        direction: 'bullish',
        index: candles.length - 1,
        confidence: 70 + Math.round((ob.strengthScore - 60) / 4),
        label: 'Reaction at Strong Order Block',
        extra: { strength: 'strong' },
      });
    }
    if (touchedBear && bearEngulf) {
      results.push({
        type: 'reaction_at_strong_ob_bearish',
        direction: 'bearish',
        index: candles.length - 1,
        confidence: 70 + Math.round((ob.strengthScore - 60) / 4),
        label: 'Reaction at Strong Order Block',
        extra: { strength: 'strong' },
      });
    }
  }

  return results;
}

export function detectStrongOrderBlockReaction(_candles: Candle[]): PatternResult[] {
  void _candles;
  return [];
}
