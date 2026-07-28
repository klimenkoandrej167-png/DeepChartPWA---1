import type { Interval } from '../types/candle';

/**
 * Declarative provider configuration. Values are extracted 1:1 from
 * src/api/sources/binance.ts and deriv.ts — no behavior or ordering changes.
 */

export const BINANCE_CONFIG = {
  restHosts: {
    global: 'https://api.binance.com',
    us: 'https://api.binance.us',
  },
  wsHosts: {
    global: 'wss://stream.binance.com:9443',
    us: 'wss://stream.binance.us:9443',
  },
  pingPath: '/api/v3/ping',
  klinesPath: '/api/v3/klines',
  intervalMap: {
    '1min':  '1m',
    '5min':  '5m',
    '15min': '15m',
    '30min': '30m',
    '1h':    '1h',
    '4h':    '4h',
    '1day':  '1d',
  } as Record<Interval, string>,
  defaultLimit: 1000,
  reconnectBackoffMs: [3000, 6000, 12000, 30000, 60000],
  requestTimeoutMs: 10_000,
} as const;

export const DERIV_CONFIG = {
  wsUrl: 'wss://ws.derivws.com/websockets/v3',
  // Замени на собственный app_id на api.deriv.com/dashboard перед продакшеном —
  // иначе все клиенты делят один rate-limit с публичным демо-идентификатором.
  appIdEnvVar: 'VITE_DERIV_APP_ID',
  defaultAppId: '1089',
  granularityMap: {
    '1min':  60,
    '5min':  300,
    '15min': 900,
    '30min': 1800,
    '1h':    3600,
    '4h':    14400,
    '1day':  86400,
  } as Record<Interval, number>,
  defaultCount: 1000,
  pingIntervalMs: 15_000,
  reconnectBackoffMs: [3000, 6000, 12000, 30000, 60000],
} as const;
