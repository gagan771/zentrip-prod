import { apiRequest } from './api-client';
import type { KnowledgeCitation } from './knowledge';

export type AgentMessageResponse = {
  interactionId?: string | null;
  intent: string;
  policyTier: string;
  reply: string;
  confidence: string;
  citations: KnowledgeCitation[];
  items: string[];
  sessionId: string | null;
};

export function submitAgentFeedback(
  interactionId: string,
  helpful: boolean,
  note?: string,
): Promise<{ id: string; feedback: string | null; outcome: string }> {
  return apiRequest(`/v1/knowledge/interactions/${interactionId}/feedback`, {
    method: 'POST',
    body: { helpful, note },
  });
}

export function sendAgentMessage(text: string, tripId?: string): Promise<AgentMessageResponse> {
  return apiRequest<AgentMessageResponse>('/v1/agent/message', {
    method: 'POST',
    body: { text, tripId },
  });
}
