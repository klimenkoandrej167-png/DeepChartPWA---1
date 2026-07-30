import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface Candle {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

const BINANCE_INTERVALS: Record<string, string> = {
  "1min": "1m", "5min": "5m", "15min": "15m", "30min": "30m",
  "1h": "1h", "4h": "4h", "1day": "1d",
};

const DERIV_GRANULARITIES: Record<string, number> = {
  "1min": 60, "5min": 300, "15min": 900, "30min": 1800,
  "1h": 3600, "4h": 14400, "1day": 86400,
};

const CRYPTO_BASES = new Set([
  "BTC","ETH","BNB","XRP","ADA","SOL","DOGE","DOT","AVAX","MATIC",
  "LINK","LTC","BCH","XLM","ATOM","UNI","ETC","TRX","FIL","NEAR",
  "ALGO","VET","ICP","APT","ARB","OP","SUI","INJ","IMX","SEI",
  "PEPE","SHIB","FLOKI","WIF","BOME",
]);

function isCrypto(symbol: string): boolean {
  const upper = symbol.toUpperCase().replace("/", "");
  for (const base of CRYPTO_BASES) {
    if (upper.startsWith(base)) return true;
  }
  return false;
}

function toDerivSymbol(symbol: string): string {
  const upper = symbol.toUpperCase().replace("/", "");
  if (upper.length === 6) return `frx${upper}`;
  for (const quote of ["USDT", "BUSD"]) {
    if (upper.endsWith(quote)) return `cry${upper.slice(0, -quote.length)}USD`;
  }
  if (upper.endsWith("USD")) return `cry${upper}`;
  return upper;
}

async function fetchBinanceCandles(symbol: string, interval: string, limit: number): Promise<Candle[]> {
  const sym = symbol.toUpperCase().replace("/", "");
  const ivl = BINANCE_INTERVALS[interval] ?? "1h";

  for (const host of ["https://api.binance.us", "https://api.binance.com"]) {
    try {
      const url = `${host}/api/v3/klines?symbol=${sym}&interval=${ivl}&limit=${limit}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
      if (!res.ok) continue;
      const data: unknown[][] = await res.json() as unknown[][];
      if (data.length > 0) {
        return data.map(k => ({
          time:   Math.floor(Number(k[0]) / 1000),
          open:   parseFloat(k[1] as string),
          high:   parseFloat(k[2] as string),
          low:    parseFloat(k[3] as string),
          close:  parseFloat(k[4] as string),
          volume: parseFloat(k[5] as string),
        }));
      }
    } catch { /* try next host */ }
  }
  throw new Error("Binance: no data from any host");
}

async function fetchDerivCandles(symbol: string, interval: string, count: number): Promise<Candle[]> {
  const dSym = toDerivSymbol(symbol);
  const granularity = DERIV_GRANULARITIES[interval] ?? 3600;

  return new Promise((resolve, reject) => {
    let ws: WebSocket;
    try {
      ws = new WebSocket("wss://ws.derivws.com/websockets/v3?app_id=1089");
    } catch (e) {
      reject(e as Error);
      return;
    }

    const timeout = setTimeout(() => {
      ws.close();
      reject(new Error("Deriv: history request timed out"));
    }, 10_000);

    ws.onopen = () => {
      ws.send(JSON.stringify({
        ticks_history: dSym,
        style: "candles",
        granularity,
        count,
        end: "latest",
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
        if (msg.msg_type === "candles" && msg.candles) {
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
      reject(new Error("Deriv: connection error"));
    };
  });
}

async function fetchYahooCandles(symbol: string, interval: string): Promise<Candle[]> {
  const upper = symbol.toUpperCase().replace("/", "");
  let yahooSym: string;
  if (isCrypto(symbol)) {
    if (upper.endsWith("USDT")) yahooSym = `${upper.slice(0, -4)}-USD`;
    else if (upper.endsWith("USD")) yahooSym = `${upper.slice(0, -3)}-USD`;
    else yahooSym = `${upper}-USD`;
  } else {
    yahooSym = upper.length === 6 ? `${upper}=X` : upper;
  }

  const intervalMap: Record<string, { range: string; interval: string }> = {
    "1min":  { range: "1d",  interval: "1m"  },
    "5min":  { range: "5d",  interval: "5m"  },
    "15min": { range: "5d",  interval: "15m" },
    "30min": { range: "1mo", interval: "30m" },
    "1h":    { range: "3mo", interval: "60m" },
    "1day":  { range: "2y",  interval: "1d"  },
  };
  const effective = interval === "4h" ? "1h" : interval;
  const cfg = intervalMap[effective];
  if (!cfg) throw new Error(`Yahoo: unsupported interval ${interval}`);

  const path = `/v8/finance/chart/${yahooSym}?range=${cfg.range}&interval=${cfg.interval}&includePrePost=false`;
  const url = `https://query1.finance.yahoo.com${path}`;

  const res = await fetch(url, {
    signal: AbortSignal.timeout(10_000),
    headers: { "User-Agent": "Mozilla/5.0" },
  });
  if (!res.ok) throw new Error(`Yahoo HTTP ${res.status}`);

  const data = await res.json() as {
    chart: {
      result?: { timestamp: number[]; indicators: { quote: { open: (number|null)[]; high: (number|null)[]; low: (number|null)[]; close: (number|null)[]; volume: (number|null)[] }[] } }[];
      error?: null | { description: string };
    };
  };
  if (data.chart.error) throw new Error(data.chart.error.description);
  const result = data.chart.result?.[0];
  if (!result) throw new Error("Yahoo: empty result");

  const { timestamp, indicators } = result;
  const quote = indicators.quote[0];

  const candles: Candle[] = timestamp
    .map((t, i) => ({
      time:   t,
      open:   quote.open[i]   ?? 0,
      high:   quote.high[i]   ?? 0,
      low:    quote.low[i]    ?? 0,
      close:  quote.close[i]  ?? 0,
      volume: quote.volume[i] ?? 0,
    }))
    .filter(c => c.open !== 0 && c.close !== 0) as Candle[];

  if (interval === "4h") {
    const out: Candle[] = [];
    for (let i = 0; i < candles.length; i += 4) {
      const chunk = candles.slice(i, i + 4);
      if (chunk.length === 0) continue;
      out.push({
        time:   chunk[0].time,
        open:   chunk[0].open,
        high:   Math.max(...chunk.map(c => c.high)),
        low:    Math.min(...chunk.map(c => c.low)),
        close:  chunk[chunk.length - 1].close,
        volume: chunk.reduce((s, c) => s + c.volume, 0),
      });
    }
    return out;
  }

  return candles;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const symbol   = url.searchParams.get("symbol")   ?? "";
    const interval = url.searchParams.get("interval")  ?? "1h";
    const limit    = parseInt(url.searchParams.get("limit") ?? "1000", 10);

    if (!symbol) {
      return new Response(
        JSON.stringify({ error: "Missing 'symbol' parameter" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const errors: string[] = [];
    let candles: Candle[] = [];

    // Try sources in order based on asset type
    if (isCrypto(symbol)) {
      // Crypto: Binance first, then Deriv, then Yahoo
      try {
        candles = await fetchBinanceCandles(symbol, interval, limit);
      } catch (e) {
        errors.push(`Binance: ${(e as Error).message}`);
        try {
          candles = await fetchDerivCandles(symbol, interval, Math.min(limit, 1000));
        } catch (e2) {
          errors.push(`Deriv: ${(e2 as Error).message}`);
          try {
            candles = await fetchYahooCandles(symbol, interval);
          } catch (e3) {
            errors.push(`Yahoo: ${(e3 as Error).message}`);
          }
        }
      }
    } else {
      // Forex/metals: Deriv first, then Yahoo
      try {
        candles = await fetchDerivCandles(symbol, interval, Math.min(limit, 1000));
      } catch (e) {
        errors.push(`Deriv: ${(e as Error).message}`);
        try {
          candles = await fetchYahooCandles(symbol, interval);
        } catch (e2) {
          errors.push(`Yahoo: ${(e2 as Error).message}`);
        }
      }
    }

    if (candles.length === 0) {
      return new Response(
        JSON.stringify({ error: "No data available", details: errors }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    return new Response(
      JSON.stringify({ candles, source: "proxy" }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
