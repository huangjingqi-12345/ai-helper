import { logger } from '../utils/logger.js';

export interface DxDoctorCandidate {
  id: string;
  doctorId: number;
  phone: string;
  name: string;
  hospital: string;
  department: string;
  title: string;
  doctorLevel: string;
  inProgressCount: number;
  publishedCount: number;
  available: boolean;
}

interface DxDoctorRow {
  doctor_id?: unknown;
  phone?: unknown;
  name?: unknown;
  hospital?: unknown;
  department?: unknown;
  title?: unknown;
  doctor_level?: unknown;
  in_progress_count?: unknown;
  published_count?: unknown;
  available?: unknown;
}

function cleanBaseUrl(value: string): string {
  return value.replace(/\/+$/, '');
}

export function isDxDoctorsApiConfigured(): boolean {
  return Boolean(process.env.DX_API_BASE_URL?.trim());
}

function buildDxDoctorsUrl(): string {
  const baseUrl = cleanBaseUrl(process.env.DX_API_BASE_URL?.trim() ?? '');
  const path = process.env.DX_DOCTORS_PATH?.trim() || '/api/px/doctors';
  if (/^https?:\/\//i.test(path)) return path;
  if (baseUrl.endsWith('/api') && path.startsWith('/api/')) {
    return `${baseUrl}${path.slice('/api'.length)}`;
  }
  return `${baseUrl}${path.startsWith('/') ? '' : '/'}${path}`;
}

function headersForDxDoctors(): Record<string, string> {
  const headers: Record<string, string> = {
    Accept: 'application/json',
    'X-PX-Integration': 'doctor-candidates',
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
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (trimmed && trimmed.toLowerCase() !== 'null') return trimmed;
  }
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return fallback;
}

function asNumber(value: unknown, fallback = 0): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function asBool(value: unknown, fallback = true): boolean {
  if (value === true || value === 1 || value === '1' || value === 'true') return true;
  if (value === false || value === 0 || value === '0' || value === 'false') return false;
  return fallback;
}

function normalizeDoctor(row: DxDoctorRow): DxDoctorCandidate | null {
  const doctorId = asNumber(row.doctor_id, 0);
  const phone = asString(row.phone);
  if (!doctorId && !phone) return null;
  return {
    id: doctorId ? String(doctorId) : phone,
    doctorId,
    phone,
    name: asString(row.name, phone ? `医生 ${phone.slice(-4)}` : `医生 ${doctorId}`),
    hospital: asString(row.hospital, '未填写医院'),
    department: asString(row.department, '未填写科室'),
    title: asString(row.title, '未填写职称'),
    doctorLevel: asString(row.doctor_level, '初级'),
    inProgressCount: Math.max(0, asNumber(row.in_progress_count, 0)),
    publishedCount: Math.max(0, asNumber(row.published_count, 0)),
    available: asBool(row.available, true),
  };
}

export async function fetchDxDoctorCandidates(): Promise<DxDoctorCandidate[]> {
  if (!isDxDoctorsApiConfigured()) return [];

  const timeoutMs = Number(process.env.DX_API_TIMEOUT_MS ?? 5000);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), Number.isFinite(timeoutMs) ? timeoutMs : 5000);
  const url = buildDxDoctorsUrl();

  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: headersForDxDoctors(),
      signal: controller.signal,
    });
    const text = await response.text();
    if (!response.ok) throw new Error(`DX doctors API returned ${response.status}: ${text.slice(0, 160)}`);
    const payload = asRecord(JSON.parse(text || '{}'));
    const rows = Array.isArray(payload.doctors) ? payload.doctors : [];
    return rows
      .map((item) => normalizeDoctor(asRecord(item) as DxDoctorRow))
      .filter((item): item is DxDoctorCandidate => Boolean(item));
  } catch (error) {
    logger.warn({ err: error, url }, 'Failed to retrieve doctor candidates from DX');
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}
