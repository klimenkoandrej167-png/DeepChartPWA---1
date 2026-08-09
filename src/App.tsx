import { useState } from 'react';
import { Settings, BarChart2, Bell, AlertCircle, SlidersHorizontal, PanelRightClose, PanelRightOpen } from 'lucide-react';

import ChartWidget from './components/Chart/ChartWidget';
import CandleTimer from './components/Chart/CandleTimer';
import IntervalSelector from './components/Chart/IntervalSelector';
import PatternOverlay from './components/Chart/PatternOverlay';
import AIOverlay from './components/Chart/AIOverlay';
import BOSLayer from './components/Chart/BOSLayer';
import DirectionIndicator from './components/Chart/DirectionIndicator';
import PredictionAccuracyBadge from './components/Chart/PredictionAccuracyBadge';
import PriorityAlertTimer from './components/Chart/PriorityAlertTimer';
import { MarketStructureBadge } from './components/Chart/MarketStructureBadge';

import SignalFeed from './components/SignalFeed/SignalFeed';
import AIButton from './components/AIAnalysis/AIButton';
import SettingsModal from './components/Settings/SettingsModal';
import StrategiesModal from './components/Strategies/StrategiesModal';
import SymbolSelector from './components/Symbols/SymbolSelector';
import PriorityAlertBanner from './components/Notifications/PriorityAlertBanner';
import OnboardingScreen from './components/Onboarding/OnboardingScreen';
import ConnectionStatus from './components/Status/ConnectionStatus';
import RSIPanel from './components/Indicators/RSIPanel';

import { useDataSource } from './hooks/useDataSource';
import { usePatternDetection } from './hooks/usePatternDetection';
import { useHtfContext } from './hooks/useHtfContext';
import { useForexMarketHours } from './hooks/useForexMarketHours';

import { useChartStore } from './store/chartStore';
import { useKeysStore } from './store/keysStore';
import { useSignalStore } from './store/signalStore';
import { isCrypto } from './utils/symbolUtils';
import { cn } from './utils/format';

import type { AIAnalysis } from './types/ai';

type Tab = 'chart' | 'signals';

export default function App() {
  const [tab,            setTab]            = useState<Tab>('chart');
  const [settingsOpen,   setSettingsOpen]   = useState(false);
  const [strategiesOpen, setStrategiesOpen] = useState(false);
  const [sidebarOpen,    setSidebarOpen]    = useState(true);
  const [aiResult,       setAiResult]       = useState<AIAnalysis | null>(null);
  const [aiError,        setAiError]        = useState<string | null>(null);

  const symbol       = useChartStore(s => s.symbol);
  const sourceStatus = useChartStore(s => s.sourceStatus);
  const signalCount  = useSignalStore(s => s.signals.length);
  const twelvedataKey = useKeysStore(s => s.twelvedataKey);
  const finnhubKey    = useKeysStore(s => s.finnhubKey);

  useDataSource();
  usePatternDetection();
  useHtfContext();

  const { isOpen: forexOpen } = useForexMarketHours();
  const showForexWarning    = !isCrypto(symbol) && !forexOpen;
  const showOnboardingBanner =
    !isCrypto(symbol) && !twelvedataKey && !finnhubKey && sourceStatus === 'error';

  return (
    /*
     * On mobile: full-height flex-col. The nav is fixed at the bottom so it
     * never scrolls away; main gets padding-bottom to avoid content hiding
     * behind the fixed bar. On desktop: flex-row with collapsible sidebar.
     */
    <div className="flex flex-col h-screen bg-slate-950 overflow-hidden select-none md:flex-row">

      {/* ── Chart column ── */}
      <div className="flex flex-col flex-1 min-w-0 h-full">

        {/* Row 1: Logo · Symbol · Status · Action buttons */}
        <header className="flex items-center gap-2 px-3 py-2 bg-slate-900 border-b border-slate-700/50 flex-shrink-0">
          <div className="flex items-center gap-1.5 mr-1 flex-shrink-0">
            <BarChart2 size={18} className="text-blue-400" />
            <span className="text-white font-bold text-sm tracking-tight hidden xs:block">DeepChart</span>
          </div>

          <SymbolSelector />
          <div className="flex-1" />
          <ConnectionStatus />

          <button
            onClick={() => setStrategiesOpen(true)}
            className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-700 rounded-lg transition-colors flex-shrink-0"
            title="Strategies"
          >
            <SlidersHorizontal size={16} />
          </button>
          <button
            onClick={() => setSettingsOpen(true)}
            className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-700 rounded-lg transition-colors flex-shrink-0"
            title="Settings"
          >
            <Settings size={16} />
          </button>

          {/* Desktop only: toggle sidebar */}
          <button
            onClick={() => setSidebarOpen(o => !o)}
            className="hidden md:flex p-1.5 text-slate-400 hover:text-white hover:bg-slate-700 rounded-lg transition-colors flex-shrink-0"
            title={sidebarOpen ? 'Hide signals panel' : 'Show signals panel'}
          >
            {sidebarOpen ? <PanelRightClose size={16} /> : <PanelRightOpen size={16} />}
          </button>
        </header>

        {/* Row 2: Timeframes + direction indicators inline */}
        <div className="flex items-center gap-2 px-3 py-1 bg-slate-900 border-b border-slate-700/30 flex-shrink-0 overflow-x-auto">
          <IntervalSelector />
          {/* Separator */}
          <div className="w-px h-4 bg-slate-700/60 flex-shrink-0" />
          <DirectionIndicator />
          <PredictionAccuracyBadge />
          <PriorityAlertTimer />
          <MarketStructureBadge />
        </div>

        {/* Row 3: RSI + AI button */}
        <div className="flex items-center gap-2 px-3 py-1.5 bg-slate-900/60 border-b border-slate-700/30 flex-shrink-0">
          <RSIPanel />
          <div className="flex-1" />
          {aiError && (
            <div className="flex items-center gap-1 text-red-400 text-xs min-w-0">
              <AlertCircle size={12} className="flex-shrink-0" />
              <span className="truncate max-w-[140px]">{aiError}</span>
              <button onClick={() => setAiError(null)} className="hover:text-red-300 ml-1 flex-shrink-0">×</button>
            </div>
          )}
          <AIButton
            onResult={r => { setAiResult(r); setAiError(null); }}
            onError={e  => { setAiError(e);  setAiResult(null); }}
          />
        </div>

        {/* Forex closed warning */}
        {showForexWarning && (
          <div className="bg-yellow-900/40 border-b border-yellow-700/50 px-3 py-1.5 flex items-center gap-2 flex-shrink-0">
            <AlertCircle size={13} className="text-yellow-400 flex-shrink-0" />
            <span className="text-yellow-300 text-xs">Forex market is currently closed. Prices may be stale.</span>
          </div>
        )}

        {/* Main content — on mobile padded so content doesn't hide under fixed nav */}
        <main className="flex-1 overflow-hidden pb-[49px] md:pb-0">
          {tab === 'chart' ? (
            <div className="relative h-full">
              <ChartWidget />
              <CandleTimer />
              <PatternOverlay />
              <BOSLayer />
              {aiResult && (
                <AIOverlay analysis={aiResult} onClear={() => setAiResult(null)} />
              )}
              {showOnboardingBanner && (
                <OnboardingScreen onOpenSettings={() => setSettingsOpen(true)} />
              )}
            </div>
          ) : (
            <SignalFeed />
          )}
        </main>
      </div>

      {/* ── Desktop sidebar: Signals (collapsible) ── */}
      <aside
        className={cn(
          'hidden md:flex flex-col flex-shrink-0 overflow-hidden transition-all duration-300 ease-in-out',
          sidebarOpen
            ? 'w-[360px] border-l border-slate-700/50'
            : 'w-0 border-l-0',
        )}
      >
        {sidebarOpen && <SignalFeed />}
      </aside>

      {/* ── Mobile bottom nav — fixed so it never scrolls away ── */}
      <nav className="fixed bottom-0 left-0 right-0 flex border-t border-slate-700/50 bg-slate-900 md:hidden z-30">
        <button
          onClick={() => setTab('chart')}
          className={cn(
            'flex-1 flex flex-col items-center gap-0.5 py-2.5 transition-colors',
            tab === 'chart' ? 'text-blue-400' : 'text-slate-500 hover:text-slate-300',
          )}
        >
          <BarChart2 size={18} />
          <span className="text-xs">Chart</span>
        </button>

        <button
          onClick={() => setTab('signals')}
          className={cn(
            'flex-1 flex flex-col items-center gap-0.5 py-2.5 transition-colors relative',
            tab === 'signals' ? 'text-blue-400' : 'text-slate-500 hover:text-slate-300',
          )}
        >
          <Bell size={18} />
          <span className="text-xs">Signals</span>
          {signalCount > 0 && (
            <span className="absolute top-2 right-1/4 bg-red-500 text-white text-xs rounded-full w-4 h-4 flex items-center justify-center font-bold">
              {signalCount > 9 ? '9+' : signalCount}
            </span>
          )}
        </button>
      </nav>

      <PriorityAlertBanner />

      {settingsOpen   && <SettingsModal   onClose={() => setSettingsOpen(false)} />}
      {strategiesOpen && <StrategiesModal onClose={() => setStrategiesOpen(false)} />}
    </div>
  );
}
