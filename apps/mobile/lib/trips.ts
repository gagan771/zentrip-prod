import { apiRequest } from './api-client';

export type Activity = {
  startTime: string;
  placeId?: string;
  placeName: string;
  durationMinutes: number;
  reason: string;
  bookingRequired: boolean;
  status: string;
};

export type ItineraryDay = {
  day: number;
  date: string;
  city: string;
  activities: Activity[];
};

export type Trip = {
  id: string;
  originCountry: string | null;
  startDate: string;
  endDate: string;
  cities: string[];
  budgetLevel: string;
  status: string;
};

export type GenerateItineraryResult = {
  tripId: string;
  days: ItineraryDay[];
  groundedInKnowledgeBase: boolean;
};

export type TravelerProfile = {
  interests: string[];
  pace: 'relaxed' | 'balanced' | 'packed';
  transportPreferences: string[];
  walkingTolerance: 'low' | 'medium' | 'high';
  wakeTime: string;
  sleepTime: string;
  travelParty: 'solo' | 'couple' | 'family' | 'group';
  accessibility: string[];
  foodPreferences: string[];
  updatedAt: string;
};

export type AdaptivePlan = {
  id: string;
  tripId: string;
  version: number;
  status: string;
  model: string;
  promptVersion: string;
  days: ItineraryDay[];
  preferencesSnapshot: Record<string, unknown>;
  sourceClaimIds: string[];
  validation: {
    passed: boolean;
    errors: string[];
    warnings: string[];
    fallbackUsed?: boolean;
    candidateCount?: number;
    [key: string]: unknown;
  };
  approvedAt: string | null;
  createdAt: string;
};

// Journey/Booking Hub aggregation payload (spec 04): trip + itinerary days in one
// response. Today "days" (itinerary activities) is the only real timeline source —
// Compare/Stay Search recommendations aren't trip-linked yet — but this is the shape
// a future booking source would be merged into server-side, so the client stays a
// single fetch even as more booking types land.
export type TripTimeline = {
  trip: Trip;
  days: ItineraryDay[];
  bookings: TripBooking[];
  offline?: boolean;
};

export type TripBooking = {
  id: string;
  kind: 'transport' | 'stay' | 'activity' | 'service';
  title: string;
  provider: string;
  startsAt: string | null;
  endsAt: string | null;
  reference: string | null;
  status: 'pending' | 'confirmed' | 'cancelled';
  deepLink: string | null;
};

export type CreateTripInput = {
  startDate: string; // YYYY-MM-DD
  endDate: string; // YYYY-MM-DD
  cities: string[];
  budgetLevel?: 'backpacker' | 'comfort' | 'luxury' | 'mixed';
};

export type OnboardingCall = {
  id: string;
  phoneNumber: string;
  status: string;
  providerCallId?: string | null;
  recordingConsent: boolean;
};

export function createTrip(input: CreateTripInput): Promise<Trip> {
  return apiRequest<Trip>('/v1/trips', { method: 'POST', body: input });
}

export function getTrip(tripId: string): Promise<Trip> {
  return apiRequest<Trip>(`/v1/trips/${tripId}`);
}

export function getItinerary(tripId: string): Promise<ItineraryDay[]> {
  return apiRequest<ItineraryDay[]>(`/v1/trips/${tripId}/itinerary`);
}

export function getTripTimeline(tripId: string): Promise<TripTimeline> {
  return apiRequest<TripTimeline>(`/v1/trips/${tripId}/timeline`);
}

export function generateItinerary(tripId: string): Promise<GenerateItineraryResult> {
  return apiRequest<GenerateItineraryResult>(`/v1/trips/${tripId}/generate-itinerary`, { method: 'POST' });
}

export function getTravelerProfile(): Promise<TravelerProfile> {
  return apiRequest<TravelerProfile>('/v1/profile/traveler');
}

export function updateTravelerProfile(profile: Omit<TravelerProfile, 'updatedAt'>): Promise<TravelerProfile> {
  return apiRequest<TravelerProfile>('/v1/profile/traveler', { method: 'PUT', body: profile });
}

export function createAdaptivePlan(tripId: string, body?: { profile?: Omit<TravelerProfile, 'updatedAt'>; constraints?: Record<string, unknown> }): Promise<AdaptivePlan> {
  return apiRequest<AdaptivePlan>(`/v1/trips/${tripId}/plans`, { method: 'POST', body: body ?? {} });
}

export function listAdaptivePlans(tripId: string): Promise<AdaptivePlan[]> {
  return apiRequest<AdaptivePlan[]>(`/v1/trips/${tripId}/plans`);
}

export function approveAdaptivePlan(tripId: string, planId: string): Promise<AdaptivePlan> {
  return apiRequest<AdaptivePlan>(`/v1/trips/${tripId}/plans/${planId}/approve`, { method: 'POST' });
}

export function rejectAdaptivePlan(tripId: string, planId: string, reason?: string): Promise<AdaptivePlan> {
  return apiRequest<AdaptivePlan>(`/v1/trips/${tripId}/plans/${planId}/reject`, {
    method: 'POST',
    body: reason ? { itemKey: 'plan', action: 'reject', reason } : undefined,
  });
}

export function recordPlanFeedback(
  tripId: string,
  planId: string,
  feedback: { itemKey: string; action: 'accept' | 'reject' | 'replace' | 'reschedule' | 'complete' | 'comment'; reason?: string },
): Promise<{ id: string; status: string }> {
  return apiRequest<{ id: string; status: string }>(`/v1/trips/${tripId}/plans/${planId}/feedback`, {
    method: 'POST',
    body: feedback,
  });
}

export function addTripBooking(tripId: string, booking: Omit<TripBooking, 'id'>): Promise<TripBooking> {
  return apiRequest<TripBooking>(`/v1/trips/${tripId}/bookings`, { method: 'POST', body: booking });
}

export function requestOnboardingCall(input: {
  phoneNumber: string;
  callConsent: true;
  recordingConsent?: boolean;
}): Promise<OnboardingCall> {
  return apiRequest<OnboardingCall>('/v1/onboarding/calls', { method: 'POST', body: input });
}

export function getOnboardingConfig(): Promise<{
  ready: boolean;
  missing: string[];
  recordingEnabled: boolean;
  publicBaseUrlSet: boolean;
}> {
  return apiRequest('/v1/onboarding/config');
}
