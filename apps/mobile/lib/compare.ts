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

export type ProviderHandoff = {
  key: string;
  displayName: string;
  category: string;
  url: string;
  live: boolean;
  note: string;
};

export type CompareSearchResponse = {
  results: CompareResult[];
  isDemoData: boolean;
  liveCheckRequired: boolean;
  message: string;
  handoffs: ProviderHandoff[];
};

export type CompareSearchInput = {
  origin: string;
  destination: string;
  departureDate: string;
  budgetLevel: BudgetLevel;
  tripId?: string;
};

export type StayResult = {
  recommendationId: string;
  observationId: string;
  provider: string;
  stayType: 'hostel' | 'hotel' | string;
  city: string;
  checkIn: string;
  checkOut: string;
  pricePerNight: number;
  totalPrice: number;
  rating: number;
  distanceToCenterKm: number;
  cancellationScore: number;
  availability: boolean;
  retrievedAt: string;
  freshness: string;
  bookable: boolean;
  liveCheckRequired: boolean;
  score: number;
  badges: string[];
  explanation: string;
  scoreBreakdown: { key: string; label: string; score: number; weight: number }[];
  contextSignals: string[];
};

export type StaySearchResponse = {
  results: StayResult[];
  isDemoData: boolean;
  liveCheckRequired: boolean;
  message: string;
  handoffs: ProviderHandoff[];
};

export function searchCompare(input: CompareSearchInput): Promise<CompareSearchResponse> {
  return apiRequest<CompareSearchResponse>('/v1/compare/search', { method: 'POST', body: input });
}

export function searchStays(input: { city: string; checkIn: string; checkOut: string; budgetLevel: BudgetLevel; travelerStyle?: string; guests?: number }): Promise<StaySearchResponse> {
  return apiRequest<StaySearchResponse>('/v1/compare/stays/search', { method: 'POST', body: input });
}

export function recordCompareOutcome(recommendationId: string, outcomeType: 'opened' | 'selected' | 'booked' | 'dismissed') {
  return apiRequest(`/v1/compare/recommendations/${recommendationId}/outcomes`, {
    method: 'POST',
    body: { outcomeType },
  });
}

export function listTransportHandoffs(input: { origin: string; destination: string; departureDate: string }) {
  const params = new URLSearchParams(input);
  return apiRequest<ProviderHandoff[]>(`/v1/compare/handoffs?${params.toString()}`);
}

export function listStayHandoffs(input: { city: string; checkIn: string; checkOut: string; guests?: number }) {
  const params = new URLSearchParams({
    city: input.city,
    checkIn: input.checkIn,
    checkOut: input.checkOut,
    guests: String(input.guests ?? 1),
  });
  return apiRequest<ProviderHandoff[]>(`/v1/compare/stays/handoffs?${params.toString()}`);
}

export type CabOption = {
  provider: string;
  productHint: string;
  provenance: 'handoff' | 'live' | string;
  fareInr: number | null;
  etaMinutes: number | null;
  url: string;
  note: string;
  smartPickupHint: string | null;
};

export type CabPartner = {
  key: string;
  name: string;
  status: string;
  applyUrl: string;
  docsUrl: string;
  why: string;
  whatToSend: string;
};

export type CabSearchResponse = {
  pickup: string;
  drop: string;
  pickupLat: number | null;
  pickupLng: number | null;
  dropLat: number | null;
  dropLng: number | null;
  isLive: boolean;
  message: string;
  smartPickupHint: string;
  options: CabOption[];
  handoffs: ProviderHandoff[];
  partners: CabPartner[];
};

export type CabSearchInput = {
  pickup: string;
  drop: string;
  pickupLat?: number;
  pickupLng?: number;
  dropLat?: number;
  dropLng?: number;
  tripId?: string;
};

export function searchCabs(input: CabSearchInput): Promise<CabSearchResponse> {
  return apiRequest<CabSearchResponse>('/v1/compare/cabs', { method: 'POST', body: input });
}

export function listCabPartners(): Promise<CabPartner[]> {
  return apiRequest<CabPartner[]>('/v1/compare/cabs/partners');
}
