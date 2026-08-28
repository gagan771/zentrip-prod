import { apiFormRequest } from './api-client';

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
