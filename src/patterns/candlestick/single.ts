import type { Candle } from '../../types/candle';
import type { PatternResult } from '../../types/pattern';

function body(c: Candle) { return Math.abs(c.close - c.open); }
function range(c: Candle) { return c.high - c.low; }
function upperWick(c: Candle) { return c.high - Math.max(c.open, c.close); }
function lowerWick(c: Candle) { return Math.min(c.open, c.close) - c.low; }
function isBull(c: Candle) { return c.close >= c.open; }

export function detectSingleCandle(candles: Candle[]): PatternResult[] {
  const results: PatternResult[] = [];
  if (candles.length < 3) return results;

  for (let i = 2; i < candles.length; i++) {
    const c = candles[i];
    const b = body(c);
    const r = range(c);
    const uw = upperWick(c);
    const lw = lowerWick(c);
    if (r === 0) continue;

    const bodyRatio = b / r;

    // Hammer (bullish reversal at low): small body top, long lower wick, bearish trend before
    if (
      lw >= 2 * b &&
      uw <= 0.3 * b &&
      b > 0 &&
      bodyRatio < 0.4 &&
      !isBull(candles[i - 1]) && !isBull(candles[i - 2])
    ) {
      results.push({ type: 'hammer', direction: 'bullish', index: i, confidence: 70, label: 'Hammer' });
    }

    // Inverted Hammer (bullish reversal): long upper wick, small body bottom
    if (
      uw >= 2 * b &&
      lw <= 0.3 * b &&
      b > 0 &&
      bodyRatio < 0.4 &&
      !isBull(candles[i - 1])
    ) {
      results.push({ type: 'inverted_hammer', direction: 'bullish', index: i, confidence: 60, label: 'Inverted Hammer' });
    }

    // Shooting Star (bearish reversal): long upper wick, small body, bullish trend before
    if (
      uw >= 2 * b &&
      lw <= 0.3 * b &&
      b > 0 &&
      bodyRatio < 0.4 &&
      isBull(candles[i - 1]) && isBull(candles[i - 2])
    ) {
      results.push({ type: 'shooting_star', direction: 'bearish', index: i, confidence: 72, label: 'Shooting Star' });
    }

    // Hanging Man (bearish reversal): like hammer but at top
    if (
      lw >= 2 * b &&
      uw <= 0.3 * b &&
      b > 0 &&
      bodyRatio < 0.4 &&
      isBull(candles[i - 1]) && isBull(candles[i - 2])
    ) {
      results.push({ type: 'hanging_man', direction: 'bearish', index: i, confidence: 65, label: 'Hanging Man' });
    }

    // Doji: very small body
    if (bodyRatio < 0.05) {
      if (lw > 2 * uw && lw > 0) {
        results.push({ type: 'dragonfly_doji', direction: 'bullish', index: i, confidence: 65, label: 'Dragonfly Doji' });
      } else if (uw > 2 * lw && uw > 0) {
        results.push({ type: 'gravestone_doji', direction: 'bearish', index: i, confidence: 65, label: 'Gravestone Doji' });
      } else if (uw > 0.3 * r && lw > 0.3 * r) {
        results.push({ type: 'long_legged_doji', direction: 'neutral', index: i, confidence: 55, label: 'Long-Legged Doji' });
      } else {
        results.push({ type: 'doji', direction: 'neutral', index: i, confidence: 50, label: 'Doji' });
      }
    }

    // Spinning Top
    if (bodyRatio >= 0.05 && bodyRatio <= 0.25 && uw > 0.2 * r && lw > 0.2 * r) {
      results.push({ type: 'spinning_top', direction: 'neutral', index: i, confidence: 45, label: 'Spinning Top' });
    }

    // Marubozu: very small wicks
    if (bodyRatio > 0.9 && uw < 0.05 * r && lw < 0.05 * r) {
      results.push({
        type: 'marubozu',
        direction: isBull(c) ? 'bullish' : 'bearish',
        index: i,
        confidence: 75,
        label: isBull(c) ? 'Bullish Marubozu' : 'Bearish Marubozu',
      });
    }
  }
  return results;
}
