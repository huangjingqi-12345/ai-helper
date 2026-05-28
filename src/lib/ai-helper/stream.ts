import type { ChatMessage, ShortcutRunOptions, StreamEvent } from './types';
import { aiHelperAuthHeaders } from './auth';

export function formatProgressStatus(data: unknown): string {
  if (typeof data === 'string') return data;
  if (!data || typeof data !== 'object') return '';
  const message = String((data as { message?: string }).message || '').trim();
  if (!message) return '';
  const detail = String((data as { detail?: string }).detail || '').trim();
  if (!detail) return message;
  return `${message} · ${detail}`;
}

export async function* readNdjsonStream(
  body: ReadableStream<Uint8Array>,
): AsyncGenerator<StreamEvent> {
  const reader = body.getReader();
  const decoder = new TextDecoder('utf-8');
  let buffer = '';

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';
    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        yield JSON.parse(line) as StreamEvent;
      } catch {
        /* skip malformed */
      }
    }
  }

  if (buffer.trim()) {
    try {
      yield JSON.parse(buffer) as StreamEvent;
    } catch {
      /* skip */
    }
  }
}

export async function postAiHelperStream(
  message: string,
  conversationId: string,
  runId: string,
  options: ShortcutRunOptions = {},
  signal?: AbortSignal,
  history: Pick<ChatMessage, 'role' | 'text' | 'files' | 'activePptContext'>[] = [],
): Promise<Response> {
  const body = JSON.stringify({
    command: '',
    message,
    conversation_id: conversationId,
    run_id: runId,
    shortcut: options.shortcut,
    data_scope: options.data_scope,
    history,
  });

  let resp = await fetch('/api/ai-helper/run/stream', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...aiHelperAuthHeaders() },
    body,
    signal,
  });

  if (resp.status === 404) {
    resp = await fetch('/api/ai-helper/command/stream', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...aiHelperAuthHeaders() },
      body,
      signal,
    });
  }

  return resp;
}
