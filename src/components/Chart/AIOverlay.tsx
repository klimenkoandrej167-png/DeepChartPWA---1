import type { AIAnalysis } from '../../types/ai';
import { formatPrice } from '../../utils/format';

interface Props {
  analysis: AIAnalysis;
  onClear: () => void;
}

const trendColors = {
  bullish:  'text-green-400',
  bearish:  'text-red-400',
  sideways: 'text-yellow-400',
};

const recColors = {
  buy:  'bg-green-600 hover:bg-green-700',
  sell: 'bg-red-600 hover:bg-red-700',
  wait: 'bg-yellow-600 hover:bg-yellow-700',
};

export default function AIOverlay({ analysis, onClear }: Props) {
  return (
    <div className="absolute bottom-16 left-2 right-2 z-20 bg-slate-900/95 backdrop-blur-sm border border-slate-600 rounded-xl p-3 shadow-xl">
      <div className="flex items-start justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className="text-blue-400 text-xs font-semibold uppercase tracking-wider">AI Analysis</span>
          <span className={`text-sm font-bold ${trendColors[analysis.trend]}`}>
            {analysis.trend.toUpperCase()}
          </span>
          <span className="text-slate-500 text-xs">{analysis.confidence}%</span>
        </div>
        <button
          onClick={onClear}
          className="text-slate-500 hover:text-slate-300 text-lg leading-none"
        >
          ×
        </button>
      </div>

      <p className="text-slate-300 text-xs leading-relaxed mb-2">{analysis.reasoning}</p>

      <div className="flex items-center gap-3 mb-2">
        <div className="text-xs">
          <span className="text-slate-500">S: </span>
          <span className="text-green-400 font-mono">{formatPrice(analysis.levels.support)}</span>
        </div>
        <div className="text-xs">
          <span className="text-slate-500">R: </span>
          <span className="text-red-400 font-mono">{formatPrice(analysis.levels.resistance)}</span>
        </div>
      </div>

      <div className="flex items-center justify-between">
        {analysis.riskNote && (
          <p className="text-yellow-400/80 text-xs">{analysis.riskNote}</p>
        )}
        <span className={`ml-auto px-3 py-1 rounded text-xs font-bold text-white uppercase ${recColors[analysis.recommendation]}`}>
          {analysis.recommendation}
        </span>
      </div>
    </div>
  );
}
