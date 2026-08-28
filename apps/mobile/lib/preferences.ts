/**
 * Profile travel philosophy ↔ GET/POST /v1/preferences.
 * Guests stay local. Logged-in travelers get an explicit statement on the server.
 * Never inferred from chat — only from Profile taps.
 */

import { apiRequest } from './api-client';
import type { TravelerPreferences } from '../store/useStore';

const PREFIX = 'Travel philosophy:';

export type UserPreference = {
  id: string;
  statement: string;
  createdAt: string;
};

export function listPreferences(): Promise<UserPreference[]> {
  return apiRequest('/v1/preferences');
}

export function addPreference(statement: string): Promise<UserPreference> {
  return apiRequest('/v1/preferences', { method: 'POST', body: { statement } });
}

export function deletePreference(id: string): Promise<void> {
  return apiRequest(`/v1/preferences/${id}`, { method: 'DELETE' });
}

export function serializePhilosophy(prefs: TravelerPreferences): string {
  const interests = prefs.interests.length ? prefs.interests.join(', ') : 'none listed';
  return `${PREFIX} pace=${prefs.pace}; budget=${prefs.budget}; interests=${interests}`;
}

export function isPhilosophyStatement(statement: string): boolean {
  return statement.trim().toLowerCase().startsWith(PREFIX.toLowerCase());
}

export function parsePhilosophy(statement: string): Partial<TravelerPreferences> | null {
  if (!isPhilosophyStatement(statement)) return null;
  const body = statement.slice(PREFIX.length).trim();
  const result: Partial<TravelerPreferences> = {};
  const pace = body.match(/pace=([a-z]+)/i)?.[1]?.toLowerCase();
  const budget = body.match(/budget=([a-z]+)/i)?.[1]?.toLowerCase();
  const interestsRaw = body.match(/interests=(.*)$/i)?.[1]?.trim();
  if (pace === 'relaxed' || pace === 'balanced' || pace === 'packed') result.pace = pace;
  if (budget === 'backpacker' || budget === 'comfort' || budget === 'luxury' || budget === 'mixed') {
    result.budget = budget;
  }
  if (interestsRaw && interestsRaw.toLowerCase() !== 'none listed') {
    result.interests = interestsRaw
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean);
  }
  return Object.keys(result).length ? result : null;
}

export function latestPhilosophy(rows: UserPreference[]): Partial<TravelerPreferences> | null {
  const match = rows.find((row) => isPhilosophyStatement(row.statement));
  return match ? parsePhilosophy(match.statement) : null;
}

export async function syncTravelPhilosophy(prefs: TravelerPreferences): Promise<void> {
  const statement = serializePhilosophy(prefs);
  const existing = await listPreferences();
  const previous = existing.filter((row) => isPhilosophyStatement(row.statement));
  await Promise.all(
    previous.map((row) => deletePreference(row.id).catch(() => undefined)),
  );
  await addPreference(statement);
}
