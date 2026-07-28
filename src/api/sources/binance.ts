import type { Candle, Interval } from '../../types/candle';
import { BINANCE_CONFIG } from '../providers.config';

const { intervalMap: INTERVAL_MAP, defaultLimit, reconnectBackoffMs: BACKOFF, requestTimeoutMs } = BINANCE_CONFIG;

export async function fetchBinanceCandles(
  symbol: string,
  interval: Interval,
  limit = defaultLimit,
): Promise<Candle[]> {
  const sym = symbol.toUpperCase().replace('/', '');
  const ivl = INTERVAL_MAP[interval];
  const url = `${BINANCE_CONFIG.restHosts.global}${BINANCE_CONFIG.klinesPath}?symbol=${sym}&interval=${ivl}&limit=${limit}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(requestTimeoutMs) });
  if (!res.ok) throw new Error(`Binance HTTP ${res.status}`);
  const data: unknown[][] = await res.json() as unknown[][];
  return data.map(k => ({
    time:   Math.floor(Number(k[0]) / 1000),
    open:   parseFloat(k[1] as string),
    high:   parseFloat(k[2] as string),
    low:    parseFloat(k[3] as string),
    close:  parseFloat(k[4] as string),
    volume: parseFloat(k[5] as string),
  }));
}

type TickCallback = (c: Candle) => void;

export function subscribeBinanceTicks(
  symbol: string,
  interval: Interval,
  onTick: TickCallback,
): () => void {
  const sym = symbol.toUpperCase().replace('/', '');
  const ivl = INTERVAL_MAP[interval];
  const url = `${BINANCE_CONFIG.wsHosts.global}/ws/${sym.toLowerCase()}@kline_${ivl}`;

  let ws: WebSocket | null = null;
  let attempt = 0;
  let stopped = false;

  function connect() {
    if (stopped) return;
    ws = new WebSocket(url);

    ws.onmessage = (ev) => {
      attempt = 0;
      try {
        const msg = JSON.parse(ev.data as string) as {
          k: { t: number; o: string; h: string; l: string; c: string; v: string };
        };
        const k = msg.k;
        onTick({
          time:   Math.floor(k.t / 1000),
          open:   parseFloat(k.o),
          high:   parseFloat(k.h),
          low:    parseFloat(k.l),
          close:  parseFloat(k.c),
          volume: parseFloat(k.v),
        });
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
