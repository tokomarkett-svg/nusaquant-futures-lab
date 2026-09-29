/**
 * Akses database SQLite lokal worker (pengganti services/worker/src/supabase.ts).
 *
 * Satu koneksi bersama per proses via getDb() dari @nusaquant/db.
 * Lokasi file: env SQLITE_PATH, default ./data/nusaquant.db dari cwd.
 */
import { getDb, type NusaQuantDb } from '@nusaquant/db';

export function getWorkerDb(): NusaQuantDb {
  return getDb();
}

export type { NusaQuantDb };
