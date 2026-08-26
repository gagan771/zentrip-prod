import { apiRequest } from './api-client';

export type BudgetLevel = 'backpacker' | 'comfort' | 'luxury' | 'mixed';

export type CompareResult = {
  recommendationId: string;
  observationId: string;
  provider: string;
  mode: 'train' | 'bus' | string;
  origin: string;
  destination: string;
  departureAt: string;
  arrivalAt: string;
  basePrice: number;
  fees: number;
  totalPrice: number;
  durationMinutes: number;
  cancellationScore: number;
  reliabilityScore: number;
  availability: boolean;
  retrievedAt: string;
  freshness: 'estimated' | 'live' | 'verified' | string;
  bookable: boolean;
  liveCheckRequired: boolean;
  score: number;
  badges: string[];
  explanation: string;
};

export type CompareSearchResponse = {
  results: CompareResult[];
  isDemoData: boolean;
  liveCheckRequired: boolean;
  message: string;
};

export type CompareSearchInput = {
  origin: string;
  destination: string;
  departureDate: string;
  budgetLevel: BudgetLevel;
  tripId?: string;
};

export function searchCompare(input: CompareSearchInput): Promise<CompareSearchResponse> {
  return apiRequest<CompareSearchResponse>('/v1/compare/search', { method: 'POST', body: input });
}

export function recordCompareOutcome(recommendationId: string, outcomeType: 'opened' | 'selected' | 'booked' | 'dismissed') {
  return apiRequest(`/v1/compare/recommendations/${recommendationId}/outcomes`, {
    method: 'POST',
    body: { outcomeType },
  });
}
