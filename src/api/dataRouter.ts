import type { Candle, DataSourceName, Interval } from '../types/candle';
import { isCrypto } from '../utils/symbolUtils';
import { intervalToMs } from '../utils/timeframeUtils';
import { loadCachedCandles, saveCachedCandles } from '../utils/historyCache';

import { fetchBinanceCandles, subscribeBinanceTicks } from './sources/binance';
import { fetchDerivCandles, subscribeDerivTicks, isDerivSupported } from './sources/deriv';
import { fetchTwelvedataCandles, subscribeTwelvedataTicks } from './sources/twelvedata';
import { fetchFinnhubCandles, subscribeFinnhubTicks } from './sources/finnhub';
import { fetchYahooCandles } from './sources/yahoofinance';

export interface DataRouter {
  sourceName: DataSourceName;
  fetchInitialCandles: () => Promise<Candle[]>;
  subscribeTicks: (cb: (c: Candle) => void) => () => void;
}

interface SelectArgs {
  symbol: string;
  interval: Interval;
  twelvedataKey: string;
  finnhubKey: string;
}

interface ChainEntry {
  name: DataSourceName;
  fetch: () => Promise<Candle[]>;
  sub: (cb: (c: Candle) => void) => () => void;
}

const INITIAL_CANDLE_COUNT = 1000;

/**
 * Build the fallback chain for a given symbol.
 *
 * Crypto:  Binance → Deriv (if the pair is quoted there)
 * Forex:   Deriv → TwelveData → Finnhub → Yahoo
 */
function buildChain(args: SelectArgs): ChainEntry[] {
  const { symbol, interval, twelvedataKey, finnhubKey } = args;
  const intervalSec = intervalToMs(interval) / 1000;
  const chain: ChainEntry[] = [];

  if (isCrypto(symbol)) {
    chain.push({
      name: 'binance',
      fetch: () => fetchBinanceCandles(symbol, interval, INITIAL_CANDLE_COUNT),
      sub: (cb) => subscribeBinanceTicks(symbol, interval, cb),
    });

    if (isDerivSupported(symbol)) {
      chain.push({
        name: 'deriv',
        fetch: () => fetchDerivCandles(symbol, interval, INITIAL_CANDLE_COUNT),
        sub: (cb) => subscribeDerivTicks(symbol, cb, intervalSec),
      });
    }
  } else {
    if (isDerivSupported(symbol)) {
      chain.push({
        name: 'deriv',
        fetch: () => fetchDerivCandles(symbol, interval, INITIAL_CANDLE_COUNT),
        sub: (cb) => subscribeDerivTicks(symbol, cb, intervalSec),
      });
    }

    if (twelvedataKey) {
      chain.push({
        name: 'twelvedata',
        fetch: () => fetchTwelvedataCandles(symbol, interval, twelvedataKey),
        sub: (cb) => subscribeTwelvedataTicks(symbol, twelvedataKey, cb, intervalSec),
      });
    }

    if (finnhubKey) {
      chain.push({
        name: 'finnhub',
        fetch: () => fetchFinnhubCandles(symbol, interval, finnhubKey),
        sub: (cb) => subscribeFinnhubTicks(symbol, finnhubKey, cb, intervalSec),
      });
    }

    chain.push({
      name: 'yahoo',
      fetch: () => fetchYahooCandles(symbol, interval),
      sub: () => () => { /* Yahoo has no WS — history-only source */ },
    });
  }

  return chain;
}

export async function selectDataSource(args: SelectArgs): Promise<DataRouter> {
  const { symbol, interval } = args;
  const chain = buildChain(args);

  // Try cache first — instant load if available and fresh
  const cached = await loadCachedCandles(symbol, interval);
  if (cached && cached.length > 0) {
    // Return cached data immediately, but still try to fetch fresh in background
    // to update the cache. Use the first source in the chain for live subscription.
    const firstSource = chain[0];
    if (firstSource) {
      // Kick off background refresh
      firstSource.fetch().then(fresh => {
        if (fresh.length > 0) saveCachedCandles(symbol, interval, fresh);
      }).catch(() => { /* cache is still valid for now */ });
    }

    return {
      sourceName: chain[0]?.name ?? 'binance',
      fetchInitialCandles: () => Promise.resolve(cached),
      subscribeTicks: (cb) => chain[0]?.sub(cb) ?? (() => () => {}),
    };
  }

  // No cache — try each source in the fallback chain
  for (const source of chain) {
    try {
      const candles = await source.fetch();
      if (candles.length > 0) {
        // Save to cache for next load
        saveCachedCandles(symbol, interval, candles);
        return {
          sourceName: source.name,
          fetchInitialCandles: () => Promise.resolve(candles),
          subscribeTicks: (cb) => source.sub(cb),
        };
      }
    } catch (err) {
      console.warn(`DataSource ${source.name} failed:`, err);
    }
  }

  throw new Error('No data source available for ' + symbol);
}
