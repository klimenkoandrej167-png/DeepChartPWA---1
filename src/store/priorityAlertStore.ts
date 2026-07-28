import { create } from 'zustand';

export interface PriorityAlert {
  id: string;
  direction: 'up' | 'down';
  symbol: string;
  interval: string;
  probability: number;
  createdAt: number;
  expiresAt: number;
  recommendedExpirySeconds: number;
  reasonLabel: string;
  rr?: number;
  expectedValuePct?: number;
}

interface PriorityAlertState {
  current: PriorityAlert | null;
  setAlert: (a: PriorityAlert) => void;
  clear: () => void;
}

export const usePriorityAlertStore = create<PriorityAlertState>()((set) => ({
  current: null,
  setAlert(a) { set({ current: a }); },
  clear() { set({ current: null }); },
}));
