import type { Candle, Interval } from '../../types/candle';

const INTERVAL_MAP: Record<Interval, string> = {
  '1min':  '1m',
  '5min':  '5m',
  '15min': '15m',
  '30min': '30m',
  '1h':    '1h',
  '4h':    '4h',
  '1day':  '1d',
};

export async function fetchBinanceCandles(
  symbol: string,
  interval: Interval,
  limit = 1000,
): Promise<Candle[]> {
  const sym = symbol.toUpperCase().replace('/', '');
  const ivl = INTERVAL_MAP[interval];
  const url = `https://api.binance.com/api/v3/klines?symbol=${sym}&interval=${ivl}&limit=${limit}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
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

const BACKOFF = [3000, 6000, 12000, 30000, 60000];

export function subscribeBinanceTicks(
  symbol: string,
  interval: Interval,
  onTick: TickCallback,
): () => void {
  const sym = symbol.toUpperCase().replace('/', '');
  const ivl = INTERVAL_MAP[interval];
  const url = `wss://stream.binance.com:9443/ws/${sym.toLowerCase()}@kline_${ivl}`;

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
