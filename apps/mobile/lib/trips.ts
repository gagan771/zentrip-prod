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

// Journey/Booking Hub aggregation payload (spec 04): trip + itinerary days in one
// response. Today "days" (itinerary activities) is the only real timeline source —
// Compare/Stay Search recommendations aren't trip-linked yet — but this is the shape
// a future booking source would be merged into server-side, so the client stays a
// single fetch even as more booking types land.
export type TripTimeline = {
  trip: Trip;
  days: ItineraryDay[];
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

export function requestOnboardingCall(input: {
  phoneNumber: string;
  callConsent: true;
  recordingConsent?: boolean;
}): Promise<OnboardingCall> {
  return apiRequest<OnboardingCall>('/v1/onboarding/calls', { method: 'POST', body: input });
}
