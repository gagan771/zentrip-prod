import AsyncStorage from '@react-native-async-storage/async-storage';

import { apiRequest } from './api-client';

const CACHE_KEY = 'zentrip.knowledge.lastSearch';

/** Corridor seeds so Explore/Guide/Payments have something honest to show offline. */
export const KNOWLEDGE_SEED_QUERIES: Array<{ query: string; city?: string }> = [
  { query: 'monument' },
  { query: 'monument', city: 'Delhi' },
  { query: 'monument', city: 'Agra' },
  { query: 'monument', city: 'Jaipur' },
  { query: 'heritage', city: 'Delhi' },
  { query: 'heritage', city: 'Agra' },
  { query: 'heritage', city: 'Jaipur' },
  { query: 'UPI' },
  { query: 'India visa' },
  { query: 'arrival checklist India' },
  { query: 'emergency 112 India' },
  { query: 'tourist helpline 1363' },
  { query: 'book train India' },
  { query: 'SIM card India foreigner' },
  { query: 'safe food and water India' },
  { query: 'temple dress code India' },
  { query: 'India travel insurance' },
];

export type KnowledgeCitation = {
  sourceName: string;
  sourceUrl?: string | null;
  sourceLocator?: string | null;
  lastVerified: string;
  confidence: string;
};

export type KnowledgeClaim = {
  claimId: string;
  entityId: string;
  entityName: string;
  entityType: string;
  city: string;
  claim: string;
  language: string;
  citation: KnowledgeCitation;
};

export type KnowledgeSearchResponse = {
  query: string;
  city: string | null;
  results: KnowledgeClaim[];
};

export type KnowledgeSearchResult = KnowledgeSearchResponse & {
  source: 'live' | 'cache';
  syncedAt: string;
};

export type CachedKnowledgeEntry = {
  response: KnowledgeSearchResponse;
  syncedAt: string;
};

export type KnowledgeCacheMeta = {
  lastSyncedAt: string | null;
  queryCount: number;
  lastQuery: string | null;
  lastCity: string | null;
  resultCount: number;
};

type CachedKnowledgeStore = {
  entries: Record<string, CachedKnowledgeEntry>;
  lastSyncedAt: string;
  lastQuery: string;
  lastCity: string | null;
  resultCount: number;
};

function entryKey(query: string, city?: string): string {
  return `${query.trim().toLowerCase()}::${(city ?? '').trim().toLowerCase()}`;
}

function isCitation(value: unknown): value is KnowledgeCitation {
  if (!value || typeof value !== 'object') return false;
  const row = value as KnowledgeCitation;
  return (
    typeof row.sourceName === 'string' &&
    typeof row.lastVerified === 'string' &&
    typeof row.confidence === 'string'
  );
}

function isClaim(value: unknown): value is KnowledgeClaim {
  if (!value || typeof value !== 'object') return false;
  const row = value as KnowledgeClaim;
  return (
    typeof row.claimId === 'string' &&
    typeof row.entityName === 'string' &&
    typeof row.claim === 'string' &&
    isCitation(row.citation)
  );
}

function isResponse(value: unknown): value is KnowledgeSearchResponse {
  if (!value || typeof value !== 'object') return false;
  const row = value as KnowledgeSearchResponse;
  return typeof row.query === 'string' && Array.isArray(row.results) && row.results.every(isClaim);
}

function isEntry(value: unknown): value is CachedKnowledgeEntry {
  if (!value || typeof value !== 'object') return false;
  const row = value as CachedKnowledgeEntry;
  return typeof row.syncedAt === 'string' && isResponse(row.response);
}

function isStore(value: unknown): value is CachedKnowledgeStore {
  if (!value || typeof value !== 'object') return false;
  const row = value as CachedKnowledgeStore;
  if (typeof row.lastSyncedAt !== 'string' || !row.entries || typeof row.entries !== 'object') return false;
  return Object.values(row.entries).every(isEntry);
}

async function readStore(): Promise<CachedKnowledgeStore | null> {
  try {
    const raw = await AsyncStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    return isStore(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

async function writeStore(store: CachedKnowledgeStore): Promise<void> {
  await AsyncStorage.setItem(CACHE_KEY, JSON.stringify(store));
}

export async function cacheKnowledgeSearch(
  query: string,
  city: string | undefined,
  response: KnowledgeSearchResponse,
): Promise<string> {
  const syncedAt = new Date().toISOString();
  const existing = await readStore();
  const entries = { ...(existing?.entries ?? {}) };
  entries[entryKey(query, city)] = { response, syncedAt };
  await writeStore({
    entries,
    lastSyncedAt: syncedAt,
    lastQuery: query.trim(),
    lastCity: city?.trim() || null,
    resultCount: response.results.length,
  });
  return syncedAt;
}

export async function readCachedKnowledgeSearch(
  query: string,
  city?: string,
): Promise<CachedKnowledgeEntry | null> {
  const store = await readStore();
  if (!store) return null;
  return store.entries[entryKey(query, city)] ?? null;
}

export async function readKnowledgeCacheMeta(): Promise<KnowledgeCacheMeta> {
  const store = await readStore();
  if (!store) {
    return {
      lastSyncedAt: null,
      queryCount: 0,
      lastQuery: null,
      lastCity: null,
      resultCount: 0,
    };
  }
  return {
    lastSyncedAt: store.lastSyncedAt,
    queryCount: Object.keys(store.entries).length,
    lastQuery: store.lastQuery,
    lastCity: store.lastCity,
    resultCount: store.resultCount,
  };
}

export function formatKnowledgeSyncedAt(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return iso;
  const delta = Date.now() - then;
  if (delta < 45_000) return 'just now';
  if (delta < 3_600_000) {
    const mins = Math.max(1, Math.round(delta / 60_000));
    return `${mins} min ago`;
  }
  if (delta < 86_400_000) {
    const hours = Math.max(1, Math.round(delta / 3_600_000));
    return `${hours}h ago`;
  }
  return iso.slice(0, 10);
}

export async function searchKnowledge(query: string, city?: string): Promise<KnowledgeSearchResult> {
  const params = new URLSearchParams({ q: query });
  if (city) params.set('city', city);
  try {
    const data = await apiRequest<KnowledgeSearchResponse>(`/v1/knowledge/search?${params.toString()}`);
    const syncedAt = await cacheKnowledgeSearch(query, city, data);
    return { ...data, source: 'live', syncedAt };
  } catch (caught) {
    const cached = await readCachedKnowledgeSearch(query, city);
    if (cached) {
      return { ...cached.response, source: 'cache', syncedAt: cached.syncedAt };
    }
    throw caught;
  }
}

/**
 * Fetch corridor seed queries and persist each successful live response.
 * Throws if none of the seeds reached the server (existing cache is left untouched).
 */
export async function refreshKnowledgeCache(): Promise<KnowledgeCacheMeta> {
  const results = await Promise.allSettled(
    KNOWLEDGE_SEED_QUERIES.map((seed) => searchKnowledge(seed.query, seed.city)),
  );
  const liveHits = results.filter(
    (row) => row.status === 'fulfilled' && row.value.source === 'live',
  ).length;
  if (liveHits === 0) {
    throw new Error('Could not reach the knowledge server.');
  }
  return readKnowledgeCacheMeta();
}
