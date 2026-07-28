import { useCallback } from 'react';

let audioCtx: AudioContext | null = null;

function getAudioCtx(): AudioContext {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
  }
  return audioCtx;
}

function playTone(freq1: number, freq2: number, duration = 0.15) {
  try {
    const ctx  = getAudioCtx();
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.2, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration * 2);
    gain.connect(ctx.destination);

    [freq1, freq2].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, ctx.currentTime + i * duration);
      osc.connect(gain);
      osc.start(ctx.currentTime + i * duration);
      osc.stop(ctx.currentTime + i * duration + duration);
    });
  } catch { /* ignore — user gesture not yet received */ }
}

export function useAudioAlert() {
  const playBullish = useCallback(() => {
    playTone(523, 659); // C5 → E5
  }, []);

  const playBearish = useCallback(() => {
    playTone(659, 494); // E5 → B4
  }, []);

  return { playBullish, playBearish };
}
