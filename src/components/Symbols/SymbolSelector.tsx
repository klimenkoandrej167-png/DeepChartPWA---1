import { useState, useRef, useEffect } from 'react';
import { ChevronDown, TrendingUp } from 'lucide-react';
import { useChartStore } from '../../store/chartStore';
import { isCrypto, formatSymbolDisplay } from '../../utils/symbolUtils';
import { cn } from '../../utils/format';

const CRYPTO_SYMBOLS = [
  'BTCUSDT','ETHUSDT','BNBUSDT','SOLUSDT','XRPUSDT',
  'ADAUSDT','DOGEUSDT','AVAXUSDT','MATICUSDT','LINKUSDT',
  'LTCUSDT','DOTUSDT','UNIUSDT','ATOMUSDT','NEARUSDT',
];

const FOREX_SYMBOLS = [
  'EURUSD','GBPUSD','USDJPY','USDCHF','AUDUSD',
  'USDCAD','NZDUSD','EURGBP','EURJPY','GBPJPY',
  'XAUUSD','XAGUSD',
];

export default function SymbolSelector() {
  const symbol    = useChartStore(s => s.symbol);
  const setSymbol = useChartStore(s => s.setSymbol);
  const [open, setOpen]   = useState(false);
  const [tab,  setTab]    = useState<'crypto' | 'forex'>(isCrypto(symbol) ? 'crypto' : 'forex');
  const [query, setQuery] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handleOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    function handleEscape(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', handleOutside);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handleOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [open]);

  const list = (tab === 'crypto' ? CRYPTO_SYMBOLS : FOREX_SYMBOLS).filter(s =>
    s.toLowerCase().includes(query.toLowerCase())
  );

  return (
    <div className="relative" ref={containerRef}>
      <button
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-1.5 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-lg px-3 py-1.5 transition-colors"
      >
        <TrendingUp size={13} className="text-blue-400" />
        <span className="text-white font-medium text-sm">
          {formatSymbolDisplay(symbol)}
        </span>
        <ChevronDown size={13} className="text-slate-400" />
      </button>

      {open && (
        <div className="absolute top-full left-0 mt-1 w-64 max-w-[calc(100vw-1.5rem)] bg-slate-900 border border-slate-700 rounded-xl shadow-2xl z-50 overflow-hidden">
          {/* Tabs */}
          <div className="flex border-b border-slate-700">
            {(['crypto', 'forex'] as const).map(t => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={cn(
                  'flex-1 py-2 text-xs font-medium transition-colors',
                  tab === t ? 'text-blue-400 border-b-2 border-blue-500' : 'text-slate-400 hover:text-slate-200',
                )}
              >
                {t.charAt(0).toUpperCase() + t.slice(1)}
              </button>
            ))}
          </div>

          {/* Search */}
          <div className="px-3 py-2 border-b border-slate-700/50">
            <input
              type="text"
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Search..."
              className="w-full bg-slate-800 text-white text-sm rounded-lg px-2.5 py-1.5 placeholder-slate-500 focus:outline-none"
              autoFocus
            />
          </div>

          {/* List */}
          <div className="max-h-52 overflow-y-auto py-1">
            {list.map(sym => (
              <button
                key={sym}
                onClick={() => { setSymbol(sym); setOpen(false); setQuery(''); }}
                className={cn(
                  'w-full text-left px-3 py-2 text-sm transition-colors',
                  sym === symbol
                    ? 'bg-blue-600/20 text-blue-300'
                    : 'text-slate-300 hover:bg-slate-800 hover:text-white',
                )}
              >
                <span className="font-medium">{formatSymbolDisplay(sym)}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
