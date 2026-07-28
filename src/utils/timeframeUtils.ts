import type { Interval } from '../types/candle';

export function intervalToMs(interval: Interval): number {
  const map: Record<Interval, number> = {
    '1min':  60_000,
    '5min':  300_000,
    '15min': 900_000,
    '30min': 1_800_000,
    '1h':    3_600_000,
    '4h':    14_400_000,
    '1day':  86_400_000,
  };
  return map[interval];
}

export function intervalLabel(interval: Interval): string {
  const labels: Record<Interval, string> = {
    '1min':  '1m',
    '5min':  '5m',
    '15min': '15m',
    '30min': '30m',
    '1h':    '1H',
    '4h':    '4H',
    '1day':  '1D',
  };
  return labels[interval];
}
