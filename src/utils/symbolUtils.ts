const CRYPTO_BASES = new Set([
  'BTC','ETH','BNB','XRP','ADA','SOL','DOGE','DOT','AVAX','MATIC',
  'LINK','LTC','BCH','XLM','ATOM','UNI','ETC','TRX','FIL','NEAR',
  'ALGO','VET','ICP','APT','ARB','OP','SUI','INJ','IMX','SEI',
  'PEPE','SHIB','FLOKI','WIF','BOME',
]);

export function isCrypto(symbol: string): boolean {
  const upper = symbol.toUpperCase().replace('/', '');
  for (const base of CRYPTO_BASES) {
    if (upper.startsWith(base)) return true;
  }
  return false;
}

export function toYahooSymbol(symbol: string): string {
  const upper = symbol.toUpperCase().replace('/', '');
  if (isCrypto(symbol)) {
    if (upper.endsWith('USDT')) return `${upper.slice(0, -4)}-USD`;
    if (upper.endsWith('BUSD')) return `${upper.slice(0, -4)}-USD`;
    if (upper.endsWith('USD'))  return `${upper.slice(0, -3)}-USD`;
    return `${upper}-USD`;
  }
  // forex: EURUSD => EURUSD=X
  if (upper.length === 6) return `${upper}=X`;
  return symbol;
}

export function toTwelvedataSymbol(symbol: string): string {
  const upper = symbol.toUpperCase().replace('/', '');
  if (isCrypto(symbol)) {
    if (upper.endsWith('USDT')) return `${upper.slice(0, -4)}/USD`;
    if (upper.endsWith('USD'))  return `${upper.slice(0, -3)}/USD`;
    return `${upper}/USD`;
  }
  if (upper.length === 6) return `${upper.slice(0, 3)}/${upper.slice(3)}`;
  return symbol;
}

export function toFinnhubForexSymbol(symbol: string): string {
  const upper = symbol.toUpperCase().replace('/', '');
  if (upper.length === 6) return `OANDA:${upper.slice(0, 3)}_${upper.slice(3)}`;
  return `OANDA:${upper}`;
}

export function formatSymbolDisplay(symbol: string): string {
  const upper = symbol.toUpperCase().replace('/', '');
  if (isCrypto(symbol)) {
    if (upper.endsWith('USDT')) return `${upper.slice(0, -4)}/USDT`;
    if (upper.endsWith('USD'))  return `${upper.slice(0, -3)}/USD`;
  }
  if (upper.length === 6) return `${upper.slice(0, 3)}/${upper.slice(3)}`;
  return symbol;
}
