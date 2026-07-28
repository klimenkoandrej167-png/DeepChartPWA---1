import { useState, useEffect } from 'react';
import { usePriorityAlertStore } from '../../store/priorityAlertStore';
import { cn } from '../../utils/format';

export default function PriorityAlertTimer() {
  const alert = usePriorityAlertStore(s => s.current);
  const clear = usePriorityAlertStore(s => s.clear);
  const [secondsLeft, setSecondsLeft] = useState(0);

  useEffect(() => {
    if (!alert) {
      setSecondsLeft(0);
      return;
    }

    function update() {
      const remaining = Math.max(0, Math.floor((alert!.expiresAt - Date.now()) / 1000));
      setSecondsLeft(remaining);
      if (remaining <= 0) clear();
    }

    update();
    const id = setInterval(update, 1000);
    return () => clearInterval(id);
  }, [alert, clear]);

  if (!alert || secondsLeft <= 0) return null;

  const isUp = alert.direction === 'up';
  const m = Math.floor(secondsLeft / 60);
  const s = secondsLeft % 60;
  const label = `${m}:${String(s).padStart(2, '0')}`;

  return (
    <div
      className={cn(
        'flex items-center gap-1 rounded-full px-2 py-0.5 border flex-shrink-0 animate-pulse',
        isUp
          ? 'bg-green-900/60 border-green-700/60'
          : 'bg-red-900/60 border-red-700/60',
      )}
      title={`Priority ${isUp ? 'UP' : 'DOWN'} signal · ${alert.probability}% · expires in ${label}`}
    >
      <span className={cn(
        'font-mono text-[10px] font-bold',
        isUp ? 'text-green-300' : 'text-red-300',
      )}>
        {isUp ? '▲' : '▼'}{label}
      </span>
    </div>
  );
}
