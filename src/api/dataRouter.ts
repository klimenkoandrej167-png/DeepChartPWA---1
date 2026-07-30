import type { Candle, DataSourceName, Interval } from '../types/candle';
import { isCrypto } from '../utils/symbolUtils';
import { intervalToMs } from '../utils/timeframeUtils';

import { fetchProxyCandles, subscribeProxyTicks } from './sources/proxy';
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

export async function selectDataSource(args: SelectArgs): Promise<DataRouter> {
  const { symbol, interval, twelvedataKey, finnhubKey } = args;
  const intervalSec = intervalToMs(interval) / 1000;

  const chain: ChainEntry[] = [];

  // Edge function proxy is always first — it runs server-side and bypasses
  // all CORS, geo-blocking, and WebSocket limitations.
  chain.push({
    name: 'binance', // reported name doesn't matter much; proxy aggregates all sources
    fetch: () => fetchProxyCandles(symbol, interval, INITIAL_CANDLE_COUNT),
    sub: (cb) => subscribeProxyTicks(symbol, interval, cb),
  });

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
      sub: () => () => { /* Yahoo has no WS — polled via re-fetch */ },
    });
  }

  for (const source of chain) {
    try {
      const candles = await source.fetch();
      if (candles.length > 0) {
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
