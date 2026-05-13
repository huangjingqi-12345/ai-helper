import { getDb } from './connection.js';
import { overviewStats, overviewProjects } from '../data/overview.js';
import { contentList as seededContentList } from '../data/content.js';
import { behaviorSummary } from '../data/behavior.js';

type ContentRecord = {
  id: string;
  projectId: string;
  title: string;
  type: string;
  status: string;
  pipelineStage: string;
  priority: string;
  author: string;
  content: string;
  tags: string[];
  readCount: number;
  likeCount: number;
  bookmarkCount: number;
  createdAt: string;
  updatedAt: string;
  [key: string]: unknown;
};

let contentItems: ContentRecord[] = seededContentList.map((item) => ({ ...item, tags: [...item.tags] }));

// === Helper: convert snake_case row to camelCase ===
function toCamel(row: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(row)) {
    const camelKey = key.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
    result[camelKey] = val;
  }
  return result;
}

function parseJsonFields(obj: Record<string, unknown>, fields: string[]): Record<string, unknown> {
  for (const f of fields) {
    if (typeof obj[f] === 'string') {
      try { obj[f] = JSON.parse(obj[f] as string); } catch { /* keep as string */ }
    }
  }
  return obj;
}

// === Overview ===
export function getOverviewStats() {
  return overviewStats;
}

export function getOverviewProjects() {
  return overviewProjects;
}

// === Content ===
export function getContentList(filters: { status?: string; type?: string; projectId?: string; pipelineStage?: string; priority?: string; search?: string; page: number; pageSize: number }) {
  const normalizedStatus = filters.status === 'offline' ? 'archived' : filters.status;
  let rows = [...contentItems];
  if (normalizedStatus) rows = rows.filter((item) => item.status === normalizedStatus);
  if (filters.type) rows = rows.filter((item) => item.type === filters.type);
  if (filters.projectId) rows = rows.filter((item) => item.projectId === filters.projectId);
  if (filters.pipelineStage) rows = rows.filter((item) => item.pipelineStage === filters.pipelineStage);
  if (filters.priority) rows = rows.filter((item) => item.priority === filters.priority);
  if (filters.search) {
    const query = filters.search.toLowerCase();
    rows = rows.filter((item) => item.title.toLowerCase().includes(query) || item.id.toLowerCase().includes(query));
  }
  const total = rows.length;
  const offset = (filters.page - 1) * filters.pageSize;
  const pageRows = rows.slice(offset, offset + filters.pageSize);

  return {
    data: pageRows,
    total,
    totalPages: Math.ceil(total / filters.pageSize),
  };
}

export function getContentById(id: string) {
  return contentItems.find((item) => item.id.toLowerCase() === id.toLowerCase()) ?? null;
}

export function createContent(data: Record<string, unknown>) {
  const nextNumber = Math.max(...contentItems.map((item) => Number(item.id.replace(/\D/g, '')) || 100)) + 1;
  const id = `CNT-${nextNumber}`;
  const now = new Date().toISOString();
  const project = overviewProjects.find((p) => p.id === data.projectId);
  const newItem = {
    id,
    projectId: String(data.projectId || 'proj-hf'),
    title: String(data.title || '未命名内容'),
    type: (data.type || 'article') as 'article',
    status: 'draft' as const,
    pipelineStage: 'requirement_submitted' as const,
    priority: 'P2' as const,
    author: String(data.author || '系统管理员'),
    content: String(data.content || ''),
    tags: Array.isArray(data.tags) ? data.tags.map(String) : [],
    pushCount: 0,
    readUsers: 0,
    readCount: 0,
    likeCount: 0,
    dislikeCount: 0,
    bookmarkCount: 0,
    createdAt: now,
    updatedAt: now,
    projectName: project?.name || '未分配项目',
    projectColor: 'blue',
  };

  contentItems = [newItem, ...contentItems];
  return newItem;
}

export function updateContent(id: string, data: Record<string, unknown>) {
  const index = contentItems.findIndex((item) => item.id.toLowerCase() === id.toLowerCase());
  if (index === -1) return null;
  const current = contentItems[index]!;
  const updated = {
    ...current,
    ...data,
    tags: Array.isArray(data.tags) ? data.tags.map(String) : current.tags,
    updatedAt: new Date().toISOString(),
  };
  contentItems[index] = updated;
  return updated;
}

export function deleteContent(id: string): boolean {
  const before = contentItems.length;
  contentItems = contentItems.filter((item) => item.id.toLowerCase() !== id.toLowerCase());
  return contentItems.length !== before;
}

// === Behavior ===
export function getBehaviorSummary() {
  return behaviorSummary;
}

export function getBehaviorTrends(type: string) {
  return type === 'interactions' ? behaviorSummary.interactionTrend : behaviorSummary.readTrend;
}

// === Distribution ===
export function getStrategies(filters: { status?: string; page: number; pageSize: number }) {
  const db = getDb();
  const conditions: string[] = [];
  const params: unknown[] = [];

  if (filters.status) { conditions.push('status = ?'); params.push(filters.status); }
  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  const total = (db.prepare(`SELECT COUNT(*) as cnt FROM distribution_strategies ${where}`).get(...params) as { cnt: number }).cnt;
  const offset = (filters.page - 1) * filters.pageSize;
  const rows = db.prepare(`SELECT * FROM distribution_strategies ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`).all(...params, filters.pageSize, offset) as Record<string, unknown>[];

  const mapped = rows.map((row) => {
    const r = toCamel(row);
    parseJsonFields(r, ['targetRegions', 'targetDiseases', 'contentIds']);
    return {
      id: r.id,
      name: r.name,
      projectId: r.projectId,
      targetAudience: {
        regions: r.targetRegions,
        diseases: r.targetDiseases,
        patientCount: r.targetPatientCount,
      },
      contentIds: r.contentIds,
      schedule: {
        type: r.scheduleType,
        startDate: r.scheduleStartDate,
        endDate: r.scheduleEndDate,
        frequency: r.scheduleFrequency,
      },
      status: r.status,
      metrics: {
        pushed: r.metricsPushed,
        delivered: r.metricsDelivered,
        opened: r.metricsOpened,
        read: r.metricsRead,
      },
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
    };
  });

  return { data: mapped, total, totalPages: Math.ceil(total / filters.pageSize) };
}

export function createStrategy(data: Record<string, unknown>) {
  const db = getDb();
  const count = (db.prepare('SELECT COUNT(*) as cnt FROM distribution_strategies').get() as { cnt: number }).cnt;
  const id = `str-${String(count + 1).padStart(3, '0')}`;
  const now = new Date().toISOString();
  const ta = data.targetAudience as Record<string, unknown> || {};
  const sch = data.schedule as Record<string, unknown> || {};

  db.prepare(`
    INSERT INTO distribution_strategies (id, name, project_id, target_regions, target_diseases, target_patient_count, content_ids, schedule_type, schedule_start_date, schedule_end_date, schedule_frequency, status, metrics_pushed, metrics_delivered, metrics_opened, metrics_read, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'draft', 0, 0, 0, 0, ?, ?)
  `).run(
    id, data.name, data.projectId,
    JSON.stringify(ta.regions || []), JSON.stringify(ta.diseases || []), ta.patientCount || 0,
    JSON.stringify(data.contentIds || []),
    sch.type || 'immediate', sch.startDate || null, sch.endDate || null, sch.frequency || null,
    now, now,
  );

  return getStrategyById(id);
}

function getStrategyById(id: string) {
  const db = getDb();
  const row = db.prepare('SELECT * FROM distribution_strategies WHERE id = ?').get(id) as Record<string, unknown> | undefined;
  if (!row) return null;
  const r = toCamel(row);
  parseJsonFields(r, ['targetRegions', 'targetDiseases', 'contentIds']);
  return {
    id: r.id, name: r.name, projectId: r.projectId,
    targetAudience: { regions: r.targetRegions, diseases: r.targetDiseases, patientCount: r.targetPatientCount },
    contentIds: r.contentIds,
    schedule: { type: r.scheduleType, startDate: r.scheduleStartDate, endDate: r.scheduleEndDate, frequency: r.scheduleFrequency },
    status: r.status,
    metrics: { pushed: r.metricsPushed, delivered: r.metricsDelivered, opened: r.metricsOpened, read: r.metricsRead },
    createdAt: r.createdAt, updatedAt: r.updatedAt,
  };
}

export function updateStrategy(id: string, data: Record<string, unknown>) {
  const db = getDb();
  const existing = db.prepare('SELECT id FROM distribution_strategies WHERE id = ?').get(id);
  if (!existing) return null;

  const updates: string[] = [];
  const params: unknown[] = [];

  if (data.name !== undefined) { updates.push('name = ?'); params.push(data.name); }
  if (data.status !== undefined) { updates.push('status = ?'); params.push(data.status); }
  updates.push('updated_at = ?'); params.push(new Date().toISOString());
  params.push(id);

  db.prepare(`UPDATE distribution_strategies SET ${updates.join(', ')} WHERE id = ?`).run(...params);
  return getStrategyById(id);
}

// === Approval ===
export function getApprovalQueue(filters: { status?: string; page: number; pageSize: number }) {
  const db = getDb();
  const conditions: string[] = [];
  const params: unknown[] = [];

  if (filters.status) { conditions.push('status = ?'); params.push(filters.status); }
  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  const total = (db.prepare(`SELECT COUNT(*) as cnt FROM approval_items ${where}`).get(...params) as { cnt: number }).cnt;
  const offset = (filters.page - 1) * filters.pageSize;
  const rows = db.prepare(`SELECT * FROM approval_items ${where} ORDER BY submitted_at DESC LIMIT ? OFFSET ?`).all(...params, filters.pageSize, offset) as Record<string, unknown>[];

  return {
    data: rows.map(toCamel),
    total,
    totalPages: Math.ceil(total / filters.pageSize),
  };
}

export function approveItem(id: string, comments?: string) {
  const db = getDb();
  const existing = db.prepare('SELECT id FROM approval_items WHERE id = ?').get(id);
  if (!existing) return null;

  db.prepare(`
    UPDATE approval_items SET status = 'approved', reviewed_by = '管理员', reviewed_at = ?, comments = ? WHERE id = ?
  `).run(new Date().toISOString(), comments || '审批通过', id);

  const row = db.prepare('SELECT * FROM approval_items WHERE id = ?').get(id) as Record<string, unknown>;
  return toCamel(row);
}

export function rejectItem(id: string, comments?: string) {
  const db = getDb();
  const existing = db.prepare('SELECT id FROM approval_items WHERE id = ?').get(id);
  if (!existing) return null;

  db.prepare(`
    UPDATE approval_items SET status = 'rejected', reviewed_by = '管理员', reviewed_at = ?, comments = ? WHERE id = ?
  `).run(new Date().toISOString(), comments || '审批不通过', id);

  const row = db.prepare('SELECT * FROM approval_items WHERE id = ?').get(id) as Record<string, unknown>;
  return toCamel(row);
}

// === Platform ===
export function getUsers(filters: { page: number; pageSize: number }) {
  const db = getDb();
  const total = (db.prepare('SELECT COUNT(*) as cnt FROM users').get() as { cnt: number }).cnt;
  const offset = (filters.page - 1) * filters.pageSize;
  const rows = db.prepare('SELECT * FROM users ORDER BY created_at DESC LIMIT ? OFFSET ?').all(filters.pageSize, offset) as Record<string, unknown>[];

  return {
    data: rows.map(toCamel),
    total,
    totalPages: Math.ceil(total / filters.pageSize),
  };
}

export function updateUser(id: string, data: Record<string, unknown>) {
  const db = getDb();
  const existing = db.prepare('SELECT id FROM users WHERE id = ?').get(id);
  if (!existing) return null;

  const updates: string[] = [];
  const params: unknown[] = [];
  const fieldMap: Record<string, string> = { name: 'name', email: 'email', role: 'role', region: 'region', status: 'status' };

  for (const [camel, snake] of Object.entries(fieldMap)) {
    if (data[camel] !== undefined) { updates.push(`${snake} = ?`); params.push(data[camel]); }
  }
  if (updates.length === 0) return getUserById(id);
  params.push(id);

  db.prepare(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`).run(...params);
  return getUserById(id);
}

function getUserById(id: string) {
  const db = getDb();
  const row = db.prepare('SELECT * FROM users WHERE id = ?').get(id) as Record<string, unknown> | undefined;
  return row ? toCamel(row) : null;
}

export function getPlatformSettings() {
  const db = getDb();
  const rows = db.prepare('SELECT key, value FROM platform_settings').all() as { key: string; value: string }[];
  const settings: Record<string, unknown> = {};
  for (const row of rows) {
    try { settings[row.key] = JSON.parse(row.value); } catch { settings[row.key] = row.value; }
  }
  return settings;
}

export function updatePlatformSettings(data: Record<string, unknown>) {
  const db = getDb();
  const upsert = db.prepare('INSERT INTO platform_settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value');
  for (const [key, val] of Object.entries(data)) {
    upsert.run(key, typeof val === 'string' ? val : JSON.stringify(val));
  }
  return getPlatformSettings();
}
