import type { Candle, Interval } from '../../types/candle';
import { DERIV_CONFIG } from '../providers.config';
import { isCrypto } from '../../utils/symbolUtils';
import { useKeysStore } from '../../store/keysStore';

const {
  granularityMap: GRANULARITY_MAP,
  defaultCount,
  pingIntervalMs,
  reconnectBackoffMs: BACKOFF,
  wsUrl: WS_URL,
} = DERIV_CONFIG;

// ─── App ID / Token resolution ───────────────────────────────────────────────

/**
 * Session-scoped flag: once the server rejects the user's app_id as invalid,
 * we fall back to the public demo ID (1089) for the rest of the page lifetime.
 * This avoids repeated rejections on every reconnect attempt.
 */
let appIdRejected = false;

/** Matches Deriv error messages like "InvalidAppID", "invalid app_id", etc. */
const INVALID_APP_ID_RE = /invalid\s*app\s*_?id/i;

/** Once per session: mark the user's app_id as rejected, fall back to demo. */
function markAppIdRejected(source: string, errorDetail: string) {
  if (appIdRejected) return;
  appIdRejected = true;
  console.warn(
    `[Deriv] App ID rejected by server (${source}). ` +
    `Falling back to demo app_id "${DERIV_CONFIG.defaultAppId}" for the rest of this session. ` +
    `If you registered a new alphanumeric app_id at developers.deriv.com/dashboard, ` +
    `it may be intended for the newer "Trading API v1" surface ` +
    `(which uses an HTTP header and a different base URL) rather than the classic ` +
    `wss://ws.derivws.com/websockets/v3?app_id= endpoint this app uses. ` +
    `Contact Deriv support to confirm which API surface your app_id is valid for. ` +
    `Server detail: ${errorDetail}`,
  );
}

/**
 * Resolve the Deriv app_id.
 *
 * Priority: keysStore (UI settings) → VITE_DERIV_APP_ID (env) → default 1089.
 * If the ID was rejected by the server this session, always returns the demo
 * fallback regardless of source.
 *
 * CRITICAL: Do NOT validate with a regex like /^\d+$/ — modern Deriv app_ids
 * can be alphanumeric. Pass the value through as-is. The only fallback is
 * when the variable is unset (undefined/empty) or when the server explicitly
 * rejected it (InvalidAppID).
 */
function resolveAppId(): string {
  if (appIdRejected) return DERIV_CONFIG.defaultAppId;

  const fromStore = useKeysStore.getState().derivAppId;
  if (fromStore && fromStore.trim().length > 0) return fromStore.trim();

  const fromEnv = import.meta.env.VITE_DERIV_APP_ID as string | undefined;
  if (fromEnv && fromEnv.trim().length > 0) return fromEnv.trim();

  return DERIV_CONFIG.defaultAppId;
}

/** Optional Deriv token — only needed for account data, not for public candles */
function resolveToken(): string | null {
  const fromStore = useKeysStore.getState().derivToken;
  if (fromStore && fromStore.trim().length > 0) return fromStore.trim();

  const fromEnv = import.meta.env.VITE_DERIV_TOKEN as string | undefined;
  if (fromEnv && fromEnv.trim().length > 0) return fromEnv.trim();

  return null;
}

function wsUrl(): string {
  return `${WS_URL}?app_id=${encodeURIComponent(resolveAppId())}`;
}

/** Reset session state — exposed for tests / future use. */
export function _resetDerivSession() {
  appIdRejected = false;
}

// ─── Symbol mapping ──────────────────────────────────────────────────────────

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

// ─── History fetch ────────────────────────────────────────────────────────────

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
          error?: { code?: string; message: string };
          msg_type?: string;
          candles?: { epoch: number; open: string; high: string; low: string; close: string }[];
        };
        if (msg.error) {
          clearTimeout(timeout);

          // Check for InvalidAppID — fall back to demo and retry once
          if (INVALID_APP_ID_RE.test(msg.error.message) || msg.error.code === 'InvalidAppID') {
            markAppIdRejected('fetchDerivCandles', JSON.stringify(msg.error));
            ws.close();
            // Retry with the demo app_id (resolveAppId now returns the fallback)
            fetchDerivCandles(symbol, interval, count).then(resolve, reject);
            return;
          }

          // DEV-only: log full error JSON for custom app_id diagnostics
          if (import.meta.env.DEV) {
            console.debug('[Deriv:fetch] Full error response:', JSON.stringify(msg, null, 2));
          }

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

// ─── Live subscription ─────────────────────────────────────────────────────────

type TickCallback = (c: Candle) => void;

/**
 * Watchdog: if no message (including errors) arrives within this window, the
 * socket is considered a "zombie" — technically open but not delivering data.
 * Clamped to [30s, 120s], scaled by 3× the candle interval.
 */
function watchdogIntervalMs(intervalSec: number): number {
  return Math.min(Math.max(intervalSec * 1000 * 3, 30_000), 120_000);
}

/**
 * Subscribe to live OHLC updates from Deriv via a single WebSocket.
 *
 * Reconnect logic:
 *  - onerror / onclose → cleanup + scheduleReconnect (guarded by `reconnecting`)
 *  - subscription error (msg.error) → cleanup + scheduleReconnect (was: log only)
 *  - watchdog (no message for N ms) → cleanup + scheduleReconnect
 *
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
  let watchdogId: ReturnType<typeof setInterval> | null = null;
  let lastMessageAt = 0;
  let attempt = 0;
  let stopped = false;
  let reconnecting = false;

  const watchdogMs = watchdogIntervalMs(intervalSec);

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
      lastMessageAt = Date.now();
      sendSubscription();
      pingId = setInterval(() => {
        if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ ping: 1 }));
      }, pingIntervalMs);

      // Watchdog: check periodically if the socket has gone silent.
      // Check every watchdogMs / 2 so we detect zombie state within ~1.5× the window.
      watchdogId = setInterval(() => {
        if (stopped || !ws) return;
        const elapsed = Date.now() - lastMessageAt;
        if (elapsed > watchdogMs) {
          // Socket is open but silent — treat as zombie, force reconnect
          if (!reconnecting) {
            reconnecting = true;
            console.warn(`Deriv: no message for ${elapsed}ms, treating as zombie and reconnecting`);
            cleanupSocket();
            scheduleReconnect();
          }
        }
      }, Math.max(watchdogMs / 2, 15_000));
    };

    ws.onmessage = (ev) => {
      lastMessageAt = Date.now();
      try {
        const msg = JSON.parse(ev.data as string) as {
          msg_type?: string;
          error?: { code?: string; message: string };
          candles?: { epoch: number; open: string; high: string; low: string; close: string }[];
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
          // InvalidAppID: fall back to demo, then reconnect with the new ID
          if (INVALID_APP_ID_RE.test(msg.error.message) || msg.error.code === 'InvalidAppID') {
            markAppIdRejected('subscribeDerivTicks', JSON.stringify(msg.error));
            if (!reconnecting) {
              reconnecting = true;
              cleanupSocket();
              scheduleReconnect();
            }
            return;
          }

          // DEV-only: log full error JSON for custom app_id diagnostics
          if (import.meta.env.DEV) {
            console.debug('[Deriv:subscribe] Full error response:', JSON.stringify(msg, null, 2));
          }

          // Any other subscription error must trigger a full reconnect cycle,
          // not just a console.warn — otherwise the chart silently freezes.
          if (!reconnecting) {
            reconnecting = true;
            console.warn('Deriv subscribe error (reconnecting):', msg.error.message);
            cleanupSocket();
            scheduleReconnect();
          }
          return;
        }
        // ticks_history with style:'candles' + subscribe:1 delivers
        // msg_type:'candles' (array), NOT 'ohlc'. Support both formats.
        if (msg.msg_type === 'candles' && msg.candles && msg.candles.length > 0) {
          const c = msg.candles[0];
          onTick({
            time:   c.epoch,
            open:   parseFloat(c.open),
            high:   parseFloat(c.high),
            low:    parseFloat(c.low),
            close:  parseFloat(c.close),
            volume: 0,
          });
        } else if (msg.msg_type === 'ohlc' && msg.ohlc) {
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
    if (watchdogId) { clearInterval(watchdogId); watchdogId = null; }
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
