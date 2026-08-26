import { apiFormRequest } from './api-client';

export type ZennyVoiceTurn = {
  transcript: string;
  spokenText: string;
  intent: string;
  policyTier: string;
  confidence: string;
  citations: Array<{
    sourceName: string;
    sourceUrl?: string | null;
    sourceLocator?: string | null;
    lastVerified: string;
    confidence: string;
  }>;
};

export async function sendZennyVoiceTurn(uri: string): Promise<ZennyVoiceTurn> {
  const form = new FormData();
  form.append(
    'audio',
    {
      uri,
      name: 'zenny-turn.m4a',
      type: 'audio/m4a',
    } as unknown as Blob
  );
  return apiFormRequest<ZennyVoiceTurn>('/v1/zenny/voice/turn', form);
}
