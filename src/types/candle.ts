export interface Candle {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface Tick {
  symbol: string;
  price: number;
  time: number;
}

export type SourceStatus = 'connecting' | 'live' | 'error' | 'offline';

export type DataSourceName = 'binance' | 'deriv' | 'twelvedata' | 'finnhub' | 'yahoo' | 'proxy';

export type Interval =
  | '1min' | '5min' | '15min' | '30min'
  | '1h' | '4h' | '1day';
