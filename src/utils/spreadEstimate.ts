import { isCrypto } from './symbolUtils';

const TYPICAL_FOREX_SPREAD_PIPS: Record<string, number> = {
  EURUSD: 1.0, GBPUSD: 1.5, USDJPY: 1.0, USDCHF: 1.8,
  AUDUSD: 1.2, USDCAD: 1.5, NZDUSD: 1.8, EURJPY: 1.8,
  EURGBP: 1.5, GBPJPY: 2.5, XAUUSD: 3.0, XAGUSD: 3.0,
};
const DEFAULT_FOREX_SPREAD_PIPS = 2.5;
const CRYPTO_SPREAD_PCT = 0.0005;

export function pipSize(symbol: string): number {
  const upper = symbol.toUpperCase().replace('/', '');
  if (upper.endsWith('JPY')) return 0.01;
  if (upper === 'XAUUSD') return 0.01;
  if (upper === 'XAGUSD') return 0.001;
  return 0.0001;
}

export function estimateSpread(
  symbol: string,
  lastPrice: number,
  customOverrides?: Record<string, number>,
): number {
  if (isCrypto(symbol)) return lastPrice * CRYPTO_SPREAD_PCT;
  const upper = symbol.toUpperCase().replace('/', '');
  if (customOverrides && customOverrides[upper] !== undefined) {
    return customOverrides[upper] * pipSize(symbol);
  }
  const pips = TYPICAL_FOREX_SPREAD_PIPS[upper] ?? DEFAULT_FOREX_SPREAD_PIPS;
  return pips * pipSize(symbol);
}

export function getDefaultSpreadPips(symbol: string): number {
  const upper = symbol.toUpperCase().replace('/', '');
  return TYPICAL_FOREX_SPREAD_PIPS[upper] ?? DEFAULT_FOREX_SPREAD_PIPS;
}
