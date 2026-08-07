import type { Candle, Interval } from '../../types/candle';
import { toFinnhubForexSymbol } from '../../utils/symbolUtils';

const INTERVAL_MAP: Record<Interval, string> = {
  '1min':  '1',
  '5min':  '5',
  '15min': '15',
  '30min': '30',
  '1h':    '60',
  '4h':    '240',
  '1day':  'D',
};

function getIntervalSeconds(interval: Interval): number {
  const map: Record<Interval, number> = {
    '1min': 60, '5min': 300, '15min': 900, '30min': 1800,
    '1h': 3600, '4h': 14400, '1day': 86400,
  };
  return map[interval];
}

export async function fetchFinnhubCandles(
  symbol: string,
  interval: Interval,
  apiKey: string,
): Promise<Candle[]> {
  const res = INTERVAL_MAP[interval];
  const to   = Math.floor(Date.now() / 1000);
  const from = to - 500 * getIntervalSeconds(interval);
  const fhSym = toFinnhubForexSymbol(symbol);

  const url =
    `https://finnhub.io/api/v1/forex/candle?symbol=${encodeURIComponent(fhSym)}` +
    `&resolution=${res}&from=${from}&to=${to}&token=${apiKey}`;

  const response = await fetch(url, { signal: AbortSignal.timeout(10_000) });
  if (!response.ok) throw new Error(`Finnhub HTTP ${response.status}`);

  interface FinnhubResp {
    s: string;
    t: number[];
    o: number[];
    h: number[];
    l: number[];
    c: number[];
    v: number[];
  }
  const data = await response.json() as FinnhubResp;
  if (data.s !== 'ok') throw new Error('Finnhub: no data');

  return data.t.map((t, i) => ({
    time:   t,
    open:   data.o[i],
    high:   data.h[i],
    low:    data.l[i],
    close:  data.c[i],
    volume: data.v[i],
  }));
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

export function subscribeFinnhubTicks(
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
  const fhSym = toFinnhubForexSymbol(symbol);
  const watchdogMs = watchdogIntervalMs(intervalSec);

  function connect() {
    if (stopped) return;
    ws = new WebSocket(`wss://ws.finnhub.io?token=${apiKey}`);

    ws.onopen = () => {
      attempt = 0;
      reconnecting = false;
      lastMessageAt = Date.now();
      ws?.send(JSON.stringify({ type: 'subscribe', symbol: fhSym }));

      watchdogId = setInterval(() => {
        if (stopped || !ws) return;
        const elapsed = Date.now() - lastMessageAt;
        if (elapsed > watchdogMs && !reconnecting) {
          reconnecting = true;
          console.warn(`Finnhub: no message for ${elapsed}ms, treating as zombie and reconnecting`);
          cleanup();
          scheduleReconnect();
        }
      }, Math.max(watchdogMs / 2, 15_000));
    };

    ws.onmessage = (ev) => {
      lastMessageAt = Date.now();
      try {
        const msg = JSON.parse(ev.data as string) as {
          type?: string;
          msg?: string;
          data?: { s: string; p: number; t: number }[];
        };
        // Finnhub sends errors as { type: 'error', msg: '...' }
        if (msg.type === 'error' && msg.msg) {
          if (!reconnecting) {
            reconnecting = true;
            console.warn('Finnhub subscribe error (reconnecting):', msg.msg);
            cleanup();
            scheduleReconnect();
          }
          return;
        }
        if (msg.type === 'trade' && msg.data?.length) {
          for (const d of msg.data) {
            const rawTime  = Math.floor(d.t / 1000);
            const bucketed = Math.floor(rawTime / intervalSec) * intervalSec;
            onTick({ time: bucketed, open: d.p, high: d.p, low: d.p, close: d.p, volume: 0 });
          }
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
