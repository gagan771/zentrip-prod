import { apiRequest } from './api-client';

export type ExplorerProfile = { id: string; status: string; reputationPoints: number; missionsCompleted: number };
export type ExplorerMission = { id: string; title: string; category: string; city: string; description: string; safetyNote: string; requiredEvidence: string[] };
export type ExplorerSubmission = { id: string; missionId: string; text: string; latitude: number | null; longitude: number | null; evidenceUrl: string | null; status: string; reviewerNote: string | null; createdAt: string };

export function getExplorerProfile() { return apiRequest<ExplorerProfile | null>('/v1/explorer/profile'); }
export function applyExplorer(city: string, motivation: string) { return apiRequest<ExplorerProfile>('/v1/explorer/apply', { method: 'POST', body: { city, motivation } }); }
export function activateExplorer() { return apiRequest<ExplorerProfile>('/v1/explorer/activate', { method: 'POST', body: { safetyAcknowledged: true } }); }
export function getExplorerMissions(city?: string) { return apiRequest<ExplorerMission[]>(`/v1/explorer/missions${city ? `?city=${encodeURIComponent(city)}` : ''}`); }
export function submitExplorerMission(missionId: string, text: string, latitude?: number, longitude?: number) { return apiRequest<ExplorerSubmission>(`/v1/explorer/missions/${missionId}/submissions`, { method: 'POST', body: { text, latitude, longitude } }); }
export function getExplorerSubmissions() { return apiRequest<ExplorerSubmission[]>('/v1/explorer/submissions'); }
