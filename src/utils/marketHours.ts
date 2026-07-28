export type ForexSession = 'sydney' | 'tokyo' | 'london' | 'new_york' | 'closed';

export function isForexMarketOpen(): boolean {
  const now = new Date();
  const day = now.getUTCDay();
  const minutesUTC = now.getUTCHours() * 60 + now.getUTCMinutes();

  if (day === 6) return false;
  if (day === 0 && minutesUTC < 22 * 60) return false;
  if (day === 5 && minutesUTC >= 22 * 60) return false;
  return true;
}

export function getCurrentSession(): ForexSession {
  if (!isForexMarketOpen()) return 'closed';
  const now = new Date();
  const t   = now.getUTCHours() * 60 + now.getUTCMinutes();

  if (t >= 12 * 60 && t < 21 * 60) return 'new_york';
  if (t >= 7  * 60 && t < 16 * 60) return 'london';
  if (t >= 0        && t < 9  * 60) return 'tokyo';
  if (t >= 22 * 60  || t < 7  * 60) return 'sydney';
  return 'closed';
}

export function sessionLabel(session: ForexSession): string {
  const labels: Record<ForexSession, string> = {
    sydney:   'Sydney',
    tokyo:    'Tokyo',
    london:   'London',
    new_york: 'New York',
    closed:   'Closed',
  };
  return labels[session];
}
