import { apiRequest } from './api-client';

export type Peak = {
  id: string;
  name: string;
  elevationM: number;
  latitude: number;
  longitude: number;
  distanceKm: number;
  bearingDegrees: number;
  direction: string;
  confidence: string;
  description: string;
  sourceName: string;
  lastVerified: string;
};

export type PeaksResponse = {
  results: Peak[];
  latitude: number;
  longitude: number;
  bearingDegrees?: number | null;
};

export function nearbyPeaks(latitude: number, longitude: number, bearing?: number): Promise<PeaksResponse> {
  const query = new URLSearchParams({ latitude: String(latitude), longitude: String(longitude) });
  if (bearing !== undefined) query.set('bearing', String(bearing));
  return apiRequest<PeaksResponse>(`/v1/peaks/nearby?${query.toString()}`);
}
