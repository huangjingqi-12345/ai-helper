import { aiHelperAuthHeaders } from './auth';
import type { ChatMessage } from './types';

export interface PersistedAiSession {
  conversationId: string;
  messages: ChatMessage[];
  updatedAt: string;
  expiresAt: string;
}

function normalizeMessage(message: ChatMessage): ChatMessage {
  return {
    id: message.id,
    role: message.role,
    text: message.text || '',
    files: message.files || [],
    loading: false,
    pptSvgProgress: message.pptSvgProgress
      ? { ...message.pptSvgProgress, completed: message.pptSvgProgress.completed }
      : undefined,
  };
}

export async function fetchAiHelperSession(): Promise<PersistedAiSession | null> {
  const resp = await fetch('/api/ai-helper/session', {
    method: 'GET',
    headers: aiHelperAuthHeaders(),
  });
  if (!resp.ok) return null;
  const body = await resp.json() as { data?: PersistedAiSession | null };
  if (!body.data) return null;
  return {
    ...body.data,
    messages: Array.isArray(body.data.messages) ? body.data.messages.map(normalizeMessage) : [],
  };
}

export async function saveAiHelperSession(conversationId: string, messages: ChatMessage[], signal?: AbortSignal): Promise<void> {
  await fetch('/api/ai-helper/session', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', ...aiHelperAuthHeaders() },
    body: JSON.stringify({
      conversation_id: conversationId,
      messages: messages.map(normalizeMessage),
    }),
    signal,
  });
}

export async function deleteAiHelperSession(): Promise<void> {
  await fetch('/api/ai-helper/session', {
    method: 'DELETE',
    headers: aiHelperAuthHeaders(),
  });
}
