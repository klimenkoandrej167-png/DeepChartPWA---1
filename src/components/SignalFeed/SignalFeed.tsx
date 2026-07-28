import { useState } from 'react';
import { useSignalStore, selectSignalsByCategory } from '../../store/signalStore';
import { useChartStore } from '../../store/chartStore';
import { PATTERN_CATEGORY, type SignalCategory } from '../../types/pattern';
import SignalTile from './SignalTile';
import type { PatternDirection } from '../../types/pattern';
import { Trash2, ChevronDown, ChevronUp } from 'lucide-react';
import { cn } from '../../utils/format';

type Filter = 'all' | PatternDirection | SignalCategory;
type Scope  = 'pair' | 'global';

export default function SignalFeed() {
  const signals       = useSignalStore(s => s.signals);
  const clearSignals  = useSignalStore(s => s.clearSignals);
  const clearForPair  = useSignalStore(s => s.clearSignalsForPair);
  const symbol        = useChartStore(s => s.symbol);
  const interval      = useChartStore(s => s.interval);

  const [filter,    setFilter]    = useState<Filter>('all');
  const [scope,     setScope]     = useState<Scope>('pair');
  const [collapsed, setCollapsed] = useState(false);

  const scoped = scope === 'pair'
    ? signals.filter(s => s.symbol === symbol && s.interval === interval)
    : signals;

  const filtered = (() => {
    if (filter === 'all') return scoped;
    if (filter === 'pattern' || filter === 'strategy' || filter === 'level') {
      return selectSignalsByCategory(scoped, filter);
    }
    return scoped.filter(s => s.pattern.direction === filter);
  })();

  const filterBtns: { label: string; value: Filter }[] = [
    { label: 'All',       value: 'all'       },
    { label: 'Bullish',   value: 'bullish'   },
    { label: 'Bearish',   value: 'bearish'   },
    { label: 'Neutral',   value: 'neutral'   },
  ];

  const catBtns: { label: string; value: Filter }[] = [
    { label: 'Patterns',   value: 'pattern'  },
    { label: 'Strategies', value: 'strategy' },
    { label: 'Levels',     value: 'level'    },
  ];

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-700/50 flex-shrink-0">
        <h2 className="text-white font-semibold text-sm">
          Signals{' '}
          <span className="text-slate-500 font-normal ml-1">{filtered.length}</span>
        </h2>
        <div className="flex items-center gap-1">
          <button
            onClick={() => scope === 'pair' ? clearForPair(symbol, interval) : clearSignals()}
            className="text-slate-500 hover:text-slate-300 transition-colors p-1"
            title="Clear signals"
          >
            <Trash2 size={14} />
          </button>
          <button
            onClick={() => setCollapsed(c => !c)}
            className="text-slate-500 hover:text-slate-300 transition-colors p-1"
            title={collapsed ? 'Show signals' : 'Hide signals'}
          >
            {collapsed ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
          </button>
        </div>
      </div>

      {!collapsed && (
        <>
          {/* Scope tabs */}
          <div className="flex gap-1 px-3 pt-2 flex-shrink-0">
            {(['pair', 'global'] as Scope[]).map(sc => (
              <button
                key={sc}
                onClick={() => setScope(sc)}
                className={cn(
                  'text-xs px-2.5 py-1 rounded-full transition-colors',
                  scope === sc
                    ? 'bg-slate-600 text-white'
                    : 'text-slate-500 hover:text-slate-300 bg-slate-800/60',
                )}
              >
                {sc === 'pair' ? `${symbol} · ${interval}` : 'All pairs'}
              </button>
            ))}
          </div>

          {/* Direction filters */}
          <div className="flex gap-1 px-3 py-2 flex-shrink-0">
            {filterBtns.map(btn => (
              <button
                key={btn.value}
                onClick={() => setFilter(btn.value)}
                className={cn(
                  'text-xs px-2.5 py-1 rounded-full transition-colors',
                  filter === btn.value
                    ? 'bg-blue-600 text-white'
                    : 'text-slate-400 hover:text-slate-200 bg-slate-800',
                )}
              >
                {btn.label}
              </button>
            ))}
          </div>

          {/* Category filters */}
          <div className="flex gap-1 px-3 pb-2 border-b border-slate-700/30 flex-shrink-0">
            {catBtns.map(btn => (
              <button
                key={btn.value}
                onClick={() => setFilter(btn.value)}
                className={cn(
                  'text-xs px-2.5 py-1 rounded-full transition-colors',
                  filter === btn.value
                    ? 'bg-blue-600 text-white'
                    : 'text-slate-400 hover:text-slate-200 bg-slate-800',
                )}
              >
                {btn.label}
              </button>
            ))}
          </div>

          {/* List */}
          <div className="flex-1 overflow-y-auto px-3 py-2 space-y-2">
            {filtered.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-40 text-slate-500">
                <p className="text-sm">No signals yet</p>
                <p className="text-xs mt-1">Patterns will appear as they are detected</p>
              </div>
            ) : (
              filtered.map(signal => {
                const cat = PATTERN_CATEGORY[signal.pattern.type];
                const borderColor = cat === 'pattern' ? 'border-l-blue-500' : cat === 'strategy' ? 'border-l-indigo-500' : 'border-l-amber-500';
                return (
                  <div key={signal.id} className={cn('border-l-2', borderColor)}>
                    <SignalTile signal={signal} />
                  </div>
                );
              })
            )}
          </div>
        </>
      )}

      {collapsed && (
        <div className="px-4 py-3 text-slate-500 text-xs text-center">
          {filtered.length} signal{filtered.length !== 1 ? 's' : ''} hidden
        </div>
      )}
    </div>
  );
}
