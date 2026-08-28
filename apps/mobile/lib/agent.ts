import { apiRequest } from './api-client';
import type { KnowledgeCitation } from './knowledge';

export type AgentMessageResponse = {
  intent: string;
  policyTier: string;
  reply: string;
  confidence: string;
  citations: KnowledgeCitation[];
  items: string[];
  sessionId: string | null;
};

export function sendAgentMessage(text: string, tripId?: string): Promise<AgentMessageResponse> {
  return apiRequest<AgentMessageResponse>('/v1/agent/message', {
    method: 'POST',
    body: { text, tripId },
  });
}
