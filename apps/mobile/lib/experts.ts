import { apiRequest } from './api-client';

export type ExpertCase = { id: string; requesterId: string; expertId: string | null; city: string | null; category: string; question: string; status: string; response: string | null; createdAt: string; updatedAt: string };

export function createExpertCase(input: { city?: string; category: string; question: string }) { return apiRequest<ExpertCase>('/v1/experts/cases', { method: 'POST', body: input }); }
export function getExpertCases() { return apiRequest<ExpertCase[]>('/v1/experts/cases'); }
export type ExpertProfile = {
  id: string;
  displayName: string;
  city: string;
  specialties: string[];
  status: string;
  rating: number;
};
export function getAvailableExperts(city?: string) {
  const query = city ? `?city=${encodeURIComponent(city)}` : '';
  return apiRequest<ExpertProfile[]>(`/v1/experts/available${query}`);
}
