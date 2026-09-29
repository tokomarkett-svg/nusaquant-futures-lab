import { getDb, type MarketCandleRow, type NusaQuantDb } from '@nusaquant/db';

export type { MarketCandleRow };

/**
 * Koneksi SQLite lokal untuk route API Next.js (server only).
 * better-sqlite3 itu synchronous; satu instance bersama per proses cukup.
 */
export function getWebDb(): NusaQuantDb {
  return getDb();
}
