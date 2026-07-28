import { AIAnalysisSchema, type AIAnalysis } from '../types/ai';
import type { Candle } from '../types/candle';

// Alias auto-updates to the current GA model; avoids hard breakage on rotation cycles
const GEMINI_MODEL = 'gemini-flash-latest';

export const FALLBACK_ANALYSIS: AIAnalysis = {
  trend:          'sideways',
  confidence:     0,
  levels:         { support: 0, resistance: 0 },
  recommendation: 'wait',
  reasoning:      'AI analysis unavailable. Check your Gemini API key.',
};

function buildPrompt(symbol: string, candles: Candle[]): string {
  const last = candles.slice(-20);
  const ohlc = last.map(c =>
    `T=${c.time} O=${c.open.toFixed(4)} H=${c.high.toFixed(4)} L=${c.low.toFixed(4)} C=${c.close.toFixed(4)}`
  ).join('\n');
  const current = last[last.length - 1];

  return `You are an expert trading analyst. Analyze the following OHLC candlestick data for ${symbol} and return a JSON object matching this exact schema:
{
  "trend": "bullish" | "bearish" | "sideways",
  "confidence": number (0-100),
  "levels": { "support": number, "resistance": number },
  "recommendation": "buy" | "sell" | "wait",
  "reasoning": string (1-3 sentences),
  "keyLevels": number[] (optional, up to 5 price levels),
  "riskNote": string (optional)
}

OHLC data (last 20 candles):
${ohlc}

Current price: ${current.close.toFixed(4)}
Analyze trend, key levels, and give a trading recommendation.`;
}

async function callGeminiOnce(prompt: string, apiKey: string): Promise<AIAnalysis> {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`,
    {
      method: 'POST',
      headers: {
        'Content-Type':   'application/json',
        'x-goog-api-key': apiKey,
      },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          temperature:      0.1,
          maxOutputTokens:  1024,
          responseMimeType: 'application/json',
        },
      }),
      signal: AbortSignal.timeout(30_000),
    },
  );

  if (!res.ok) {
    const errText = await res.text();
    if (res.status === 401) {
      throw new Error('Gemini API key is invalid or not authorized. Check your key in Settings.');
    }
    if (res.status === 429) {
      throw new Error('Gemini quota exceeded. Try again later.');
    }
    throw new Error(`Gemini HTTP ${res.status}: ${errText.slice(0, 200)}`);
  }

  interface GeminiResp {
    candidates?: { content: { parts: { text: string }[] } }[];
  }
  const json = await res.json() as GeminiResp;
  const text = json.candidates?.[0]?.content?.parts?.[0]?.text ?? '';

  // Strip markdown fences if model ignores responseMimeType
  const clean = text
    .replace(/```json\s*/gi, '')
    .replace(/```\s*/g, '')
    .trim();

  let parsed: unknown;
  try {
    parsed = JSON.parse(clean);
  } catch {
    throw new Error('Gemini returned non-JSON response');
  }

  const validated = AIAnalysisSchema.safeParse(parsed);
  if (!validated.success) {
    console.warn('Gemini schema mismatch:', validated.error.issues);
    throw new Error('Gemini returned an unexpected response format. Try again.');
  }
  return validated.data;
}

const RETRYABLE = new Set([429, 500, 502, 503, 504]);

export async function runGeminiAnalysis(
  symbol: string,
  candles: Candle[],
  apiKey: string,
): Promise<AIAnalysis> {
  if (!apiKey) throw new Error('Gemini API key is not set');
  if (candles.length < 5) throw new Error('Not enough candles for analysis');

  const prompt = buildPrompt(symbol, candles);

  try {
    return await callGeminiOnce(prompt, apiKey);
  } catch (err) {
    if (err instanceof DOMException && err.name === 'TimeoutError') {
      throw new Error('Gemini timed out (30s)');
    }
    if (err instanceof Error && err.message.includes('invalid or not authorized')) throw err;

    const isRetryable =
      !(err instanceof Error) ||
      err.message.includes('non-JSON') ||
      err.message.includes('unexpected response format') ||
      RETRYABLE.has(parseInt(err.message.match(/HTTP (\d+)/)?.[1] ?? '0'));

    if (!isRetryable) throw err;

    await new Promise(r => setTimeout(r, 1500));
    try {
      return await callGeminiOnce(prompt, apiKey);
    } catch (err2) {
      if (err2 instanceof DOMException && err2.name === 'TimeoutError') {
        throw new Error('Gemini timed out (30s)');
      }
      throw err2;
    }
  }
}
