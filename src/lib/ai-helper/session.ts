import { aiHelperAuthHeaders } from './auth';
import { filterVisibleDeliverables, normalizeDeliverableUrl } from './deliverables';
import type { ChatMessage } from './types';

export interface PersistedAiSession {
  conversationId: string;
  messages: ChatMessage[];
  updatedAt: string;
  expiresAt: string;
}

function normalizeMessage(message: ChatMessage): ChatMessage {
  const rawFiles = message.files || [];
  const normalizedFiles = rawFiles.map(normalizeDeliverableUrl);
  const pptSlides = [...new Set(normalizedFiles
    .filter((file) => file.toLowerCase().endsWith('.svg') && file.toLowerCase().includes('/svg_output/')))]
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }));
  const exportedPpt = normalizedFiles.find((file) => file.toLowerCase().endsWith('.pptx'));
  const progressSlides = message.pptSvgProgress?.slides?.length
    ? message.pptSvgProgress.slides
    : pptSlides;
  return {
    id: message.id,
    role: message.role,
    text: message.text || '',
    runId: message.runId,
    files: filterVisibleDeliverables(rawFiles),
    activePptContext: message.activePptContext,
    loading: Boolean(message.loading),
    loadingStatus: message.loadingStatus,
    modelProgressStatus: message.modelProgressStatus,
    hasModelProgress: Boolean(message.hasModelProgress),
    loadingElapsed: message.loadingElapsed,
    loadingStartedAt: message.loadingStartedAt,
    pptSvgProgress: message.pptSvgProgress || progressSlides.length
      ? {
          mode: 'spec',
          title: 'PPT 快速版页面预览',
          ...message.pptSvgProgress,
          slides: progressSlides,
          completed: Boolean(message.pptSvgProgress?.completed) || Boolean(exportedPpt),
          exportedPpt: message.pptSvgProgress?.exportedPpt || exportedPpt,
        }
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
