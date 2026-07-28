import { useState, useEffect } from 'react';
import { usePriorityAlertStore } from '../../store/priorityAlertStore';
import { cn } from '../../utils/format';

export default function PriorityAlertBanner() {
  const alert = usePriorityAlertStore(s => s.current);
  const clear = usePriorityAlertStore(s => s.clear);
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!alert) {
      setVisible(false);
      return;
    }

    setVisible(true);

    function update() {
      const remaining = Math.max(0, Math.floor((alert!.expiresAt - Date.now()) / 1000));
      setSecondsLeft(remaining);
      if (remaining <= 0) {
        clear();
      }
    }

    update();
    const id = setInterval(update, 1000);
    return () => clearInterval(id);
  }, [alert, clear]);

  if (!alert || !visible) return null;

  const isUp = alert.direction === 'up';
  const m = Math.floor(secondsLeft / 60);
  const s = secondsLeft % 60;
  const timeLabel = `${m}:${String(s).padStart(2, '0')}`;

  return (
    <div className="fixed top-16 left-3 right-3 z-50 flex justify-center pointer-events-none">
      <div
        className={cn(
          'pointer-events-auto w-full max-w-md rounded-2xl border-2 shadow-2xl px-4 py-3',
          'backdrop-blur-md transition-all duration-300',
          isUp
            ? 'bg-green-900/80 border-green-500/60'
            : 'bg-red-900/80 border-red-500/60',
          visible ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-2',
        )}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className={cn(
              'text-3xl font-bold',
              isUp ? 'text-green-300' : 'text-red-300',
            )}>
              {isUp ? '▲' : '▼'}
            </span>
            <div>
              <p className={cn(
                'text-lg font-bold leading-tight',
                isUp ? 'text-green-200' : 'text-red-200',
              )}>
                {isUp ? 'UP' : 'DOWN'} · {alert.probability}%
                {alert.rr !== undefined && alert.rr > 0 && (
                  <span className="text-sm font-normal ml-1">R:R 1:{alert.rr.toFixed(1)}</span>
                )}
              </p>
              <p className="text-xs text-slate-300/80 leading-tight">
                {alert.reasonLabel}
              </p>
            </div>
          </div>
          <div className="text-right">
            <p className={cn(
              'font-mono text-2xl font-bold tabular-nums',
              isUp ? 'text-green-300' : 'text-red-300',
            )}>
              {timeLabel}
            </p>
            <p className="text-[10px] text-slate-400 uppercase tracking-wider">
              expiry
            </p>
          </div>
        </div>
        <div className="mt-2 h-1 rounded-full bg-slate-700/50 overflow-hidden">
          <div
            className={cn(
              'h-full rounded-full transition-all duration-1000 ease-linear',
              isUp ? 'bg-green-400' : 'bg-red-400',
            )}
            style={{ width: `${alert.recommendedExpirySeconds > 0 ? (secondsLeft / alert.recommendedExpirySeconds) * 100 : 0}%` }}
          />
        </div>
      </div>
    </div>
  );
}
