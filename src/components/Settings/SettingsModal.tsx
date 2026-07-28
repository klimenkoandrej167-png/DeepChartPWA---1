import { useState } from 'react';
import { X, Eye, EyeOff } from 'lucide-react';
import { useKeysStore } from '../../store/keysStore';
import { useSettingsStore, type IndicatorToggles, type PredictionInputToggles } from '../../store/settingsStore';
import { useChartStore } from '../../store/chartStore';
import { estimateSpread, getDefaultSpreadPips } from '../../utils/spreadEstimate';
import { isCrypto, formatSymbolDisplay } from '../../utils/symbolUtils';
import { cn } from '../../utils/format';

interface Props {
  onClose: () => void;
}

function KeyField({
  label, value, onChange, placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
}) {
  const [show, setShow] = useState(false);
  return (
    <div>
      <label className="block text-xs text-slate-400 mb-1">{label}</label>
      <div className="flex gap-2">
        <input
          type={show ? 'text' : 'password'}
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder={placeholder}
          className="flex-1 bg-slate-700/50 border border-slate-600 text-white text-sm rounded-lg px-3 py-2 placeholder-slate-500 focus:outline-none focus:border-blue-500 font-mono"
        />
        <button
          type="button"
          onClick={() => setShow(s => !s)}
          className="px-2 text-slate-400 hover:text-slate-200"
        >
          {show ? <EyeOff size={16} /> : <Eye size={16} />}
        </button>
      </div>
    </div>
  );
}

const INDICATOR_LABELS: Record<keyof IndicatorToggles, string> = {
  ema20:            'EMA 20',
  ema50:            'EMA 50',
  ema200:           'EMA 200',
  rsi:              'RSI (14)',
  atr:              'ATR (14)',
  macd:             'MACD',
  bb:               'Bollinger Bands',
  fibonacci:        'Fibonacci',
  trendStructure:   'Trend Structure',
  supportResistance:'Support / Resistance',
  orderBlocks:      'Order Blocks',
  fvg:              'Fair Value Gaps',
  rejectionBlocks:  'Rejection Blocks',
  bos:              'Break of Structure',
};

const PREDICTION_LABELS: Record<keyof PredictionInputToggles, string> = {
  recentSignals: 'Recent candlestick signals',
  ema:           'EMA 9/21 (M1 trigger)',
  rsi:           'RSI 7-9 (short period)',
  macd:          'MACD histogram',
  bos:           'Break of Structure',
  htfBias:       'H1 trend bias',
  m15Filter:     'M15 confirmation filter',
  structure:     'M5/M15 structure (HH/HL/LH/LL)',
  zones:         'Order Blocks / FVG / S-R zones',
  liquidity:     'Liquidity sweeps',
  vwap:          'VWAP',
  volumeSpike:   'Volume spike / impulse velocity',
};

export default function SettingsModal({ onClose }: Props) {
  const { geminiKey, twelvedataKey, finnhubKey, setGeminiKey, setTwelvedataKey, setFinnhubKey } = useKeysStore();
  const { soundEnabled, indicators, setSoundEnabled, toggleIndicator, predictionInputs, togglePredictionInput, customSpreadOverrides, setCustomSpread, strictAsianSession, setStrictAsianSession } = useSettingsStore();
  const { activeSources } = useChartStore();
  const chartSymbol = useChartStore(s => s.symbol);

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-slate-900 border border-slate-700 rounded-t-2xl sm:rounded-2xl w-full sm:max-w-md max-h-[90vh] flex flex-col shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-700/50">
          <h2 className="text-white font-semibold">Settings</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-white p-1">
            <X size={18} />
          </button>
        </div>

        <div className="overflow-y-auto flex-1 px-4 py-4 space-y-5">
          {/* API Keys */}
          <section>
            <h3 className="text-slate-300 text-xs font-semibold uppercase tracking-wider mb-3">API Keys</h3>
            <div className="space-y-3">
              <KeyField label="Gemini AI" value={geminiKey} onChange={setGeminiKey} placeholder="AIzaSy..." />
              <KeyField label="TwelveData" value={twelvedataKey} onChange={setTwelvedataKey} placeholder="your_key_here" />
              <KeyField label="Finnhub" value={finnhubKey} onChange={setFinnhubKey} placeholder="your_key_here" />
            </div>
            <p className="text-slate-600 text-xs mt-2">Keys are stored only for this browser tab session (sessionStorage) — they are cleared when you close the tab.</p>
          </section>

          {/* Data Source Status */}
          {activeSources.length > 0 && (
            <section>
              <h3 className="text-slate-300 text-xs font-semibold uppercase tracking-wider mb-2">Active Source</h3>
              <div className="flex gap-2">
                {activeSources.map(src => (
                  <span key={src} className="text-xs px-2 py-1 bg-blue-900/40 text-blue-300 border border-blue-700/40 rounded-full">
                    {src}
                  </span>
                ))}
              </div>
            </section>
          )}

          {/* Sound */}
          <section>
            <h3 className="text-slate-300 text-xs font-semibold uppercase tracking-wider mb-3">Alerts</h3>
            <div className="flex items-center justify-between">
              <span className="text-slate-300 text-sm">Sound Alerts</span>
              <button
                onClick={() => setSoundEnabled(!soundEnabled)}
                className={cn(
                  'relative w-11 h-6 rounded-full transition-colors',
                  soundEnabled ? 'bg-blue-600' : 'bg-slate-600',
                )}
              >
                <span className={cn(
                  'absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform',
                  soundEnabled ? 'translate-x-5' : 'translate-x-0',
                )} />
              </button>
            </div>
          </section>

          {/* Indicators */}
          <section>
            <h3 className="text-slate-300 text-xs font-semibold uppercase tracking-wider mb-3">Indicators</h3>
            <div className="space-y-1.5">
              {(Object.keys(INDICATOR_LABELS) as (keyof IndicatorToggles)[]).map(key => (
                <div key={key} className="flex items-center justify-between py-1">
                  <span className="text-slate-300 text-sm">{INDICATOR_LABELS[key]}</span>
                  <button
                    onClick={() => toggleIndicator(key)}
                    className={cn(
                      'relative w-11 h-6 rounded-full transition-colors',
                      indicators[key] ? 'bg-blue-600' : 'bg-slate-600',
                    )}
                  >
                    <span className={cn(
                      'absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform',
                      indicators[key] ? 'translate-x-5' : 'translate-x-0',
                    )} />
                  </button>
                </div>
              ))}
            </div>
          </section>

          {/* Prediction inputs — what factors to consider in direction prediction */}
          <section>
            <h3 className="text-slate-300 text-xs font-semibold uppercase tracking-wider mb-1">
              Prediction Factors
            </h3>
            <p className="text-slate-500 text-xs mb-3">
              Affects probability calculation only, not chart display.
            </p>
            <div className="space-y-1.5">
              {(Object.keys(PREDICTION_LABELS) as (keyof PredictionInputToggles)[]).map(key => (
                <div key={key} className="flex items-center justify-between py-1">
                  <span className="text-slate-300 text-sm">{PREDICTION_LABELS[key]}</span>
                  <button
                    onClick={() => togglePredictionInput(key)}
                    className={cn(
                      'relative w-11 h-6 rounded-full transition-colors',
                      predictionInputs[key] ? 'bg-blue-600' : 'bg-slate-600',
                    )}
                  >
                    <span className={cn(
                      'absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform',
                      predictionInputs[key] ? 'translate-x-5' : 'translate-x-0',
                    )} />
                  </button>
                </div>
              ))}
            </div>
          </section>

          {/* --- Spread & Session Filters --- */}
          <section className="space-y-3">
            <h3 className="text-slate-300 text-xs font-semibold uppercase tracking-wider">
              Spread &amp; Session Filters
            </h3>

            {/* Spread override for current symbol */}
            {!isCrypto(chartSymbol) && (
              <div className="bg-slate-800/50 border border-slate-700/40 rounded-lg px-3 py-2.5 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-slate-300 text-sm">
                    {formatSymbolDisplay(chartSymbol)} spread (pips)
                  </span>
                  <span className="text-slate-500 text-[10px]">est. {estimateSpread(chartSymbol, 1, customSpreadOverrides).toFixed(5)}</span>
                </div>
                <input
                  type="number"
                  step="0.1"
                  min="0"
                  defaultValue={customSpreadOverrides[chartSymbol.toUpperCase().replace('/', '')] ?? getDefaultSpreadPips(chartSymbol)}
                  onBlur={e => setCustomSpread(chartSymbol, parseFloat(e.target.value) || 0)}
                  className="w-full bg-slate-900 text-white text-sm rounded-lg px-2.5 py-1.5 placeholder-slate-500 focus:outline-none border border-slate-700"
                />
                <p className="text-slate-600 text-[9px]">Approx. spread used for trade filtering. Override with your broker's actual spread.</p>
              </div>
            )}

            {/* Strict Asian session toggle */}
            <div className="flex items-center justify-between">
              <div>
                <span className="text-slate-300 text-sm">Strict Asian session</span>
                <p className="text-slate-600 text-[9px] mt-0.5">Raise alert threshold for EUR/GBP pairs during Tokyo session (low liquidity)</p>
              </div>
              <button
                onClick={() => setStrictAsianSession(!strictAsianSession)}
                className={cn(
                  'relative w-10 h-5 rounded-full transition-colors flex-shrink-0',
                  strictAsianSession ? 'bg-blue-600' : 'bg-slate-600',
                )}
              >
                <span className={cn(
                  'absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full transition-transform',
                  strictAsianSession ? 'translate-x-5' : 'translate-x-0',
                )} />
              </button>
            </div>
          </section>
        </div>

        <div className="px-4 py-3 border-t border-slate-700/50">
          <button
            onClick={onClose}
            className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-xl transition-colors"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
