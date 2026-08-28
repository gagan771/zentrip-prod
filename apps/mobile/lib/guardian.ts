import { apiRequest } from './api-client';

export type GuardianCategory = 'police' | 'medical' | 'lost' | 'scam' | 'harassment' | 'trail' | 'other';

export type GuardianIncident = {
  id: string;
  category: GuardianCategory;
  status: 'created' | 'checked_in' | 'shared' | 'resolved' | string;
  note: string | null;
  latitude: number | null;
  longitude: number | null;
  checkinAt: string | null;
  sharedAt: string | null;
  resolvedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export function getActiveIncident() {
  return apiRequest<GuardianIncident | null>('/v1/guardian/incidents/active');
}

export function createIncident(category: GuardianCategory, note?: string) {
  return apiRequest<GuardianIncident>('/v1/guardian/incidents', { method: 'POST', body: { category, note } });
}

export function checkInIncident(id: string) {
  return apiRequest<GuardianIncident>(`/v1/guardian/incidents/${id}/checkin`, { method: 'POST', body: {} });
}

export function shareIncident(id: string, latitude: number, longitude: number) {
  return apiRequest<GuardianIncident>(`/v1/guardian/incidents/${id}/share`, { method: 'POST', body: { latitude, longitude } });
}

export function resolveIncident(id: string) {
  return apiRequest<GuardianIncident>(`/v1/guardian/incidents/${id}/resolve`, { method: 'POST', body: {} });
}
