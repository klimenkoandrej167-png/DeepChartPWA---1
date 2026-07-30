import type { Candle, Interval } from '../../types/candle';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

function endpoint(symbol: string, interval: Interval, limit: number): string {
  return `${SUPABASE_URL}/functions/v1/market-data?symbol=${encodeURIComponent(symbol)}&interval=${interval}&limit=${limit}`;
}

export async function fetchProxyCandles(
  symbol: string,
  interval: Interval,
  limit = 1000,
): Promise<Candle[]> {
  const res = await fetch(endpoint(symbol, interval, limit), {
    headers: {
      Authorization: `Bearer ${SUPABASE_KEY}`,
      'Content-Type': 'application/json',
    },
    signal: AbortSignal.timeout(15_000),
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? `Proxy HTTP ${res.status}`);
  }

  const json = await res.json() as { candles?: Candle[]; error?: string };
  if (json.error) throw new Error(json.error);
  if (!json.candles || json.candles.length === 0) throw new Error('No candles');
  return json.candles;
}

type TickCallback = (c: Candle) => void;

export function subscribeProxyTicks(
  symbol: string,
  interval: Interval,
  onTick: TickCallback,
): () => void {
  let stopped = false;
  let pollId: ReturnType<typeof setInterval> | null = null;

  const intervalMs: Record<Interval, number> = {
    '1min': 60_000,
    '5min': 300_000,
    '15min': 900_000,
    '30min': 1_800_000,
    '1h': 3_600_000,
    '4h': 14_400_000,
    '1day': 86_400_000,
  };
  const pollInterval = Math.max(intervalMs[interval] / 2, 5_000);

  async function poll() {
    if (stopped) return;
    try {
      const candles = await fetchProxyCandles(symbol, interval, 1);
      if (candles.length > 0) onTick(candles[candles.length - 1]);
    } catch { /* ignore — will retry next cycle */ }
  }

  pollId = setInterval(poll, pollInterval);
  return () => {
    stopped = true;
    if (pollId) clearInterval(pollId);
  };
}
