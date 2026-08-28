import { apiRequest } from './api-client';

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

export function getCommunityEvents(city?: string): Promise<{ events: CommunityEvent[]; city: string | null }> {
  const query = city ? `?city=${encodeURIComponent(city)}` : '';
  return apiRequest(`/v1/community/events${query}`);
}

export function findBuddyMatches(text: string): Promise<{ matches: BuddyMatch[]; parsedRequest: Record<string, unknown> }> {
  return apiRequest('/v1/buddy/matches', { method: 'POST', body: { text } });
}
