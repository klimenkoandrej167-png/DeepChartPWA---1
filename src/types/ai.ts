import { z } from 'zod';

export const AIAnalysisSchema = z.object({
  trend: z.enum(['bullish', 'bearish', 'sideways']),
  confidence: z.number().min(0).max(100),
  levels: z.object({
    support: z.number(),
    resistance: z.number(),
  }),
  recommendation: z.enum(['buy', 'sell', 'wait']),
  reasoning: z.string().min(10),
  keyLevels: z.array(z.number()).optional(),
  riskNote: z.string().optional(),
});

export type AIAnalysis = z.infer<typeof AIAnalysisSchema>;

export interface AIState {
  loading: boolean;
  result: AIAnalysis | null;
  error: string | null;
}
