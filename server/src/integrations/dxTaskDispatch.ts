import { logger } from '../utils/logger.js';

const DEFAULT_DX_API_BASE_URL = 'https://uat-dx.senzco.com';

export type DxTaskPriority = 'high' | 'mid' | 'low';

export interface DxTaskDispatchRequest {
  px_task_id: string;
  title: string;
  drug?: string;
  brief?: string;
  task_type?: string;
  content_format?: string;
  priority?: DxTaskPriority;
  count: number;
  unit_price?: number;
  deadline?: string;
  doctor_assignment: {
    doctor_id?: number;
    doctor_phone?: string;
  };
}

export interface DxTaskDispatchResponse {
  dx_task_id: string;
  px_task_id: string;
  status: string;
  assigned_at: string;
  idempotent: boolean;
}

function cleanBaseUrl(value: string): string {
  return value.replace(/\/+$/, '');
}

export function isDxTaskDispatchConfigured(): boolean {
  return Boolean((process.env.DX_API_BASE_URL?.trim() || DEFAULT_DX_API_BASE_URL));
}

function buildDxTasksUrl(): string {
  const baseUrl = cleanBaseUrl(process.env.DX_API_BASE_URL?.trim() || DEFAULT_DX_API_BASE_URL);
  const path = process.env.DX_TASKS_PATH?.trim() || '/api/px/tasks';
  if (/^https?:\/\//i.test(path)) return path;
  if (baseUrl.endsWith('/api') && path.startsWith('/api/')) {
    return `${baseUrl}${path.slice('/api'.length)}`;
  }
  return `${baseUrl}${path.startsWith('/') ? '' : '/'}${path}`;
}

function headersForDxTasks(): Record<string, string> {
  const headers: Record<string, string> = {
    Accept: 'application/json',
    'Content-Type': 'application/json',
    'X-PX-Integration': 'task-dispatch',
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

export async function dispatchDxTask(payload: DxTaskDispatchRequest): Promise<DxTaskDispatchResponse> {
  if (!isDxTaskDispatchConfigured()) {
    throw new Error('DX task dispatch API is not configured');
  }

  const timeoutMs = Number(process.env.DX_API_TIMEOUT_MS ?? 5000);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), Number.isFinite(timeoutMs) ? timeoutMs : 5000);
  const url = buildDxTasksUrl();

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: headersForDxTasks(),
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    const text = await response.text();
    if (!response.ok) throw new Error(`DX task dispatch API returned ${response.status}: ${text.slice(0, 200)}`);

    const body = asRecord(JSON.parse(text || '{}'));
    return {
      dx_task_id: asString(body.dx_task_id),
      px_task_id: asString(body.px_task_id, payload.px_task_id),
      status: asString(body.status, 'assigned'),
      assigned_at: asString(body.assigned_at, new Date().toISOString()),
      idempotent: asBool(body.idempotent),
    };
  } catch (error) {
    logger.warn({ err: error, url, pxTaskId: payload.px_task_id }, 'Failed to dispatch PX task to DX');
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}
