import { dbAll, dbGet, dbRun, DB_DRIVER } from './connection.js';
import { createHash, randomUUID } from 'crypto';
import type { AuthUser } from '../middleware/auth.js';

const jsonCast = DB_DRIVER === 'postgres' ? '::jsonb' : '';
const boolValue = (value: boolean): boolean | number => (DB_DRIVER === 'postgres' ? value : value ? 1 : 0);
const kAnonymityDefault = 50;

type QueryScope = Pick<AuthUser, 'tenantId' | 'tenantType' | 'permissions' | 'id' | 'name'>;

function isPxAdmin(scope?: QueryScope): boolean {
  return !scope || scope.permissions.includes('*') || scope.tenantType === 'ops';
}

function tenantCondition(alias: string, scope?: QueryScope): { sql: string; params: unknown[] } {
  if (isPxAdmin(scope)) return { sql: '', params: [] };
  return { sql: `${alias}.tenant_id = ?`, params: [scope!.tenantId] };
}

function contentHash(input: unknown): string {
  return createHash('sha256').update(JSON.stringify(input ?? null)).digest('hex');
}

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
export async function getOverviewStats(scope?: QueryScope) {
  if (!isPxAdmin(scope)) {
    const row = await dbGet<Record<string, unknown>>(`
      SELECT
        COUNT(*) as project_count,
        SUM(published_count) || '/' || SUM(content_count) as published_content,
        COALESCE(SUM(push_count), 0) as push_count,
        COALESCE(SUM(read_users), 0) as read_users,
        COALESCE(SUM(read_count), 0) as read_count,
        COALESCE(SUM(interaction_count), 0) as interaction_count,
        MAX(updated_at) as last_updated
      FROM projects
      WHERE tenant_id = ?
    `, [scope!.tenantId]);
    return row ? toCamel(row) : { lastUpdated: new Date().toISOString() };
  }
  const row = await dbGet<Record<string, unknown>>('SELECT * FROM overview_stats WHERE id = 1');
  return row ? toCamel(row) : { lastUpdated: new Date().toISOString() };
}

export async function getOverviewProjects(scope?: QueryScope) {
  const tenant = tenantCondition('projects', scope);
  const where = tenant.sql ? `WHERE ${tenant.sql}` : '';
  const rows = await dbAll<Record<string, unknown>>(`SELECT * FROM projects ${where} ORDER BY read_count DESC, updated_at DESC`, tenant.params);
  return rows.map(toCamel);
}

// === Content ===
export async function getContentList(filters: { status?: string; type?: string; projectId?: string; pipelineStage?: string; priority?: string; search?: string; page: number; pageSize: number; scope?: QueryScope }) {
  const conditions: string[] = [];
  const params: unknown[] = [];
  const normalizedStatus = filters.status;
  const tenant = tenantCondition('c', filters.scope);

  if (tenant.sql) { conditions.push(tenant.sql); params.push(...tenant.params); }
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
    ORDER BY c.id ASC
    LIMIT ? OFFSET ?
  `, [...params, filters.pageSize, offset]);

  return {
    data: rows.map(mapContentRow),
    total,
    totalPages: Math.ceil(total / filters.pageSize),
  };
}

export async function getContentById(id: string, scope?: QueryScope) {
  const tenant = tenantCondition('c', scope);
  const tenantSql = tenant.sql ? `AND ${tenant.sql}` : '';
  const row = await dbGet<Record<string, unknown>>(`
    SELECT c.*, p.name AS project_name
    FROM content c
    LEFT JOIN projects p ON p.id = c.project_id
    WHERE LOWER(c.id) = LOWER(?)
    ${tenantSql}
  `, [id, ...tenant.params]);
  return row ? mapContentRow(row) : null;
}

async function createContentVersion(contentId: string, data: Record<string, unknown>, user?: QueryScope, changeNote = 'content saved') {
  const row = await dbGet<{ max_version: number | string | null }>('SELECT MAX(version_no) as max_version FROM content_versions WHERE content_id = ?', [contentId]);
  const versionNo = Number(row?.max_version ?? 0) + 1;
  const now = new Date().toISOString();
  const checklist = {
    classification: data.classification || 'patient_education',
    diseaseArea: data.diseaseArea || data.projectName || 'unassigned',
    brandMention: Boolean(data.brandMention ?? false),
    sourceAttached: Boolean(data.sourceAttached ?? false),
    piReference: data.piReference || null,
    prohibitedClaimChecked: Boolean(data.prohibitedClaimChecked ?? false),
  };
  await dbRun(`
    INSERT INTO content_versions (content_id, version_no, title, body, excerpt, editor_user_id, change_note, workflow_state, compliance_checklist, immutable_hash, approved_by, approved_at, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?${jsonCast}, ?, ?, ?, ?)
  `, [
    contentId,
    versionNo,
    String(data.title || '未命名内容'),
    String(data.content || data.body || ''),
    typeof data.excerpt === 'string' ? data.excerpt : null,
    user?.id ?? null,
    changeNote,
    String(data.workflowState || 'draft'),
    JSON.stringify(checklist),
    contentHash({ contentId, versionNo, title: data.title, body: data.content || data.body, checklist }),
    null,
    null,
    now,
  ]);
}

export async function createContent(data: Record<string, unknown>, scope?: QueryScope) {
  const rows = await dbAll<{ id: string }>("SELECT id FROM content WHERE id LIKE 'CNT-%'");
  const nextNumber = Math.max(100, ...rows.map((item) => Number(item.id.replace(/\D/g, '')) || 100)) + 1;
  const id = `CNT-${nextNumber}`;
  const now = new Date().toISOString();
  const projectId = String(data.projectId || 'proj-hf');
  const tenantId = scope?.tenantId || 'T-PX';
  const status = String(data.status || 'draft');
  const workflowState = String(data.workflowState || 'draft');
  const pipelineStage = String(data.pipelineStage || 'requirement_submitted');
  const priority = String(data.priority || 'P2');

  await dbRun(`
    INSERT INTO content (id, tenant_id, project_id, title, type, status, workflow_state, pipeline_stage, priority, author, excerpt, content, tags, push_count, read_users, read_count, like_count, dislike_count, bookmark_count, share_count, expected_date, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?${jsonCast}, 0, 0, 0, 0, 0, 0, 0, ?, ?, ?)
  `, [
    id,
    tenantId,
    projectId,
    String(data.title || '未命名内容'),
    String(data.type || 'article'),
    status,
    workflowState,
    pipelineStage,
    priority,
    String(data.author || '系统管理员'),
    typeof data.excerpt === 'string' ? data.excerpt : null,
    String(data.content || ''),
    JSON.stringify(Array.isArray(data.tags) ? data.tags.map(String) : []),
    typeof data.expectedDate === 'string' ? data.expectedDate : null,
    now,
    now,
  ]);

  await createContentVersion(id, data, scope, 'initial draft created');
  return getContentById(id, scope);
}

function matrixTotal(matrix: Record<string, Record<string, number>>): number {
  return Object.values(matrix).reduce(
    (sum, row) => sum + Object.values(row ?? {}).reduce((rowSum, value) => rowSum + (Number(value) || 0), 0),
    0
  );
}

function matrixLabels(matrix: Record<string, Record<string, number>>): string[] {
  const formatLabels: Record<string, string> = { article: '长图文', poster: '海报', checklist: '手册', longtext: '长图文', manual: '手册' };
  const totals: Record<string, number> = {};
  Object.values(matrix).forEach((row) => {
    Object.entries(row ?? {}).forEach(([format, count]) => {
      totals[format] = (totals[format] ?? 0) + (Number(count) || 0);
    });
  });
  return Object.entries(totals)
    .filter(([, count]) => count > 0)
    .map(([format, count]) => `${formatLabels[format] ?? format}×${count}`);
}

export async function getContentRequestProjects(scope?: QueryScope) {
  const baseSql = `
    SELECT
      p.id,
      p.tenant_id,
      p.name,
      p.title,
      p.disease,
      p.status,
      p.content_count,
      p.published_count,
      p.created_at,
      p.updated_at,
      COALESCE(b.name, '') as brand,
      COALESCE(u.name, 'PX 运营组') as owner
    FROM projects p
    LEFT JOIN brands b ON b.id = p.brand_id
    LEFT JOIN users u ON u.id = p.owner_user_id
  `;

  if (isPxAdmin(scope)) {
    const rows = await dbAll<Record<string, unknown>>(`${baseSql} WHERE p.status != 'archived' ORDER BY p.updated_at DESC`);
    return rows.map(toCamel);
  }

  const ownRows = await dbAll<Record<string, unknown>>(`${baseSql} WHERE p.tenant_id = ? AND p.status != 'archived' ORDER BY p.updated_at DESC`, [scope!.tenantId]);
  if (ownRows.length > 0) return ownRows.map(toCamel);

  const scopeRow = await dbGet<{ disease_ids?: unknown; brand_ids?: unknown }>('SELECT disease_ids, brand_ids FROM tenant_scopes WHERE tenant_id = ?', [scope!.tenantId]);
  const diseases = parseJson<string[]>(scopeRow?.disease_ids, []);
  const brands = parseJson<string[]>(scopeRow?.brand_ids, []);
  const conditions: string[] = ["p.status != 'archived'"];
  const params: unknown[] = [];

  if (!diseases.includes('*') && diseases.length > 0) {
    conditions.push(`p.disease IN (${diseases.map(() => '?').join(', ')})`);
    params.push(...diseases);
  }
  if (!brands.includes('*') && brands.length > 0) {
    conditions.push(`(b.name IS NULL OR b.name = '' OR b.name IN (${brands.map(() => '?').join(', ')}))`);
    params.push(...brands);
  }

  const rows = await dbAll<Record<string, unknown>>(`${baseSql} WHERE ${conditions.join(' AND ')} ORDER BY p.updated_at DESC`, params);
  return rows.map((row) => ({ ...toCamel(row), tenantId: scope!.tenantId }));
}

export async function submitContentRequest(data: Record<string, unknown>, scope?: QueryScope) {
  const tenantId = scope?.tenantId || 'T-PX';
  const projectId = String(data.projectId);
  const project = await dbGet<Record<string, unknown>>('SELECT * FROM projects WHERE id = ?', [projectId]);
  if (!project) return null;

  const matrix = data.themeFormatMatrix as Record<string, Record<string, number>>;
  const totalCount = matrixTotal(matrix);
  const requestName = String(data.requestName);
  const projectName = String(project.name || project.title || projectId);
  const disease = String(project.disease || '未分配病种');
  const priority = String(data.priority || 'P1');
  const expectedDate = typeof data.expectedDate === 'string' ? data.expectedDate : null;
  const note = typeof data.note === 'string' ? data.note : '';
  const rows = await dbAll<{ id: string }>("SELECT id FROM content_requests WHERE id LIKE 'REQ-%'");
  const nextNumber = Math.max(2031, ...rows.map((item) => Number(item.id.replace(/\D/g, '')) || 2031)) + 1;
  const requestId = `REQ-${nextNumber}`;
  const title = `${projectName} · ${requestName}`;
  const content = await createContent({
    projectId,
    title,
    type: 'article',
    author: scope?.name || '药企提交',
    excerpt: `共 ${totalCount} 篇 · ${disease} · ${matrixLabels(matrix).join(' / ')}`,
    content: [
      `# ${title}`,
      '',
      `- 本次诉求总量：${totalCount} 篇`,
      `- 期望上线日：${expectedDate ?? '未填写'}`,
      `- 优先级：${priority}`,
      `- 备注：${note || '无'}`,
    ].join('\n'),
    tags: [disease, '选题诉求', priority],
    priority,
    expectedDate,
    pipelineStage: 'requirement_submitted',
    workflowState: 'draft',
    status: 'draft',
    classification: 'content_request',
    diseaseArea: disease,
  }, scope);

  const contentId = String((content as Record<string, unknown> | null)?.id ?? '');
  const now = new Date().toISOString();
  await dbRun(`
    INSERT INTO content_requests (id, tenant_id, project_id, content_id, request_name, title, priority, expected_date, theme_format_matrix, total_count, note, status, submitted_by, submitted_at, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?${jsonCast}, ?, ?, 'pending', ?, ?, ?, ?)
  `, [
    requestId,
    tenantId,
    projectId,
    contentId,
    requestName,
    title,
    priority,
    expectedDate,
    JSON.stringify(matrix),
    totalCount,
    note,
    scope?.name || tenantId,
    now,
    now,
    now,
  ]);

  await dbRun('UPDATE projects SET content_count = COALESCE(content_count, 0) + ?, total_pieces = COALESCE(total_pieces, 0) + ?, updated_at = ? WHERE id = ?', [1, totalCount, now, projectId]);
  const request = await dbGet<Record<string, unknown>>('SELECT * FROM content_requests WHERE id = ?', [requestId]);
  return { request: request ? parseJsonFields(toCamel(request), ['themeFormatMatrix']) : null, content };
}

export async function updateContent(id: string, data: Record<string, unknown>, scope?: QueryScope) {
  const tenant = tenantCondition('content', scope);
  const existing = await dbGet<Record<string, unknown>>(`SELECT * FROM content WHERE LOWER(id) = LOWER(?) ${tenant.sql ? `AND ${tenant.sql}` : ''}`, [id, ...tenant.params]);
  if (!existing) return null;
  const existingState = String(existing.workflow_state || existing.status || 'draft');
  const createNewDraftAfterLock = ['approved_locked', 'published'].includes(existingState);

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

  if (updates.length === 0) return getContentById(id, scope);
  if (createNewDraftAfterLock) {
    updates.push('workflow_state = ?');
    params.push('draft');
    updates.push('status = ?');
    params.push('draft');
  }
  updates.push('updated_at = ?');
  params.push(new Date().toISOString(), id);

  const updateTenant = tenantCondition('content', scope);
  await dbRun(
    `UPDATE content SET ${updates.join(', ')} WHERE LOWER(id) = LOWER(?) ${updateTenant.sql ? `AND ${updateTenant.sql}` : ''}`,
    [...params, ...updateTenant.params]
  );
  await createContentVersion(id, { ...existing, ...data, workflowState: createNewDraftAfterLock ? 'draft' : existingState }, scope, createNewDraftAfterLock ? 'new draft created after approved lock' : 'content updated');
  return getContentById(id, scope);
}

export async function deleteContent(id: string, scope?: QueryScope): Promise<boolean> {
  const tenant = tenantCondition('content', scope);
  const result = await dbRun(`DELETE FROM content WHERE LOWER(id) = LOWER(?) ${tenant.sql ? `AND ${tenant.sql}` : ''}`, [id, ...tenant.params]);
  return result.changes > 0;
}

// === Behavior ===
export async function getBehaviorSummary(scope?: QueryScope) {
  const stats = await getOverviewStats(scope) as Record<string, unknown>;
  if (!isPxAdmin(scope)) {
    const daily = await dbAll<Record<string, unknown>>(`
      SELECT metric_date, SUM(read_count) as read_count, SUM(interaction_count) as interaction_count
      FROM behavior_daily_metrics
      WHERE tenant_id = ?
      GROUP BY metric_date
      ORDER BY metric_date ASC
    `, [scope!.tenantId]);
    const totals = daily.reduce<{ reads: number; interactions: number }>((acc, row) => ({
      reads: acc.reads + asNumber(row.read_count),
      interactions: acc.interactions + asNumber(row.interaction_count),
    }), { reads: 0, interactions: 0 });
    return {
      pushCount: asNumber(stats.pushCount),
      readUsers: asNumber(stats.readUsers),
      totalReads: totals.reads,
      totalInteractions: totals.interactions,
      avgReadDuration: 0,
      readTrend: daily.map((row) => ({ date: String(row.metric_date), value: asNumber(row.read_count) })),
      interactionTrend: daily.map((row) => ({ date: String(row.metric_date), value: asNumber(row.interaction_count) })),
      topContent: [],
      byDisease: [],
      aggregateOnly: true,
    };
  }
  const readTrend = await getBehaviorTrends('reads', scope);
  const interactionTrend = await getBehaviorTrends('interactions', scope);
  const topRows = await dbAll<Record<string, unknown>>(`
    SELECT btc.content_id, btc.title, btc.reads, btc.interactions, c.push_count, c.read_users, p.disease
    FROM behavior_top_content btc
    LEFT JOIN content c ON c.id = btc.content_id
    LEFT JOIN projects p ON p.id = c.project_id
    ORDER BY btc.reads DESC
  `);
  const byDiseaseRows = await dbAll<Record<string, unknown>>('SELECT * FROM behavior_by_disease ORDER BY reads DESC');
  const contentCountRow = await dbGet<{ cnt: number | string }>('SELECT COUNT(*) as cnt FROM content');
  const avgSetting = await dbGet<{ value: string }>("SELECT value FROM platform_settings WHERE key = 'behaviorAvgReadDuration'");

  return {
    pushCount: asNumber(stats.pushCount),
    readUsers: asNumber(stats.readUsers),
    totalReads: asNumber(stats.readCount),
    totalInteractions: asNumber(stats.interactionCount),
    contentCount: asNumber(contentCountRow?.cnt),
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

export async function getBehaviorTrends(type: string, scope?: QueryScope) {
  const normalizedType = type === 'interactions' ? 'interactions' : 'reads';
  if (!isPxAdmin(scope)) {
    const metricColumn = normalizedType === 'interactions' ? 'interaction_count' : 'read_count';
    const rows = await dbAll<Record<string, unknown>>(`
      SELECT metric_date as date, SUM(${metricColumn}) as value
      FROM behavior_daily_metrics
      WHERE tenant_id = ?
      GROUP BY metric_date
      ORDER BY metric_date ASC
    `, [scope!.tenantId]);
    return rows.map((row) => ({ date: String(row.date), value: asNumber(row.value) }));
  }
  const rows = await dbAll<Record<string, unknown>>('SELECT date, value FROM behavior_trends WHERE type = ? ORDER BY id ASC', [normalizedType]);
  return rows.map((row) => ({ date: String(row.date), value: asNumber(row.value) }));
}

// === Distribution strategies ===
export async function getStrategies(filters: { status?: string; projectId?: string; page: number; pageSize: number; scope?: QueryScope }) {
  const conditions: string[] = [];
  const params: unknown[] = [];
  const tenant = tenantCondition('distribution_strategies', filters.scope);

  if (tenant.sql) { conditions.push(tenant.sql); params.push(...tenant.params); }
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

export async function createStrategy(data: Record<string, unknown>, scope?: QueryScope) {
  const countRow = await dbGet<{ cnt: number | string }>('SELECT COUNT(*) as cnt FROM distribution_strategies');
  const count = Number(countRow?.cnt ?? 0);
  const id = `str-${String(count + 1).padStart(3, '0')}`;
  const now = new Date().toISOString();
  const ta = data.targetAudience as Record<string, unknown> | undefined || {};
  const sch = data.schedule as Record<string, unknown> | undefined || {};
  const tenantId = scope?.tenantId || 'T-PX';

  await dbRun(`
    INSERT INTO distribution_strategies (id, tenant_id, name, project_id, target_regions, target_diseases, target_patient_count, content_ids, schedule_type, schedule_start_date, schedule_end_date, schedule_frequency, status, metrics_pushed, metrics_delivered, metrics_opened, metrics_read, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?${jsonCast}, ?${jsonCast}, ?, ?${jsonCast}, ?, ?, ?, ?, 'draft', 0, 0, 0, 0, ?, ?)
  `, [
    id, tenantId, data.name, data.projectId,
    JSON.stringify(ta.regions || []), JSON.stringify(ta.diseases || []), ta.patientCount || 0,
    JSON.stringify(data.contentIds || []),
    sch.type || 'immediate', sch.startDate || null, sch.endDate || null, sch.frequency || null,
    now, now,
  ]);

  return getStrategyById(id, scope);
}

async function getStrategyById(id: string, scope?: QueryScope) {
  const tenant = tenantCondition('distribution_strategies', scope);
  const row = await dbGet<Record<string, unknown>>(
    `SELECT * FROM distribution_strategies WHERE id = ? ${tenant.sql ? `AND ${tenant.sql}` : ''}`,
    [id, ...tenant.params]
  );
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

export async function updateStrategy(id: string, data: Record<string, unknown>, scope?: QueryScope) {
  const tenant = tenantCondition('distribution_strategies', scope);
  const existing = await dbGet(
    `SELECT id FROM distribution_strategies WHERE id = ? ${tenant.sql ? `AND ${tenant.sql}` : ''}`,
    [id, ...tenant.params]
  );
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

  await dbRun(
    `UPDATE distribution_strategies SET ${updates.join(', ')} WHERE id = ? ${tenant.sql ? `AND ${tenant.sql}` : ''}`,
    [...params, ...tenant.params]
  );
  return getStrategyById(id, scope);
}

export async function getDistributionProjects(filters: { status?: string; priority?: string; search?: string; page: number; pageSize: number; scope?: QueryScope }) {
  const conditions: string[] = [];
  const params: unknown[] = [];
  const tenant = tenantCondition('distribution_projects', filters.scope);
  if (tenant.sql) { conditions.push(tenant.sql); params.push(...tenant.params); }
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
  const rows = await dbAll<Record<string, unknown>>(`SELECT * FROM distribution_projects ${where} ORDER BY id ASC LIMIT ? OFFSET ?`, [...params, filters.pageSize, offset]);
  return {
    data: rows.map(mapDistributionProjectRow),
    total,
    totalPages: Math.ceil(total / filters.pageSize),
  };
}

export async function getDistributionProjectById(id: string, scope?: QueryScope) {
  const tenant = tenantCondition('distribution_projects', scope);
  const row = await dbGet<Record<string, unknown>>(`SELECT * FROM distribution_projects WHERE id = ? ${tenant.sql ? `AND ${tenant.sql}` : ''}`, [id, ...tenant.params]);
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
    createdAt: project.createdAt,
    updatedAt: project.updatedAt,
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
export async function getApprovalQueue(filters: { status?: string; page: number; pageSize: number; scope?: QueryScope }) {
  const conditions: string[] = [];
  const params: unknown[] = [];
  if (!isPxAdmin(filters.scope)) {
    conditions.push('content_id IN (SELECT id FROM content WHERE tenant_id = ?)');
    params.push(filters.scope!.tenantId);
  }

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

export async function approveItem(id: string, comments?: string, user?: QueryScope) {
  const tenantSql = !isPxAdmin(user) ? 'AND c.tenant_id = ?' : '';
  const existing = await dbGet(`
    SELECT ai.id
    FROM approval_items ai
    LEFT JOIN content c ON c.id = ai.content_id
    WHERE ai.id = ? ${tenantSql}
  `, !isPxAdmin(user) ? [id, user!.tenantId] : [id]);
  if (!existing) return null;

  await dbRun(`
    UPDATE approval_items SET status = 'approved', reviewed_by = ?, reviewed_at = ?, comments = ? WHERE id = ?
  `, [user?.name || '管理员', new Date().toISOString(), comments || '审批通过', id]);

  const row = await dbGet<Record<string, unknown>>('SELECT * FROM approval_items WHERE id = ?', [id]);
  return row ? toCamel(row) : null;
}

export async function rejectItem(id: string, comments?: string, user?: QueryScope) {
  const tenantSql = !isPxAdmin(user) ? 'AND c.tenant_id = ?' : '';
  const existing = await dbGet(`
    SELECT ai.id
    FROM approval_items ai
    LEFT JOIN content c ON c.id = ai.content_id
    WHERE ai.id = ? ${tenantSql}
  `, !isPxAdmin(user) ? [id, user!.tenantId] : [id]);
  if (!existing) return null;

  await dbRun(`
    UPDATE approval_items SET status = 'rejected', reviewed_by = ?, reviewed_at = ?, comments = ? WHERE id = ?
  `, [user?.name || '管理员', new Date().toISOString(), comments || '审批不通过', id]);

  const row = await dbGet<Record<string, unknown>>('SELECT * FROM approval_items WHERE id = ?', [id]);
  return row ? toCamel(row) : null;
}

export async function getApprovalTasks(filters: { status?: string; page: number; pageSize: number; scope?: QueryScope }) {
  const conditions: string[] = [];
  const params: unknown[] = [];
  if (!isPxAdmin(filters.scope)) { conditions.push('t.tenant_id = ?'); params.push(filters.scope!.tenantId); }
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
    id: task.id,
    taskId: task.id,
    contentId: task.contentId,
    title: task.title,
    disease: task.disease,
    author: task.author || task.submittedBy,
    node: status === 'approved' ? '发布' : task.nodeName || '未提交',
    progress: task.progressText || '0/3',
    sla: task.slaDueAt || '—',
    status,
  };
}

export async function handleApprovalTask(id: string, action: 'approve' | 'reject', comments?: string, rejectReason?: string, user?: QueryScope) {
  const tenantSql = !isPxAdmin(user) ? 'AND tenant_id = ?' : '';
  const existing = await dbGet<Record<string, unknown>>(
    `SELECT * FROM approval_tasks WHERE (id = ? OR content_id = ?) ${tenantSql}`,
    !isPxAdmin(user) ? [id, id, user!.tenantId] : [id, id]
  );
  if (!existing) return null;
  const now = new Date().toISOString();
  const nextStatus = action === 'approve' ? 'approved' : 'rejected';
  await dbRun(`
    UPDATE approval_tasks
    SET status = ?, current_node_id = ?, progress_text = ?, sla_due_at = ?, completed_at = ?, updated_at = ?
    WHERE (id = ? OR content_id = ?) ${tenantSql}
  `, !isPxAdmin(user)
    ? [nextStatus, action === 'approve' ? null : existing.current_node_id, action === 'approve' ? '3/3' : existing.progress_text, action === 'approve' ? '已完成' : '修改中', action === 'approve' ? now : null, now, id, id, user!.tenantId]
    : [nextStatus, action === 'approve' ? null : existing.current_node_id, action === 'approve' ? '3/3' : existing.progress_text, action === 'approve' ? '已完成' : '修改中', action === 'approve' ? now : null, now, id, id]);

  await dbRun(`
    INSERT INTO approval_task_actions (task_id, node_id, action, actor_user_id, actor_name, reject_reason, comment, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `, [existing.id, existing.current_node_id ?? null, action, user?.id ?? null, user?.name || '管理员', rejectReason ?? null, comments ?? null, now]);

  await dbRun(`
    UPDATE approval_items SET status = ?, reviewed_by = ?, reviewed_at = ?, comments = ? WHERE content_id = ?
  `, [nextStatus, user?.name || '管理员', now, comments || rejectReason || (action === 'approve' ? '审批通过' : '审批不通过'), existing.content_id]);

  await dbRun(`
    UPDATE content SET workflow_state = ?, status = ?, updated_at = ? WHERE id = ?
    ${!isPxAdmin(user) ? 'AND tenant_id = ?' : ''}
  `, !isPxAdmin(user)
    ? [action === 'approve' ? 'approved_locked' : 'rejected', action === 'approve' ? 'approved' : 'draft', now, existing.content_id, user!.tenantId]
    : [action === 'approve' ? 'approved_locked' : 'rejected', action === 'approve' ? 'approved' : 'draft', now, existing.content_id]);

  if (action === 'approve') {
    await dbRun(`
      UPDATE content_versions
      SET workflow_state = 'approved_locked', approved_by = ?, approved_at = ?
      WHERE content_id = ? AND version_no = (SELECT MAX(version_no) FROM content_versions WHERE content_id = ?)
    `, [user?.id ?? null, now, existing.content_id, existing.content_id]);
  }

  const row = await dbGet<Record<string, unknown>>(`
    SELECT t.*, c.title, c.author, p.disease, n.node_name
    FROM approval_tasks t
    LEFT JOIN content c ON c.id = t.content_id
    LEFT JOIN projects p ON p.id = t.project_id
    LEFT JOIN approval_flow_nodes n ON n.id = t.current_node_id
    WHERE (t.id = ? OR t.content_id = ?) ${!isPxAdmin(user) ? 'AND t.tenant_id = ?' : ''}
  `, !isPxAdmin(user) ? [id, id, user!.tenantId] : [id, id]);
  return row ? mapApprovalTaskRow(row) : null;
}

// === Platform base users/settings ===
export async function getUsers(filters: { page: number; pageSize: number; scope?: QueryScope }) {
  const tenant = tenantCondition('users', filters.scope);
  const where = tenant.sql ? `WHERE ${tenant.sql}` : '';
  const totalRow = await dbGet<{ cnt: number | string }>(`SELECT COUNT(*) as cnt FROM users ${where}`, tenant.params);
  const total = Number(totalRow?.cnt ?? 0);
  const offset = (filters.page - 1) * filters.pageSize;
  const rows = await dbAll<Record<string, unknown>>(`SELECT * FROM users ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`, [...tenant.params, filters.pageSize, offset]);

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

export async function getTenantByIdPublic(id: string) {
  const row = await dbGet<Record<string, unknown>>(`
    SELECT t.id, t.name, t.short_name, t.tenant_type, s.k_anonymity_threshold
    FROM tenants t
    LEFT JOIN tenant_scopes s ON s.tenant_id = t.id
    WHERE t.id = ?
  `, [id]);
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    shortName: row.short_name,
    type: row.tenant_type,
    kAnonymityThreshold: asNumber(row.k_anonymity_threshold, kAnonymityDefault),
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

export async function updateTeamMemberRole(id: string, role: string, scope?: QueryScope) {
  const tenant = tenantCondition('users', scope);
  const existing = await dbGet('SELECT id FROM users WHERE id = ?' + (tenant.sql ? ` AND ${tenant.sql}` : ''), [id, ...tenant.params]);
  if (!existing) return null;
  await dbRun('UPDATE users SET role = ?, updated_at = ? WHERE id = ?' + (tenant.sql ? ` AND ${tenant.sql}` : ''), [role, new Date().toISOString(), id, ...tenant.params]);
  const row = await dbGet<Record<string, unknown>>('SELECT * FROM users WHERE id = ?' + (tenant.sql ? ` AND ${tenant.sql}` : ''), [id, ...tenant.params]);
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

export async function deleteTeamMember(id: string, scope?: QueryScope): Promise<boolean> {
  const tenant = tenantCondition('users', scope);
  const result = await dbRun('DELETE FROM users WHERE id = ?' + (tenant.sql ? ` AND ${tenant.sql}` : ''), [id, ...tenant.params]);
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

// === Aggregate-only integrations and exports ===
export interface AggregateMetricInput {
  projectId?: string;
  contentId?: string;
  diseaseId?: string;
  metricDate: string;
  pushCount?: number;
  deliveredCount?: number;
  readUsers?: number;
  readCount?: number;
  likeCount?: number;
  dislikeCount?: number;
  bookmarkCount?: number;
  shareCount?: number;
  avgReadSec?: number;
  finishRate?: number;
}

export async function ingestAggregateMetrics(rows: AggregateMetricInput[], scope: QueryScope) {
  const now = new Date().toISOString();
  let inserted = 0;

  for (const row of rows) {
    const interactionCount = asNumber(row.likeCount) + asNumber(row.dislikeCount) + asNumber(row.bookmarkCount) + asNumber(row.shareCount);
    await dbRun(`
      DELETE FROM behavior_daily_metrics
      WHERE tenant_id = ? AND metric_date = ? AND COALESCE(project_id, '') = COALESCE(?, '') AND COALESCE(content_id, '') = COALESCE(?, '')
    `, [scope.tenantId, row.metricDate, row.projectId ?? null, row.contentId ?? null]);

    await dbRun(`
      INSERT INTO behavior_daily_metrics (
        tenant_id, project_id, content_id, disease_id, metric_date,
        push_count, delivered_count, read_users, read_count, like_count, dislike_count,
        bookmark_count, share_count, interaction_count, avg_read_sec, finish_rate, created_at, updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      scope.tenantId,
      row.projectId ?? null,
      row.contentId ?? null,
      row.diseaseId ?? null,
      row.metricDate,
      asNumber(row.pushCount),
      asNumber(row.deliveredCount),
      asNumber(row.readUsers),
      asNumber(row.readCount),
      asNumber(row.likeCount),
      asNumber(row.dislikeCount),
      asNumber(row.bookmarkCount),
      asNumber(row.shareCount),
      interactionCount,
      asNumber(row.avgReadSec),
      Number(row.finishRate ?? 0),
      now,
      now,
    ]);
    inserted += 1;
  }

  return { inserted, aggregateOnly: true };
}

async function getTenantKAnonymity(scope: QueryScope): Promise<number> {
  const row = await dbGet<{ k_anonymity_threshold: number | string }>('SELECT k_anonymity_threshold FROM tenant_scopes WHERE tenant_id = ?', [scope.tenantId]);
  return asNumber(row?.k_anonymity_threshold, kAnonymityDefault);
}

export async function assertExportAllowed(scope: QueryScope): Promise<{ recordCount: number; minReadUsers: number | null; threshold: number }> {
  const threshold = await getTenantKAnonymity(scope);
  const row = await dbGet<{ cnt: number | string; min_read_users: number | string | null }>(
    'SELECT COUNT(*) as cnt, MIN(read_users) as min_read_users FROM behavior_daily_metrics WHERE tenant_id = ?',
    [scope.tenantId]
  );
  const recordCount = asNumber(row?.cnt);
  const minReadUsers = row?.min_read_users === null || row?.min_read_users === undefined ? null : asNumber(row.min_read_users);
  if (recordCount > 0 && minReadUsers !== null && minReadUsers < threshold) {
    throw new Error(`Export blocked: smallest aggregate cell (${minReadUsers}) is below k-anonymity threshold (${threshold}).`);
  }
  return { recordCount, minReadUsers, threshold };
}

export async function createExportJob(data: Record<string, unknown>, scope: QueryScope) {
  const guard = await assertExportAllowed(scope);
  const id = `export-${randomUUID()}`;
  const rangeDays = Math.max(1, asNumber(data.rangeDays, 14));
  const scopeValue = String(data.scope || 'all');
  const now = new Date().toISOString();
  const watermark = `${scope.tenantId} / ${scope.name} / ${now}`;

  await dbRun(`
    INSERT INTO behavior_export_jobs (id, tenant_id, requested_by, scope, range_days, project_id, disease_id, status, file_url, record_count, created_at, completed_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, 'completed', ?, ?, ?, ?)
  `, [
    id,
    scope.tenantId,
    scope.id,
    ['all', 'push', 'read', 'interaction'].includes(scopeValue) ? scopeValue : 'all',
    rangeDays,
    typeof data.projectId === 'string' ? data.projectId : null,
    typeof data.diseaseId === 'string' ? data.diseaseId : null,
    `/api/exports/${id}/download`,
    guard.recordCount,
    now,
    now,
  ]);

  return { id, status: 'completed', fileUrl: `/api/exports/${id}/download`, watermark, aggregateOnly: true, ...guard };
}

export async function getExportJob(id: string, scope: QueryScope) {
  const row = await dbGet<Record<string, unknown>>('SELECT * FROM behavior_export_jobs WHERE id = ? AND tenant_id = ?', [id, scope.tenantId]);
  return row ? toCamel(row) : null;
}

export async function getExportMetricRows(job: Record<string, unknown>, scope: QueryScope) {
  const conditions = ['tenant_id = ?'];
  const params: unknown[] = [scope.tenantId];
  if (job.projectId) {
    conditions.push('project_id = ?');
    params.push(job.projectId);
  }
  if (job.diseaseId) {
    conditions.push('disease_id = ?');
    params.push(job.diseaseId);
  }

  const rows = await dbAll<Record<string, unknown>>(`
    SELECT metric_date, project_id, content_id, disease_id, push_count, delivered_count, read_users,
      read_count, like_count, dislike_count, bookmark_count, share_count, interaction_count,
      avg_read_sec, finish_rate
    FROM behavior_daily_metrics
    WHERE ${conditions.join(' AND ')}
    ORDER BY metric_date DESC, project_id ASC, content_id ASC
    LIMIT 10000
  `, params);

  return rows.map(toCamel);
}
