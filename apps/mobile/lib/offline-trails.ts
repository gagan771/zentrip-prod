import { openDatabaseAsync, type SQLiteDatabase } from 'expo-sqlite';

import type { TrailPackage } from './trails';

const DATABASE_NAME = 'zentrip-offline.db';
const SCHEMA = `
  CREATE TABLE IF NOT EXISTS offline_trail_packs (
    trail_slug TEXT PRIMARY KEY NOT NULL,
    payload TEXT NOT NULL,
    cached_at TEXT NOT NULL
  );
`;

let databasePromise: Promise<SQLiteDatabase> | null = null;

async function database(): Promise<SQLiteDatabase> {
  if (!databasePromise) {
    databasePromise = openDatabaseAsync(DATABASE_NAME).then(async (db) => {
      await db.execAsync(SCHEMA);
      return db;
    });
  }
  return databasePromise;
}

export async function saveOfflineTrailPack(pack: TrailPackage): Promise<string> {
  const db = await database();
  const cachedAt = new Date().toISOString();
  await db.runAsync(
    'INSERT OR REPLACE INTO offline_trail_packs (trail_slug, payload, cached_at) VALUES (?, ?, ?)',
    pack.trail.slug,
    JSON.stringify(pack),
    cachedAt,
  );
  return cachedAt;
}

export async function getOfflineTrailPack(slug: string): Promise<{ pack: TrailPackage; cachedAt: string } | null> {
  const db = await database();
  const row = await db.getFirstAsync<{ payload: string; cached_at: string }>(
    'SELECT payload, cached_at FROM offline_trail_packs WHERE trail_slug = ?',
    slug,
  );
  if (!row) return null;
  try {
    return { pack: JSON.parse(row.payload) as TrailPackage, cachedAt: row.cached_at };
  } catch {
    return null;
  }
}
