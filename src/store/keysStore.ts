import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

interface KeysState {
  geminiKey:      string;
  twelvedataKey:  string;
  finnhubKey:     string;
  derivAppId:     string;
  derivToken:     string;
  setGeminiKey:      (key: string) => void;
  setTwelvedataKey:  (key: string) => void;
  setFinnhubKey:     (key: string) => void;
  setDerivAppId:     (id: string) => void;
  setDerivToken:     (token: string) => void;
  clearKeys:         () => void;
}

export const useKeysStore = create<KeysState>()(
  persist(
    (set) => ({
      geminiKey:     '',
      twelvedataKey: '',
      finnhubKey:    '',
      derivAppId:    '',
      derivToken:    '',

      setGeminiKey(key)     { set({ geminiKey: key }); },
      setTwelvedataKey(key) { set({ twelvedataKey: key }); },
      setFinnhubKey(key)    { set({ finnhubKey: key }); },
      setDerivAppId(id)     { set({ derivAppId: id }); },
      setDerivToken(token)  { set({ derivToken: token }); },
      clearKeys()           { set({ geminiKey: '', twelvedataKey: '', finnhubKey: '', derivAppId: '', derivToken: '' }); },
    }),
    {
      name:    'dc_keys',
      storage: createJSONStorage(() => sessionStorage),
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as Partial<KeysState>;
        return {
          ...current,
          ...p,
          geminiKey:     p.geminiKey     || import.meta.env.VITE_GEMINI_API_KEY     || '',
          twelvedataKey: p.twelvedataKey || import.meta.env.VITE_TWELVEDATA_API_KEY || '',
          finnhubKey:    p.finnhubKey    || import.meta.env.VITE_FINNHUB_API_KEY    || '',
          derivAppId:    p.derivAppId    || import.meta.env.VITE_DERIV_APP_ID       || '',
          derivToken:    p.derivToken    || import.meta.env.VITE_DERIV_TOKEN        || '',
        };
      },
    },
  ),
);
