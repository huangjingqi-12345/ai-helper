import { dbAll, dbGet, DB_DRIVER } from '../db/connection.js';
import type { DataQaContext, MetricPoint, PrefetchMetrics, PrefetchMetricsParams, ProjectMetric, TopContentMetric } from './types.js';

type AnyRow = Record<string, unknown>;

function num(value: unknown): number {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function str(value: unknown): string {
  return String(value ?? '').trim();
}

function safeDiv(a: number, b: number): number {
  return b ? a / b : 0;
}

function pctDelta(current: number, prior: number): number {
  if (!prior) return current ? 100 : 0;
  return ((current - prior) / prior) * 100;
}

function monthKey(date: string): string {
  return date.slice(0, 7) || '';
}

function cleanDate(value: unknown): string {
  const raw = str(value).slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : '';
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function cleanId(value: unknown): string {
  return str(value).replace(/[^\w:.-]+/g, '').slice(0, 120);
}

function metricFilters(params: PrefetchMetricsParams = {}, alias = 'b'): { where: string; values: unknown[] } {
  const clauses: string[] = [];
  const values: unknown[] = [];
  const prefix = alias ? `${alias}.` : '';
  const start = cleanDate(params.dateRange?.start);
  const requestedEnd = cleanDate(params.dateRange?.end);
  const today = todayIso();
  // 未来日期通常来自测试/误导入数据。默认指标和显式范围都不应让未来日期成为
  // “最新日期”锚点，否则 /ppt、/ppt-svg 的 last_1_year 会被带到 2099 等异常窗口。
  const end = requestedEnd && requestedEnd < today ? requestedEnd : today;
  const projectId = cleanId(params.projectId);
  const contentId = cleanId(params.contentId);
  const diseaseId = cleanId(params.diseaseId);
  const tenantId = cleanId(params.tenantId);
  if (start) {
    clauses.push(`${prefix}metric_date >= ?`);
    values.push(start);
  }
  clauses.push(`${prefix}metric_date <= ?`);
  values.push(end);
  if (projectId) {
    clauses.push(`${prefix}project_id = ?`);
    values.push(projectId);
  }
  if (contentId) {
    clauses.push(`${prefix}content_id = ?`);
    values.push(contentId);
  }
  if (diseaseId) {
    clauses.push(`${prefix}disease_id = ?`);
    values.push(diseaseId);
  }
  if (tenantId) {
    clauses.push(`${prefix}tenant_id = ?`);
    values.push(tenantId);
  }
  return { where: clauses.length ? ` AND ${clauses.join(' AND ')}` : '', values };
}

function aggregatePoints(rows: AnyRow[]): MetricPoint[] {
  const byDate = new Map<string, MetricPoint & { finishWeight: number; readSecWeight: number }>();
  for (const row of rows) {
    const date = str(row.metric_date || row.date).slice(0, 10);
    if (!date) continue;
    const current = byDate.get(date) || {
      date,
      pushCount: 0,
      deliveredCount: 0,
      readUsers: 0,
      readCount: 0,
      interactionCount: 0,
      likeCount: 0,
      bookmarkCount: 0,
      shareCount: 0,
      finishRate: 0,
      avgReadSec: 0,
      finishWeight: 0,
      readSecWeight: 0,
    };
    const readCount = num(row.read_count);
    current.pushCount += num(row.push_count);
    current.deliveredCount += num(row.delivered_count);
    current.readUsers += num(row.read_users);
    current.readCount += readCount;
    current.interactionCount += num(row.interaction_count);
    current.likeCount += num(row.like_count);
    current.bookmarkCount += num(row.bookmark_count);
    current.shareCount += num(row.share_count);
    current.finishRate += num(row.finish_rate) * readCount;
    current.avgReadSec += num(row.avg_read_sec) * readCount;
    current.finishWeight += readCount;
    current.readSecWeight += readCount;
    byDate.set(date, current);
  }
  return [...byDate.values()]
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((p) => ({
      date: p.date,
      pushCount: p.pushCount,
      deliveredCount: p.deliveredCount,
      readUsers: p.readUsers,
      readCount: p.readCount,
      interactionCount: p.interactionCount,
      likeCount: p.likeCount,
      bookmarkCount: p.bookmarkCount,
      shareCount: p.shareCount,
      finishRate: safeDiv(p.finishRate, p.finishWeight),
      avgReadSec: safeDiv(p.avgReadSec, p.readSecWeight),
    }));
}

async function readDailyRows(params: PrefetchMetricsParams = {}): Promise<AnyRow[]> {
  const filter = metricFilters(params, '');
  return dbAll<AnyRow>(
    `SELECT metric_date, push_count, delivered_count, read_users, read_count,
            like_count, bookmark_count, share_count, interaction_count,
            avg_read_sec, finish_rate, content_id, project_id, disease_id
       FROM behavior_daily_metrics
      WHERE 1 = 1${filter.where}
      ORDER BY metric_date ASC`,
    filter.values,
  );
}

async function readInventoryStats(params: PrefetchMetricsParams = {}): Promise<{ projectCount: number; contentCount: number; publishedCount: number }> {
  const tenantId = cleanId(params.tenantId);
  const projectWhere = tenantId ? ' WHERE tenant_id = ?' : '';
  const contentWhere = tenantId ? ' WHERE tenant_id = ?' : '';
  const publishedWhere = tenantId ? " WHERE status = 'published' AND tenant_id = ?" : " WHERE status = 'published'";
  const values = tenantId ? [tenantId, tenantId, tenantId] : [];
  const row = await dbGet<AnyRow>(
    `SELECT
       (SELECT COUNT(*) FROM projects${projectWhere}) AS project_count,
       (SELECT COUNT(*) FROM content${contentWhere}) AS content_count,
       (SELECT COUNT(*) FROM content${publishedWhere}) AS published_count`,
    values,
  );
  return {
    projectCount: num(row?.project_count),
    contentCount: num(row?.content_count),
    publishedCount: num(row?.published_count),
  };
}

async function readTopContent(params: PrefetchMetricsParams = {}): Promise<TopContentMetric[]> {
  const filter = metricFilters(params, 'b');
  const limit = Math.max(1, Math.min(Number(params.limit || 20), 50));
  const rows = await dbAll<AnyRow>(
    `SELECT
        b.content_id AS id,
        COALESCE(c.title, b.content_id, '未命名内容') AS title,
        c.project_id,
        p.name AS project_name,
        c.type,
        c.status,
        SUM(COALESCE(b.read_count, 0)) AS read_count,
        SUM(COALESCE(b.read_users, 0)) AS read_users,
        SUM(COALESCE(b.interaction_count, 0)) AS interaction_count,
        SUM(COALESCE(b.push_count, 0)) AS push_count,
        CASE WHEN SUM(COALESCE(b.read_count, 0)) > 0
             THEN SUM(COALESCE(b.finish_rate, 0) * COALESCE(b.read_count, 0)) / SUM(COALESCE(b.read_count, 0))
             ELSE 0 END AS finish_rate
      FROM behavior_daily_metrics b
       LEFT JOIN content c ON c.id = b.content_id
       LEFT JOIN projects p ON p.id = COALESCE(b.project_id, c.project_id)
      WHERE b.content_id IS NOT NULL AND b.content_id <> ''${filter.where}
      GROUP BY b.content_id, c.title, c.project_id, p.name, c.type, c.status
      HAVING SUM(COALESCE(b.read_count, 0)) > 0
          OR SUM(COALESCE(b.interaction_count, 0)) > 0
          OR SUM(COALESCE(b.push_count, 0)) > 0
      ORDER BY read_count DESC, interaction_count DESC, push_count DESC
      LIMIT ${limit}`,
    filter.values,
  );
  return rows.map((r) => ({
    id: str(r.id),
    title: str(r.title) || '未命名内容',
    projectId: str(r.project_id),
    projectName: str(r.project_name),
    type: str(r.type),
    status: str(r.status),
    readCount: num(r.read_count),
    readUsers: num(r.read_users),
    interactionCount: num(r.interaction_count),
    pushCount: num(r.push_count),
    finishRate: num(r.finish_rate),
  }));
}

async function readProjects(params: PrefetchMetricsParams = {}): Promise<ProjectMetric[]> {
  const filter = metricFilters(params, '');
  const tenantId = cleanId(params.tenantId);
  const projectWhere = tenantId ? 'WHERE p.tenant_id = ?' : '';
  const contentWhere = tenantId ? ' AND tenant_id = ?' : '';
  const values = [
    ...(tenantId ? [tenantId] : []),
    ...filter.values,
    ...(tenantId ? [tenantId] : []),
  ];
  const rows = await dbAll<AnyRow>(
    `SELECT
        p.id,
        COALESCE(p.name, p.title, p.id) AS name,
        p.disease,
        p.status,
        COALESCE(c.content_count, 0) AS content_count,
        COALESCE(c.published_count, 0) AS published_count,
        COALESCE(m.push_count, 0) AS push_count,
        COALESCE(m.read_users, 0) AS read_users,
        COALESCE(m.read_count, 0) AS read_count,
        COALESCE(m.interaction_count, 0) AS interaction_count
       FROM projects p
       LEFT JOIN (
         SELECT project_id,
                COUNT(*) AS content_count,
                SUM(CASE WHEN status = 'published' THEN 1 ELSE 0 END) AS published_count
           FROM content
          WHERE project_id IS NOT NULL AND project_id <> ''${contentWhere}
          GROUP BY project_id
       ) c ON c.project_id = p.id
       LEFT JOIN (
         SELECT project_id,
                SUM(COALESCE(push_count, 0)) AS push_count,
                SUM(COALESCE(read_users, 0)) AS read_users,
                SUM(COALESCE(read_count, 0)) AS read_count,
                SUM(COALESCE(interaction_count, 0)) AS interaction_count
           FROM behavior_daily_metrics
          WHERE project_id IS NOT NULL AND project_id <> ''${filter.where}
          GROUP BY project_id
       ) m ON m.project_id = p.id
      ${projectWhere}
      ORDER BY read_count DESC, interaction_count DESC, content_count DESC
      LIMIT 30`,
    values,
  );
  return rows.map((r) => ({
    id: str(r.id),
    name: str(r.name) || '未命名项目',
    disease: str(r.disease),
    status: str(r.status),
    contentCount: num(r.content_count),
    publishedCount: num(r.published_count),
    pushCount: num(r.push_count),
    readUsers: num(r.read_users),
    readCount: num(r.read_count),
    interactionCount: num(r.interaction_count),
  }));
}

async function readDiseaseBreakdown(params: PrefetchMetricsParams = {}): Promise<Array<{ name: string; reads: number; interactions: number; pushCount: number }>> {
  const filter = metricFilters(params, 'b');
  const rows = await dbAll<AnyRow>(
    `SELECT COALESCE(d.name, b.disease_id, '未分组') AS name,
            SUM(COALESCE(b.read_count, 0)) AS reads,
            SUM(COALESCE(b.interaction_count, 0)) AS interactions,
            SUM(COALESCE(b.push_count, 0)) AS push_count
       FROM behavior_daily_metrics b
       LEFT JOIN diseases d ON d.id = b.disease_id
      WHERE 1 = 1${filter.where}
      GROUP BY COALESCE(d.name, b.disease_id, '未分组')
      HAVING SUM(COALESCE(b.read_count, 0)) > 0
          OR SUM(COALESCE(b.interaction_count, 0)) > 0
          OR SUM(COALESCE(b.push_count, 0)) > 0
      ORDER BY reads DESC, interactions DESC, push_count DESC
      LIMIT 10`,
    filter.values,
  );
  return rows.map((r) => ({ name: str(r.name), reads: num(r.reads), interactions: num(r.interactions), pushCount: num(r.push_count) }));
}

function buildInsights(metrics: Omit<PrefetchMetrics, 'insights'>): string[] {
  const insights: string[] = [];
  const k = metrics.coreKpi;
  if (!k.readCount && !k.pushCount && !k.interactionCount) {
    insights.push('当前周期暂无可分析的行为指标记录，请确认业务数据是否已完成同步');
    return insights;
  }
  if (metrics.monthDelta.readCountPct >= 10) insights.push(`最新月阅读量环比提升 ${metrics.monthDelta.readCountPct.toFixed(1)}%，内容触达效率改善`);
  if (metrics.monthDelta.readCountPct <= -10) insights.push(`最新月阅读量环比下降 ${Math.abs(metrics.monthDelta.readCountPct).toFixed(1)}%，需复盘渠道与内容节奏`);
  if (k.finishRate && k.finishRate < 0.45) insights.push(`整体完成率 ${(k.finishRate * 100).toFixed(1)}% 偏低，建议压缩长内容并强化首屏结论`);
  if (safeDiv(k.interactionCount, k.readCount) < 0.04) insights.push('互动/阅读比偏低，建议增加收藏、问答、随访提醒等明确 CTA');
  const top = metrics.topContent[0];
  if (top) insights.push(`高表现内容集中在「${top.title}」，可沉淀为后续选题模板`);
  if (!insights.length) insights.push('整体指标较平稳，可继续扩大高表现项目分发并观察医生端承接质量');
  return insights.slice(0, 5);
}

export async function prefetchMetrics(params: PrefetchMetricsParams = {}): Promise<PrefetchMetrics> {
  const [dailyRows, inventory, topContent, projects, diseases] = await Promise.all([
    readDailyRows(params),
    readInventoryStats(params),
    readTopContent(params),
    readProjects(params),
    readDiseaseBreakdown(params),
  ]);

  const dailyTrend = aggregatePoints(dailyRows);

  const totals = dailyTrend.reduce(
    (acc, p) => {
      acc.pushCount += p.pushCount;
      acc.deliveredCount += p.deliveredCount;
      acc.readUsers += p.readUsers;
      acc.readCount += p.readCount;
      acc.interactionCount += p.interactionCount;
      acc.finishWeighted += p.finishRate * p.readCount;
      acc.readSecWeighted += p.avgReadSec * p.readCount;
      return acc;
    },
    { pushCount: 0, deliveredCount: 0, readUsers: 0, readCount: 0, interactionCount: 0, finishWeighted: 0, readSecWeighted: 0 },
  );

  const byMonth = new Map<string, { month: string; readCount: number; interactionCount: number; pushCount: number; readUsers: number; finishWeighted: number }>();
  for (const p of dailyTrend) {
    const key = monthKey(p.date);
    if (!key) continue;
    const cur = byMonth.get(key) || { month: key, readCount: 0, interactionCount: 0, pushCount: 0, readUsers: 0, finishWeighted: 0 };
    cur.readCount += p.readCount;
    cur.interactionCount += p.interactionCount;
    cur.pushCount += p.pushCount;
    cur.readUsers += p.readUsers;
    cur.finishWeighted += p.finishRate * p.readCount;
    byMonth.set(key, cur);
  }
  const monthAgg = [...byMonth.values()].sort((a, b) => a.month.localeCompare(b.month));
  const monthlyTrend = monthAgg.map((m) => ({ month: m.month, readCount: m.readCount, interactionCount: m.interactionCount, pushCount: m.pushCount, readUsers: m.readUsers }));
  const latestRaw = monthAgg.at(-1) || { month: '', readCount: 0, interactionCount: 0, pushCount: 0, readUsers: 0, finishWeighted: 0 };
  const priorRaw = monthAgg.at(-2);
  const latestMonth = {
    key: latestRaw.month,
    pushCount: latestRaw.pushCount,
    readCount: latestRaw.readCount,
    interactionCount: latestRaw.interactionCount,
    readUsers: latestRaw.readUsers,
    finishRate: safeDiv(latestRaw.finishWeighted, latestRaw.readCount),
  };
  const priorMonth = priorRaw
    ? {
        key: priorRaw.month,
        pushCount: priorRaw.pushCount,
        readCount: priorRaw.readCount,
        interactionCount: priorRaw.interactionCount,
        readUsers: priorRaw.readUsers,
        finishRate: safeDiv(priorRaw.finishWeighted, priorRaw.readCount),
      }
    : undefined;

  const trendLimit = Math.max(1, Math.min(800, Number(params.limit || (params.dateRange ? 400 : 120))));

  const partial: Omit<PrefetchMetrics, 'insights'> = {
    source: 'PX 指标数据',
    generatedAt: new Date().toISOString(),
    range: {
      start: dailyTrend[0]?.date || '',
      end: dailyTrend.at(-1)?.date || '',
      days: dailyTrend.length,
    },
    coreKpi: {
      projectCount: inventory.projectCount,
      contentCount: inventory.contentCount,
      publishedCount: inventory.publishedCount,
      pushCount: totals.pushCount,
      deliveredCount: totals.deliveredCount,
      readUsers: totals.readUsers,
      readCount: totals.readCount,
      interactionCount: totals.interactionCount,
      finishRate: safeDiv(totals.finishWeighted, totals.readCount),
      avgReadSec: safeDiv(totals.readSecWeighted, totals.readCount),
      activeDays: dailyTrend.filter((p) => p.readCount || p.pushCount || p.interactionCount).length,
    },
    latestMonth,
    priorMonth,
    monthDelta: {
      readCountPct: pctDelta(latestMonth.readCount, priorMonth?.readCount || 0),
      interactionCountPct: pctDelta(latestMonth.interactionCount, priorMonth?.interactionCount || 0),
      pushCountPct: pctDelta(latestMonth.pushCount, priorMonth?.pushCount || 0),
    },
    dailyTrend: dailyTrend.slice(-trendLimit),
    monthlyTrend,
    topContent,
    projects,
    diseases,
  };
  return { ...partial, insights: buildInsights(partial) };
}

export async function prefetchDataQaContext(params: PrefetchMetricsParams = {}): Promise<DataQaContext> {
  const tenantId = cleanId(params.tenantId);
  const tableNames = [
    'projects',
    'content',
    'behavior_daily_metrics',
    'distribution_projects',
    'distribution_strategies',
    'tenants',
    'users',
  ];

  const countRows = await Promise.all(
    tableNames.map(async (table) => {
      try {
        const tenantTables = new Set(['projects', 'content', 'behavior_daily_metrics', 'distribution_projects', 'distribution_strategies', 'users']);
        const where = tenantId
          ? table === 'tenants'
            ? ' WHERE id = ?'
            : tenantTables.has(table)
              ? ' WHERE tenant_id = ?'
              : ''
          : '';
        const values = where ? [tenantId] : [];
        const row = await dbGet<{ cnt: number | string }>(`SELECT COUNT(*) AS cnt FROM ${table}${where}`, values);
        return [table, num(row?.cnt)] as const;
      } catch {
        return [table, 0] as const;
      }
    }),
  );

  let behavior = {
    rows: 0,
    minDate: '',
    maxDate: '',
    distinctContent: 0,
    distinctProjects: 0,
  };
  try {
    const filter = metricFilters(params, '');
    const row = await dbGet<AnyRow>(
      `SELECT COUNT(*) AS row_count,
              MIN(metric_date) AS min_date,
              MAX(metric_date) AS max_date,
              COUNT(DISTINCT content_id) AS distinct_content,
              COUNT(DISTINCT project_id) AS distinct_projects
         FROM behavior_daily_metrics
        WHERE 1 = 1${filter.where}`,
      filter.values,
    );
    behavior = {
      rows: num(row?.row_count),
      minDate: str(row?.min_date).slice(0, 10),
      maxDate: str(row?.max_date).slice(0, 10),
      distinctContent: num(row?.distinct_content),
      distinctProjects: num(row?.distinct_projects),
    };
  } catch {
    // Keep empty diagnostics when the table is not available.
  }

  return {
    dbDriver: DB_DRIVER,
    generatedAt: new Date().toISOString(),
    tableCounts: Object.fromEntries(countRows),
    behaviorDailyMetrics: behavior,
    metricDefinitions: {
      source: '所有问答只基于后端指标数据与固定指标口径说明。',
      pushCount: '推送次数按统计窗口汇总。',
      deliveredCount: '送达次数按统计窗口汇总。',
      readUsers: '阅读人数按统计窗口聚合；具体去重口径取决于上游统计方式。',
      readCount: '阅读次数按统计窗口汇总。',
      interactionCount: '互动次数按统计窗口汇总，包含点赞、收藏、分享等互动动作。',
      finishRate: '完读率按阅读次数加权平均。',
      avgReadSec: '平均阅读时长按阅读次数加权平均。',
      topContent: '内容表现按统计窗口汇总后，结合内容标题、状态、项目等维度展示。',
      projectContribution: '项目贡献按统计窗口汇总后，结合项目名称等维度展示。',
      emptyBehavior: '如果当前周期无行为指标记录，则核心 KPI、TOP 内容、趋势与项目行为贡献都应为空或 0。',
    },
  };
}
