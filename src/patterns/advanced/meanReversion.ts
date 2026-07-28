import type { Candle } from '../../types/candle';
import type { PatternResult } from '../../types/pattern';
import { calcBollingerBands } from '../../indicators/bollingerBands';
import { calcRSI } from '../../indicators/rsi';

const RSI_OVERBOUGHT = 75;
const RSI_OVERSOLD = 25;

// Mean reversion: prior bar closed beyond a Bollinger band with RSI7 in an
// extreme zone, and the current bar shows the first reversal sign (closing
// back inside the band against the prior direction).
export function detectMeanReversion(candles: Candle[]): PatternResult[] {
  if (candles.length < 25) return [];
  const closes = candles.map(c => c.close);
  const bb = calcBollingerBands(closes);
  const rsi = calcRSI(closes, 7);

  const results: PatternResult[] = [];
  const i = candles.length - 1;
  const prev = candles[i - 1];
  const cur = candles[i];

  const upper = bb.upper[i - 1];
  const lower = bb.lower[i - 1];
  const rsiVal = rsi[i];
  if (upper === undefined || lower === undefined || Number.isNaN(rsiVal)) return results;

  const wasAboveUpper = prev.close > upper;
  const reversingDown = cur.close < prev.close && cur.close < upper;
  if (wasAboveUpper && rsiVal > RSI_OVERBOUGHT && reversingDown) {
    results.push({
      type: 'mean_reversion_bearish',
      direction: 'bearish',
      index: i,
      confidence: 60,
      label: 'Mean Reversion (RSI overbought + BB upper)',
    });
  }

  const wasBelowLower = prev.close < lower;
  const reversingUp = cur.close > prev.close && cur.close > lower;
  if (wasBelowLower && rsiVal < RSI_OVERSOLD && reversingUp) {
    results.push({
      type: 'mean_reversion_bullish',
      direction: 'bullish',
      index: i,
      confidence: 60,
      label: 'Mean Reversion (RSI oversold + BB lower)',
    });
  }

  return results;
}
