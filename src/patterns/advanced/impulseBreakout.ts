import type { Candle } from '../../types/candle';
import type { PatternResult } from '../../types/pattern';
import { detectICB } from './impulseConsolidationBreakout_v2';

export function detectImpulseBreakout(candles: Candle[], impulseVelocity?: number[]): PatternResult[] {
  const matches = detectICB(candles, {}, impulseVelocity);
  return matches.map(m => ({
    type:      'impulse_consolidation_breakout' as const,
    direction: m.direction,
    index:     m.breakoutIndex,
    confidence: m.confidence,
    label:     `ICB ${m.direction === 'bullish' ? '▲' : '▼'} (${m.consolidationBars}b con)`,
    extra: {
      entry:             m.entry,
      sl:                m.sl,
      tp1:               m.tp1,
      tp2:               m.tp2,
      rr:                m.rr,
      consolidationBars: m.consolidationBars,
      impulseStrength:   m.impulseStrength,
    },
  }));
}
