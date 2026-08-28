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
  angularDifferenceDegrees?: number | null;
  lineOfSight?: string;
};

export type PeaksResponse = {
  results: Peak[];
  latitude: number;
  longitude: number;
  bearingDegrees?: number | null;
  fieldOfView?: number | null;
  demApplied?: boolean;
  identificationMethod?: string;
  demNote?: string | null;
};

export function nearbyPeaks(
  latitude: number,
  longitude: number,
  options?: { bearing?: number; fieldOfView?: number }
): Promise<PeaksResponse> {
  const query = new URLSearchParams({ latitude: String(latitude), longitude: String(longitude) });
  if (options?.bearing !== undefined) query.set('bearing', String(options.bearing));
  if (options?.fieldOfView !== undefined) query.set('fieldOfView', String(options.fieldOfView));
  return apiRequest<PeaksResponse>(`/v1/peaks/nearby?${query.toString()}`);
}
