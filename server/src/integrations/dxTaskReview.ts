import { logger } from '../utils/logger.js';

const DEFAULT_DX_API_BASE_URL = 'https://uat-dx.senzco.com';

export type DxTaskReviewVerdict = 'pass' | 'reject';
export type DxTaskReviewNode = 2 | 3;

export interface DxTaskReviewRequest {
  reviewer_node: DxTaskReviewNode;
  reviewer_type: '运营' | '药企';
  reviewer_label?: string;
  verdict: DxTaskReviewVerdict;
  suggestion?: string;
  reviewed_at?: string;
  submission_id?: number;
}

export interface DxTaskReviewResponse {
  ok: boolean;
  dx_task_id: string;
  new_status: string;
}

function cleanBaseUrl(value: string): string {
  return value.replace(/\/+$/, '');
}

export function isDxTaskReviewConfigured(): boolean {
  return Boolean(process.env.DX_API_BASE_URL?.trim() || DEFAULT_DX_API_BASE_URL);
}

function buildDxTaskReviewUrl(pxTaskId: string): string {
  const baseUrl = cleanBaseUrl(process.env.DX_API_BASE_URL?.trim() || DEFAULT_DX_API_BASE_URL);
  const path = process.env.DX_TASKS_PATH?.trim() || '/api/px/tasks';
  const rawUrl = /^https?:\/\//i.test(path)
    ? path
    : baseUrl.endsWith('/api') && path.startsWith('/api/')
      ? `${baseUrl}${path.slice('/api'.length)}`
      : `${baseUrl}${path.startsWith('/') ? '' : '/'}${path}`;
  return `${rawUrl.replace(/\/+$/, '')}/${encodeURIComponent(pxTaskId)}/review`;
}

function headersForDxReview(): Record<string, string> {
  const headers: Record<string, string> = {
    Accept: 'application/json',
    'Content-Type': 'application/json',
    'X-PX-Integration': 'task-review',
  };
  const token = process.env.DX_API_TOKEN?.trim();
  const apiKey = process.env.DX_API_KEY?.trim();
  if (token) headers.Authorization = `Bearer ${token}`;
  if (apiKey) headers['X-API-Key'] = apiKey;
  return headers;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function asString(value: unknown, fallback = ''): string {
  if (typeof value === 'string' && value.trim()) return value.trim();
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return fallback;
}

function asBool(value: unknown): boolean {
  return value === true || value === 1 || value === '1' || value === 'true';
}

export async function reviewDxTask(pxTaskId: string, payload: DxTaskReviewRequest): Promise<DxTaskReviewResponse> {
  if (!isDxTaskReviewConfigured()) {
    throw new Error('DX task review API is not configured');
  }

  const timeoutMs = Number(process.env.DX_API_TIMEOUT_MS ?? 5000);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), Number.isFinite(timeoutMs) ? timeoutMs : 5000);
  const url = buildDxTaskReviewUrl(pxTaskId);

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: headersForDxReview(),
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    const text = await response.text();
    if (!response.ok) throw new Error(`DX task review API returned ${response.status}: ${text.slice(0, 200)}`);

    const body = asRecord(JSON.parse(text || '{}'));
    return {
      ok: asBool(body.ok),
      dx_task_id: asString(body.dx_task_id),
      new_status: asString(body.new_status),
    };
  } catch (error) {
    logger.warn({ err: error, url, pxTaskId, verdict: payload.verdict }, 'Failed to write PX review back to DX');
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}
