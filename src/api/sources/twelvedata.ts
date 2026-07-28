import type { Candle, Interval } from '../../types/candle';
import { toTwelvedataSymbol } from '../../utils/symbolUtils';

const INTERVAL_MAP: Record<Interval, string> = {
  '1min':  '1min',
  '5min':  '5min',
  '15min': '15min',
  '30min': '30min',
  '1h':    '1h',
  '4h':    '4h',
  '1day':  '1day',
};

export async function fetchTwelvedataCandles(
  symbol: string,
  interval: Interval,
  apiKey: string,
  outputsize = 500,
): Promise<Candle[]> {
  const ivl = INTERVAL_MAP[interval];
  const tdSym = toTwelvedataSymbol(symbol);
  const url =
    `https://api.twelvedata.com/time_series?symbol=${encodeURIComponent(tdSym)}` +
    `&interval=${ivl}&outputsize=${outputsize}&apikey=${apiKey}&format=JSON`;
  const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
  if (!res.ok) throw new Error(`TwelveData HTTP ${res.status}`);

  interface TDBar {
    datetime: string;
    open: string;
    high: string;
    low: string;
    close: string;
    volume: string;
  }
  const json = await res.json() as { values?: TDBar[]; status?: string; message?: string };

  if (!json.values) {
    throw new Error(json.message ?? 'TwelveData: no values');
  }

  return json.values
    .map(v => ({
      time:   Math.floor(new Date(v.datetime).getTime() / 1000),
      open:   parseFloat(v.open),
      high:   parseFloat(v.high),
      low:    parseFloat(v.low),
      close:  parseFloat(v.close),
      volume: parseFloat(v.volume || '0'),
    }))
    .reverse();
}

type TickCallback = (c: Candle) => void;
const BACKOFF = [3000, 6000, 12000, 30000, 60000];

export function subscribeTwelvedataTicks(
  symbol: string,
  apiKey: string,
  onTick: TickCallback,
  intervalSec: number,
): () => void {
  let ws: WebSocket | null = null;
  let attempt = 0;
  let stopped = false;
  const tdSym = toTwelvedataSymbol(symbol);

  function connect() {
    if (stopped) return;
    ws = new WebSocket(`wss://ws.twelvedata.com/v1/quotes/price?apikey=${apiKey}`);

    ws.onopen = () => {
      attempt = 0;
      ws?.send(JSON.stringify({ action: 'subscribe', params: { symbols: tdSym } }));
    };

    ws.onmessage = (ev) => {
      try {
        const msg = JSON.parse(ev.data as string) as {
          event?: string; price?: string; timestamp?: number;
        };
        if (msg.event === 'price' && msg.price) {
          const price    = parseFloat(msg.price);
          const rawTime  = msg.timestamp ?? Math.floor(Date.now() / 1000);
          const bucketed = Math.floor(rawTime / intervalSec) * intervalSec;
          onTick({ time: bucketed, open: price, high: price, low: price, close: price, volume: 0 });
        }
      } catch { /* ignore */ }
    };

    ws.onerror = () => reconnect();
    ws.onclose = () => reconnect();
  }

  function reconnect() {
    if (stopped) return;
    const delay = BACKOFF[Math.min(attempt, BACKOFF.length - 1)];
    attempt++;
    setTimeout(connect, delay);
  }

  connect();
  return () => { stopped = true; ws?.close(); };
}
