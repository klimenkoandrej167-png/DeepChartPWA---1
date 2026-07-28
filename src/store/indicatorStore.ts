import { create } from 'zustand';

export interface SRLevel {
  price: number;
  strength: number;
  type: 'support' | 'resistance';
}

export interface SwingPoint {
  index: number;
  price: number;
  type: 'HH' | 'HL' | 'LH' | 'LL';
}

export interface OrderBlock {
  top: number;
  bottom: number;
  time: number;
  type: 'bullish' | 'bearish';
  mitigated: boolean;
  endTime: number | null;
}

export interface FVG {
  top: number;
  bottom: number;
  time: number;
  type: 'bullish' | 'bearish';
  broken: boolean;
  endTime: number | null;
}

export interface RejectionBlock {
  top: number;
  bottom: number;
  time: number;
  type: 'bullish' | 'bearish';
}

export interface BOSEvent {
  price: number;
  time: number;
  type: 'bullish' | 'bearish';
}

export interface IndicatorValues {
  ema20:    number[];
  ema50:    number[];
  ema200:   number[];
  rsi:      number[];
  atr:      number[];
  macd:     { macd: number[]; signal: number[]; hist: number[] };
  bb:       { upper: number[]; middle: number[]; lower: number[] };
  fibLevels: number[];
  swings:   SwingPoint[];
  srLevels: SRLevel[];
  orderBlocks: OrderBlock[];
  fvgs:        FVG[];
  rejectionBlocks: RejectionBlock[];
  bosEvents:   BOSEvent[];
  // M1 trigger indicators (optional — not rendered on chart by default)
  ema9?:    number[];
  ema21?:   number[];
  rsi7?:    number[];
  vwap?:    number[];
}

const EMPTY: IndicatorValues = {
  ema20: [], ema50: [], ema200: [],
  rsi: [], atr: [],
  macd: { macd: [], signal: [], hist: [] },
  bb:   { upper: [], middle: [], lower: [] },
  fibLevels: [],
  swings: [],
  srLevels: [],
  orderBlocks: [],
  fvgs: [],
  rejectionBlocks: [],
  bosEvents: [],
};

interface IndicatorState {
  values: IndicatorValues;
  setValues: (v: IndicatorValues) => void;
  reset: () => void;
}

export const useIndicatorStore = create<IndicatorState>()((set) => ({
  values: EMPTY,
  setValues: (values) => set({ values }),
  reset: () => set({ values: EMPTY }),
}));
