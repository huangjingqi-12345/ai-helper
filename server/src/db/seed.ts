import { dbAll, dbGet, dbRun, DB_DRIVER } from './connection.js';
import { initializeSchema } from './schema.js';
import { logger } from '../utils/logger.js';
import { contentList } from '../data/content.js';
import { overviewProjects, overviewStats } from '../data/overview.js';
import { behaviorSummary } from '../data/behavior.js';
import { distributionProjects, doctorCandidates } from '../data/distributionProjects.js';
import { runMigrations } from './migrations.js';

const jsonCast = DB_DRIVER === 'postgres' ? '::jsonb' : '';
const boolValue = (value: boolean): boolean | number => (DB_DRIVER === 'postgres' ? value : value ? 1 : 0);
const demoResetEnabled = DB_DRIVER === 'sqlite' && process.env.RESET_DEMO_DATA === 'true';

async function run(sql: string, params: unknown[] = []): Promise<void> {
  await dbRun(sql, params);
}

function json(value: unknown): string {
  return JSON.stringify(value);
}

async function replaceRowsForSqlite(tables: string[]): Promise<void> {
  if (!demoResetEnabled) return;
  await run('PRAGMA foreign_keys = OFF');
  for (const table of tables) {
    await run(`DELETE FROM ${table}`);
  }
  await run('PRAGMA foreign_keys = ON');
}

async function seedTenants(now: string): Promise<void> {
  const tenants = [
    ['T-PX', 'Px 自营运营组', 'Px Ops', 'ops', 'active', '未签约', '齐晓川', 'ops-admin@px.health', 'Px 平台合规枢纽租户，唯一可见全量明文。', boolValue(true)],
    ['T-NV', '诺华制药（中国）', '诺华', 'pharma', 'active', 'PXC-2025-A001', '林筱', 'compliance@novartis.cn', '乳腺癌靶向与 CDK4/6 线，脱敏聚合供三区表现。', boolValue(true)],
    ['T-AZ', '阿斯利康（中国）', '阿斯利康', 'pharma', 'active', 'PXC-2025-A002', '顾承', 'compliance@astrazeneca.cn', '乳腺癌 HER2 ADC + PARP 抑制维持线，灰度上限 30%。', boolValue(true)],
    ['T-MSD', '默沙东（中国）', '默沙东', 'pharma', 'active', 'PXC-2025-A003', '韦珂', 'compliance@msd.cn', '乳腺癌免疫联合线，灰度上限 20%、k-匿名 100。', boolValue(false)],
    ['T-RC', '罗氏制药', '罗氏', 'pharma', 'inactive', 'PXC-2025-A004', '贺珏', 'compliance@roche.cn', '因合规审查暂停服务（2026-04-26），暂停期内账号全部冻结。', boolValue(false)],
    ['T-LL', '礼来制药', '礼来', 'pharma', 'active', 'PXC-2026-A005', '禾未', 'compliance@lilly.cn', '乳腺癌内分泌依从与随访依从线，灰度上限 30%，仅 7 个工作日的实时数据。', boolValue(true)],
    ['T-SY', '石药集团', '石药', 'pharma', 'draft', '未签约', '周予安', 'compliance@cspc.cn', '尚未签约，租户处于草稿状态。', boolValue(false)],
  ];

  for (const tenant of tenants) {
    await run(`
      INSERT INTO tenants (id, name, short_name, tenant_type, status, contract_no, contact_name, contact_email, description, can_export, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        name = excluded.name,
        short_name = excluded.short_name,
        tenant_type = excluded.tenant_type,
        status = excluded.status,
        contract_no = excluded.contract_no,
        contact_name = excluded.contact_name,
        contact_email = excluded.contact_email,
        description = excluded.description,
        can_export = excluded.can_export,
        updated_at = excluded.updated_at
    `, [...tenant, now, now]);
  }

  const scopes = [
    ['scope-T-PX', 'T-PX', ['*'], ['*'], ['*'], 100, 0, boolValue(true), boolValue(true)],
    ['scope-T-NV', 'T-NV', ['乳腺癌'], ['飞赛尔', '来曲唑'], ['华东', '华北', '华南'], 50, 50, boolValue(true), boolValue(true)],
    ['scope-T-AZ', 'T-AZ', ['乳腺癌'], ['优赫得', '利普卓'], ['*'], 30, 50, boolValue(true), boolValue(true)],
    ['scope-T-MSD', 'T-MSD', ['乳腺癌'], ['可瑞达'], ['华东', '华南'], 20, 100, boolValue(true), boolValue(false)],
    ['scope-T-RC', 'T-RC', ['乳腺癌'], ['赫赛汀', '帕杰特'], ['*'], 10, 100, boolValue(true), boolValue(false)],
    ['scope-T-LL', 'T-LL', ['乳腺癌'], ['依西美坦片', '他莫昔芬'], ['*'], 30, 50, boolValue(true), boolValue(true)],
    ['scope-T-SY', 'T-SY', [], [], [], 0, 100, boolValue(true), boolValue(false)],
  ];

  for (const scope of scopes) {
    const [id, tenantId, diseaseIds, brandIds, regionIds, gray, kAnon, canViewAggregate, canExportCsv] = scope;
    await run(`
      INSERT INTO tenant_scopes (id, tenant_id, disease_ids, brand_ids, region_ids, gray_limit_percent, k_anonymity_threshold, can_view_aggregate_metrics, can_export_csv, created_at, updated_at)
      VALUES (?, ?, ?${jsonCast}, ?${jsonCast}, ?${jsonCast}, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        disease_ids = excluded.disease_ids,
        brand_ids = excluded.brand_ids,
        region_ids = excluded.region_ids,
        gray_limit_percent = excluded.gray_limit_percent,
        k_anonymity_threshold = excluded.k_anonymity_threshold,
        can_view_aggregate_metrics = excluded.can_view_aggregate_metrics,
        can_export_csv = excluded.can_export_csv,
        updated_at = excluded.updated_at
    `, [id, tenantId, json(diseaseIds), json(brandIds), json(regionIds), gray, kAnon, canViewAggregate, canExportCsv, now, now]);
  }
}

async function seedOverviewContentAndBehavior(_now: string): Promise<void> {
  await replaceRowsForSqlite([
    'content_tags',
    'content_versions',
    'content_assets',
    'request_distribution_batches',
    'request_distribution_configs',
    'content_requests',
    'content',
    'project_topics',
    'project_formats',
    'projects',
    'behavior_trends',
    'behavior_top_content',
    'behavior_by_disease',
  ]);

  await run(`
    INSERT INTO overview_stats (id, project_count, published_content, push_count, read_users, read_count, interaction_count, last_updated)
    VALUES (1, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      project_count = excluded.project_count,
      published_content = excluded.published_content,
      push_count = excluded.push_count,
      read_users = excluded.read_users,
      read_count = excluded.read_count,
      interaction_count = excluded.interaction_count,
      last_updated = excluded.last_updated
  `, [overviewStats.projectCount, overviewStats.publishedContent, overviewStats.pushCount, overviewStats.readUsers, overviewStats.readCount, overviewStats.interactionCount, overviewStats.lastUpdated]);

  for (const project of overviewProjects) {
    await run(`
      INSERT INTO projects (id, tenant_id, name, title, disease, content_count, published_count, push_count, read_users, read_count, interaction_count, status, created_at, updated_at)
      VALUES (?, 'T-PX', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        name = excluded.name,
        title = excluded.title,
        disease = excluded.disease,
        content_count = excluded.content_count,
        published_count = excluded.published_count,
        push_count = excluded.push_count,
        read_users = excluded.read_users,
        read_count = excluded.read_count,
        interaction_count = excluded.interaction_count,
        status = excluded.status,
        updated_at = excluded.updated_at
    `, [project.id, project.name, project.name, project.disease, project.contentCount, project.publishedCount, project.pushCount, project.readUsers, project.readCount, project.interactionCount, project.status, project.createdAt, project.updatedAt]);
  }

  for (const project of distributionProjects) {
    await run(`
      INSERT INTO projects (
        id, tenant_id, name, title, disease, priority, content_count, published_count,
        status, expected_date, total_pieces, cadence, patient_cap, progress_percent,
        created_at, updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        tenant_id = excluded.tenant_id,
        name = excluded.name,
        title = excluded.title,
        disease = excluded.disease,
        priority = excluded.priority,
        content_count = excluded.content_count,
        published_count = excluded.published_count,
        status = excluded.status,
        expected_date = excluded.expected_date,
        total_pieces = excluded.total_pieces,
        cadence = excluded.cadence,
        patient_cap = excluded.patient_cap,
        progress_percent = excluded.progress_percent,
        updated_at = excluded.updated_at
    `, [
      project.id,
      project.tenantId,
      project.title,
      project.title,
      project.disease,
      project.priority,
      project.contentCount,
      project.publishedCount,
      project.status,
      project.expectedDate,
      project.totalPieces,
      project.cadence,
      project.patientCap,
      project.progress,
      project.createdAt ?? project.expectedDate,
      project.updatedAt ?? project.createdAt ?? project.expectedDate,
    ]);
  }

  const contentWorkflowStates = new Set(['requirement_submitted', 'doctor_distributing', 'doctor_producing', 'third_party_review', 'internal_review', 'published']);
  for (const item of contentList) {
    const itemStatus = String(item.status);
    const dbStatus = contentWorkflowStates.has(itemStatus) ? itemStatus : item.pipelineStage;
    await run(`
      INSERT INTO content (id, tenant_id, project_id, title, type, status, workflow_state, pipeline_stage, priority, author, excerpt, content, tags, push_count, read_users, read_count, like_count, dislike_count, bookmark_count, share_count, finish_rate, avg_read_sec, expected_date, rejection_note, created_at, updated_at, published_at)
      VALUES (?, 'T-PX', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?${jsonCast}, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        project_id = excluded.project_id,
        title = excluded.title,
        type = excluded.type,
        status = excluded.status,
        workflow_state = excluded.workflow_state,
        pipeline_stage = excluded.pipeline_stage,
        priority = excluded.priority,
        author = excluded.author,
        excerpt = excluded.excerpt,
        content = excluded.content,
        tags = excluded.tags,
        push_count = excluded.push_count,
        read_users = excluded.read_users,
        read_count = excluded.read_count,
        like_count = excluded.like_count,
        dislike_count = excluded.dislike_count,
        bookmark_count = excluded.bookmark_count,
        share_count = excluded.share_count,
        finish_rate = excluded.finish_rate,
        avg_read_sec = excluded.avg_read_sec,
        expected_date = excluded.expected_date,
        rejection_note = excluded.rejection_note,
        updated_at = excluded.updated_at,
        published_at = excluded.published_at
    `, [
      item.id,
      item.projectId,
      item.title,
      item.type,
      dbStatus,
      dbStatus,
      item.pipelineStage,
      item.priority,
      item.author,
      item.excerpt ?? null,
      item.content,
      json(item.tags),
      item.pushCount ?? 0,
      item.readUsers ?? 0,
      item.readCount,
      item.likeCount,
      item.dislikeCount ?? 0,
      item.bookmarkCount,
      item.shareCount ?? 0,
      item.finishRate ?? null,
      item.avgReadSec ?? null,
      item.expectedDate ?? null,
      item.rejectionNote ?? null,
      item.createdAt,
      item.updatedAt,
      item.publishedAt ?? null,
    ]);

    const versionCount = await dbGet<{ cnt: number | string }>('SELECT COUNT(*) as cnt FROM content_versions WHERE content_id = ?', [item.id]);
    if (Number(versionCount?.cnt ?? 0) === 0) {
      await run(`
        INSERT INTO content_versions (content_id, version_no, title, body, excerpt, editor_user_id, change_note, workflow_state, compliance_checklist, immutable_hash, approved_by, approved_at, created_at)
        VALUES (?, 1, ?, ?, ?, ?, 'seeded baseline content version', ?, ?${jsonCast}, ?, ?, ?, ?)
      `, [
        item.id,
        item.title,
        item.content,
        item.excerpt ?? null,
        item.author,
        dbStatus,
        json({
          classification: 'patient_education',
          diseaseArea: item.projectName,
          brandMention: false,
          sourceAttached: false,
          piReference: null,
          prohibitedClaimChecked: false,
        }),
        `seed-${item.id}`,
        itemStatus === 'published' ? 'seed' : null,
        itemStatus === 'published' ? item.publishedAt ?? item.updatedAt : null,
        item.createdAt,
      ]);
    }
  }

  const requestOverrides: Record<string, Partial<{
    tenantId: string;
    projectId: string;
    requestName: string;
    title: string;
    priority: 'P0' | 'P1' | 'P2';
    expectedDate: string;
    matrix: Record<string, Record<string, number>>;
    totalCount: number;
    note: string;
    status: 'pending' | 'accepted' | 'rejected' | 'converted';
    submittedAt: string;
  }>> = {
    'REQ-2030': {
      tenantId: 'T-AZ',
      projectId: 'PRJ-1001',
      requestName: '首输 6 周内安全信号识别',
      title: '乳腺癌 · 优赫得 · 首输 6 周内安全信号识别',
      priority: 'P1',
      expectedDate: '2026-05-22',
      matrix: { treatment: { article: 2, poster: 1 }, adverse: { checklist: 1 } },
      totalCount: 4,
      note: '等待派单',
      status: 'pending',
      submittedAt: '2026-05-07 14:10',
    },
    'REQ-2031': {
      tenantId: 'T-RC',
      projectId: 'PRJ-1000',
      requestName: '12 周随访节点提醒 · 多子项诉求',
      title: '乳腺癌 · 赫赛汀 · 12 周随访节点提醒 · 多子项诉求',
      priority: 'P0',
      expectedDate: '2026-05-18',
      matrix: {
        awareness: { article: 2, poster: 1 },
        treatment: { article: 1, poster: 1 },
        followup: { checklist: 1 },
      },
      totalCount: 6,
      note: '等待运营受理与合规预审',
      status: 'pending',
      submittedAt: '2026-05-07 09:42',
    },
  };

  const requestSeeds = contentList.slice(0, 5).map((item, index) => {
    const id = `REQ-${2031 - index}`;
    const override = requestOverrides[id] ?? {};
    return {
      id,
      tenantId: override.tenantId ?? ['T-NV', 'T-AZ', 'T-RC', 'T-LL', 'T-NV'][index] ?? 'T-NV',
      projectId: override.projectId ?? item.projectId,
      contentId: item.id,
      requestName: override.requestName ?? (item.title.split(' · ').slice(-1)[0] || item.title),
      title: override.title ?? `乳腺癌 · ${item.title}`,
      priority: override.priority ?? item.priority,
      expectedDate: override.expectedDate ?? item.expectedDate ?? '2026-05-30',
      matrix: override.matrix ?? { treatment: { article: item.type === 'article' ? 1 : 0, poster: item.type === 'poster' ? 1 : 0, checklist: item.type === 'checklist' ? 1 : 0 } },
      totalCount: override.totalCount ?? 1,
      note: override.note ?? 'Demo seeded pharma content request.',
      status: override.status ?? 'pending',
      submittedBy: item.author,
      submittedAt: override.submittedAt ?? item.createdAt,
      createdAt: item.createdAt,
      updatedAt: item.updatedAt,
    };
  });

  for (const request of requestSeeds) {
    await run(`
      INSERT INTO content_requests (id, tenant_id, project_id, content_id, request_name, title, priority, expected_date, theme_format_matrix, total_count, note, status, submitted_by, submitted_at, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?${jsonCast}, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        tenant_id = excluded.tenant_id,
        project_id = excluded.project_id,
        content_id = excluded.content_id,
        request_name = excluded.request_name,
        title = excluded.title,
        priority = excluded.priority,
        expected_date = excluded.expected_date,
        theme_format_matrix = excluded.theme_format_matrix,
        total_count = excluded.total_count,
        note = excluded.note,
        status = excluded.status,
        submitted_by = excluded.submitted_by,
        submitted_at = excluded.submitted_at,
        updated_at = excluded.updated_at
    `, [
      request.id,
      request.tenantId,
      request.projectId,
      request.contentId,
      request.requestName,
      request.title,
      request.priority,
      request.expectedDate,
      json(request.matrix),
      request.totalCount,
      request.note,
      request.status,
      request.submittedBy,
      request.submittedAt,
      request.createdAt,
      request.updatedAt,
    ]);
  }

  for (const request of requestSeeds.slice(0, 3)) {
    const manuscriptStrategyOnly = request.id === 'REQ-2031';
    const strategyOnly = manuscriptStrategyOnly || request.id === 'REQ-2030';
    await run(`
      INSERT INTO request_distribution_configs (
        request_id, assignment_mode, whitelist_enabled, strategy_enabled,
        department_filters, title_filters, region_filters, tag_filters,
        whitelist_doctor_ids, whitelist_doctor_quota,
        patient_channels, patient_regions, patient_tags, patient_gray_percent, patient_cap,
        note, updated_by, created_at, updated_at
      )
      VALUES (?, ?, ?, ?, ?${jsonCast}, ?${jsonCast}, ?${jsonCast}, ?${jsonCast}, ?${jsonCast}, ?${jsonCast}, ?${jsonCast}, ?${jsonCast}, ?${jsonCast}, 30, 5000, ?, 'PX 运营组', ?, ?)
      ON CONFLICT(request_id) DO UPDATE SET
        assignment_mode = excluded.assignment_mode,
        whitelist_enabled = excluded.whitelist_enabled,
        strategy_enabled = excluded.strategy_enabled,
        department_filters = excluded.department_filters,
        title_filters = excluded.title_filters,
        region_filters = excluded.region_filters,
        tag_filters = excluded.tag_filters,
        whitelist_doctor_ids = excluded.whitelist_doctor_ids,
        whitelist_doctor_quota = excluded.whitelist_doctor_quota,
        patient_channels = excluded.patient_channels,
        patient_regions = excluded.patient_regions,
        patient_tags = excluded.patient_tags,
        patient_gray_percent = excluded.patient_gray_percent,
        patient_cap = excluded.patient_cap,
        note = excluded.note,
        updated_by = excluded.updated_by,
        updated_at = excluded.updated_at
    `, [
      request.id,
      manuscriptStrategyOnly ? 'strategy' : strategyOnly ? 'strategy' : 'mixed',
      boolValue(!strategyOnly),
      boolValue(true),
      json(manuscriptStrategyOnly ? [] : ['乳腺外科', '肿瘤内科']),
      json(strategyOnly ? ['主任医师', '副主任医师', '主治医师', '住院医师'] : ['主任医师', '副主任医师']),
      json(manuscriptStrategyOnly ? [] : ['华东', '华南']),
      json(manuscriptStrategyOnly ? [] : ['KOL', '患教经验丰富']),
      json(strategyOnly ? [] : ['doc_1001', 'doc_1002']),
      json(strategyOnly ? {} : { doc_1001: 1, doc_1002: 1 }),
      json(['微信公众号', '短信']),
      json(['华东', '华南']),
      json(['术后随访', 'HER2 靶向']),
      'Demo seeded request-level distribution config.',
      request.createdAt,
      request.updatedAt,
    ]);
  }

  await run("DELETE FROM request_distribution_batches WHERE request_id IN ('REQ-2031', 'REQ-2030')");
  const requestHistoryBatches = [
    {
      requestId: 'REQ-2031',
      id: 'BATCH-REQ-2031-1',
      matrix: { awareness: { article: 2 } },
      total: 2,
      whitelist: 1,
      strategy: 1,
      operator: '陆玟昕',
      submittedAt: '2026-04-22 10:14',
    },
    {
      requestId: 'REQ-2031',
      id: 'BATCH-REQ-2031-2',
      matrix: { treatment: { article: 1 } },
      total: 1,
      whitelist: 0,
      strategy: 1,
      operator: '祝景琰',
      submittedAt: '2026-04-25 16:32',
    },
    {
      requestId: 'REQ-2030',
      id: 'BATCH-REQ-2030-1',
      matrix: { treatment: { article: 2 } },
      total: 2,
      whitelist: 1,
      strategy: 1,
      operator: '陆玟昕',
      submittedAt: '2026-04-22 10:14',
    },
    {
      requestId: 'REQ-2030',
      id: 'BATCH-REQ-2030-2',
      matrix: { adverse: { checklist: 1 } },
      total: 1,
      whitelist: 0,
      strategy: 1,
      operator: '祝景琰',
      submittedAt: '2026-04-25 16:32',
    },
  ];
  for (const batch of requestHistoryBatches) {
    const seededRequest = requestSeeds.find((request) => request.id === batch.requestId);
    if (seededRequest) {
      await run(`
        INSERT INTO request_distribution_batches (id, request_id, batch_matrix, total_count, whitelist_total, strategy_total, operator, submitted_at, created_at)
        VALUES (?, ?, ?${jsonCast}, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          batch_matrix = excluded.batch_matrix,
          total_count = excluded.total_count,
          whitelist_total = excluded.whitelist_total,
          strategy_total = excluded.strategy_total,
          operator = excluded.operator,
          submitted_at = excluded.submitted_at
      `, [
        batch.id,
        batch.requestId,
        json(batch.matrix),
        batch.total,
        batch.whitelist,
        batch.strategy,
        batch.operator,
        batch.submittedAt,
        seededRequest.createdAt,
      ]);
    }
  }

  await run('DELETE FROM behavior_trends');
  for (const point of behaviorSummary.readTrend) {
    await run('INSERT INTO behavior_trends (date, type, value) VALUES (?, ?, ?)', [point.date, 'reads', point.value]);
  }
  for (const point of behaviorSummary.interactionTrend) {
    await run('INSERT INTO behavior_trends (date, type, value) VALUES (?, ?, ?)', [point.date, 'interactions', point.value]);
  }

  await run('DELETE FROM behavior_top_content');
  for (const item of behaviorSummary.topContent) {
    await run('INSERT INTO behavior_top_content (content_id, title, reads, interactions) VALUES (?, ?, ?, ?)', [item.contentId, item.title, item.reads, item.interactions]);
  }

  await run('DELETE FROM behavior_by_disease');
  for (const item of behaviorSummary.byDisease) {
    await run('INSERT INTO behavior_by_disease (disease, reads, interactions, push_count) VALUES (?, ?, ?, ?)', [item.disease, item.reads, item.interactions, item.pushCount]);
  }
}

async function seedDistributionProjects(now: string): Promise<void> {
  await replaceRowsForSqlite(['distribution_projects', 'doctor_specialties', 'doctor_tags', 'distribution_candidates', 'doctors']);

  for (const project of distributionProjects) {
    await run(`
      INSERT INTO distribution_projects (id, tenant_id, title, priority, status, brand, disease, owner, expected_date, total_pieces, cadence, patient_cap, topics, formats, approval_flow, progress, current_node, content_count, published_count, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?${jsonCast}, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        tenant_id = excluded.tenant_id,
        title = excluded.title,
        priority = excluded.priority,
        status = excluded.status,
        brand = excluded.brand,
        disease = excluded.disease,
        owner = excluded.owner,
        expected_date = excluded.expected_date,
        total_pieces = excluded.total_pieces,
        cadence = excluded.cadence,
        patient_cap = excluded.patient_cap,
        topics = excluded.topics,
        formats = excluded.formats,
        approval_flow = excluded.approval_flow,
        progress = excluded.progress,
        current_node = excluded.current_node,
        content_count = excluded.content_count,
        published_count = excluded.published_count,
        created_at = excluded.created_at,
        updated_at = excluded.updated_at
    `, [project.id, project.tenantId, project.title, project.priority, project.status, project.brand, project.disease, project.owner, project.expectedDate, project.totalPieces, project.cadence, project.patientCap, json(project.topics), project.formats, project.approvalFlow, project.progress, project.currentNode, project.contentCount, project.publishedCount, project.createdAt ?? now, project.updatedAt ?? now]);
  }

  const activeProjectIds = distributionProjects.map((project) => project.id);
  if (activeProjectIds.length > 0) {
    await run(
      `DELETE FROM distribution_projects WHERE id LIKE 'PRJ-%' AND id NOT IN (${activeProjectIds.map(() => '?').join(', ')})`,
      activeProjectIds,
    );
  }

  for (const doctor of doctorCandidates) {
    await run(`
      INSERT INTO doctors (id, name, title, department, region, hospital, status, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, 'active', ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        name = excluded.name,
        title = excluded.title,
        department = excluded.department,
        region = excluded.region,
        hospital = excluded.hospital,
        status = excluded.status,
        updated_at = excluded.updated_at
    `, [doctor.id, doctor.name, doctor.title, doctor.dept, doctor.region, doctor.hospital, now, now]);

    await run('DELETE FROM doctor_specialties WHERE doctor_id = ?', [doctor.id]);
    for (const specialty of doctor.specialties) {
      await run('INSERT INTO doctor_specialties (doctor_id, disease_id, created_at) VALUES (?, ?, ?)', [doctor.id, specialty, now]);
    }

    await run('DELETE FROM doctor_tags WHERE doctor_id = ?', [doctor.id]);
    for (const tag of doctor.tags) {
      await run('INSERT INTO doctor_tags (doctor_id, tag, created_at) VALUES (?, ?, ?)', [doctor.id, tag, now]);
    }
  }
}

async function seedStrategies(now: string): Promise<void> {
  await replaceRowsForSqlite(['distribution_strategies', 'distribution_strategy_filters', 'distribution_records']);

  const strategies = [
    ['str-001', 'T-NV', '乳腺癌春季推送计划', 'proj-breast', ['华东', '华南'], ['乳腺癌'], 3200, ['CNT-105', 'CNT-112'], 'recurring', '2026-03-01T00:00:00Z', '2026-05-31T23:59:59Z', 'weekly', 'active', 3200, 3050, 2100, 1800, '2026-02-20T08:00:00Z', now],
    ['str-002', 'T-MSD', '肺癌科普专项推送', 'proj-breast', ['华北', '西南'], ['肺癌(NSCLC)'], 2800, ['CNT-106'], 'scheduled', '2026-04-01T00:00:00Z', '2026-06-30T23:59:59Z', null, 'active', 2800, 2650, 1800, 1500, '2026-03-15T08:00:00Z', now],
    ['str-003', 'T-AZ', '糖尿病管理推送', 'proj-breast', ['全国'], ['2型糖尿病'], 4500, ['CNT-104', 'CNT-114'], 'recurring', '2026-02-01T00:00:00Z', '2026-07-31T23:59:59Z', 'monthly', 'active', 4500, 4200, 3100, 2600, '2026-01-25T08:00:00Z', now],
    ['str-004', 'T-PX', '高血压患者关怀', 'proj-breast', ['华中'], ['高血压'], 2300, ['CNT-110'], 'immediate', null, null, null, 'paused', 2300, 2100, 1400, 1100, '2026-03-10T08:00:00Z', now],
  ];

  for (const strategy of strategies) {
    const [id, tenantId, name, projectId, regions, diseases, patientCount, contentIds, scheduleType, startDate, endDate, frequency, status, pushed, delivered, opened, read, createdAt, updatedAt] = strategy;
    await run(`
      INSERT INTO distribution_strategies (id, tenant_id, name, project_id, target_regions, target_diseases, target_patient_count, content_ids, schedule_type, schedule_start_date, schedule_end_date, schedule_frequency, status, metrics_pushed, metrics_delivered, metrics_opened, metrics_read, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?${jsonCast}, ?${jsonCast}, ?, ?${jsonCast}, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        tenant_id = excluded.tenant_id,
        name = excluded.name,
        project_id = excluded.project_id,
        target_regions = excluded.target_regions,
        target_diseases = excluded.target_diseases,
        target_patient_count = excluded.target_patient_count,
        content_ids = excluded.content_ids,
        schedule_type = excluded.schedule_type,
        schedule_start_date = excluded.schedule_start_date,
        schedule_end_date = excluded.schedule_end_date,
        schedule_frequency = excluded.schedule_frequency,
        status = excluded.status,
        metrics_pushed = excluded.metrics_pushed,
        metrics_delivered = excluded.metrics_delivered,
        metrics_opened = excluded.metrics_opened,
        metrics_read = excluded.metrics_read,
        updated_at = excluded.updated_at
    `, [id, tenantId, name, projectId, json(regions), json(diseases), patientCount, json(contentIds), scheduleType, startDate, endDate, frequency, status, pushed, delivered, opened, read, createdAt, updatedAt]);
  }
}

async function seedApproval(now: string): Promise<void> {
  await replaceRowsForSqlite(['approval_task_actions', 'approval_tasks', 'approval_flow_nodes', 'approval_flows', 'approval_items']);

  const flows = [
    ['flow-1', 'T-PX', 'PX 默认审批流', 'DX 医学审核 → PX 运营审核 → 药企审核', 'active', 'submitter', '2026-04-20T00:00:00Z', '2026-04-20T00:00:00Z'],
    ['flow-2', 'T-PX', 'PX 快速流（品牌通识类）', '编辑审核 → Px 审核 → 药企审核', 'inactive', 'previous', '2026-03-15T00:00:00Z', '2026-03-15T00:00:00Z'],
    ['flow-nv-standard', 'T-NV', '诺华 · 标准审批流', '编辑审核 → Px 审核 → 药企审核', 'active', 'submitter', '2026-04-18T00:00:00Z', '2026-04-18T00:00:00Z'],
    ['flow-az-standard', 'T-AZ', '阿斯利康 · 标准审批流', '编辑审核 → 药企审核', 'active', 'submitter', '2026-04-18T00:00:00Z', '2026-04-18T00:00:00Z'],
  ];

  for (const flow of flows) {
    await run(`
      INSERT INTO approval_flows (id, tenant_id, name, description, status, return_policy, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        tenant_id = excluded.tenant_id,
        name = excluded.name,
        description = excluded.description,
        status = excluded.status,
        return_policy = excluded.return_policy,
        created_at = excluded.created_at,
        updated_at = excluded.updated_at
    `, flow);
  }

  const flowNodes: Array<[string, string, number, string, string, number, string]> = [
    ['flow-1-node-1', 'flow-1', 1, 'DX 医学审核', 'dx_editor', 8, 'remind_only'],
    ['flow-1-node-2', 'flow-1', 2, 'PX 运营审核', 'px_ops', 8, 'remind_only'],
    ['flow-1-node-3', 'flow-1', 3, '药企审核', 'pharma_med', 8, 'remind_only'],
    ['flow-2-node-1', 'flow-2', 1, '编辑审核', 'dx_editor', 12, 'remind_only'],
    ['flow-2-node-2', 'flow-2', 2, 'Px 审核', 'px_ops', 24, 'remind_only'],
    ['flow-2-node-3', 'flow-2', 3, '药企审核', 'pharma_med', 24, 'remind_only'],
    ['flow-nv-node-1', 'flow-nv-standard', 1, '编辑审核', 'dx_editor', 24, 'remind_only'],
    ['flow-nv-node-2', 'flow-nv-standard', 2, 'Px 审核', 'px_ops', 24, 'remind_only'],
    ['flow-nv-node-3', 'flow-nv-standard', 3, '药企审核', 'pharma_med', 48, 'remind_only'],
    ['flow-az-node-1', 'flow-az-standard', 1, '编辑审核', 'dx_editor', 24, 'remind_only'],
    ['flow-az-node-2', 'flow-az-standard', 2, '药企审核', 'pharma_med', 48, 'remind_only'],
  ];

  const activeNodeIds = flowNodes.map((node) => node[0]);
  if (activeNodeIds.length > 0) {
    await run(
      `DELETE FROM approval_flow_nodes WHERE id LIKE 'flow-%-node-%' AND id NOT IN (${activeNodeIds.map(() => '?').join(', ')})`,
      activeNodeIds,
    );
  }

  for (const node of flowNodes) {
    await run(`
      INSERT INTO approval_flow_nodes (id, flow_id, sort_order, node_name, reviewer_type, sla_hours, timeout_policy, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        flow_id = excluded.flow_id,
        sort_order = excluded.sort_order,
        node_name = excluded.node_name,
        reviewer_type = excluded.reviewer_type,
        sla_hours = excluded.sla_hours,
        timeout_policy = excluded.timeout_policy,
        updated_at = excluded.updated_at
    `, [...node, now, now]);
  }

  const taskSeeds = [
    ['task-CNT-101', 'CNT-101', 'proj-breast', 'flow-1', null, 'cancelled', '—', '—'],
    ['task-CNT-102', 'CNT-102', 'proj-breast', 'flow-1', 'flow-1-node-1', 'pending', '0/3', '531h / 8h'],
    ['task-CNT-104', 'CNT-104', 'proj-breast', 'flow-1', null, 'cancelled', '—', '—'],
    ['task-CNT-105', 'CNT-105', 'proj-breast', 'flow-1', 'flow-1-node-1', 'pending', '0/3', '507h / 8h'],
    ['task-CNT-106', 'CNT-106', 'proj-breast', 'flow-1', 'flow-1-node-1', 'pending', '0/3', '531h / 8h'],
    ['task-CNT-107', 'CNT-107', 'proj-breast', 'flow-1', 'flow-1-node-1', 'pending', '0/3', '459h / 8h'],
    ['task-CNT-103', 'CNT-103', 'proj-breast', 'flow-1', null, 'cancelled', '—', '—'],
    ['task-CNT-108', 'CNT-108', 'proj-breast', 'flow-1', null, 'cancelled', '—', '—'],
    ['task-CNT-110', 'CNT-110', 'proj-breast', 'flow-1', null, 'cancelled', '—', '—'],
    ['task-CNT-111', 'CNT-111', 'proj-breast', 'flow-1', null, 'cancelled', '—', '—'],
    ['task-CNT-109', 'CNT-109', 'proj-breast', 'flow-1', null, 'cancelled', '—', '—'],
    ['task-CNT-112', 'CNT-112', 'proj-breast', 'flow-1', null, 'cancelled', '—', '—'],
    ['task-CNT-113', 'CNT-113', 'proj-breast', 'flow-1', null, 'cancelled', '—', '—'],
    ['task-CNT-114', 'CNT-114', 'proj-breast', 'flow-1', null, 'cancelled', '—', '—'],
  ];

  for (const task of taskSeeds) {
    const content = contentList.find((item) => item.id === task[1]);
    await run(`
      INSERT INTO approval_tasks (id, tenant_id, content_id, project_id, flow_id, current_node_id, status, progress_text, sla_due_at, submitted_by, submitted_at, completed_at, created_at, updated_at)
      VALUES (?, 'T-PX', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        content_id = excluded.content_id,
        project_id = excluded.project_id,
        flow_id = excluded.flow_id,
        current_node_id = excluded.current_node_id,
        status = excluded.status,
        progress_text = excluded.progress_text,
        sla_due_at = excluded.sla_due_at,
        submitted_by = excluded.submitted_by,
        submitted_at = excluded.submitted_at,
        completed_at = excluded.completed_at,
        updated_at = excluded.updated_at
    `, [task[0], task[1], task[2], task[3], task[4], task[5], task[6], task[7], content?.author ?? '作者', content?.createdAt ?? now, task[5] === 'approved' ? now : null, now, now]);
  }

  for (const task of taskSeeds) {
    const content = contentList.find((item) => item.id === task[1]);
    if (!content) continue;
    const itemStatus = task[5] === 'cancelled' ? 'approved' : task[5];
    await run(`
      INSERT INTO approval_items (id, content_id, content_title, submitted_by, submitted_at, status, reviewed_by, reviewed_at, comments, project_name)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        content_id = excluded.content_id,
        content_title = excluded.content_title,
        submitted_by = excluded.submitted_by,
        submitted_at = excluded.submitted_at,
        status = excluded.status,
        reviewed_by = excluded.reviewed_by,
        reviewed_at = excluded.reviewed_at,
        comments = excluded.comments,
        project_name = excluded.project_name
    `, [`apr-${content.id}`, content.id, content.title, content.author, content.createdAt, itemStatus, itemStatus === 'pending' ? null : '管理员', itemStatus === 'pending' ? null : now, itemStatus === 'rejected' ? content.rejectionNote ?? '请修改后重新提交' : itemStatus === 'approved' ? '内容准确，可以发布' : null, content.projectName ?? content.tags[0] ?? '患教项目']);
  }
}

async function seedAccountsAndLogs(now: string): Promise<void> {
  await replaceRowsForSqlite(['user_roles', 'users', 'audit_logs', 'notifications', 'team_settings']);

  const accounts = [
    ['A-001', 'T-PX', '齐晓川', 'qixc@px.health', 'admin', ['运营 · 平台管理员'], 'ops', '全国', 'active', true, '2026-05-08 08:42', '平台超管，唯一可启停用租户。'],
    ['A-002', 'T-PX', '陆玟昕', 'luwx@px.health', 'editor', ['运营 · 内容审核员'], 'ops', '华东', 'active', true, '2026-05-07 22:11', '负责医学审核与上下架。'],
    ['A-003', 'T-PX', '祝景琰', 'zhujy@px.health', 'editor', ['运营 · 内容审核员'], 'ops', '华东', 'active', true, '2026-05-08 09:01', '负责内容合规复核。'],
    ['A-004', 'T-PX', '顾翊辰', 'guyc@px.health', 'editor', ['运营 · 分发执行员'], 'ops', '华南', 'active', true, '2026-05-08 07:55', '操作分发策略与触达。'],
    ['A-005', 'T-PX', '邵书珩', 'shaosh@px.health', 'editor', ['运营 · 分发执行员'], 'ops', '华南', 'active', false, '2026-05-07 19:32', '待开启二步验证。'],
    ['A-006', 'T-PX', '钟锦盛', 'zhongjs@px.health', 'editor', ['运营 · 内容审核员', '运营 · 分发执行员'], 'ops', '华北', 'active', true, '2026-05-08 06:20', '复合角色。'],
    ['A-007', 'T-NV', '林筱', 'linx@novartis.cn', 'viewer', ['药企 · 合规'], 'pharma', '华东', 'active', true, '2026-05-07 16:30', '合规审核员。'],
    ['A-008', 'T-NV', '宋知节', 'songzj@novartis.cn', 'viewer', ['药企 · BD'], 'pharma', '华东', 'active', true, '2026-05-08 09:15', '选题需求提交。'],
    ['A-009', 'T-NV', '崔知白', 'cuizb@novartis.cn', 'viewer', ['药企 · 市场'], 'pharma', '华南', 'active', false, '2026-05-06 11:42', '查看项目效果。'],
    ['A-010', 'T-AZ', '顾承', 'guc@az.cn', 'viewer', ['药企 · 合规'], 'pharma', '全国', 'active', true, '2026-05-07 14:55', '合规审核员。'],
    ['A-011', 'T-AZ', '毕瑾', 'bij@az.cn', 'viewer', ['药企 · BD'], 'pharma', '全国', 'active', true, '2026-05-08 08:30', 'BD 项目提交。'],
    ['A-012', 'T-AZ', '高承翊', 'gaocy@az.cn', 'viewer', ['药企 · 市场'], 'pharma', '全国', 'invited', false, '—', '邀请未激活。'],
    ['A-013', 'T-MSD', '韦珂', 'weik@msd.cn', 'viewer', ['药企 · 合规'], 'pharma', '华东', 'active', true, '2026-05-06 19:20', '合规审核员。'],
    ['A-014', 'T-MSD', '司礼安', 'sila@msd.cn', 'viewer', ['药企 · BD', '药企 · 市场'], 'pharma', '华北', 'active', true, '2026-05-07 17:48', '复合药企角色。'],
    ['A-015', 'T-RC', '贺珏', 'hej@roche.cn', 'viewer', ['药企 · 合规'], 'pharma', '华东', 'frozen', true, '2026-04-25 17:45', '租户停用后冻结。'],
    ['A-016', 'T-RC', '明微', 'mingw@roche.cn', 'viewer', ['药企 · BD'], 'pharma', '华东', 'frozen', false, '2026-04-25 17:42', '租户停用后冻结。'],
    ['A-017', 'T-LL', '禾未', 'hew@lilly.cn', 'viewer', ['药企 · 合规'], 'pharma', '华东', 'active', true, '2026-05-08 09:10', '合规审核员。'],
    ['A-018', 'T-LL', '言归', 'yang@lilly.cn', 'viewer', ['药企 · BD'], 'pharma', '华南', 'active', true, '2026-05-07 21:33', 'BD 项目提交。'],
  ];

  for (const account of accounts) {
    const [id, tenantId, name, email, role, roleLabels, viewType, region, status, has2fa, lastLogin, note] = account;
    await run(`
      INSERT INTO users (id, tenant_id, name, email, role, role_labels, view_type, region, status, has_2fa, last_login, note, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?${jsonCast}, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(email) DO UPDATE SET
        id = excluded.id,
        tenant_id = excluded.tenant_id,
        name = excluded.name,
        role = excluded.role,
        role_labels = excluded.role_labels,
        view_type = excluded.view_type,
        region = excluded.region,
        status = excluded.status,
        has_2fa = excluded.has_2fa,
        last_login = excluded.last_login,
        note = excluded.note,
        updated_at = excluded.updated_at
    `, [id, tenantId, name, email, role, json(roleLabels), viewType, region, status, boolValue(Boolean(has2fa)), lastLogin, note, '2025-09-01 09:00', now]);
  }

  const logs = [
    ['log-001', 'T-PX', 'A-001', '张明', 'publish_content', 'content', 'CNT-101', '张明 发布了内容 《心衰患者每日体重监测的 5 个细节》', '2026-04-28 09:32'],
    ['log-002', 'T-PX', 'A-002', '李雨晴', 'update_content', 'content', 'CNT-114', '李雨晴 更新了内容 《胰岛素笔注射 7 步法》', '2026-04-27 17:46'],
    ['log-003', 'T-PX', 'A-003', '王健', 'archive_content', 'content', 'CNT-102', '王健 下架了内容 《沙库巴曲缬沙坦该饭前还是饭后吃？》', '2026-04-26 11:12'],
    ['log-004', 'T-PX', 'A-001', '张明', 'invite_member', 'user', 'm-4', '张明 邀请成员加入 陈思雨 (查看者)', '2026-04-25 15:08'],
    ['log-005', 'T-PX', null, '系统', 'export_report', 'behavior_export', 'export-001', '系统 导出报告 近 7 天行为汇总.csv', '2026-04-24 10:01'],
  ];

  for (const logRow of logs) {
    await run(`
      INSERT INTO audit_logs (id, tenant_id, actor_user_id, actor_name, action, resource_type, resource_id, description, metadata, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?${jsonCast}, ?)
      ON CONFLICT(id) DO UPDATE SET
        tenant_id = excluded.tenant_id,
        actor_user_id = excluded.actor_user_id,
        actor_name = excluded.actor_name,
        action = excluded.action,
        resource_type = excluded.resource_type,
        resource_id = excluded.resource_id,
        description = excluded.description,
        metadata = excluded.metadata,
        created_at = excluded.created_at
    `, [...logRow.slice(0, 8), json({ seed: true }), logRow[8]]);
  }

  const settings: Record<string, unknown> = {
    siteName: 'Px Lite · 药企患教内容运营与行为洞察平台',
    version: 'V1.0 · LOCAL',
    region: '中国',
    database: DB_DRIVER,
    behaviorAvgReadDuration: behaviorSummary.avgReadDuration,
    features: {
      contentWorkshop: true,
      behaviorInsights: true,
      distributionStrategy: true,
      approvalCenter: true,
    },
  };

  for (const [key, val] of Object.entries(settings)) {
    await run('INSERT INTO platform_settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value', [
      key,
      typeof val === 'string' ? val : JSON.stringify(val),
    ]);
  }

  await run(`
    INSERT INTO team_settings (id, tenant_id, site_name, default_region, feature_flags, created_at, updated_at)
    VALUES ('team-T-PX', 'T-PX', 'Px Lite · 药企患教内容运营与行为洞察平台', '华东区域', ?${jsonCast}, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      site_name = excluded.site_name,
      default_region = excluded.default_region,
      feature_flags = excluded.feature_flags,
      updated_at = excluded.updated_at
  `, [json({ contentWorkshop: true, behaviorInsights: true, distributionStrategy: true, approvalCenter: true }), now, now]);
}

export async function seedDatabase(): Promise<void> {
  await initializeSchema();
  await runMigrations();
  if (process.env.NODE_ENV === 'production' && process.env.RUN_DEMO_SEED !== 'true') {
    logger.info({ driver: DB_DRIVER }, 'Production mode: schema initialized; demo seed data skipped.');
    return;
  }
  const now = new Date().toISOString();

  logger.info({ driver: DB_DRIVER, demoResetEnabled }, 'Seeding fake demo data...');
  await seedTenants(now);
  await seedOverviewContentAndBehavior(now);
  await seedDistributionProjects(now);
  await seedStrategies(now);
  await seedApproval(now);
  await seedAccountsAndLogs(now);

  const counts = await dbAll<{ name: string; cnt: number | string }>(`
    SELECT 'projects' as name, COUNT(*) as cnt FROM projects
    UNION ALL SELECT 'content', COUNT(*) FROM content
    UNION ALL SELECT 'distribution_projects', COUNT(*) FROM distribution_projects
    UNION ALL SELECT 'users', COUNT(*) FROM users
  `);
  const summary = Object.fromEntries(counts.map((row) => [row.name, Number(row.cnt)]));
  const seeded = await dbGet<{ cnt: number | string }>('SELECT COUNT(*) as cnt FROM tenants');
  logger.info({ driver: DB_DRIVER, tenants: Number(seeded?.cnt ?? 0), ...summary }, 'Fake demo data seeded successfully');
}
