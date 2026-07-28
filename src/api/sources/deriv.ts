import type { Candle, Interval } from '../../types/candle';
import { DERIV_CONFIG } from '../providers.config';

const {
  granularityMap: GRANULARITY_MAP,
  defaultCount,
  pingIntervalMs,
  reconnectBackoffMs: BACKOFF,
  wsUrl: WS_URL,
} = DERIV_CONFIG;

function resolveAppId(): string {
  // app_id must be numeric — Deriv's test app_id 1089 works for development.
  // Users can register their own at api.deriv.com/dashboard.
  const env = import.meta.env;
  const appId = env[DERIV_CONFIG.appIdEnvVar as 'VITE_DERIV_APP_ID'] as string | undefined;
  return appId && /^\d+$/.test(appId) ? appId : DERIV_CONFIG.defaultAppId;
}

function wsUrl(): string {
  return `${WS_URL}?app_id=${resolveAppId()}`;
}

function toDerivSymbol(symbol: string): string {
  const upper = symbol.toUpperCase().replace('/', '');
  // Forex pairs (6 chars) use the frx prefix
  if (upper.length === 6) return `frx${upper}`;
  // Crypto pairs: convert e.g. BTCUSDT → cryBTCUSD, ETHUSDT → cryETHUSD
  for (const quote of ['USDT', 'BUSD']) {
    if (upper.endsWith(quote)) {
      return `cry${upper.slice(0, -quote.length)}USD`;
    }
  }
  if (upper.endsWith('USD')) return `cry${upper}`;
  return upper;
}

/** Deriv covers forex majors/crosses/metals (6-letter pairs via frx prefix) and crypto (e.g. BTCUSD) */
export function isDerivSupported(symbol: string): boolean {
  const upper = symbol.toUpperCase().replace('/', '');
  // Forex pairs (e.g. EURUSD, GBPJPY, XAUUSD) — 6 chars
  if (upper.length === 6) return true;
  // Crypto pairs without USDT suffix (e.g. BTCUSD, ETHUSD) — Deriv uses crypto base + USD
  // Strip common quote currencies to check if the base is a known crypto
  for (const quote of ['USDT', 'USD', 'BUSD', 'EUR', 'GBP']) {
    if (upper.endsWith(quote) && upper.length > quote.length) return true;
  }
  return false;
}

export async function fetchDerivCandles(
  symbol: string,
  interval: Interval,
  count = defaultCount,
): Promise<Candle[]> {
  const granularity = GRANULARITY_MAP[interval];
  const dSym = toDerivSymbol(symbol);

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
      }));
    };

    ws.onmessage = (ev) => {
      try {
        const msg = JSON.parse(ev.data as string) as {
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
            volume: 0,
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

export function subscribeDerivTicks(
  symbol: string,
  onTick: TickCallback,
  intervalSec: number,
): () => void {
  const dSym = toDerivSymbol(symbol);
  const granularity = intervalSec;

  let ws: WebSocket | null = null;
  let pingId: ReturnType<typeof setInterval> | null = null;
  let attempt = 0;
  let stopped = false;

  function connect() {
    if (stopped) return;
    try {
      ws = new WebSocket(wsUrl());
    } catch {
      reconnect();
      return;
    }

    ws.onopen = () => {
      attempt = 0;
      ws?.send(JSON.stringify({
        ticks_history: dSym,
        style: 'candles',
        granularity,
        count: 1,
        end: 'latest',
        subscribe: 1,
      }));
      pingId = setInterval(() => {
        if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ ping: 1 }));
      }, pingIntervalMs);
    };

    ws.onmessage = (ev) => {
      try {
        const msg = JSON.parse(ev.data as string) as {
          msg_type?: string;
          ohlc?: { epoch: number; open_time: number; open: string; high: string; low: string; close: string };
        };
        if (msg.msg_type === 'ohlc' && msg.ohlc) {
          const c = msg.ohlc;
          onTick({
            time:   Number(c.open_time),
            open:   parseFloat(c.open),
            high:   parseFloat(c.high),
            low:    parseFloat(c.low),
            close:  parseFloat(c.close),
            volume: 0,
          });
        }
      } catch { /* ignore */ }
    };

    ws.onerror = () => reconnect();
    ws.onclose = () => {
      if (pingId) clearInterval(pingId);
      reconnect();
    };
  }

  function reconnect() {
    if (stopped) return;
    const delay = BACKOFF[Math.min(attempt, BACKOFF.length - 1)];
    attempt++;
    setTimeout(connect, delay);
  }

  connect();
  return () => {
    stopped = true;
    if (pingId) clearInterval(pingId);
    ws?.close();
  };
}
