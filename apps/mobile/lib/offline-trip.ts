import { openDatabaseAsync, type SQLiteDatabase } from 'expo-sqlite';

import type { TripTimeline } from './trips';

const DATABASE_NAME = 'zentrip-offline.db';
const SCHEMA = `
  CREATE TABLE IF NOT EXISTS offline_trip_packs (
    trip_id TEXT PRIMARY KEY NOT NULL,
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

export async function saveOfflineTripPack(tripId: string, timeline: TripTimeline): Promise<string> {
  const db = await database();
  const cachedAt = new Date().toISOString();
  await db.runAsync(
    'INSERT OR REPLACE INTO offline_trip_packs (trip_id, payload, cached_at) VALUES (?, ?, ?)',
    tripId,
    JSON.stringify(timeline),
    cachedAt,
  );
  return cachedAt;
}

export async function getOfflineTripPack(
  tripId: string,
): Promise<{ timeline: TripTimeline; cachedAt: string } | null> {
  const db = await database();
  const row = await db.getFirstAsync<{ payload: string; cached_at: string }>(
    'SELECT payload, cached_at FROM offline_trip_packs WHERE trip_id = ?',
    tripId,
  );
  if (!row) return null;
  try {
    return { timeline: JSON.parse(row.payload) as TripTimeline, cachedAt: row.cached_at };
  } catch {
    return null;
  }
}

export async function removeOfflineTripPack(tripId: string): Promise<void> {
  const db = await database();
  await db.runAsync('DELETE FROM offline_trip_packs WHERE trip_id = ?', tripId);
}
