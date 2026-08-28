import { apiRequest } from './api-client';

export type RiskPattern = {
  id: string;
  city: string;
  locationLabel: string;
  category: string;
  pattern: string;
  recommendation: string;
  confidence: string;
  sourceName: string;
  sourceUrl: string | null;
  lastVerified: string;
};

export function getRiskPatterns(city?: string) {
  return apiRequest<{ results: RiskPattern[]; city: string | null; category: string | null }>(`/v1/risks${city ? `?city=${encodeURIComponent(city)}` : ''}`);
}
