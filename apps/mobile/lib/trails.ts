import { apiRequest } from './api-client';

export type TrailSummary = {
  id: string;
  slug: string;
  name: string;
  region: string;
  summary: string;
  distanceKm: number;
  elevationGainM: number;
  minAltitudeM: number;
  maxAltitudeM: number;
  difficulty: string;
  seasonality: string;
  permitNotes?: string | null;
  verificationStatus: string;
  lastVerified: string;
  packageVersion: string;
  navigationReady: boolean;
  sourceName: string;
  sourceUrl?: string | null;
};

export type TrailWaypoint = {
  id: string;
  name: string;
  kind: string;
  latitude: number;
  longitude: number;
  elevationM?: number | null;
  description: string;
  sourceConfidence: string;
};

export type TrailHazard = {
  id: string;
  category: string;
  description: string;
  latitude?: number | null;
  longitude?: number | null;
  sourceKind: string;
  confidence: string;
  status: string;
  observedAt: string;
  expiresAt?: string | null;
};

export type TrailDetail = TrailSummary & {
  routeGeojson: { type: string; coordinates: number[][] };
  waypoints: TrailWaypoint[];
  hazards: TrailHazard[];
};

export type TrailPackage = {
  trail: TrailDetail;
  emergencyNumbers: Array<{ label: string; number: string; source: string }>;
  packageWarning: string;
  generatedAt: string;
};

export function listTrails(region?: string): Promise<TrailSummary[]> {
  const query = region ? `?region=${encodeURIComponent(region)}` : '';
  return apiRequest<TrailSummary[]>(`/v1/trails${query}`);
}

export function getTrail(slug: string): Promise<TrailDetail> {
  return apiRequest<TrailDetail>(`/v1/trails/${encodeURIComponent(slug)}`);
}

export function getTrailPackage(slug: string): Promise<TrailPackage> {
  return apiRequest<TrailPackage>(`/v1/trails/${encodeURIComponent(slug)}/package`);
}
