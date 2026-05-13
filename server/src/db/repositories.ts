import { dbAll, dbGet, dbRun, DB_DRIVER } from './connection.js';

const jsonCast = DB_DRIVER === 'postgres' ? '::jsonb' : '';
const boolValue = (value: boolean): boolean | number => (DB_DRIVER === 'postgres' ? value : value ? 1 : 0);

function toCamel(row: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(row)) {
    const camelKey = key.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase());
    result[camelKey] = val;
  }
  return result;
}

function parseJson<T>(value: unknown, fallback: T): T {
  if (Array.isArray(value) || (value && typeof value === 'object')) return value as T;
  if (typeof value !== 'string' || value.length === 0) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function parseJsonFields(obj: Record<string, unknown>, fields: string[]): Record<string, unknown> {
  for (const field of fields) {
    obj[field] = parseJson(obj[field], []);
  }
  return obj;
}

function asNumber(value: unknown, fallback = 0): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function asBool(value: unknown): boolean {
  return value === true || value === 1 || value === '1' || value === 'true';
}


const projectColors: Record<string, string> = {
  'proj-breast': 'purple',
  'proj-hf': 'cyan',
  'proj-diabetes': 'blue',
  'proj-ra': 'yellow',
  'proj-mm': 'red',
  'proj-lung': 'green',
  'proj-hypertension': 'red',
  'proj-copd': 'cyan',
};

function mapContentRow(row: Record<string, unknown>) {
  const content = toCamel(row);
  parseJsonFields(content, ['tags']);
  return {
    ...content,
    projectColor: projectColors[String(content.projectId)] ?? 'blue',
  };
}

// === Overview ===
export async function getOverviewStats() {
  const row = await dbGet<Record<string, unknown>>('SELECT * FROM overview_stats WHERE id = 1');
  return row ? toCamel(row) : { lastUpdated: new Date().toISOString() };
}

export async function getOverviewProjects() {
  const rows = await dbAll<Record<string, unknown>>('SELECT * FROM projects ORDER BY read_count DESC, updated_at DESC');
  return rows.map(toCamel);
}

// === Content ===
export async function getContentList(filters: { status?: string; type?: string; projectId?: string; pipelineStage?: string; priority?: string; search?: string; page: number; pageSize: number }) {
  const conditions: string[] = [];
  const params: unknown[] = [];
  const normalizedStatus = filters.status === 'offline' ? 'archived' : filters.status;

  if (normalizedStatus) { conditions.push('c.status = ?'); params.push(normalizedStatus); }
  if (filters.type) { conditions.push('c.type = ?'); params.push(filters.type); }
  if (filters.projectId) { conditions.push('c.project_id = ?'); params.push(filters.projectId); }
  if (filters.pipelineStage) { conditions.push('c.pipeline_stage = ?'); params.push(filters.pipelineStage); }
  if (filters.priority) { conditions.push('c.priority = ?'); params.push(filters.priority); }
  if (filters.search) {
    conditions.push('(LOWER(c.title) LIKE ? OR LOWER(c.id) LIKE ?)');
    const query = `%${filters.search.toLowerCase()}%`;
    params.push(query, query);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const totalRow = await dbGet<{ cnt: number | string }>(`SELECT COUNT(*) as cnt FROM content c ${where}`, params);
  const total = Number(totalRow?.cnt ?? 0);
  const offset = (filters.page - 1) * filters.pageSize;
  const rows = await dbAll<Record<string, unknown>>(`
    SELECT c.*, p.name AS project_name
    FROM content c
    LEFT JOIN projects p ON p.id = c.project_id
    ${where}
    ORDER BY c.updated_at DESC
    LIMIT ? OFFSET ?
  `, [...params, filters.pageSize, offset]);

  return {
    data: rows.map(mapContentRow),
    total,
    totalPages: Math.ceil(total / filters.pageSize),
  };
}

export async function getContentById(id: string) {
  const row = await dbGet<Record<string, unknown>>(`
    SELECT c.*, p.name AS project_name
    FROM content c
    LEFT JOIN projects p ON p.id = c.project_id
    WHERE LOWER(c.id) = LOWER(?)
  `, [id]);
  return row ? mapContentRow(row) : null;
}

export async function createContent(data: Record<string, unknown>) {
  const rows = await dbAll<{ id: string }>("SELECT id FROM content WHERE id LIKE 'CNT-%'");
  const nextNumber = Math.max(100, ...rows.map((item) => Number(item.id.replace(/\D/g, '')) || 100)) + 1;
  const id = `CNT-${nextNumber}`;
  const now = new Date().toISOString();
  const projectId = String(data.projectId || 'proj-hf');

  await dbRun(`
    INSERT INTO content (id, tenant_id, project_id, title, type, status, pipeline_stage, priority, author, excerpt, content, tags, push_count, read_users, read_count, like_count, dislike_count, bookmark_count, share_count, created_at, updated_at)
    VALUES (?, 'T-PX', ?, ?, ?, 'draft', 'requirement_submitted', 'P2', ?, ?, ?, ?${jsonCast}, 0, 0, 0, 0, 0, 0, 0, ?, ?)
  `, [
    id,
    projectId,
    String(data.title || '未命名内容'),
    String(data.type || 'article'),
    String(data.author || '系统管理员'),
    typeof data.excerpt === 'string' ? data.excerpt : null,
    String(data.content || ''),
    JSON.stringify(Array.isArray(data.tags) ? data.tags.map(String) : []),
    now,
    now,
  ]);

  return getContentById(id);
}

export async function updateContent(id: string, data: Record<string, unknown>) {
  const existing = await dbGet('SELECT id FROM content WHERE LOWER(id) = LOWER(?)', [id]);
  if (!existing) return null;

  const updates: string[] = [];
  const params: unknown[] = [];
  const fieldMap: Record<string, string> = {
    projectId: 'project_id',
    title: 'title',
    type: 'type',
    status: 'status',
    pipelineStage: 'pipeline_stage',
    priority: 'priority',
    author: 'author',
    excerpt: 'excerpt',
    content: 'content',
    expectedDate: 'expected_date',
    rejectionNote: 'rejection_note',
  };

  for (const [camel, snake] of Object.entries(fieldMap)) {
    if (data[camel] !== undefined) {
      updates.push(`${snake} = ?`);
      params.push(data[camel]);
    }
  }
  if (Array.isArray(data.tags)) {
    updates.push(`tags = ?${jsonCast}`);
    params.push(JSON.stringify(data.tags.map(String)));
  }

  if (updates.length === 0) return getContentById(id);
  updates.push('updated_at = ?');
  params.push(new Date().toISOString(), id);

  await dbRun(`UPDATE content SET ${updates.join(', ')} WHERE LOWER(id) = LOWER(?)`, params);
  return getContentById(id);
}

export async function deleteContent(id: string): Promise<boolean> {
  const result = await dbRun('DELETE FROM content WHERE LOWER(id) = LOWER(?)', [id]);
  return result.changes > 0;
}

// === Behavior ===
export async function getBehaviorSummary() {
  const stats = await getOverviewStats() as Record<string, unknown>;
  const readTrend = await getBehaviorTrends('reads');
  const interactionTrend = await getBehaviorTrends('interactions');
  const topRows = await dbAll<Record<string, unknown>>(`
    SELECT btc.content_id, btc.title, btc.reads, btc.interactions, c.push_count, c.read_users, p.disease
    FROM behavior_top_content btc
    LEFT JOIN content c ON c.id = btc.content_id
    LEFT JOIN projects p ON p.id = c.project_id
    ORDER BY btc.reads DESC
  `);
  const byDiseaseRows = await dbAll<Record<string, unknown>>('SELECT * FROM behavior_by_disease ORDER BY reads DESC');
  const avgSetting = await dbGet<{ value: string }>("SELECT value FROM platform_settings WHERE key = 'behaviorAvgReadDuration'");

  return {
    pushCount: asNumber(stats.pushCount),
    readUsers: asNumber(stats.readUsers),
    totalReads: asNumber(stats.readCount),
    totalInteractions: asNumber(stats.interactionCount),
    avgReadDuration: asNumber(avgSetting?.value, 148),
    readTrend,
    interactionTrend,
    topContent: topRows.map((row) => ({
      contentId: row.content_id,
      title: row.title,
      disease: row.disease,
      pushCount: asNumber(row.push_count),
      readUsers: asNumber(row.read_users),
      reads: asNumber(row.reads),
      interactions: asNumber(row.interactions),
    })),
    byDisease: byDiseaseRows.map((row) => ({
      disease: row.disease,
      reads: asNumber(row.reads),
      interactions: asNumber(row.interactions),
      pushCount: asNumber(row.push_count),
    })),
  };
}

export async function getBehaviorTrends(type: string) {
  const normalizedType = type === 'interactions' ? 'interactions' : 'reads';
  const rows = await dbAll<Record<string, unknown>>('SELECT date, value FROM behavior_trends WHERE type = ? ORDER BY id ASC', [normalizedType]);
  return rows.map((row) => ({ date: String(row.date), value: asNumber(row.value) }));
}

// === Distribution strategies ===
export async function getStrategies(filters: { status?: string; projectId?: string; page: number; pageSize: number }) {
  const conditions: string[] = [];
  const params: unknown[] = [];

  if (filters.status) { conditions.push('status = ?'); params.push(filters.status); }
  if (filters.projectId) { conditions.push('project_id = ?'); params.push(filters.projectId); }
  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  const totalRow = await dbGet<{ cnt: number | string }>(`SELECT COUNT(*) as cnt FROM distribution_strategies ${where}`, params);
  const total = Number(totalRow?.cnt ?? 0);
  const offset = (filters.page - 1) * filters.pageSize;
  const rows = await dbAll<Record<string, unknown>>(`SELECT * FROM distribution_strategies ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`, [...params, filters.pageSize, offset]);

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

export async function createStrategy(data: Record<string, unknown>) {
  const countRow = await dbGet<{ cnt: number | string }>('SELECT COUNT(*) as cnt FROM distribution_strategies');
  const count = Number(countRow?.cnt ?? 0);
  const id = `str-${String(count + 1).padStart(3, '0')}`;
  const now = new Date().toISOString();
  const ta = data.targetAudience as Record<string, unknown> | undefined || {};
  const sch = data.schedule as Record<string, unknown> | undefined || {};

  await dbRun(`
    INSERT INTO distribution_strategies (id, name, project_id, target_regions, target_diseases, target_patient_count, content_ids, schedule_type, schedule_start_date, schedule_end_date, schedule_frequency, status, metrics_pushed, metrics_delivered, metrics_opened, metrics_read, created_at, updated_at)
    VALUES (?, ?, ?, ?${jsonCast}, ?${jsonCast}, ?, ?${jsonCast}, ?, ?, ?, ?, 'draft', 0, 0, 0, 0, ?, ?)
  `, [
    id, data.name, data.projectId,
    JSON.stringify(ta.regions || []), JSON.stringify(ta.diseases || []), ta.patientCount || 0,
    JSON.stringify(data.contentIds || []),
    sch.type || 'immediate', sch.startDate || null, sch.endDate || null, sch.frequency || null,
    now, now,
  ]);

  return getStrategyById(id);
}

async function getStrategyById(id: string) {
  const row = await dbGet<Record<string, unknown>>('SELECT * FROM distribution_strategies WHERE id = ?', [id]);
  if (!row) return null;
  const r = toCamel(row);
  parseJsonFields(r, ['targetRegions', 'targetDiseases', 'contentIds']);
  return {
    id: r.id,
    name: r.name,
    projectId: r.projectId,
    targetAudience: { regions: r.targetRegions, diseases: r.targetDiseases, patientCount: r.targetPatientCount },
    contentIds: r.contentIds,
    schedule: { type: r.scheduleType, startDate: r.scheduleStartDate, endDate: r.scheduleEndDate, frequency: r.scheduleFrequency },
    status: r.status,
    metrics: { pushed: r.metricsPushed, delivered: r.metricsDelivered, opened: r.metricsOpened, read: r.metricsRead },
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  };
}

export async function updateStrategy(id: string, data: Record<string, unknown>) {
  const existing = await dbGet('SELECT id FROM distribution_strategies WHERE id = ?', [id]);
  if (!existing) return null;

  const updates: string[] = [];
  const params: unknown[] = [];

  if (data.name !== undefined) { updates.push('name = ?'); params.push(data.name); }
  if (data.status !== undefined) { updates.push('status = ?'); params.push(data.status); }
  if (data.targetAudience && typeof data.targetAudience === 'object') {
    const target = data.targetAudience as Record<string, unknown>;
    updates.push(`target_regions = ?${jsonCast}`, `target_diseases = ?${jsonCast}`, 'target_patient_count = ?');
    params.push(JSON.stringify(target.regions || []), JSON.stringify(target.diseases || []), target.patientCount || 0);
  }
  if (Array.isArray(data.contentIds)) { updates.push(`content_ids = ?${jsonCast}`); params.push(JSON.stringify(data.contentIds)); }
  if (data.schedule && typeof data.schedule === 'object') {
    const schedule = data.schedule as Record<string, unknown>;
    updates.push('schedule_type = ?', 'schedule_start_date = ?', 'schedule_end_date = ?', 'schedule_frequency = ?');
    params.push(schedule.type || 'immediate', schedule.startDate || null, schedule.endDate || null, schedule.frequency || null);
  }
  updates.push('updated_at = ?');
  params.push(new Date().toISOString(), id);

  await dbRun(`UPDATE distribution_strategies SET ${updates.join(', ')} WHERE id = ?`, params);
  return getStrategyById(id);
}

export async function getDistributionProjects(filters: { status?: string; priority?: string; search?: string; page: number; pageSize: number }) {
  const conditions: string[] = [];
  const params: unknown[] = [];
  if (filters.status) { conditions.push('status = ?'); params.push(filters.status); }
  if (filters.priority) { conditions.push('priority = ?'); params.push(filters.priority); }
  if (filters.search) {
    conditions.push('(LOWER(title) LIKE ? OR LOWER(disease) LIKE ? OR LOWER(brand) LIKE ?)');
    const query = `%${filters.search.toLowerCase()}%`;
    params.push(query, query, query);
  }
  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const totalRow = await dbGet<{ cnt: number | string }>(`SELECT COUNT(*) as cnt FROM distribution_projects ${where}`, params);
  const total = Number(totalRow?.cnt ?? 0);
  const offset = (filters.page - 1) * filters.pageSize;
  const rows = await dbAll<Record<string, unknown>>(`SELECT * FROM distribution_projects ${where} ORDER BY expected_date DESC, id ASC LIMIT ? OFFSET ?`, [...params, filters.pageSize, offset]);
  return {
    data: rows.map(mapDistributionProjectRow),
    total,
    totalPages: Math.ceil(total / filters.pageSize),
  };
}

export async function getDistributionProjectById(id: string) {
  const row = await dbGet<Record<string, unknown>>('SELECT * FROM distribution_projects WHERE id = ?', [id]);
  return row ? mapDistributionProjectRow(row) : null;
}

function mapDistributionProjectRow(row: Record<string, unknown>) {
  const project = toCamel(row);
  project.topics = parseJson<string[]>(project.topics, []);
  return {
    id: project.id,
    title: project.title,
    priority: project.priority,
    status: project.status,
    brand: project.brand,
    disease: project.disease,
    owner: project.owner,
    tenantId: project.tenantId,
    expectedDate: project.expectedDate,
    totalPieces: asNumber(project.totalPieces),
    cadence: project.cadence,
    patientCap: asNumber(project.patientCap),
    topics: project.topics,
    formats: project.formats,
    approvalFlow: project.approvalFlow,
    progress: asNumber(project.progress),
    currentNode: project.currentNode,
    contentCount: asNumber(project.contentCount),
    publishedCount: asNumber(project.publishedCount),
  };
}

export async function getDoctorCandidates() {
  const doctors = await dbAll<Record<string, unknown>>('SELECT * FROM doctors ORDER BY name ASC');
  const specialties = await dbAll<Record<string, unknown>>('SELECT doctor_id, disease_id FROM doctor_specialties ORDER BY id ASC');
  const tags = await dbAll<Record<string, unknown>>('SELECT doctor_id, tag FROM doctor_tags ORDER BY id ASC');
  return doctors.map((doctor) => {
    const id = String(doctor.id);
    const doctorSpecialties = specialties.filter((item) => item.doctor_id === id).map((item) => String(item.disease_id));
    const doctorTags = tags.filter((item) => item.doctor_id === id).map((item) => String(item.tag));
    return {
      id,
      name: doctor.name,
      title: doctor.title,
      dept: doctor.department,
      region: doctor.region,
      hospital: doctor.hospital,
      specialties: doctorSpecialties.join(' / '),
      specialtyList: doctorSpecialties,
      tags: doctorTags,
    };
  });
}

// === Approval ===
export async function getApprovalQueue(filters: { status?: string; page: number; pageSize: number }) {
  const conditions: string[] = [];
  const params: unknown[] = [];

  if (filters.status) { conditions.push('status = ?'); params.push(filters.status); }
  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  const totalRow = await dbGet<{ cnt: number | string }>(`SELECT COUNT(*) as cnt FROM approval_items ${where}`, params);
  const total = Number(totalRow?.cnt ?? 0);
  const offset = (filters.page - 1) * filters.pageSize;
  const rows = await dbAll<Record<string, unknown>>(`SELECT * FROM approval_items ${where} ORDER BY submitted_at DESC LIMIT ? OFFSET ?`, [...params, filters.pageSize, offset]);

  return {
    data: rows.map(toCamel),
    total,
    totalPages: Math.ceil(total / filters.pageSize),
  };
}

export async function approveItem(id: string, comments?: string) {
  const existing = await dbGet('SELECT id FROM approval_items WHERE id = ?', [id]);
  if (!existing) return null;

  await dbRun(`
    UPDATE approval_items SET status = 'approved', reviewed_by = '管理员', reviewed_at = ?, comments = ? WHERE id = ?
  `, [new Date().toISOString(), comments || '审批通过', id]);

  const row = await dbGet<Record<string, unknown>>('SELECT * FROM approval_items WHERE id = ?', [id]);
  return row ? toCamel(row) : null;
}

export async function rejectItem(id: string, comments?: string) {
  const existing = await dbGet('SELECT id FROM approval_items WHERE id = ?', [id]);
  if (!existing) return null;

  await dbRun(`
    UPDATE approval_items SET status = 'rejected', reviewed_by = '管理员', reviewed_at = ?, comments = ? WHERE id = ?
  `, [new Date().toISOString(), comments || '审批不通过', id]);

  const row = await dbGet<Record<string, unknown>>('SELECT * FROM approval_items WHERE id = ?', [id]);
  return row ? toCamel(row) : null;
}

export async function getApprovalTasks(filters: { status?: string; page: number; pageSize: number }) {
  const conditions: string[] = [];
  const params: unknown[] = [];
  if (filters.status && filters.status !== 'all') { conditions.push('t.status = ?'); params.push(filters.status); }
  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const totalRow = await dbGet<{ cnt: number | string }>(`SELECT COUNT(*) as cnt FROM approval_tasks t ${where}`, params);
  const total = Number(totalRow?.cnt ?? 0);
  const offset = (filters.page - 1) * filters.pageSize;
  const rows = await dbAll<Record<string, unknown>>(`
    SELECT t.*, c.title, c.author, p.disease, n.node_name
    FROM approval_tasks t
    LEFT JOIN content c ON c.id = t.content_id
    LEFT JOIN projects p ON p.id = t.project_id
    LEFT JOIN approval_flow_nodes n ON n.id = t.current_node_id
    ${where}
    ORDER BY t.submitted_at DESC
    LIMIT ? OFFSET ?
  `, [...params, filters.pageSize, offset]);

  return {
    data: rows.map(mapApprovalTaskRow),
    total,
    totalPages: Math.ceil(total / filters.pageSize),
  };
}

function mapApprovalTaskRow(row: Record<string, unknown>) {
  const task = toCamel(row);
  const status = String(task.status);
  return {
    id: task.contentId,
    taskId: task.id,
    title: task.title,
    disease: task.disease,
    author: task.author || task.submittedBy,
    node: status === 'approved' ? '发布' : task.nodeName || '未提交',
    progress: task.progressText || '0/5',
    sla: task.slaDueAt || '—',
    status,
  };
}

export async function handleApprovalTask(id: string, action: 'approve' | 'reject', comments?: string, rejectReason?: string) {
  const existing = await dbGet<Record<string, unknown>>('SELECT * FROM approval_tasks WHERE id = ? OR content_id = ?', [id, id]);
  if (!existing) return null;
  const now = new Date().toISOString();
  const nextStatus = action === 'approve' ? 'approved' : 'rejected';
  await dbRun(`
    UPDATE approval_tasks
    SET status = ?, current_node_id = ?, progress_text = ?, sla_due_at = ?, completed_at = ?, updated_at = ?
    WHERE id = ? OR content_id = ?
  `, [nextStatus, action === 'approve' ? null : existing.current_node_id, action === 'approve' ? '5/5' : existing.progress_text, action === 'approve' ? '已完成' : '修改中', action === 'approve' ? now : null, now, id, id]);

  await dbRun(`
    INSERT INTO approval_task_actions (task_id, node_id, action, actor_name, reject_reason, comment, created_at)
    VALUES (?, ?, ?, '管理员', ?, ?, ?)
  `, [existing.id, existing.current_node_id ?? null, action, rejectReason ?? null, comments ?? null, now]);

  await dbRun(`
    UPDATE approval_items SET status = ?, reviewed_by = '管理员', reviewed_at = ?, comments = ? WHERE content_id = ?
  `, [nextStatus, now, comments || rejectReason || (action === 'approve' ? '审批通过' : '审批不通过'), existing.content_id]);

  const row = await dbGet<Record<string, unknown>>(`
    SELECT t.*, c.title, c.author, p.disease, n.node_name
    FROM approval_tasks t
    LEFT JOIN content c ON c.id = t.content_id
    LEFT JOIN projects p ON p.id = t.project_id
    LEFT JOIN approval_flow_nodes n ON n.id = t.current_node_id
    WHERE t.id = ? OR t.content_id = ?
  `, [id, id]);
  return row ? mapApprovalTaskRow(row) : null;
}

// === Platform base users/settings ===
export async function getUsers(filters: { page: number; pageSize: number }) {
  const totalRow = await dbGet<{ cnt: number | string }>('SELECT COUNT(*) as cnt FROM users');
  const total = Number(totalRow?.cnt ?? 0);
  const offset = (filters.page - 1) * filters.pageSize;
  const rows = await dbAll<Record<string, unknown>>('SELECT * FROM users ORDER BY created_at DESC LIMIT ? OFFSET ?', [filters.pageSize, offset]);

  return {
    data: rows.map((row) => parseJsonFields(toCamel(row), ['roleLabels'])),
    total,
    totalPages: Math.ceil(total / filters.pageSize),
  };
}

export async function updateUser(id: string, data: Record<string, unknown>) {
  const existing = await dbGet('SELECT id FROM users WHERE id = ?', [id]);
  if (!existing) return null;

  const updates: string[] = [];
  const params: unknown[] = [];
  const fieldMap: Record<string, string> = { name: 'name', email: 'email', role: 'role', region: 'region', status: 'status' };

  for (const [camel, snake] of Object.entries(fieldMap)) {
    if (data[camel] !== undefined) { updates.push(`${snake} = ?`); params.push(data[camel]); }
  }
  if (updates.length === 0) return getUserById(id);
  updates.push('updated_at = ?'); params.push(new Date().toISOString());
  params.push(id);

  await dbRun(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`, params);
  return getUserById(id);
}

async function getUserById(id: string) {
  const row = await dbGet<Record<string, unknown>>('SELECT * FROM users WHERE id = ?', [id]);
  return row ? parseJsonFields(toCamel(row), ['roleLabels']) : null;
}

export async function getPlatformSettings() {
  const rows = await dbAll<{ key: string; value: string }>('SELECT key, value FROM platform_settings');
  const settings: Record<string, unknown> = {};
  for (const row of rows) {
    try { settings[row.key] = JSON.parse(row.value); } catch { settings[row.key] = row.value; }
  }
  return settings;
}

export async function updatePlatformSettings(data: Record<string, unknown>) {
  for (const [key, val] of Object.entries(data)) {
    await dbRun('INSERT INTO platform_settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value', [
      key,
      typeof val === 'string' ? val : JSON.stringify(val),
    ]);
  }
  return getPlatformSettings();
}

// === Platform tenant/account/admin data ===
export async function getTenantOptions() {
  const rows = await dbAll<Record<string, unknown>>('SELECT id, short_name, name, tenant_type FROM tenants ORDER BY CASE WHEN id = \'T-PX\' THEN 0 ELSE 1 END, short_name ASC');
  return rows.map((row) => ({
    id: row.id,
    shortName: row.short_name,
    name: row.name,
    type: row.tenant_type,
  }));
}

export async function getTenants() {
  const rows = await dbAll<Record<string, unknown>>(`
    SELECT t.*, s.disease_ids, s.brand_ids, s.region_ids, s.gray_limit_percent, s.k_anonymity_threshold,
      (SELECT COUNT(*) FROM users u WHERE u.tenant_id = t.id) AS accounts
    FROM tenants t
    LEFT JOIN tenant_scopes s ON s.tenant_id = t.id
    ORDER BY CASE WHEN t.id = 'T-PX' THEN 0 ELSE 1 END, t.created_at ASC
  `);
  return rows.map(mapTenantRow);
}

async function getTenantById(id: string) {
  const rows = await getTenants();
  return rows.find((tenant) => tenant.id === id) ?? null;
}

function listText(value: unknown, fallback: string): string {
  const list = parseJson<string[]>(value, []);
  return list.length > 0 ? list.join(' / ') : fallback;
}

function mapTenantRow(row: Record<string, unknown>) {
  const isOps = row.tenant_type === 'ops';
  return {
    id: row.id,
    name: row.name,
    shortName: row.short_name,
    type: isOps ? '自营' : '药企租户',
    status: row.status,
    contract: row.contract_no || '未签约',
    contact: `${row.contact_name || '未设置'} · ${row.contact_email || '未设置邮箱'}`,
    description: row.description || '',
    diseaseScope: isOps ? '全部病种 · 仅 Px 自营运营组' : listText(row.disease_ids, '0 种病'),
    brandScope: isOps ? '全部品牌' : listText(row.brand_ids, '待配置'),
    regionScope: isOps ? '全国 / 不限地域' : listText(row.region_ids, '待配置'),
    gray: `灰度 ≤ ${asNumber(row.gray_limit_percent)}%`,
    kAnon: `k-匿 ${asNumber(row.k_anonymity_threshold)}`,
    accounts: asNumber(row.accounts),
    canExport: asBool(row.can_export),
  };
}

export async function updateTenantStatus(id: string, status: string) {
  const existing = await dbGet('SELECT id FROM tenants WHERE id = ?', [id]);
  if (!existing) return null;
  await dbRun('UPDATE tenants SET status = ?, updated_at = ? WHERE id = ?', [status, new Date().toISOString(), id]);
  return getTenantById(id);
}

export async function createTenant(data: Record<string, unknown>) {
  const now = new Date().toISOString();
  const id = String(data.id || `T-NEW-${Date.now().toString().slice(-4)}`);
  const contact = String(data.contact || '未设置 · unset@example.cn');
  const [contactName = '未设置', contactEmail = 'unset@example.cn'] = contact.split(' · ');
  await dbRun(`
    INSERT INTO tenants (id, name, short_name, tenant_type, status, contract_no, contact_name, contact_email, description, can_export, created_at, updated_at)
    VALUES (?, ?, ?, 'pharma', ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET name = excluded.name, short_name = excluded.short_name, status = excluded.status, updated_at = excluded.updated_at
  `, [id, data.name || '新药企租户', data.shortName || '新租户', data.status || 'active', data.contract || '未签约', contactName, contactEmail, data.description || '通过新建租户向导创建。', boolValue(Boolean(data.canExport ?? true)), now, now]);
  await dbRun(`
    INSERT INTO tenant_scopes (id, tenant_id, disease_ids, brand_ids, region_ids, gray_limit_percent, k_anonymity_threshold, can_export_csv, created_at, updated_at)
    VALUES (?, ?, ?${jsonCast}, ?${jsonCast}, ?${jsonCast}, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET disease_ids = excluded.disease_ids, gray_limit_percent = excluded.gray_limit_percent, k_anonymity_threshold = excluded.k_anonymity_threshold, updated_at = excluded.updated_at
  `, [`scope-${id}`, id, JSON.stringify(String(data.diseaseScope || '').split(' / ').filter(Boolean)), JSON.stringify([]), JSON.stringify(['全国']), Number(String(data.gray || '50').replace(/\D/g, '')) || 50, Number(String(data.kAnon || '50').replace(/\D/g, '')) || 50, boolValue(Boolean(data.canExport ?? true)), now, now]);
  return getTenantById(id);
}

export async function getAccounts() {
  const rows = await dbAll<Record<string, unknown>>(`
    SELECT u.*, t.short_name AS tenant_short_name, t.name AS tenant_name
    FROM users u
    LEFT JOIN tenants t ON t.id = u.tenant_id
    ORDER BY u.id ASC
  `);
  return rows.map(mapAccountRow);
}

async function getAccountById(id: string) {
  const rows = await getAccounts();
  return rows.find((account) => account.id === id) ?? null;
}

function mapAccountRow(row: Record<string, unknown>) {
  const labels = parseJson<string[]>(row.role_labels, []);
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    tenant: row.tenant_short_name || row.tenant_name || row.tenant_id,
    tenantId: row.tenant_id,
    view: row.view_type === 'ops' ? '运营视图' : '药企视图',
    roles: labels.length > 0 ? labels : [row.role === 'admin' ? '运营 · 平台管理员' : row.role === 'editor' ? '运营 · 内容审核员' : '药企 · 合规'],
    status: row.status,
    has2fa: asBool(row.has_2fa),
    lastLogin: row.last_login || '—',
    note: row.note || '',
  };
}

function inferBaseRole(view: string, roles: string[]): string {
  if (view === '运营视图' && roles.some((role) => role.includes('平台管理员'))) return 'admin';
  if (view === '运营视图') return 'editor';
  return 'viewer';
}

export async function createAccount(data: Record<string, unknown>) {
  const now = new Date().toISOString();
  const roles = Array.isArray(data.roles) ? data.roles.map(String) : ['药企 · 合规'];
  const view = String(data.view || '药企视图');
  const id = String(data.id || `A-${Date.now().toString().slice(-3)}`);
  await dbRun(`
    INSERT INTO users (id, tenant_id, name, email, role, role_labels, view_type, region, status, has_2fa, last_login, note, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?${jsonCast}, ?, ?, ?, ?, ?, ?, ?, ?)
  `, [id, data.tenantId || 'T-PX', data.name || '新成员', data.email || `new-${Date.now()}@example.cn`, inferBaseRole(view, roles), JSON.stringify(roles), view === '运营视图' ? 'ops' : 'pharma', '全国', data.status || 'invited', boolValue(Boolean(data.has2fa ?? true)), data.lastLogin || '—', data.note || '通过账号邀请向导创建。', now, now]);
  return getAccountById(id);
}

export async function updateAccountStatus(id: string, status: string) {
  const existing = await dbGet('SELECT id FROM users WHERE id = ?', [id]);
  if (!existing) return null;
  await dbRun('UPDATE users SET status = ?, updated_at = ? WHERE id = ?', [status, new Date().toISOString(), id]);
  return getAccountById(id);
}

export async function updateAccount2fa(id: string, has2fa: boolean) {
  const existing = await dbGet('SELECT id FROM users WHERE id = ?', [id]);
  if (!existing) return null;
  await dbRun('UPDATE users SET has_2fa = ?, updated_at = ? WHERE id = ?', [boolValue(has2fa), new Date().toISOString(), id]);
  return getAccountById(id);
}

export async function getApprovalFlows(tenantId?: string) {
  const params: unknown[] = [];
  const where = tenantId ? 'WHERE tenant_id = ?' : '';
  if (tenantId) params.push(tenantId);
  const flows = await dbAll<Record<string, unknown>>(`SELECT * FROM approval_flows ${where} ORDER BY updated_at DESC`, params);
  const nodes = await dbAll<Record<string, unknown>>('SELECT * FROM approval_flow_nodes ORDER BY sort_order ASC');
  return flows.map((flow) => ({
    id: flow.id,
    tenantId: flow.tenant_id,
    name: flow.name,
    description: flow.description,
    status: flow.status,
    returnPolicy: flow.return_policy,
    lastUpdated: String(flow.updated_at || flow.created_at).slice(0, 10),
    nodes: nodes.filter((node) => node.flow_id === flow.id).map((node) => ({
      id: String(node.id),
      name: node.node_name,
      reviewerType: node.reviewer_type,
      slaHours: asNumber(node.sla_hours),
      timeoutPolicy: node.timeout_policy,
    })),
  }));
}

export async function getTeamMembers(tenantId: string) {
  const rows = await dbAll<Record<string, unknown>>('SELECT * FROM users WHERE tenant_id = ? ORDER BY id ASC', [tenantId]);
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    email: row.email,
    role: row.role,
    lastLogin: row.last_login || '—',
  }));
}

export async function updateTeamMemberRole(id: string, role: string) {
  const existing = await dbGet('SELECT id FROM users WHERE id = ?', [id]);
  if (!existing) return null;
  await dbRun('UPDATE users SET role = ?, updated_at = ? WHERE id = ?', [role, new Date().toISOString(), id]);
  const row = await dbGet<Record<string, unknown>>('SELECT * FROM users WHERE id = ?', [id]);
  return row ? { id: row.id, name: row.name, email: row.email, role: row.role, lastLogin: row.last_login || '—' } : null;
}

export async function createTeamMember(tenantId: string, data: Record<string, unknown>) {
  const now = new Date().toISOString();
  const id = String(data.id || `m-${Date.now()}`);
  await dbRun(`
    INSERT INTO users (id, tenant_id, name, email, role, role_labels, view_type, region, status, has_2fa, last_login, note, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?${jsonCast}, ?, '全国', 'invited', ?, '—', '通过团队设置邀请。', ?, ?)
  `, [id, tenantId, data.name || '新成员', data.email || `new-${Date.now()}@px.cn`, data.role || 'viewer', JSON.stringify([data.role || 'viewer']), tenantId === 'T-PX' ? 'ops' : 'pharma', boolValue(false), now, now]);
  return updateTeamMemberRole(id, String(data.role || 'viewer'));
}

export async function deleteTeamMember(id: string): Promise<boolean> {
  const result = await dbRun('DELETE FROM users WHERE id = ?', [id]);
  return result.changes > 0;
}

export async function getAuditLogs(tenantId?: string) {
  const params: unknown[] = [];
  const where = tenantId ? 'WHERE tenant_id = ?' : '';
  if (tenantId) params.push(tenantId);
  const rows = await dbAll<Record<string, unknown>>(`SELECT * FROM audit_logs ${where} ORDER BY created_at DESC LIMIT 20`, params);
  return rows.map((row) => ({
    id: row.id,
    message: row.description,
    time: row.created_at,
    actorName: row.actor_name,
    action: row.action,
  }));
}
