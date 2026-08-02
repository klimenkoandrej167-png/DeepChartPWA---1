import type { Candle, DataSourceName, Interval } from '../types/candle';
import { isCrypto } from '../utils/symbolUtils';
import { intervalToMs } from '../utils/timeframeUtils';
import { loadCachedCandles, saveCachedCandles } from '../utils/historyCache';

import { fetchBinanceCandles, subscribeBinanceTicks } from './sources/binance';
import { fetchDerivCandles, subscribeDerivTicks, isDerivSupported } from './sources/deriv';
import { fetchTwelvedataCandles, subscribeTwelvedataTicks } from './sources/twelvedata';
import { fetchFinnhubCandles, subscribeFinnhubTicks } from './sources/finnhub';
import { fetchYahooCandles } from './sources/yahoofinance';
import { fetchProxyCandles, subscribeProxyTicks } from './sources/proxy';

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

/** Max time to wait for a fresh network response before falling back to cache */
const FRESH_FETCH_TIMEOUT_MS = 2500;

function isSupabaseConfigured(): boolean {
  const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
  const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
  return !!(url && key && url.trim().length > 0 && key.trim().length > 0);
}

/**
 * Build the fallback chain for a given symbol.
 *
 * Crypto:  Binance → Deriv (if quoted) → Proxy (if Supabase configured)
 * Forex:   Deriv → TwelveData → Finnhub → Yahoo → Proxy (if Supabase configured)
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

  // Server-side proxy as last resort fallback for both crypto and forex.
  // Only included if Supabase env vars are configured — avoids 404s in
  // environments where the edge function isn't deployed.
  if (isSupabaseConfigured()) {
    chain.push({
      name: 'proxy',
      fetch: () => fetchProxyCandles(symbol, interval, INITIAL_CANDLE_COUNT),
      sub: (cb) => subscribeProxyTicks(symbol, interval, cb),
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
    // Race a fresh fetch against a short timeout. If the network responds
    // in time, use fresh data. If not, use cache instantly for fast paint.
    // The same fetch promise is reused — no double network request.
    const firstSource = chain[0];
    if (firstSource) {
      // Kick off ONE fetch promise. Race it against the timeout.
      // If it resolves in time → fresh data. If it times out → cache.
      // Either way, the promise continues in background to update cache.
      const freshPromise = firstSource.fetch();

      try {
        const fresh = await Promise.race([
          freshPromise,
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error('cache-timeout')), FRESH_FETCH_TIMEOUT_MS),
          ),
        ]);

        if (fresh && fresh.length > 0) {
          saveCachedCandles(symbol, interval, fresh);
          return {
            sourceName: firstSource.name,
            fetchInitialCandles: () => Promise.resolve(fresh),
            subscribeTicks: (cb) => firstSource.sub(cb),
          };
        }
      } catch {
        // Fresh fetch didn't complete in time — use cache for instant paint.
        // The freshPromise continues in background and updates cache for next load.
        freshPromise.then(fresh => {
          if (fresh && fresh.length > 0) saveCachedCandles(symbol, interval, fresh);
        }).catch(() => { /* cache stays as-is */ });
      }

      return {
        sourceName: firstSource.name,
        fetchInitialCandles: () => Promise.resolve(cached),
        subscribeTicks: (cb) => firstSource.sub(cb),
      };
    }

    // No chain sources available — return cache alone
    return {
      sourceName: 'proxy',
      fetchInitialCandles: () => Promise.resolve(cached),
      subscribeTicks: () => () => { /* no live source */ },
    };
  }

  // No cache — try each source in the fallback chain sequentially
  for (const source of chain) {
    try {
      const candles = await source.fetch();
      if (candles.length > 0) {
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
