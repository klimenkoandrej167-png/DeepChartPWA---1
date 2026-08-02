import type { Candle, Interval } from '../../types/candle';
import { DERIV_CONFIG } from '../providers.config';
import { isCrypto } from '../../utils/symbolUtils';

const {
  granularityMap: GRANULARITY_MAP,
  defaultCount,
  pingIntervalMs,
  reconnectBackoffMs: BACKOFF,
  wsUrl: WS_URL,
} = DERIV_CONFIG;

/**
 * Resolve the Deriv app_id from the environment.
 *
 * CRITICAL: Do NOT validate with a regex like /^\d+$/ — modern Deriv app_ids
 * can be alphanumeric. Pass VITE_DERIV_APP_ID through as-is. The only
 * fallback is when the variable is unset (undefined/empty): use 1089.
 */
function resolveAppId(): string {
  const raw = import.meta.env.VITE_DERIV_APP_ID as string | undefined;
  if (raw && raw.trim().length > 0) return raw.trim();
  return DERIV_CONFIG.defaultAppId;
}

/** Optional Deriv token — only needed for account data, not for public candles */
function resolveToken(): string | null {
  const raw = import.meta.env.VITE_DERIV_TOKEN as string | undefined;
  if (raw && raw.trim().length > 0) return raw.trim();
  return null;
}

function wsUrl(): string {
  return `${WS_URL}?app_id=${resolveAppId()}`;
}

/** Map a user-facing symbol to Deriv's internal symbol format */
export function toDerivSymbol(symbol: string): string {
  const upper = symbol.toUpperCase().replace('/', '');
  if (isCrypto(symbol)) {
    for (const quote of ['USDT', 'BUSD']) {
      if (upper.endsWith(quote)) return `cry${upper.slice(0, -quote.length)}USD`;
    }
    if (upper.endsWith('USD')) return `cry${upper}`;
    return upper;
  }
  // Forex/metals (6-letter pairs) use the frx prefix
  if (upper.length === 6) return `frx${upper}`;
  return upper;
}

/** Deriv covers forex majors/crosses/metals (6-letter pairs via frx prefix) and some crypto */
export function isDerivSupported(symbol: string): boolean {
  const upper = symbol.toUpperCase().replace('/', '');
  if (upper.length === 6) return true;
  if (isCrypto(symbol)) {
    for (const quote of ['USDT', 'USD', 'BUSD']) {
      if (upper.endsWith(quote) && upper.length > quote.length) return true;
    }
  }
  return false;
}

let reqIdCounter = 1;
function nextReqId(): number { return reqIdCounter++; }

export async function fetchDerivCandles(
  symbol: string,
  interval: Interval,
  count = defaultCount,
): Promise<Candle[]> {
  const granularity = GRANULARITY_MAP[interval];
  const dSym = toDerivSymbol(symbol);
  const reqId = nextReqId();

  return new Promise((resolve, reject) => {
    let ws: WebSocket;
    try {
      ws = new WebSocket(wsUrl());
    } catch (e) {
      reject(e as Error);
      return;
    }

    const timeout = setTimeout(() => {
      ws.close();
      reject(new Error('Deriv: history request timed out'));
    }, 10_000);

    ws.onopen = () => {
      ws.send(JSON.stringify({
        ticks_history: dSym,
        style: 'candles',
        granularity,
        count,
        end: 'latest',
        req_id: reqId,
      }));
    };

    ws.onmessage = (ev) => {
      try {
        const msg = JSON.parse(ev.data as string) as {
          req_id?: number;
          error?: { message: string };
          msg_type?: string;
          candles?: { epoch: number; open: string; high: string; low: string; close: string }[];
        };
        if (msg.error) {
          clearTimeout(timeout);
          ws.close();
          reject(new Error(`Deriv: ${msg.error.message}`));
          return;
        }
        if (msg.msg_type === 'candles' && msg.candles) {
          clearTimeout(timeout);
          const candles: Candle[] = msg.candles.map(c => ({
            time:   c.epoch,
            open:   parseFloat(c.open),
            high:   parseFloat(c.high),
            low:    parseFloat(c.low),
            close:  parseFloat(c.close),
            volume: 0, // forex/metals always have volume 0 on Deriv
          }));
          ws.close();
          resolve(candles);
        }
      } catch (e) {
        clearTimeout(timeout);
        ws.close();
        reject(e as Error);
      }
    };

    ws.onerror = () => {
      clearTimeout(timeout);
      reject(new Error('Deriv: connection error'));
    };
  });
}

type TickCallback = (c: Candle) => void;

/**
 * Subscribe to live OHLC updates from Deriv via a single WebSocket.
 *
 * Reconnect logic: onerror and onclose both fire on disconnect. A single
 * `reconnecting` flag ensures reconnect() runs exactly once per break.
 * After reconnect, the subscription is re-sent (Deriv forgets subscriptions
 * on socket disconnect).
 */
export function subscribeDerivTicks(
  symbol: string,
  onTick: TickCallback,
  intervalSec: number,
): () => void {
  const dSym = toDerivSymbol(symbol);
  const granularity = intervalSec;
  const token = resolveToken();

  let ws: WebSocket | null = null;
  let pingId: ReturnType<typeof setInterval> | null = null;
  let attempt = 0;
  let stopped = false;
  let reconnecting = false;

  function sendSubscription() {
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    // If a token is available, authorize first; subscription is sent independently after
    if (token) {
      ws.send(JSON.stringify({ authorize: token, req_id: nextReqId() }));
    }
    ws.send(JSON.stringify({
      ticks_history: dSym,
      style: 'candles',
      granularity,
      count: 1,
      end: 'latest',
      subscribe: 1,
      req_id: nextReqId(),
    }));
  }

  function connect() {
    if (stopped) return;
    try {
      ws = new WebSocket(wsUrl());
    } catch {
      scheduleReconnect();
      return;
    }

    ws.onopen = () => {
      attempt = 0;
      reconnecting = false;
      sendSubscription();
      pingId = setInterval(() => {
        if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ ping: 1 }));
      }, pingIntervalMs);
    };

    ws.onmessage = (ev) => {
      try {
        const msg = JSON.parse(ev.data as string) as {
          msg_type?: string;
          error?: { message: string };
          ohlc?: {
            open_time: number;
            epoch: number;
            open: string;
            high: string;
            low: string;
            close: string;
          };
        };
        if (msg.error) {
          console.warn('Deriv subscribe error:', msg.error.message);
          return;
        }
        if (msg.msg_type === 'ohlc' && msg.ohlc) {
          const c = msg.ohlc;
          // CRITICAL: use open_time as the candle's time identity.
          // The store's updateOrAppendCandle compares this with the last
          // candle's time to decide merge vs. new-candle.
          onTick({
            time:   Number(c.open_time),
            open:   parseFloat(c.open),
            high:   parseFloat(c.high),
            low:    parseFloat(c.low),
            close:  parseFloat(c.close),
            volume: 0, // forex/metals volume is always 0
          });
        }
      } catch { /* ignore parse errors */ }
    };

    ws.onerror = () => {
      // Guard: only reconnect once per disconnect cycle
      if (!reconnecting) {
        reconnecting = true;
        cleanupSocket();
        scheduleReconnect();
      }
    };

    ws.onclose = () => {
      // Guard: onerror already triggered reconnect, don't duplicate
      if (!reconnecting) {
        reconnecting = true;
        cleanupSocket();
        scheduleReconnect();
      }
    };
  }

  function cleanupSocket() {
    if (pingId) { clearInterval(pingId); pingId = null; }
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

  connect();

  return () => {
    stopped = true;
    cleanupSocket();
  };
}
