import { create } from 'zustand';
import type { PatternResult, SignalCategory } from '../types/pattern';
import { PATTERN_CATEGORY } from '../types/pattern';

export interface Signal {
  id: string;
  pattern: PatternResult;
  symbol: string;
  interval: string;
  candleTime: number;
  createdAt: number;
  preClose?: boolean;
}

export interface Toast {
  id: string;
  signal: Signal;
}

export function selectSignalsByCategory(signals: Signal[], category: SignalCategory): Signal[] {
  return signals.filter(s => PATTERN_CATEGORY[s.pattern.type] === category);
}

const MAX_SIGNALS_PER_PAIR = 20;

function pairKey(symbol: string, interval: string): string {
  return `${symbol}_${interval}`;
}

interface SignalState {
  signals:  Signal[];
  toasts:   Toast[];
  addSignal: (s: Signal) => void;
  clearSignals: () => void;
  clearSignalsForPair: (symbol: string, interval: string) => void;
  addToast:  (t: Toast) => void;
  removeToast: (id: string) => void;
}

export const useSignalStore = create<SignalState>()((set) => ({
  signals: [],
  toasts:  [],

  addSignal(s) {
    set((state) => {
      const key        = pairKey(s.symbol, s.interval);
      const samePair   = state.signals.filter(x => pairKey(x.symbol, x.interval) === key);
      const otherPairs = state.signals.filter(x => pairKey(x.symbol, x.interval) !== key);
      const updated    = [s, ...samePair].slice(0, MAX_SIGNALS_PER_PAIR);
      return { signals: [...updated, ...otherPairs] };
    });
  },

  clearSignals() {
    set({ signals: [] });
  },

  clearSignalsForPair(symbol, interval) {
    set((state) => ({
      signals: state.signals.filter(
        x => pairKey(x.symbol, x.interval) !== pairKey(symbol, interval),
      ),
    }));
  },

  addToast(t) {
    set((state) => ({
      toasts: [...state.toasts, t].slice(-5),
    }));
  },

  removeToast(id) {
    set((state) => ({
      toasts: state.toasts.filter(t => t.id !== id),
    }));
  },
}));
