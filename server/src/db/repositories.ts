import { getDb } from './connection.js';

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
  const db = getDb();
  const row = db.prepare('SELECT * FROM overview_stats WHERE id = 1').get() as Record<string, unknown> | undefined;
  if (!row) return null;
  const r = toCamel(row);
  delete r.id;
  r.lastUpdated = new Date().toISOString();
  return r;
}

export function getOverviewProjects() {
  const db = getDb();
  const rows = db.prepare('SELECT * FROM projects ORDER BY created_at DESC').all() as Record<string, unknown>[];
  return rows.map(toCamel);
}

// === Content ===
export function getContentList(filters: { status?: string; type?: string; projectId?: string; page: number; pageSize: number }) {
  const db = getDb();
  const conditions: string[] = [];
  const params: unknown[] = [];

  if (filters.status) { conditions.push('status = ?'); params.push(filters.status); }
  if (filters.type) { conditions.push('type = ?'); params.push(filters.type); }
  if (filters.projectId) { conditions.push('project_id = ?'); params.push(filters.projectId); }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  const total = (db.prepare(`SELECT COUNT(*) as cnt FROM content ${where}`).get(...params) as { cnt: number }).cnt;
  const offset = (filters.page - 1) * filters.pageSize;
  const rows = db.prepare(`SELECT * FROM content ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`).all(...params, filters.pageSize, offset) as Record<string, unknown>[];

  return {
    data: rows.map((r) => parseJsonFields(toCamel(r), ['tags'])),
    total,
    totalPages: Math.ceil(total / filters.pageSize),
  };
}

export function getContentById(id: string) {
  const db = getDb();
  const row = db.prepare('SELECT * FROM content WHERE id = ?').get(id) as Record<string, unknown> | undefined;
  if (!row) return null;
  return parseJsonFields(toCamel(row), ['tags']);
}

export function createContent(data: Record<string, unknown>) {
  const db = getDb();
  const count = (db.prepare('SELECT COUNT(*) as cnt FROM content').get() as { cnt: number }).cnt;
  const id = `cnt-${String(count + 1).padStart(3, '0')}`;
  const now = new Date().toISOString();

  db.prepare(`
    INSERT INTO content (id, project_id, title, type, status, author, content, tags, read_count, like_count, bookmark_count, created_at, updated_at)
    VALUES (?, ?, ?, ?, 'draft', ?, ?, ?, 0, 0, 0, ?, ?)
  `).run(id, data.projectId, data.title, data.type, data.author, data.content || '', JSON.stringify(data.tags || []), now, now);

  return getContentById(id);
}

export function updateContent(id: string, data: Record<string, unknown>) {
  const db = getDb();
  const existing = db.prepare('SELECT id FROM content WHERE id = ?').get(id);
  if (!existing) return null;

  const updates: string[] = [];
  const params: unknown[] = [];
  const fieldMap: Record<string, string> = {
    title: 'title', type: 'type', status: 'status', author: 'author',
    content: 'content', publishedAt: 'published_at', projectId: 'project_id',
  };

  for (const [camel, snake] of Object.entries(fieldMap)) {
    if (data[camel] !== undefined) { updates.push(`${snake} = ?`); params.push(data[camel]); }
  }
  if (data.tags !== undefined) { updates.push('tags = ?'); params.push(JSON.stringify(data.tags)); }

  updates.push('updated_at = ?');
  params.push(new Date().toISOString());
  params.push(id);

  db.prepare(`UPDATE content SET ${updates.join(', ')} WHERE id = ?`).run(...params);
  return getContentById(id);
}

export function deleteContent(id: string): boolean {
  const db = getDb();
  const result = db.prepare('DELETE FROM content WHERE id = ?').run(id);
  return result.changes > 0;
}

// === Behavior ===
export function getBehaviorSummary() {
  const db = getDb();

  const stats = db.prepare('SELECT * FROM overview_stats WHERE id = 1').get() as Record<string, unknown>;
  const readTrend = db.prepare("SELECT date, value FROM behavior_trends WHERE type = 'reads' ORDER BY date").all();
  const interactionTrend = db.prepare("SELECT date, value FROM behavior_trends WHERE type = 'interactions' ORDER BY date").all();
  const topContent = db.prepare('SELECT content_id as contentId, title, reads, interactions FROM behavior_top_content ORDER BY reads DESC').all();
  const byDisease = db.prepare('SELECT disease, reads, interactions, push_count as pushCount FROM behavior_by_disease').all();

  return {
    totalReads: stats?.read_count ?? 24531,
    totalInteractions: stats?.interaction_count ?? 3876,
    avgReadDuration: 186,
    readTrend,
    interactionTrend,
    topContent,
    byDisease,
  };
}

export function getBehaviorTrends(type: string) {
  const db = getDb();
  const trendType = type === 'interactions' ? 'interactions' : 'reads';
  return db.prepare('SELECT date, value FROM behavior_trends WHERE type = ? ORDER BY date').all(trendType);
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
