import type { Candle, Interval } from '../../types/candle';
import { toYahooSymbol } from '../../utils/symbolUtils';

const YAHOO_PROXY_BASE = import.meta.env.VITE_YAHOO_PROXY_URL as string | undefined;

function buildYahooUrl(path: string): string {
  if (YAHOO_PROXY_BASE) {
    return `${YAHOO_PROXY_BASE}${path}`;
  }
  console.warn('Yahoo: using public CORS-proxy. Set VITE_YAHOO_PROXY_URL for production.');
  return `https://corsproxy.io/?url=${encodeURIComponent(`https://query1.finance.yahoo.com${path}`)}`;
}

const INTERVAL_MAP: Record<Exclude<Interval, '4h'>, { range: string; interval: string }> = {
  '1min':  { range: '1d',  interval: '1m'  },
  '5min':  { range: '5d',  interval: '5m'  },
  '15min': { range: '5d',  interval: '15m' },
  '30min': { range: '1mo', interval: '30m' },
  '1h':    { range: '3mo', interval: '60m' },
  '1day':  { range: '2y',  interval: '1d'  },
};

function aggregateTo4h(hourly: Candle[]): Candle[] {
  const out: Candle[] = [];
  for (let i = 0; i < hourly.length; i += 4) {
    const chunk = hourly.slice(i, i + 4);
    if (chunk.length === 0) continue;
    out.push({
      time:   chunk[0].time,
      open:   chunk[0].open,
      high:   Math.max(...chunk.map(c => c.high)),
      low:    Math.min(...chunk.map(c => c.low)),
      close:  chunk[chunk.length - 1].close,
      volume: chunk.reduce((s, c) => s + c.volume, 0),
    });
  }
  return out;
}

export async function fetchYahooCandles(
  symbol: string,
  interval: Interval,
): Promise<Candle[]> {
  const effectiveInterval = interval === '4h' ? '1h' : interval;
  const yahooSym = toYahooSymbol(symbol);
  const { range, interval: ivl } = INTERVAL_MAP[effectiveInterval as Exclude<Interval, '4h'>];

  const path =
    `/v8/finance/chart/${yahooSym}` +
    `?range=${range}&interval=${ivl}&includePrePost=false&events=div%7Csplit`;

  let res: Response;
  try {
    res = await fetch(buildYahooUrl(path), { signal: AbortSignal.timeout(10_000) });
  } catch (err) {
    if (err instanceof DOMException && err.name === 'TimeoutError') {
      throw new Error('Yahoo Finance timed out (10s)');
    }
    throw new Error('Yahoo Finance unavailable from browser (CORS or network)');
  }

  if (!res.ok) throw new Error(`Yahoo HTTP ${res.status}`);

  interface YahooResult {
    timestamp: number[];
    indicators: {
      quote: {
        open:   (number | null)[];
        high:   (number | null)[];
        low:    (number | null)[];
        close:  (number | null)[];
        volume: (number | null)[];
      }[];
    };
  }
  interface YahooResp {
    chart: { result: YahooResult[]; error: null | { code: string; description: string } };
  }

  const data = await res.json() as YahooResp;
  if (data.chart.error) throw new Error(data.chart.error.description);
  const result = data.chart.result?.[0];
  if (!result) throw new Error('Yahoo: empty result');

  const { timestamp, indicators } = result;
  const quote = indicators.quote[0];

  const candles = timestamp
    .map((t, i) => ({
      time:   t,
      open:   quote.open[i],
      high:   quote.high[i],
      low:    quote.low[i],
      close:  quote.close[i],
      volume: quote.volume[i] ?? 0,
    }))
    .filter(c => c.open != null && c.high != null && c.low != null && c.close != null) as { time: number; open: number; high: number; low: number; close: number; volume: number }[];

  return interval === '4h' ? aggregateTo4h(candles) : candles;
}
