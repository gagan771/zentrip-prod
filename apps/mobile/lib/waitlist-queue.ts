/**
 * Device-side Buddy waitlist queue.
 * Used only when POST /v1/buddy/waitlist cannot reach the server (offline or 5xx).
 * Never presented as a server-queued request.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

const QUEUE_KEY = 'zentrip.buddy.waitlist.offlineQueue';
const GET_CACHE_KEY = 'zentrip.buddy.waitlist.lastGet';

export type OfflineWaitlistDraft = {
  id: string;
  groupId: string;
  groupName: string;
  requestText: string | null;
  createdAt: string;
  lastError: string | null;
  attempts: number;
};

function isDraft(value: unknown): value is OfflineWaitlistDraft {
  if (!value || typeof value !== 'object') return false;
  const row = value as OfflineWaitlistDraft;
  return typeof row.id === 'string' && typeof row.groupId === 'string' && typeof row.groupName === 'string';
}

export async function listOfflineWaitlist(): Promise<OfflineWaitlistDraft[]> {
  try {
    const raw = await AsyncStorage.getItem(QUEUE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isDraft);
  } catch {
    return [];
  }
}

async function writeQueue(drafts: OfflineWaitlistDraft[]): Promise<void> {
  await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(drafts));
}

export async function enqueueOfflineWaitlist(input: {
  groupId: string;
  groupName: string;
  requestText?: string | null;
  lastError?: string | null;
}): Promise<OfflineWaitlistDraft> {
  const existing = await listOfflineWaitlist();
  const now = new Date().toISOString();
  const found = existing.find((row) => row.groupId === input.groupId);
  if (found) {
    const updated: OfflineWaitlistDraft = {
      ...found,
      groupName: input.groupName,
      requestText: input.requestText ?? found.requestText,
      lastError: input.lastError ?? found.lastError,
      attempts: found.attempts + 1,
    };
    await writeQueue(existing.map((row) => (row.id === found.id ? updated : row)));
    return updated;
  }
  const draft: OfflineWaitlistDraft = {
    id: `offline-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    groupId: input.groupId,
    groupName: input.groupName,
    requestText: input.requestText ?? null,
    createdAt: now,
    lastError: input.lastError ?? null,
    attempts: 1,
  };
  await writeQueue([draft, ...existing]);
  return draft;
}

export async function removeOfflineWaitlist(id: string): Promise<void> {
  const existing = await listOfflineWaitlist();
  await writeQueue(existing.filter((row) => row.id !== id));
}

export async function removeOfflineWaitlistForGroup(groupId: string): Promise<void> {
  const existing = await listOfflineWaitlist();
  await writeQueue(existing.filter((row) => row.groupId !== groupId));
}

export type CachedWaitlistGet = {
  requests: Array<{
    id: string;
    groupId: string;
    groupName: string;
    requestText: string | null;
    status: string;
    createdAt: string;
  }>;
  syncedAt: string;
};

function isCachedWaitlist(value: unknown): value is CachedWaitlistGet {
  if (!value || typeof value !== 'object') return false;
  const row = value as CachedWaitlistGet;
  return Array.isArray(row.requests) && typeof row.syncedAt === 'string';
}

export async function cacheWaitlistGet(requests: CachedWaitlistGet['requests']): Promise<CachedWaitlistGet> {
  const snapshot: CachedWaitlistGet = { requests, syncedAt: new Date().toISOString() };
  await AsyncStorage.setItem(GET_CACHE_KEY, JSON.stringify(snapshot));
  return snapshot;
}

export async function readCachedWaitlistGet(): Promise<CachedWaitlistGet | null> {
  try {
    const raw = await AsyncStorage.getItem(GET_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    return isCachedWaitlist(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function formatWaitlistSyncedAt(iso: string): string {
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

export async function markOfflineWaitlistError(id: string, lastError: string): Promise<void> {
  const existing = await listOfflineWaitlist();
  await writeQueue(
    existing.map((row) =>
      row.id === id ? { ...row, lastError, attempts: row.attempts + 1 } : row,
    ),
  );
}

/** Network failures and 5xx/408/429 are retryable. Auth and validation 4xx are not. */
export function isRetryableWaitlistFailure(caught: unknown): boolean {
  if (!(caught instanceof Error)) return true;
  const message = caught.message;
  if (!message.startsWith('API ')) return true;
  const match = message.match(/^API (\d+)/);
  if (!match) return true;
  const status = Number(match[1]);
  return status >= 500 || status === 408 || status === 429;
}
