import { create } from 'zustand';
import type { Candle, Interval } from '../types/candle';
import type {
  SwingPoint, SRLevel, OrderBlock, FVG, BOSEvent,
} from './indicatorStore';
import type { LiquidityPool } from '../indicators/liquidityPools';
import type { VolumeProfileResult } from '../indicators/volumeProfile';

export interface HtfFrame {
  candles:       Candle[];
  ema20:         number[];
  ema50:         number[];
  swings:        SwingPoint[];
  srLevels:      SRLevel[];
  orderBlocks:   OrderBlock[];
  fvgs:          FVG[];
  bosEvents:     BOSEvent[];
  volumeProfile: VolumeProfileResult | null;
  liquidityPools: LiquidityPool[];
  status:        'connecting' | 'live' | 'error' | 'offline';
}

export type HtfTf = 'h1' | 'm15' | 'm5';

const EMPTY_FRAME: HtfFrame = {
  candles: [], ema20: [], ema50: [],
  swings: [], srLevels: [], orderBlocks: [], fvgs: [], bosEvents: [],
  volumeProfile: null, liquidityPools: [],
  status: 'offline',
};

interface HtfContextState {
  h1:   HtfFrame;
  m15:  HtfFrame;
  m5:   HtfFrame;
  setFrame: (tf: HtfTf, frame: Partial<HtfFrame>) => void;
  reset: () => void;
}

export const useHtfContextStore = create<HtfContextState>()((set) => ({
  h1:  { ...EMPTY_FRAME, status: 'offline' },
  m15: { ...EMPTY_FRAME, status: 'offline' },
  m5:  { ...EMPTY_FRAME, status: 'offline' },

  setFrame(tf, frame) {
    set((state) => ({ [tf]: { ...state[tf], ...frame } }));
  },

  reset() {
    set({
      h1:  { ...EMPTY_FRAME, status: 'connecting' },
      m15: { ...EMPTY_FRAME, status: 'connecting' },
      m5:  { ...EMPTY_FRAME, status: 'connecting' },
    });
  },
}));

export const HTF_INTERVAL_MAP: Record<HtfTf, Interval> = {
  h1:  '1h',
  m15: '15min',
  m5:  '5min',
};
