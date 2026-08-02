import type { Candle, Interval } from '../../types/candle';
import { BINANCE_CONFIG } from '../providers.config';

const { intervalMap: INTERVAL_MAP, defaultLimit, reconnectBackoffMs: BACKOFF, requestTimeoutMs } = BINANCE_CONFIG;

let restHostCache: string | null = null;
let wsHostCache: string | null = null;
let detecting: Promise<void> | null = null;

async function detectHosts(): Promise<void> {
  if (restHostCache && wsHostCache) return;
  if (detecting) return detecting;
  detecting = (async () => {
    for (const variant of ['global', 'us'] as const) {
      const rest = BINANCE_CONFIG.restHosts[variant];
      try {
        const res = await fetch(`${rest}${BINANCE_CONFIG.pingPath}`, {
          signal: AbortSignal.timeout(3000),
        });
        if (res.ok) {
          restHostCache = rest;
          wsHostCache = BINANCE_CONFIG.wsHosts[variant];
          return;
        }
      } catch { /* try next */ }
    }
    restHostCache = BINANCE_CONFIG.restHosts.global;
    wsHostCache = BINANCE_CONFIG.wsHosts.global;
  })();
  return detecting;
}

/**
 * Fetch historical candles from Binance REST API.
 *
 * Max 1000 candles per request. For longer history, paginates backwards
 * in time: next request uses endTime = (first candle time * 1000) - 1.
 * 250ms pause between requests to avoid 429 rate-limit.
 */
export async function fetchBinanceCandles(
  symbol: string,
  interval: Interval,
  limit = defaultLimit,
): Promise<Candle[]> {
  await detectHosts();
  const sym = symbol.toUpperCase().replace('/', '');
  const ivl = INTERVAL_MAP[interval];

  const allCandles: Candle[] = [];
  let remaining = limit;
  let endTime: number | undefined;

  while (remaining > 0) {
    const batchLimit = Math.min(remaining, 1000);
    let url = `${restHostCache}${BINANCE_CONFIG.klinesPath}?symbol=${sym}&interval=${ivl}&limit=${batchLimit}`;
    if (endTime !== undefined) url += `&endTime=${endTime}`;

    const res = await fetch(url, { signal: AbortSignal.timeout(requestTimeoutMs) });
    if (!res.ok) throw new Error(`Binance HTTP ${res.status}`);
    const data: unknown[][] = await res.json() as unknown[][];

    if (data.length === 0) break;

    const batch: Candle[] = data.map(k => ({
      time:   Math.floor(Number(k[0]) / 1000),
      open:   parseFloat(k[1] as string),
      high:   parseFloat(k[2] as string),
      low:    parseFloat(k[3] as string),
      close:  parseFloat(k[4] as string),
      volume: parseFloat(k[5] as string),
    }));

    // Prepend older candles (we're going backwards in time)
    allCandles.unshift(...batch);
    remaining -= batch.length;

    if (batch.length < batchLimit) break; // no more history available

    // Set endTime to 1ms before the oldest candle in this batch
    endTime = Number(data[0][0]) - 1;

    // 250ms pause between paginated requests to avoid 429
    if (remaining > 0) await new Promise(r => setTimeout(r, 250));
  }

  return allCandles;
}

type TickCallback = (c: Candle) => void;

export function subscribeBinanceTicks(
  symbol: string,
  interval: Interval,
  onTick: TickCallback,
): () => void {
  const sym = symbol.toUpperCase().replace('/', '');
  const ivl = INTERVAL_MAP[interval];

  let ws: WebSocket | null = null;
  let attempt = 0;
  let stopped = false;
  let reconnecting = false;

  function buildUrl(): string {
    const host = wsHostCache ?? BINANCE_CONFIG.wsHosts.global;
    return `${host}/ws/${sym.toLowerCase()}@kline_${ivl}`;
  }

  function connect() {
    if (stopped) return;
    const wsUrl = buildUrl();
    try {
      ws = new WebSocket(wsUrl);
    } catch {
      scheduleReconnect();
      return;
    }

    ws.onopen = () => {
      attempt = 0;
      reconnecting = false;
      // Binance WS URL contains symbol+interval — no re-subscribe needed
    };

    ws.onmessage = (ev) => {
      try {
        const msg = JSON.parse(ev.data as string) as {
          k: {
            t: number;  // open time (ms)
            o: string;  // open
            h: string;  // high
            l: string;  // low
            c: string;  // close
            v: string;  // volume — cumulative for this candle, NOT delta
            x: boolean; // is closed flag
          };
        };
        const k = msg.k;
        // Pass the raw candle to the store's updateOrAppendCandle.
        // Volume is cumulative per-candle from Binance — do NOT sum it.
        onTick({
          time:   Math.floor(k.t / 1000),
          open:   parseFloat(k.o),
          high:   parseFloat(k.h),
          low:    parseFloat(k.l),
          close:  parseFloat(k.c),
          volume: parseFloat(k.v),
        });
      } catch { /* ignore parse errors */ }
    };

    ws.onerror = () => {
      if (!reconnecting) {
        reconnecting = true;
        cleanupSocket();
        scheduleReconnect();
      }
    };

    ws.onclose = () => {
      if (!reconnecting) {
        reconnecting = true;
        cleanupSocket();
        scheduleReconnect();
      }
    };
  }

  function cleanupSocket() {
    try { ws?.close(); } catch { /* ignore */ }
    ws = null;
  }

  function scheduleReconnect() {
    if (stopped) return;
    const delay = BACKOFF[Math.min(attempt, BACKOFF.length - 1)];
    attempt++;
    setTimeout(() => {
      reconnecting = false;
      connect();
    }, delay);
  }

  detectHosts().then(connect);

  return () => {
    stopped = true;
    cleanupSocket();
  };
}
