import type { Candle } from '../../types/candle';
import type { PatternResult } from '../../types/pattern';

function body(c: Candle) { return Math.abs(c.close - c.open); }
function isBull(c: Candle) { return c.close >= c.open; }
function isBear(c: Candle) { return c.close < c.open; }
function midpoint(c: Candle) { return (c.open + c.close) / 2; }
function isDoji(c: Candle) { return body(c) < 0.1 * (c.high - c.low); }

export function detectTripleCandle(candles: Candle[]): PatternResult[] {
  const results: PatternResult[] = [];
  if (candles.length < 3) return results;

  for (let i = 2; i < candles.length; i++) {
    const a = candles[i - 2];
    const b = candles[i - 1];
    const c = candles[i];

    // Morning Star (bullish)
    if (
      isBear(a) &&
      b.high < a.close && b.high < c.open &&
      isBull(c) &&
      c.close > midpoint(a)
    ) {
      results.push({ type: 'morning_star', direction: 'bullish', index: i, confidence: 80, label: 'Morning Star' });
    }

    // Evening Star (bearish)
    if (
      isBull(a) &&
      b.low > a.close && b.low > c.open &&
      isBear(c) &&
      c.close < midpoint(a)
    ) {
      results.push({ type: 'evening_star', direction: 'bearish', index: i, confidence: 80, label: 'Evening Star' });
    }

    // Three White Soldiers
    if (
      isBull(a) && isBull(b) && isBull(c) &&
      b.open > a.open && b.close > a.close &&
      c.open > b.open && c.close > b.close &&
      body(a) > 0 && body(b) > 0 && body(c) > 0
    ) {
      results.push({ type: 'three_white_soldiers', direction: 'bullish', index: i, confidence: 82, label: 'Three White Soldiers' });
    }

    // Three Black Crows
    if (
      isBear(a) && isBear(b) && isBear(c) &&
      b.open < a.open && b.close < a.close &&
      c.open < b.open && c.close < b.close &&
      body(a) > 0 && body(b) > 0 && body(c) > 0
    ) {
      results.push({ type: 'three_black_crows', direction: 'bearish', index: i, confidence: 82, label: 'Three Black Crows' });
    }

    // Three Inside Up (bullish harami confirmed)
    if (
      isBear(a) && isBull(b) &&
      b.open > a.close && b.close < a.open &&
      isBull(c) && c.close > a.open
    ) {
      results.push({ type: 'three_inside_up', direction: 'bullish', index: i, confidence: 75, label: 'Three Inside Up' });
    }

    // Three Inside Down (bearish harami confirmed)
    if (
      isBull(a) && isBear(b) &&
      b.open < a.close && b.close > a.open &&
      isBear(c) && c.close < a.open
    ) {
      results.push({ type: 'three_inside_down', direction: 'bearish', index: i, confidence: 75, label: 'Three Inside Down' });
    }

    // Rising Three Methods: bull, 3 small bears within range, bull breakout above
    // Requires 5 candles: a (i-4), b1 (i-3), b2 (i-2), b3 (i-1), c (i)
    if (i >= 4) {
      const a5 = candles[i - 4];
      const b1 = candles[i - 3];
      const b2 = candles[i - 2];
      const b3 = candles[i - 1];
      const c5 = c;

      if (
        isBull(a5) && isBear(b1) && isBear(b2) && isBear(b3) && isBull(c5) &&
        body(a5) > 0 &&
        b1.high < a5.high && b1.low > a5.low &&
        b2.high < a5.high && b2.low > a5.low &&
        b3.high < a5.high && b3.low > a5.low &&
        c5.close > a5.close
      ) {
        results.push({ type: 'rising_three_methods', direction: 'bullish', index: i, confidence: 70, label: 'Rising Three Methods' });
      }

      // Falling Three Methods: bear, 3 small bulls within range, bear breakout below
      if (
        isBear(a5) && isBull(b1) && isBull(b2) && isBull(b3) && isBear(c5) &&
        body(a5) > 0 &&
        b1.high < a5.high && b1.low > a5.low &&
        b2.high < a5.high && b2.low > a5.low &&
        b3.high < a5.high && b3.low > a5.low &&
        c5.close < a5.close
      ) {
        results.push({ type: 'falling_three_methods', direction: 'bearish', index: i, confidence: 70, label: 'Falling Three Methods' });
      }
    }

    // Abandoned Baby Bullish: gap down doji, gap up
    if (
      isBear(a) && isDoji(b) && isBull(c) &&
      b.high < a.low && b.high < c.low
    ) {
      results.push({ type: 'abandoned_baby_bullish', direction: 'bullish', index: i, confidence: 85, label: 'Abandoned Baby Bullish' });
    }

    // Abandoned Baby Bearish: gap up doji, gap down
    if (
      isBull(a) && isDoji(b) && isBear(c) &&
      b.low > a.high && b.low > c.high
    ) {
      results.push({ type: 'abandoned_baby_bearish', direction: 'bearish', index: i, confidence: 85, label: 'Abandoned Baby Bearish' });
    }
  }
  return results;
}
