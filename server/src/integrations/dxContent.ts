import { logger } from '../utils/logger.js';

const DEFAULT_DX_API_BASE_URL = 'https://uat-dx.senzco.com';

export type DxAttachmentSource = 'dx_api' | 'local_cache';
export type DxAttachmentStatus = 'pending' | 'ready' | 'unavailable';

export interface DxContentAttachment {
  id?: string;
  type: 'content_detail';
  label: string;
  contentId: string;
  title?: string;
  contentType?: string;
  excerpt?: string;
  body?: string;
  tags?: string[];
  priority?: string;
  projectName?: string;
  disease?: string;
  author?: string;
  updatedAt?: string;
  versionNo?: number;
  immutableHash?: string;
  route?: string;
  source: DxAttachmentSource;
  sourceLabel?: string;
  status: DxAttachmentStatus;
  retrievedAt?: string;
  error?: string;
}

function cleanBaseUrl(value: string): string {
  return value.replace(/\/+$/, '');
}

export function isDxContentApiConfigured(): boolean {
  return Boolean((process.env.DX_API_BASE_URL?.trim() || DEFAULT_DX_API_BASE_URL));
}

function buildDxContentUrl(contentId: string): string {
  const baseUrl = cleanBaseUrl(process.env.DX_API_BASE_URL?.trim() || DEFAULT_DX_API_BASE_URL);
  const template = process.env.DX_CONTENT_DETAIL_PATH_TEMPLATE?.trim() || '/content/{contentId}';
  const encodedId = encodeURIComponent(contentId);
  const path = template.replaceAll('{contentId}', encodedId);
  if (/^https?:\/\//i.test(path)) return path;
  return `${baseUrl}${path.startsWith('/') ? '' : '/'}${path}`;
}

function headersForDx(taskContext?: { taskId?: string; tenantId?: string }): Record<string, string> {
  const headers: Record<string, string> = {
    Accept: 'application/json',
    'X-PX-Integration': 'approval-content-attachment',
  };
  const token = process.env.DX_API_TOKEN?.trim();
  const apiKey = process.env.DX_API_KEY?.trim();
  if (token) headers.Authorization = `Bearer ${token}`;
  if (apiKey) headers['X-API-Key'] = apiKey;
  if (taskContext?.taskId) headers['X-PX-Approval-Task-Id'] = taskContext.taskId;
  if (taskContext?.tenantId) headers['X-PX-Tenant-Id'] = taskContext.tenantId;
  return headers;
}

function parseJsonMaybe(text: string): unknown {
  if (!text.trim()) return {};
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return { body: text };
  }
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function unwrapPayload(value: unknown): Record<string, unknown> {
  const root = asRecord(value);
  const data = asRecord(root.data);
  const content = asRecord(root.content);
  const attachment = asRecord(root.attachment);
  if (Object.keys(attachment).length > 0) return attachment;
  if (Array.isArray(root.attachments) && root.attachments.length > 0) return asRecord(root.attachments[0]);
  if (Array.isArray(data.attachments) && data.attachments.length > 0) return asRecord(data.attachments[0]);
  if (Object.keys(asRecord(data.attachment)).length > 0) return asRecord(data.attachment);
  if (Object.keys(asRecord(data.content)).length > 0) return asRecord(data.content);
  if (Object.keys(content).length > 0) return content;
  if (Object.keys(data).length > 0) return data;
  return root;
}

function textField(record: Record<string, unknown>, keys: string[], fallback = ''): string {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === 'string' && value.trim()) return value;
    if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  }
  return fallback;
}

function optionalText(record: Record<string, unknown>, keys: string[]): string | undefined {
  const value = textField(record, keys, '');
  return value || undefined;
}

function numberField(record: Record<string, unknown>, keys: string[]): number | undefined {
  for (const key of keys) {
    const raw = record[key];
    const parsed = Number(raw);
    if (Number.isFinite(parsed) && parsed > 0) return parsed;
  }
  return undefined;
}

function normalizeTags(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(String).map((item) => item.trim()).filter(Boolean);
  if (typeof value === 'string') {
    return value.split(/[，,、\s]+/).map((item) => item.trim()).filter(Boolean);
  }
  return [];
}

function tagsField(record: Record<string, unknown>): string[] {
  const direct = normalizeTags(record.tags);
  if (direct.length > 0) return direct;
  return normalizeTags(record.keywords);
}

export async function fetchDxContentAttachment(
  contentId: string,
  taskContext?: { taskId?: string; tenantId?: string },
): Promise<DxContentAttachment | null> {
  if (!isDxContentApiConfigured()) return null;

  const timeoutMs = Number(process.env.DX_API_TIMEOUT_MS ?? 5000);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), Number.isFinite(timeoutMs) ? timeoutMs : 5000);
  const url = buildDxContentUrl(contentId);

  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: headersForDx(taskContext),
      signal: controller.signal,
    });

    const text = await response.text();
    if (!response.ok) {
      throw new Error(`DX content API returned ${response.status}: ${text.slice(0, 160)}`);
    }

    const payload = unwrapPayload(parseJsonMaybe(text));
    const body = textField(payload, ['body', 'content', 'markdown', 'renderedContent', 'detail', 'details', 'text', 'html']);

    return {
      id: optionalText(payload, ['id', 'attachmentId']),
      type: 'content_detail',
      label: textField(payload, ['label'], '患教内容详情'),
      contentId: textField(payload, ['contentId', 'content_id', 'id'], contentId),
      title: optionalText(payload, ['title', 'contentTitle', 'name']),
      contentType: optionalText(payload, ['contentType', 'content_type', 'type', 'format']),
      excerpt: optionalText(payload, ['excerpt', 'summary', 'abstract']),
      body,
      tags: tagsField(payload),
      priority: optionalText(payload, ['priority']),
      projectName: optionalText(payload, ['projectName', 'project_name']),
      disease: optionalText(payload, ['disease', 'diseaseName', 'disease_name']),
      author: optionalText(payload, ['author', 'doctorName', 'doctor_name', 'submittedBy']),
      updatedAt: optionalText(payload, ['updatedAt', 'updated_at', 'submittedAt', 'submitted_at']),
      versionNo: numberField(payload, ['versionNo', 'version_no', 'version']),
      immutableHash: optionalText(payload, ['immutableHash', 'immutable_hash', 'hash']),
      route: `/content/${contentId}`,
      source: 'dx_api',
      sourceLabel: 'DX API',
      status: 'ready',
      retrievedAt: new Date().toISOString(),
    };
  } catch (error) {
    logger.warn({ err: error, contentId, url }, 'Failed to retrieve approval attachment from DX content API');
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}
