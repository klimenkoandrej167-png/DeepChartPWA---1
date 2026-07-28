import { useState, useEffect } from 'react';
import { isForexMarketOpen, getCurrentSession, type ForexSession } from '../utils/marketHours';

export function useForexMarketHours() {
  const [isOpen, setIsOpen]     = useState(isForexMarketOpen);
  const [session, setSession]   = useState<ForexSession>(getCurrentSession);

  useEffect(() => {
    const id = setInterval(() => {
      setIsOpen(isForexMarketOpen());
      setSession(getCurrentSession());
    }, 60_000);
    return () => clearInterval(id);
  }, []);

  return { isOpen, session };
}
