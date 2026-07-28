import { useState } from 'react';
import { Brain, Loader2 } from 'lucide-react';
import { runGeminiAnalysis } from '../../api/gemini';
import { useKeysStore } from '../../store/keysStore';
import { useChartStore } from '../../store/chartStore';
import type { AIAnalysis } from '../../types/ai';

interface Props {
  onResult: (r: AIAnalysis) => void;
  onError:  (e: string) => void;
}

export default function AIButton({ onResult, onError }: Props) {
  const [loading, setLoading] = useState(false);
  const geminiKey = useKeysStore(s => s.geminiKey);
  const candles   = useChartStore(s => s.candles);
  const symbol    = useChartStore(s => s.symbol);

  async function handleClick() {
    if (!geminiKey) {
      onError('Gemini API key is not set. Add it in Settings.');
      return;
    }
    if (candles.length < 5) {
      onError('Not enough chart data loaded yet.');
      return;
    }

    setLoading(true);
    try {
      const result = await runGeminiAnalysis(symbol, candles, geminiKey);
      onResult(result);
    } catch (err) {
      onError(err instanceof Error ? err.message : 'AI analysis failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <button
      onClick={handleClick}
      disabled={loading}
      className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-800 disabled:opacity-60 text-white text-xs font-medium rounded-lg transition-colors"
    >
      {loading
        ? <Loader2 size={13} className="animate-spin" />
        : <Brain size={13} />
      }
      {loading ? 'Analyzing…' : 'AI'}
    </button>
  );
}
