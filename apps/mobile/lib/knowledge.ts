import { apiRequest } from './api-client';

export type KnowledgeCitation = {
  sourceName: string;
  sourceUrl?: string | null;
  sourceLocator?: string | null;
  lastVerified: string;
  confidence: string;
};

export type KnowledgeClaim = {
  claimId: string;
  entityId: string;
  entityName: string;
  entityType: string;
  city: string;
  claim: string;
  language: string;
  citation: KnowledgeCitation;
};

export type KnowledgeSearchResponse = {
  query: string;
  city: string | null;
  results: KnowledgeClaim[];
};

export function searchKnowledge(query: string, city?: string): Promise<KnowledgeSearchResponse> {
  const params = new URLSearchParams({ q: query });
  if (city) params.set('city', city);
  return apiRequest<KnowledgeSearchResponse>(`/v1/knowledge/search?${params.toString()}`);
}
