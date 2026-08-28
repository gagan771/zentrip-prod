import { apiFormRequest, apiRequest, API_BASE_URL } from './api-client';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Crypto from 'expo-crypto';

export type ZennyVoiceTurn = {
  sessionId: string;
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
  items: string[];
};

export type ZennyLiveSession = {
  sessionId: string;
  wsUrl: string;
  ticket: string;
  sttProvider: string;
};

const VOICE_SESSION_KEY = 'zentrip.voice.session.v1';

export async function getVoiceSessionId(): Promise<string> {
  const existing = await AsyncStorage.getItem(VOICE_SESSION_KEY);
  if (existing) return existing;
  const created = Crypto.randomUUID();
  await AsyncStorage.setItem(VOICE_SESSION_KEY, created);
  return created;
}

export async function sendZennyVoiceTurn(uri: string, tripId?: string | null): Promise<ZennyVoiceTurn> {
  const sessionId = await getVoiceSessionId();
  const form = new FormData();
  form.append(
    'audio',
    {
      uri,
      name: uri.toLowerCase().includes('.wav') ? 'zenny-turn.wav' : 'zenny-turn.m4a',
      type: uri.toLowerCase().includes('.wav') ? 'audio/wav' : 'audio/m4a',
    } as unknown as Blob
  );
  form.append('sessionId', sessionId);
  if (tripId) form.append('trip_id', tripId);
  return apiFormRequest<ZennyVoiceTurn>('/v1/zenny/voice/turn', form);
}

export async function createZennyLiveSession(tripId?: string | null): Promise<ZennyLiveSession> {
  const sessionId = await getVoiceSessionId();
  return apiRequest<ZennyLiveSession>('/v1/zenny/voice/live/session', {
    method: 'POST',
    body: { sessionId, tripId: tripId || undefined },
  });
}

export function zennyLiveSocketUrl(session: ZennyLiveSession): string {
  if (session.wsUrl.startsWith('ws://') || session.wsUrl.startsWith('wss://')) return session.wsUrl;
  const root = API_BASE_URL.replace(/^https:/, 'wss:').replace(/^http:/, 'ws:');
  return `${root}/v1/zenny/voice/live?ticket=${session.ticket}`;
}
