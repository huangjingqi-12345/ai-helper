import { logger } from '../utils/logger.js';

const DEFAULT_DX_API_BASE_URL = 'https://uat-dx.senzco.com';

export type DxTaskLifecycleStatus = 'assigned' | 'dx_review' | 'dx_revising' | 'draft_finalized' | 'published';

export interface DxTaskStatusItem {
  px_task_id: string;
  dx_task_id: string;
  title?: string;
  drug?: string;
  brief?: string;
  task_type?: string;
  content_format?: string;
  priority?: string;
  count?: number;
  unit_price?: number;
  status: DxTaskLifecycleStatus | string;
  deadline?: string | null;
  assigned_at?: string | null;
  submitted_at?: string | null;
  reviewed_at?: string | null;
  updated_at: string;
  doctor_id?: number | null;
  latest_submission?: Record<string, unknown> | null;
  latest_review?: Record<string, unknown> | null;
}

export interface DxTaskStatusListResponse {
  items: DxTaskStatusItem[];
  total: number;
  has_more: boolean;
}

function cleanBaseUrl(value: string): string {
  return value.replace(/\/+$/, '');
}

export function isDxTaskStatusApiConfigured(): boolean {
  return Boolean(process.env.DX_API_BASE_URL?.trim() || DEFAULT_DX_API_BASE_URL);
}

function buildDxTasksUrl(params: { since?: string; status?: string; limit?: number }): string {
  const baseUrl = cleanBaseUrl(process.env.DX_API_BASE_URL?.trim() || DEFAULT_DX_API_BASE_URL);
  const path = process.env.DX_TASKS_PATH?.trim() || '/api/px/tasks';
  const rawUrl = /^https?:\/\//i.test(path)
    ? path
    : baseUrl.endsWith('/api') && path.startsWith('/api/')
      ? `${baseUrl}${path.slice('/api'.length)}`
      : `${baseUrl}${path.startsWith('/') ? '' : '/'}${path}`;
  const url = new URL(rawUrl);
  if (params.since) url.searchParams.set('since', params.since);
  if (params.status) url.searchParams.set('status', params.status);
  url.searchParams.set('limit', String(Math.min(Math.max(params.limit ?? 200, 1), 200)));
  return url.toString();
}

function headersForDxTasks(): Record<string, string> {
  const headers: Record<string, string> = {
    Accept: 'application/json',
    'X-PX-Integration': 'task-status-sync',
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

function asNumber(value: unknown, fallback = 0): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function asBool(value: unknown): boolean {
  return value === true || value === 1 || value === '1' || value === 'true';
}

function asNullableRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function normalizeItem(value: unknown): DxTaskStatusItem | null {
  const item = asRecord(value);
  const pxTaskId = asString(item.px_task_id);
  const updatedAt = asString(item.updated_at);
  if (!pxTaskId || !updatedAt) return null;
  return {
    px_task_id: pxTaskId,
    dx_task_id: asString(item.dx_task_id),
    title: asString(item.title) || undefined,
    drug: asString(item.drug) || undefined,
    brief: asString(item.brief) || undefined,
    task_type: asString(item.task_type) || undefined,
    content_format: asString(item.content_format) || undefined,
    priority: asString(item.priority) || undefined,
    count: asNumber(item.count),
    unit_price: asNumber(item.unit_price),
    status: asString(item.status, 'assigned'),
    deadline: asString(item.deadline) || null,
    assigned_at: asString(item.assigned_at) || null,
    submitted_at: asString(item.submitted_at) || null,
    reviewed_at: asString(item.reviewed_at) || null,
    updated_at: updatedAt,
    doctor_id: item.doctor_id === null || item.doctor_id === undefined ? null : asNumber(item.doctor_id),
    latest_submission: asNullableRecord(item.latest_submission),
    latest_review: asNullableRecord(item.latest_review),
  };
}

export async function fetchDxTaskStatuses(params: { since?: string; status?: string; limit?: number } = {}): Promise<DxTaskStatusListResponse> {
  if (!isDxTaskStatusApiConfigured()) {
    throw new Error('DX task status API is not configured');
  }

  const timeoutMs = Number(process.env.DX_API_TIMEOUT_MS ?? 5000);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), Number.isFinite(timeoutMs) ? timeoutMs : 5000);
  const url = buildDxTasksUrl(params);

  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: headersForDxTasks(),
      signal: controller.signal,
    });
    const text = await response.text();
    if (!response.ok) throw new Error(`DX task status API returned ${response.status}: ${text.slice(0, 200)}`);

    const body = asRecord(JSON.parse(text || '{}'));
    const items = Array.isArray(body.items) ? body.items.map(normalizeItem).filter(Boolean) as DxTaskStatusItem[] : [];
    return {
      items,
      total: asNumber(body.total, items.length),
      has_more: asBool(body.has_more),
    };
  } catch (error) {
    logger.warn({ err: error, url }, 'Failed to fetch DX task statuses');
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}
