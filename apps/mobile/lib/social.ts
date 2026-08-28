import { apiRequest } from './api-client';
import {
  cacheWaitlistGet,
  enqueueOfflineWaitlist,
  isRetryableWaitlistFailure,
  listOfflineWaitlist,
  markOfflineWaitlistError,
  readCachedWaitlistGet,
  removeOfflineWaitlist,
  removeOfflineWaitlistForGroup,
  type CachedWaitlistGet,
  type OfflineWaitlistDraft,
} from './waitlist-queue';

export type { CachedWaitlistGet, OfflineWaitlistDraft };
export { formatWaitlistSyncedAt, readCachedWaitlistGet } from './waitlist-queue';

export type CommunityEvent = {
  id: string;
  city: string;
  title: string;
  venue: string;
  category: string;
  startTime: string;
  endTime: string;
  source: string;
  verificationStatus: string;
};

export type BuddyMatch = {
  groupId: string;
  name: string;
  destination: string;
  dateRange: string;
  members: number;
  budgetBand: string;
  style: string;
  interests: string;
  compatibility: number;
};

export type BuddyWaitlistEntry = {
  id: string;
  groupId: string;
  groupName: string;
  requestText: string | null;
  status: string;
  createdAt: string;
};

export function getCommunityEvents(city?: string): Promise<{ events: CommunityEvent[]; city: string | null }> {
  const query = city ? `?city=${encodeURIComponent(city)}` : '';
  return apiRequest(`/v1/community/events${query}`);
}

export function findBuddyMatches(text: string): Promise<{ matches: BuddyMatch[]; parsedRequest: Record<string, unknown> }> {
  return apiRequest('/v1/buddy/matches', { method: 'POST', body: { text } });
}

export type WaitlistJoinOutcome =
  | { source: 'server'; entry: BuddyWaitlistEntry }
  | { source: 'device'; draft: OfflineWaitlistDraft };

export async function joinBuddyWaitlist(input: {
  groupId: string;
  groupName: string;
  requestText?: string;
}): Promise<WaitlistJoinOutcome> {
  try {
    const entry = await apiRequest<BuddyWaitlistEntry>('/v1/buddy/waitlist', {
      method: 'POST',
      body: {
        groupId: input.groupId,
        groupName: input.groupName,
        requestText: input.requestText ?? null,
      },
    });
    await removeOfflineWaitlistForGroup(input.groupId);
    return { source: 'server', entry };
  } catch (caught) {
    if (!isRetryableWaitlistFailure(caught)) throw caught;
    const draft = await enqueueOfflineWaitlist({
      groupId: input.groupId,
      groupName: input.groupName,
      requestText: input.requestText ?? null,
      lastError: caught instanceof Error ? caught.message : 'Unreachable',
    });
    return { source: 'device', draft };
  }
}

export type BuddyWaitlistList = {
  requests: BuddyWaitlistEntry[];
  source: 'live' | 'cache';
  syncedAt: string | null;
};

export async function listBuddyWaitlist(): Promise<BuddyWaitlistList> {
  try {
    const data = await apiRequest<{ requests: BuddyWaitlistEntry[] }>('/v1/buddy/waitlist');
    const requests = data.requests ?? [];
    const snapshot = await cacheWaitlistGet(requests);
    return { requests, source: 'live', syncedAt: snapshot.syncedAt };
  } catch (caught) {
    const cached = await readCachedWaitlistGet();
    if (cached) {
      return {
        requests: cached.requests as BuddyWaitlistEntry[],
        source: 'cache',
        syncedAt: cached.syncedAt,
      };
    }
    throw caught;
  }
}

export type BuddyPeer = {
  peerId: string;
  groupId: string;
  groupName: string;
  label: string;
  displayName: string | null;
  youConsented: boolean;
  theyConsented: boolean;
  chatUnlocked: boolean;
  pairId: string | null;
};

export type BuddyThread = {
  pairId: string;
  groupId: string;
  groupName: string;
  displayName: string;
  chatUnlocked: boolean;
};

export type BuddyChatMessage = {
  id: string;
  sender: 'you' | 'them';
  body: string;
  createdAt: string;
};

export function listBuddyPeers(): Promise<{ peers: BuddyPeer[] }> {
  return apiRequest('/v1/buddy/peers');
}

export function offerBuddyConsent(peerId: string): Promise<BuddyPeer> {
  return apiRequest('/v1/buddy/consent', { method: 'POST', body: { peerId } });
}

export function listBuddyThreads(): Promise<{ threads: BuddyThread[] }> {
  return apiRequest('/v1/buddy/threads');
}

export function listBuddyMessages(pairId: string): Promise<{
  pairId: string;
  displayName: string;
  groupName: string;
  messages: BuddyChatMessage[];
}> {
  return apiRequest(`/v1/buddy/threads/${pairId}/messages`);
}

export function sendBuddyMessage(pairId: string, body: string): Promise<BuddyChatMessage> {
  return apiRequest(`/v1/buddy/threads/${pairId}/messages`, { method: 'POST', body: { body } });
}

export function listDeviceWaitlist(): Promise<OfflineWaitlistDraft[]> {
  return listOfflineWaitlist();
}

/** Retry device-queued requests. Successful posts are removed; failures stay queued. */
export async function flushWaitlistQueue(): Promise<{ sent: number; remaining: number }> {
  const drafts = await listOfflineWaitlist();
  let sent = 0;
  for (const draft of drafts) {
    try {
      await apiRequest<BuddyWaitlistEntry>('/v1/buddy/waitlist', {
        method: 'POST',
        body: {
          groupId: draft.groupId,
          groupName: draft.groupName,
          requestText: draft.requestText,
        },
      });
      await removeOfflineWaitlist(draft.id);
      sent += 1;
    } catch (caught) {
      if (!isRetryableWaitlistFailure(caught)) {
        await removeOfflineWaitlist(draft.id);
      } else {
        await markOfflineWaitlistError(
          draft.id,
          caught instanceof Error ? caught.message : 'Still unreachable',
        );
      }
    }
  }
  const remaining = (await listOfflineWaitlist()).length;
  return { sent, remaining };
}
