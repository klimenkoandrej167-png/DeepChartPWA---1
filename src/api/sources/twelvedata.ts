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

/**
 * Watchdog: if no message arrives within this window, the socket is considered
 * a "zombie" — open but not delivering data. Clamped to [30s, 120s], 3× interval.
 */
function watchdogIntervalMs(intervalSec: number): number {
  return Math.min(Math.max(intervalSec * 1000 * 3, 30_000), 120_000);
}

export function subscribeTwelvedataTicks(
  symbol: string,
  apiKey: string,
  onTick: TickCallback,
  intervalSec: number,
): () => void {
  let ws: WebSocket | null = null;
  let attempt = 0;
  let stopped = false;
  let reconnecting = false;
  let lastMessageAt = 0;
  let watchdogId: ReturnType<typeof setInterval> | null = null;
  const tdSym = toTwelvedataSymbol(symbol);
  const watchdogMs = watchdogIntervalMs(intervalSec);

  function connect() {
    if (stopped) return;
    ws = new WebSocket(`wss://ws.twelvedata.com/v1/quotes/price?apikey=${apiKey}`);

    ws.onopen = () => {
      attempt = 0;
      reconnecting = false;
      lastMessageAt = Date.now();
      ws?.send(JSON.stringify({ action: 'subscribe', params: { symbols: tdSym } }));

      watchdogId = setInterval(() => {
        if (stopped || !ws) return;
        const elapsed = Date.now() - lastMessageAt;
        if (elapsed > watchdogMs && !reconnecting) {
          reconnecting = true;
          console.warn(`TwelveData: no message for ${elapsed}ms, treating as zombie and reconnecting`);
          cleanup();
          scheduleReconnect();
        }
      }, Math.max(watchdogMs / 2, 15_000));
    };

    ws.onmessage = (ev) => {
      lastMessageAt = Date.now();
      try {
        const msg = JSON.parse(ev.data as string) as {
          event?: string; price?: string; timestamp?: number;
          status?: string; message?: string;
        };
        // TwelveData sends subscription errors as { status: 'error', message: '...' }
        if (msg.status === 'error' && msg.message) {
          if (!reconnecting) {
            reconnecting = true;
            console.warn('TwelveData subscribe error (reconnecting):', msg.message);
            cleanup();
            scheduleReconnect();
          }
          return;
        }
        if (msg.event === 'price' && msg.price) {
          const price    = parseFloat(msg.price);
          const rawTime  = msg.timestamp ?? Math.floor(Date.now() / 1000);
          const bucketed = Math.floor(rawTime / intervalSec) * intervalSec;
          onTick({ time: bucketed, open: price, high: price, low: price, close: price, volume: 0 });
        }
      } catch { /* ignore */ }
    };

    ws.onerror = () => {
      if (!reconnecting) { reconnecting = true; cleanup(); scheduleReconnect(); }
    };
    ws.onclose = () => {
      if (!reconnecting) { reconnecting = true; cleanup(); scheduleReconnect(); }
    };
  }

  function cleanup() {
    if (watchdogId) { clearInterval(watchdogId); watchdogId = null; }
    try { ws?.close(); } catch { /* ignore */ }
    ws = null;
  }

  function scheduleReconnect() {
    if (stopped) return;
    const delay = BACKOFF[Math.min(attempt, BACKOFF.length - 1)];
    attempt++;
    setTimeout(() => { reconnecting = false; connect(); }, delay);
  }

  connect();
  return () => { stopped = true; cleanup(); };
}
