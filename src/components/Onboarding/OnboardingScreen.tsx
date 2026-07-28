import { AlertTriangle, Settings, Key } from 'lucide-react';

interface Props {
  onOpenSettings: () => void;
}

export default function OnboardingScreen({ onOpenSettings }: Props) {
  return (
    <div className="flex flex-col items-center justify-center h-full px-6 text-center">
      <div className="w-16 h-16 rounded-2xl bg-blue-600/20 border border-blue-500/40 flex items-center justify-center mb-6">
        <AlertTriangle size={28} className="text-blue-400" />
      </div>

      <h2 className="text-white font-bold text-xl mb-2">Forex/Stock Data Required</h2>
      <p className="text-slate-400 text-sm leading-relaxed mb-6 max-w-xs">
        For forex pairs and stocks, you need at least one API key.
        Crypto pairs (BTC, ETH, etc.) work without any keys.
      </p>

      <div className="w-full max-w-xs space-y-3 mb-8">
        <div className="bg-slate-800/60 border border-slate-700 rounded-xl p-4 text-left">
          <div className="flex items-center gap-2 mb-2">
            <Key size={14} className="text-yellow-400" />
            <span className="text-slate-200 text-sm font-medium">TwelveData</span>
            <span className="text-xs text-slate-500">(recommended)</span>
          </div>
          <p className="text-slate-500 text-xs">
            Free tier: 800 API calls/day. Supports 50+ forex pairs.
          </p>
        </div>
        <div className="bg-slate-800/60 border border-slate-700 rounded-xl p-4 text-left">
          <div className="flex items-center gap-2 mb-2">
            <Key size={14} className="text-green-400" />
            <span className="text-slate-200 text-sm font-medium">Finnhub</span>
          </div>
          <p className="text-slate-500 text-xs">
            Free tier: 60 calls/minute. Forex via OANDA feed.
          </p>
        </div>
      </div>

      <button
        onClick={onOpenSettings}
        className="flex items-center gap-2 px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-xl transition-colors"
      >
        <Settings size={16} />
        Open Settings
      </button>
    </div>
  );
}
