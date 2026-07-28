export type ActivityWindow = 'breakout_favored' | 'reversal_favored' | 'neutral';

const LONDON_OPEN_START = 7 * 60,  LONDON_OPEN_END = 9 * 60;   // UTC, first 2h of London
const NY_OPEN_START     = 12 * 60, NY_OPEN_END     = 14 * 60;  // UTC, first 2h of New York

// Module 1 (impulse breakout / triggerScore) is favoured during session opens,
// Module 2 (sweep/CHoCH / liquidityScore) during the rest of the session.
export function getActivityWindow(now: Date = new Date()): ActivityWindow {
  const t = now.getUTCHours() * 60 + now.getUTCMinutes();
  const inLondonOpen = t >= LONDON_OPEN_START && t < LONDON_OPEN_END;
  const inNyOpen     = t >= NY_OPEN_START && t < NY_OPEN_END;
  if (inLondonOpen || inNyOpen) return 'breakout_favored';
  return 'reversal_favored';
}
