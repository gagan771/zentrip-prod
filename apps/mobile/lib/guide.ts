import { apiFormRequest, apiRequest } from './api-client';

export type GuideCitation = {
  sourceName: string;
  sourceUrl?: string | null;
  sourceLocator?: string | null;
  lastVerified: string;
  confidence: string;
};

export type GuideIdentifyResult = {
  matched: boolean;
  entityName: string | null;
  confidence: string;
  reply: string;
  citations: GuideCitation[];
  contentMode: string;
};

export type DestinationRecommendation = {
  placeId: string;
  name: string;
  city: string;
  fact: string;
  score: number;
  scoreBreakdown: Record<string, number>;
  experienceTags: string[];
  source: GuideCitation;
  tradeoffs: string[];
};

export type DestinationRecommendationsResult = {
  results: DestinationRecommendation[];
  profile: Record<string, unknown>;
  month: number | null;
  provenance: string;
};

export function recommendDestinations(params: {
  interests?: string[];
  days?: number;
  month?: number;
  budget?: 'backpacker' | 'comfort' | 'luxury' | 'mixed';
  travelParty?: 'solo' | 'couple' | 'family' | 'group';
  accessibility?: string[];
  query?: string;
  limit?: number;
} = {}): Promise<DestinationRecommendationsResult> {
  const query = new URLSearchParams();
  if (params.interests?.length) query.set('interests', params.interests.join(','));
  if (params.days) query.set('days', String(params.days));
  if (params.month) query.set('month', String(params.month));
  if (params.budget) query.set('budget', params.budget);
  if (params.travelParty) query.set('travel_party', params.travelParty);
  if (params.accessibility?.length) query.set('accessibility', params.accessibility.join(','));
  if (params.query) query.set('q', params.query);
  if (params.limit) query.set('limit', String(params.limit));
  const suffix = query.toString();
  return apiRequest<DestinationRecommendationsResult>(`/v1/guide/recommendations${suffix ? `?${suffix}` : ''}`);
}

/**
 * Uploads a captured photo to the camera-based landmark ID endpoint
 * (07-historical-cultural-guide.md, full version — see services/api/app/routers/guide.py).
 * `city` and optional GPS coordinates narrow the candidate list server-side before the
 * vision call; omit them to search across every published landmark.
 */
export async function identifyLandmark(
  photoUri: string,
  city?: string,
  mode = 'overview',
  location?: { latitude: number; longitude: number },
): Promise<GuideIdentifyResult> {
  const form = new FormData();
  form.append(
    'photo',
    {
      uri: photoUri,
      name: 'landmark.jpg',
      type: 'image/jpeg',
    } as unknown as Blob
  );
  if (city) form.append('city', city);
  if (location) {
    form.append('latitude', String(location.latitude));
    form.append('longitude', String(location.longitude));
  }
  form.append('mode', mode);
  return apiFormRequest<GuideIdentifyResult>('/v1/guide/identify', form);
}
