import type { Candle, Interval } from '../types/candle';

const DB_NAME = 'deepchart_cache';
const STORE_NAME = 'candles';
const DB_VERSION = 1;
const TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

interface CacheEntry {
  candles: Candle[];
  timestamp: number;
}

let dbPromise: Promise<IDBDatabase> | null = null;

function openDB(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

function cacheKey(symbol: string, interval: Interval): string {
  // Key format: {symbol}_{interval} — no Date.now() so cache hits match
  return `${symbol.toUpperCase().replace('/', '')}_${interval}`;
}

export async function loadCachedCandles(
  symbol: string,
  interval: Interval,
): Promise<Candle[] | null> {
  try {
    const db = await openDB();
    const key = cacheKey(symbol, interval);
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.get(key);
      req.onsuccess = () => {
        const entry = req.result as CacheEntry | undefined;
        if (!entry) { resolve(null); return; }
        // Check TTL — expired entries are stale
        if (Date.now() - entry.timestamp > TTL_MS) {
          // Delete expired entry
          const delTx = db.transaction(STORE_NAME, 'readwrite');
          delTx.objectStore(STORE_NAME).delete(key);
          resolve(null);
          return;
        }
        resolve(entry.candles);
      };
      req.onerror = () => resolve(null);
    });
  } catch {
    return null;
  }
}

export async function saveCachedCandles(
  symbol: string,
  interval: Interval,
  candles: Candle[],
): Promise<void> {
  try {
    const db = await openDB();
    const key = cacheKey(symbol, interval);
    const entry: CacheEntry = { candles, timestamp: Date.now() };
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).put(entry, key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });
  } catch { /* ignore — cache is best-effort */ }
}

/**
 * Append newly-closed live candles to the cached array without
 * deleting the core cache. Called when live stream produces a
 * new candle that wasn't in the initial fetch.
 */
export async function appendCachedCandle(
  symbol: string,
  interval: Interval,
  newCandle: Candle,
): Promise<void> {
  try {
    const existing = await loadCachedCandles(symbol, interval);
    if (!existing) return;
    const last = existing[existing.length - 1];
    if (last && newCandle.time <= last.time) return; // not newer
    const updated = [...existing, newCandle];
    // Keep max 2000 candles in cache
    const trimmed = updated.length > 2000 ? updated.slice(-2000) : updated;
    await saveCachedCandles(symbol, interval, trimmed);
  } catch { /* ignore */ }
}
