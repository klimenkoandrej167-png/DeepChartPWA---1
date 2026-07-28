import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface IndicatorToggles {
  ema20: boolean;
  ema50: boolean;
  ema200: boolean;
  rsi: boolean;
  atr: boolean;
  macd: boolean;
  bb: boolean;
  fibonacci: boolean;
  trendStructure: boolean;
  supportResistance: boolean;
  orderBlocks: boolean;
  fvg: boolean;
  rejectionBlocks: boolean;
  bos: boolean;
}

export interface PredictionInputToggles {
  recentSignals: boolean;
  ema: boolean;
  rsi: boolean;
  macd: boolean;
  bos: boolean;
  htfBias: boolean;
  m15Filter: boolean;
  structure: boolean;
  zones: boolean;
  liquidity: boolean;
  vwap: boolean;
  volumeSpike: boolean;
}

interface SettingsState {
  soundEnabled: boolean;
  indicators: IndicatorToggles;
  predictionInputs: PredictionInputToggles;
  customSpreadOverrides: Record<string, number>;
  strictAsianSession: boolean;
  setSoundEnabled: (v: boolean) => void;
  toggleIndicator: (key: keyof IndicatorToggles) => void;
  setIndicator: (key: keyof IndicatorToggles, v: boolean) => void;
  setPredictionInput: (key: keyof PredictionInputToggles, v: boolean) => void;
  togglePredictionInput: (key: keyof PredictionInputToggles) => void;
  setCustomSpread: (symbol: string, pips: number) => void;
  setStrictAsianSession: (v: boolean) => void;
}

const DEFAULT_INDICATORS: IndicatorToggles = {
  ema20:            true,
  ema50:            true,
  ema200:           false,
  rsi:              true,
  atr:              false,
  macd:             false,
  bb:               false,
  fibonacci:        false,
  trendStructure:   true,
  supportResistance:true,
  orderBlocks:      true,
  fvg:              true,
  rejectionBlocks:  false,
  bos:              true,
};

const DEFAULT_PREDICTION_INPUTS: PredictionInputToggles = {
  recentSignals: true,
  ema:           true,
  rsi:           true,
  macd:          true,
  bos:           true,
  htfBias:       true,
  m15Filter:     true,
  structure:     true,
  zones:         true,
  liquidity:     true,
  vwap:          true,
  volumeSpike:   true,
};

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      soundEnabled: true,
      indicators: DEFAULT_INDICATORS,
      predictionInputs: DEFAULT_PREDICTION_INPUTS,
      customSpreadOverrides: {},
      strictAsianSession: true,
      setSoundEnabled(v) { set({ soundEnabled: v }); },
      toggleIndicator(key) {
        set(s => ({
          indicators: { ...s.indicators, [key]: !s.indicators[key] },
        }));
      },
      setIndicator(key, v) {
        set(s => ({
          indicators: { ...s.indicators, [key]: v },
        }));
      },
      setPredictionInput(key, v) {
        set(s => ({
          predictionInputs: { ...s.predictionInputs, [key]: v },
        }));
      },
      togglePredictionInput(key) {
        set(s => ({
          predictionInputs: { ...s.predictionInputs, [key]: !s.predictionInputs[key] },
        }));
      },
      setCustomSpread(symbol, pips) {
        set(s => ({
          customSpreadOverrides: { ...s.customSpreadOverrides, [symbol.toUpperCase().replace('/', '')]: pips },
        }));
      },
      setStrictAsianSession(v) { set({ strictAsianSession: v }); },
    }),
    {
      name: 'dc_settings',
      version: 3,
      partialize: (s) => ({
        soundEnabled: s.soundEnabled,
        indicators: s.indicators,
        predictionInputs: s.predictionInputs,
        customSpreadOverrides: s.customSpreadOverrides,
        strictAsianSession: s.strictAsianSession,
      }),
      migrate: (persisted: unknown) => {
        const p = (persisted ?? {}) as Partial<SettingsState>;
        return {
          ...p,
          predictionInputs: p.predictionInputs ?? DEFAULT_PREDICTION_INPUTS,
          customSpreadOverrides: p.customSpreadOverrides ?? {},
          strictAsianSession: p.strictAsianSession ?? true,
        } as SettingsState;
      },
    }
  )
);
