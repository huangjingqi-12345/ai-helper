import fs from 'fs';
import path from 'path';
import { AIService, AIServiceError, type ChatMessage, type ContentBlock } from './aiService.js';
import { createRunDirectory, GENERATED_DIR, toAssetPath } from './paths.js';
import { prefetchMetrics } from './metrics.js';
import { MODEL_IO_LOG_PATH, RUNTIME_LOG_PATH, modelIoLog, runtimeLog } from './runtimeLogger.js';
import type { AiDataScope, AiShortcut, PrefetchMetrics, PrefetchMetricsParams, RunRequest, StreamEvent } from './types.js';
import { SHORTCUT_PROMPTS, SYSTEM_PROMPT } from './promptTemplates.js';
import { SkillRegistry } from './skillRegistry.js';
import { SkillExecutor, type SkillCall, type SkillResult } from './skillExecutor.js';
import { scheduleBackgroundJob, type BackgroundJob } from './backgroundJobs.js';

export { SHORTCUT_PROMPTS, SYSTEM_PROMPT } from './promptTemplates.js';

interface AgentDonePayload {
  text: string;
  files: string[];
  skills_used: string[];
  trace: Array<{ step: number | string; call?: SkillCall; result?: SkillResult }>;
  background_jobs?: BackgroundJob[];
}

function eventLine(type: string, data: unknown): string {
  return JSON.stringify({ type, data } satisfies StreamEvent) + '\n';
}

function requestLog(req: RunRequest): Record<string, unknown> {
  return { conversation_id: req.conversation_id, run_id: req.run_id, message: req.message, command: req.command, shortcut: req.shortcut, data_scope: req.data_scope };
}

/**
 * 将系统消息的 content 包装为带 cache_control 的 ContentBlock[] 格式。
 * 阿里云百炼 Explicit Cache：在需要缓存的内容块上标记 cache_control: {type:"ephemeral"}，
 * 后续相同前缀的请求会命中缓存，减少 prompt token 费用。
 * 策略：system prompt + actionSpec + primary_data_context 作为稳定前缀，在最后一个稳定块上打标记。
 */
function withCacheControl(content: string): ContentBlock[] {
  return [{ type: 'text', text: content, cache_control: { type: 'ephemeral' } }];
}

function modelErrorLog(err: unknown): unknown {
  if (err instanceof AIServiceError) {
    return {
      name: err.name,
      message: err.message,
      stack: err.stack,
      status: err.status,
      detail: err.detail,
      request: err.request,
      raw_response: err.rawResponse,
    };
  }
  return err;
}

function isRecoverableEmptyModelContent(err: unknown): boolean {
  return err instanceof AIServiceError && err.message.startsWith('模型返回为空');
}

function isModelTimeoutError(err: unknown): boolean {
  return err instanceof AIServiceError && err.message.startsWith('模型调用超时');
}

function buildModelErrorObservation(text: string): string {
  const lines = [
    'MODEL_OBSERVATION:',
    text,
    '上一轮模型没有在 content 中返回可执行 JSON。请基于当前上下文重新输出一个 JSON 对象；type 只能是 skill_call 或 final，不要输出解释文字。',
  ];
  if (text.includes('模型调用超时')) {
    lines.push(
      '重要：上一轮可能因为一次生成内容过大而超时。请缩小下一步输出：如果要写 PPT SVG，每次最多写 1 页；不要重复写已成功生成的文件；继续从缺失的下一页开始，必要时分多步完成。',
    );
  }
  return lines.join('\n');
}

function buildModelTimeoutRetryObservation(text: string): string {
  return [
    'MODEL_OBSERVATION:',
    text,
    '上一轮模型在单次响应时间内没有返回内容，后端将自动重试。',
    '请缩小本次输出：如果要写 PPT SVG，每次最多写 1 页；不要重复写已成功生成的文件；如果发现文件已生成但位置不对，请移动/复用已有文件，不要重新生成。',
    '请只输出一个 JSON 对象；type 只能是 skill_call 或 final，不要输出解释文字。',
  ].join('\n');
}

function isSkillCall(obj: unknown): obj is SkillCall {
  const value = obj && typeof obj === 'object' ? (obj as Record<string, unknown>) : {};
  return value.type === 'skill_call' && typeof value.skill_id === 'string' && typeof value.action === 'string';
}

function textPreview(value: string, maxChars = 260): string {
  const compact = value.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  return compact.length > maxChars ? `${compact.slice(0, maxChars)}…` : compact;
}

function extractSvgSummary(content: string): Record<string, unknown> {
  const root = content.match(/<svg\b[^>]*>/i)?.[0] || '';
  const attr = (name: string) => root.match(new RegExp(`${name}=["']([^"']+)["']`, 'i'))?.[1] || '';
  const colors = [...new Set((content.match(/#[0-9a-fA-F]{3,8}\b/g) || []).map((x) => x.toUpperCase()))].slice(0, 10);
  const textNodes = [...content.matchAll(/<text\b[^>]*>([\s\S]*?)<\/text>/gi)]
    .map((m) => m[1].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim())
    .filter(Boolean);
  const title = textNodes[0] || content.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.trim() || '';
  const count = (tag: string) => (content.match(new RegExp(`<${tag}\\b`, 'gi')) || []).length;
  return {
    kind: 'svg_summary',
    chars: content.length,
    title,
    canvas: { width: attr('width'), height: attr('height'), viewBox: attr('viewBox') },
    colors,
    text_preview: textPreview(textNodes.slice(0, 18).join(' | '), 520),
    shape_counts: {
      rect: count('rect'),
      path: count('path'),
      circle: count('circle'),
      line: count('line'),
      polyline: count('polyline'),
      polygon: count('polygon'),
      text: count('text'),
      group: count('g'),
    },
  };
}

function summarizeFileContent(pathValue: unknown, content: string): unknown {
  const filePath = typeof pathValue === 'string' ? pathValue : '';
  const ext = filePath.split('.').pop()?.toLowerCase() || '';
  if (ext === 'svg' || /<svg\b/i.test(content)) return { path: filePath, ...extractSvgSummary(content) };
  if (ext === 'json') {
    try {
      const parsed = JSON.parse(content);
      return { path: filePath, kind: 'json_summary', chars: content.length, keys: parsed && typeof parsed === 'object' ? Object.keys(parsed).slice(0, 20) : [], preview: textPreview(content, 320) };
    } catch {
      return { path: filePath, kind: 'json_summary', chars: content.length, preview: textPreview(content, 320) };
    }
  }
  if (ext === 'md' || ext === 'markdown') {
    const headings = [...content.matchAll(/^#{1,3}\s+(.+)$/gm)].map((m) => m[1].trim()).slice(0, 12);
    return { path: filePath, kind: 'markdown_summary', chars: content.length, headings, preview: textPreview(content, 520) };
  }
  return { path: filePath, kind: 'content_summary', chars: content.length, preview: textPreview(content, 320) };
}

function compactParamsForContext(params: Record<string, unknown>): Record<string, unknown> {
  const next = { ...params };
  const ownPath = next.path || next.file_name || next.fileName;
  const content = typeof next.content === 'string' ? next.content : undefined;
  if (content !== undefined) {
    next.content_summary = summarizeFileContent(ownPath, content);
    next.content = `[content omitted from conversation context; chars=${content.length}; see content_summary]`;
  }
  for (const key of ['markdown', 'text']) {
    const value = next[key];
    if (typeof value === 'string' && value.length > 500) {
      next[`${key}_summary`] = summarizeFileContent(ownPath, value);
      next[key] = `[${key} omitted from conversation context; chars=${value.length}; see ${key}_summary]`;
    }
  }
  if (Array.isArray(next.files)) {
    next.files = next.files.map((item) => {
      if (!item || typeof item !== 'object') return item;
      const file = { ...(item as Record<string, unknown>) };
      const fileContent = typeof file.content === 'string' ? file.content : undefined;
      if (fileContent !== undefined) {
        file.content_summary = summarizeFileContent(file.path || file.file_name || file.fileName, fileContent);
        file.content = `[content omitted from conversation context; chars=${fileContent.length}; see content_summary]`;
      }
      return file;
    });
  }
  return next;
}

function compactSkillCallForContext(raw: string): string {
  const parsed = SkillExecutor.parseJsonObject(raw);
  if (!parsed || parsed.type !== 'skill_call') return raw.length > 4000 ? `${raw.slice(0, 4000)}\n...[assistant output truncated for context; chars=${raw.length}]` : raw;
  const params = parsed.params && typeof parsed.params === 'object' ? compactParamsForContext(parsed.params as Record<string, unknown>) : {};

  return JSON.stringify({ ...parsed, params });
}

function asFinal(obj: Record<string, unknown>): { answer: string; deliverable_files: string[] } | undefined {
  if (obj.type !== 'final') return undefined;
  return {
    answer: typeof obj.answer === 'string' ? obj.answer.trim() : '',
    deliverable_files: Array.isArray(obj.deliverable_files) ? obj.deliverable_files.filter((x): x is string => typeof x === 'string') : [],
  };
}

function fileName(file: string): string {
  return file.replace(/\\/g, '/').split('/').pop() || file;
}

function visibleDeliverables(files: string[]): string[] {
  const allowed = new Set(['md', 'svg', 'png', 'pdf', 'ppt', 'pptx', 'html', 'htm']);
  return [...new Set(files)]
    .map((f) => (f.startsWith('generated/') || f.startsWith('projects/') ? `/${f}` : f))
    .filter((f) => f.startsWith('/generated/') || f.startsWith('/projects/'))
    .filter((f) => allowed.has((fileName(f).split('.').pop() || '').toLowerCase()))
    .filter((f) => !/manifest|metrics|qa/i.test(fileName(f)));
}

function resultFiles(result?: SkillResult): string[] {
  if (!result || result.ok === false) return [];
  const out: string[] = [];
  if (Array.isArray(result.files)) out.push(...result.files.filter((x): x is string => typeof x === 'string'));
  if (typeof result.file === 'string') out.push(result.file);
  return out;
}

function collectFiles(trace: AgentDonePayload['trace'], explicit: string[] = []): string[] {
  const out = [...explicit];
  for (const entry of trace) out.push(...resultFiles(entry.result));
  return visibleDeliverables(out);
}

function selectedSkills(trace: AgentDonePayload['trace']): string[] {
  return [...new Set(trace.map((x) => x.call?.skill_id).filter((x): x is string => Boolean(x)))];
}

function missingRequired(trace: AgentDonePayload['trace']): string[] {
  const present = new Set<string>();
  for (const entry of trace) for (const f of resultFiles(entry.result)) present.add(fileName(f));
  const selected = selectedSkills(trace);
  const missing: string[] = [];
  const requireFor = (skill: string, files: string[]) => {
    if (!selected.includes(skill)) return;
    for (const f of files) if (!present.has(f)) missing.push(f);
  };
  requireFor('patient-education-data-overview', ['overview_report.md', 'overview_kpi.html', 'overview_kpi.png', 'overview_manifest.json']);
  requireFor('patient-education-monthly-report', ['monthly_report.md', 'monthly_report.pdf']);
  if (selected.includes('ppt-master')) {
    const exportRequested = trace.some((x) => x.call?.skill_id === 'ppt-master' && x.call.action === 'ppt_master_export' && x.result?.ok !== false);
    if (!exportRequested) missing.push('ppt_master_export_or_background_job');
  }
  return [...new Set(missing)];
}

function buildFinalRejection(missing: string[]): string {
  return `FINAL_REJECTED_INCOMPLETE_DELIVERABLES:\n本轮任务尚未完成，缺少必交文件: ${missing.join(', ')}。\n请继续 skill_call 补齐，不要再次 final。交付文件必须真实生成成功后才能 final；PPTX 可由 ppt-master 导出任务继续生成。`;
}

type DateRange = { start: string; end: string };

interface PrimaryDataScope {
  shortcut?: AiShortcut;
  data_scope?: AiDataScope;
  label: string;
  intended_use: string;
  granularity: NonNullable<PrefetchMetricsParams['granularity']>;
  dateRange?: DateRange;
  compareRange?: DateRange;
  params: PrefetchMetricsParams;
}

function asShortcut(value: unknown): AiShortcut | undefined {
  return value === 'overview' || value === 'monthly' || value === 'ppt' || value === 'ppt_svg' ? value : undefined;
}

function isPptShortcut(shortcut?: AiShortcut): boolean {
  return shortcut === 'ppt' || shortcut === 'ppt_svg';
}

function asDataScope(value: unknown): AiDataScope | undefined {
  return value === 'last_7_days' || value === 'latest_complete_month' || value === 'last_1_year' ? value : undefined;
}

function defaultDataScope(shortcut?: AiShortcut): AiDataScope | undefined {
  if (shortcut === 'overview') return 'last_7_days';
  if (shortcut === 'monthly') return 'latest_complete_month';
  if (isPptShortcut(shortcut)) return 'last_1_year';
  return undefined;
}

function parseIsoDate(value: string): Date | undefined {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return undefined;
  const [y, m, d] = value.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

function fmtDate(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function addDays(value: Date, days: number): Date {
  const next = new Date(value);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function startOfMonth(value: Date): Date {
  return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), 1));
}

function endOfMonth(value: Date): Date {
  return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth() + 1, 0));
}

function sameDay(a: Date, b: Date): boolean {
  return fmtDate(a) === fmtDate(b);
}

function range(start: Date, end: Date): DateRange {
  return { start: fmtDate(start), end: fmtDate(end) };
}

function resolvePrimaryDataScope(req: RunRequest, latestMetricDate: string): PrimaryDataScope {
  const shortcut = asShortcut(req.shortcut);
  const dataScope = asDataScope(req.data_scope) || defaultDataScope(shortcut);
  const latest = parseIsoDate(latestMetricDate);

  if (!dataScope || !latest) {
    return {
      shortcut,
      data_scope: dataScope,
      label: latest ? '默认全局数据' : '当前数据库暂无可用统计日期',
      intended_use: '作为本轮任务的默认主数据',
      granularity: 'month',
      params: {},
    };
  }

  if (dataScope === 'last_7_days') {
    const dateRange = range(addDays(latest, -6), latest);
    return {
      shortcut,
      data_scope: dataScope,
      label: '最近 7 天',
      intended_use: '生成短周期运营数据概览',
      granularity: 'day',
      dateRange,
      params: { dateRange, granularity: 'day', limit: 14, purpose: '快捷入口默认预取：最近 7 天数据概览' },
    };
  }

  if (dataScope === 'latest_complete_month') {
    const latestMonthEnd = endOfMonth(latest);
    const focusEnd = sameDay(latest, latestMonthEnd) ? latestMonthEnd : addDays(startOfMonth(latest), -1);
    const focusStart = startOfMonth(focusEnd);
    const compareEnd = addDays(focusStart, -1);
    const compareStart = startOfMonth(compareEnd);
    const dateRange = range(focusStart, focusEnd);
    const compareRange = range(compareStart, compareEnd);
    return {
      shortcut,
      data_scope: dataScope,
      label: '最近完整自然月',
      intended_use: '生成月度运营复盘主数据，并提供前一完整自然月用于环比',
      granularity: 'week',
      dateRange,
      compareRange,
      params: { dateRange, compareRange, granularity: 'week', limit: 70, purpose: '快捷入口默认预取：最近完整自然月月报' },
    };
  }

  const dateRange = range(addDays(latest, -364), latest);
  return {
    shortcut,
    data_scope: dataScope,
    label: '最近一年',
    intended_use: '生成管理层患教运营 PPT 的趋势背景与关键结论',
    granularity: 'day',
    dateRange,
    params: { dateRange, granularity: 'day', limit: 400, purpose: '快捷入口默认预取：最近一年 PPT 趋势背景' },
  };
}

function compactMetricsForContext(metrics: PrefetchMetrics): Record<string, unknown> {
  const dailyTrend = metrics.dailyTrend.slice(-90);
  return {
    source: metrics.source,
    generatedAt: metrics.generatedAt,
    range: metrics.range,
    coreKpi: metrics.coreKpi,
    latestMonth: metrics.latestMonth,
    priorMonth: metrics.priorMonth,
    monthDelta: metrics.monthDelta,
    dailyTrend,
    dailyTrend_meta: {
      total_points: metrics.dailyTrend.length,
      included_points: dailyTrend.length,
      included_range: { start: dailyTrend[0]?.date || '', end: dailyTrend.at(-1)?.date || '' },
      note: 'coreKpi/monthlyTrend/topContent/projects are complete SQL aggregates for the requested range; dailyTrend is compacted for model context.',
    },
    monthlyTrend: metrics.monthlyTrend.slice(-12),
    topContent: metrics.topContent.slice(0, 10),
    projects: metrics.projects.slice(0, 10),
    diseases: metrics.diseases.slice(0, 10),
    insights: metrics.insights,
  };
}

function slimContent(items: PrefetchMetrics['topContent'], limit = 8): Array<Record<string, unknown>> {
  return items.slice(0, limit).map((item) => ({
    title: item.title,
    projectName: item.projectName,
    readCount: item.readCount,
    readUsers: item.readUsers,
    interactionCount: item.interactionCount,
    finishRate: item.finishRate,
  }));
}

function slimProjects(items: PrefetchMetrics['projects'], limit = 6): Array<Record<string, unknown>> {
  return items.slice(0, limit).map((item) => ({
    name: item.name,
    disease: item.disease,
    contentCount: item.contentCount,
    pushCount: item.pushCount,
    readUsers: item.readUsers,
    readCount: item.readCount,
    interactionCount: item.interactionCount,
  }));
}

function weeklyTrend(rows: PrefetchMetrics['dailyTrend']): Array<Record<string, unknown>> {
  const buckets = new Map<string, {
    label: string;
    start: string;
    end: string;
    pushCount: number;
    deliveredCount: number;
    readUsers: number;
    readCount: number;
    interactionCount: number;
    finishWeighted: number;
    readSecWeighted: number;
  }>();
  const weekStart = (date: string): string => {
    const d = parseIsoDate(date);
    if (!d) return date;
    d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
    return fmtDate(d);
  };
  for (const row of rows) {
    const start = weekStart(row.date);
    const cur = buckets.get(start) || {
      label: start.slice(5),
      start,
      end: row.date,
      pushCount: 0,
      deliveredCount: 0,
      readUsers: 0,
      readCount: 0,
      interactionCount: 0,
      finishWeighted: 0,
      readSecWeighted: 0,
    };
    cur.end = row.date;
    cur.pushCount += row.pushCount;
    cur.deliveredCount += row.deliveredCount;
    cur.readUsers += row.readUsers;
    cur.readCount += row.readCount;
    cur.interactionCount += row.interactionCount;
    cur.finishWeighted += row.finishRate * row.readCount;
    cur.readSecWeighted += row.avgReadSec * row.readCount;
    buckets.set(start, cur);
  }
  return [...buckets.values()].map((item) => ({
    label: `${item.start.slice(5)}~${item.end.slice(5)}`,
    start: item.start,
    end: item.end,
    pushCount: item.pushCount,
    deliveredCount: item.deliveredCount,
    readUsers: item.readUsers,
    readCount: item.readCount,
    interactionCount: item.interactionCount,
    finishRate: item.readCount ? item.finishWeighted / item.readCount : 0,
    avgReadSec: item.readCount ? item.readSecWeighted / item.readCount : 0,
  }));
}

function metricStoreParts(metrics: PrefetchMetrics): Record<string, unknown> {
  const compact = compactMetricsForContext(metrics);
  return {
    core: {
      source: compact.source,
      generatedAt: compact.generatedAt,
      range: compact.range,
      coreKpi: compact.coreKpi,
      latestMonth: compact.latestMonth,
      priorMonth: compact.priorMonth,
      monthDelta: compact.monthDelta,
      insights: compact.insights,
    },
    trends: {
      range: compact.range,
      dailyTrend: compact.dailyTrend,
      dailyTrend_meta: compact.dailyTrend_meta,
      weeklyTrend: weeklyTrend(metrics.dailyTrend),
      monthlyTrend: compact.monthlyTrend,
    },
    rankings: {
      range: compact.range,
      topContent: compact.topContent,
      projects: compact.projects,
      diseases: compact.diseases,
    },
  };
}

function writeMetricStores(rootDir: string, groups: Array<{ prefix: string; label: string; metrics: PrefetchMetrics }>): Array<Record<string, unknown>> {
  const dir = path.join(rootDir, '_metrics');
  fs.mkdirSync(dir, { recursive: true });
  const stores: Array<Record<string, unknown>> = [];
  for (const group of groups) {
    const parts = metricStoreParts(group.metrics);
    for (const [kind, payload] of Object.entries(parts)) {
      const file = path.join(dir, `${group.prefix}_${kind}.json`);
      fs.writeFileSync(file, JSON.stringify(payload, null, 2), 'utf8');
      stores.push({
        key: `${group.prefix}_${kind}`,
        label: `${group.label} ${kind}`,
        kind,
        path: toAssetPath(file),
        read_with: {
          skill_id: 'px-data',
          action: 'read_metric_file',
          params: { path: toAssetPath(file) },
        },
      });
    }
  }
  return stores;
}

function buildTaskMetrics(shortcut: AiShortcut | undefined, primaryMetrics: PrefetchMetrics, supplemental: Record<string, unknown>): Record<string, unknown> {
  if (shortcut === 'overview') {
    return {
      range: primaryMetrics.range,
      coreKpi: primaryMetrics.coreKpi,
      dailyTrend: primaryMetrics.dailyTrend.slice(-14),
      topContent: slimContent(primaryMetrics.topContent, 8),
      projects: slimProjects(primaryMetrics.projects, 6),
      diseases: primaryMetrics.diseases.slice(0, 6),
      insights: primaryMetrics.insights,
      note: '数据概览默认只注入短周期趋势、核心 KPI、项目/内容排名；更多趋势或完整字段见 available_metric_stores。',
    };
  }

  if (shortcut === 'monthly') {
    const previous = obj(supplemental.previous_period);
    const previousMetrics = obj(previous.metrics) as Partial<PrefetchMetrics>;
    return {
      range: primaryMetrics.range,
      compareRange: previous.dateRange,
      current: {
        coreKpi: primaryMetrics.coreKpi,
        latestMonth: primaryMetrics.latestMonth,
        priorMonth: primaryMetrics.priorMonth,
        monthDelta: primaryMetrics.monthDelta,
        weeklyTrend: weeklyTrend(primaryMetrics.dailyTrend),
        topContent: slimContent(primaryMetrics.topContent, 8),
        projects: slimProjects(primaryMetrics.projects, 6),
        diseases: primaryMetrics.diseases.slice(0, 6),
        insights: primaryMetrics.insights,
      },
      previous: {
        label: previous.label,
        range: previousMetrics.range,
        coreKpi: previousMetrics.coreKpi,
      },
      note: '月报默认只注入写作必需的本月 KPI、上月核心 KPI、环比、周度节奏、项目/内容精简排名；完整日趋势和完整排名见 available_metric_stores。',
    };
  }

  if (isPptShortcut(shortcut)) {
    const recent30 = obj(supplemental.recent_30_days);
    const previous30 = obj(supplemental.previous_30_days);
    return {
      range: primaryMetrics.range,
      coreKpi: primaryMetrics.coreKpi,
      monthlyTrend: primaryMetrics.monthlyTrend.slice(-12),
      topContent: slimContent(primaryMetrics.topContent, 10),
      projects: slimProjects(primaryMetrics.projects, 8),
      diseases: primaryMetrics.diseases.slice(0, 8),
      recent_30_days: {
        range: obj(recent30.metrics).range,
        coreKpi: obj(recent30.metrics).coreKpi,
        insights: obj(recent30.metrics).insights,
      },
      previous_30_days: {
        range: obj(previous30.metrics).range,
        coreKpi: obj(previous30.metrics).coreKpi,
      },
      insights: primaryMetrics.insights,
      note: 'PPT 默认注入年度月趋势、TOP 项目/内容和最近 30 天摘要；完整日趋势和完整排名见 available_metric_stores。',
    };
  }

  return {
    range: primaryMetrics.range,
    coreKpi: primaryMetrics.coreKpi,
    latestMonth: primaryMetrics.latestMonth,
    priorMonth: primaryMetrics.priorMonth,
    monthDelta: primaryMetrics.monthDelta,
    insights: primaryMetrics.insights,
    note: '通用问答默认只注入核心指标；更多趋势或排名见 available_metric_stores，或调用 px-data 获取。',
  };
}

async function buildPrimaryDataContext(req: RunRequest, rootDir: string): Promise<Record<string, unknown>> {
  const defaultMetrics = await prefetchMetrics();
  const scope = resolvePrimaryDataScope(req, defaultMetrics.range.end);
  const primaryMetrics = scope.params.dateRange ? await prefetchMetrics(scope.params) : defaultMetrics;
  const supplemental: Record<string, unknown> = {};
  const storeGroups: Array<{ prefix: string; label: string; metrics: PrefetchMetrics }> = [
    { prefix: 'primary', label: '主数据', metrics: primaryMetrics },
  ];

  if (scope.data_scope === 'latest_complete_month' && scope.compareRange) {
    const previousMetrics = await prefetchMetrics({
      dateRange: scope.compareRange,
      granularity: 'week',
      limit: 40,
      purpose: '月报环比对比',
    });
    supplemental.previous_period = {
      label: '前一个完整自然月',
      dateRange: scope.compareRange,
      metrics: compactMetricsForContext(previousMetrics),
    };
    storeGroups.push({ prefix: 'previous_period', label: '前一个完整自然月', metrics: previousMetrics });
  }

  const latest = parseIsoDate(defaultMetrics.range.end);
  if (scope.data_scope === 'last_1_year' && latest) {
    const recent30 = range(addDays(latest, -29), latest);
    const previous30 = range(addDays(latest, -59), addDays(latest, -30));
    const recent30Metrics = await prefetchMetrics({
      dateRange: recent30,
      granularity: 'day',
      limit: 40,
      purpose: 'PPT 核心结论最近 30 天数据',
    });
    const previous30Metrics = await prefetchMetrics({
      dateRange: previous30,
      granularity: 'day',
      limit: 40,
      purpose: 'PPT 核心结论前 30 天对比数据',
    });
    supplemental.recent_30_days = {
      label: '最近 30 天',
      dateRange: recent30,
      metrics: compactMetricsForContext(recent30Metrics),
    };
    supplemental.previous_30_days = {
      label: '前 30 天',
      dateRange: previous30,
      metrics: compactMetricsForContext(previous30Metrics),
    };
    storeGroups.push({ prefix: 'recent_30_days', label: '最近 30 天', metrics: recent30Metrics });
    storeGroups.push({ prefix: 'previous_30_days', label: '前 30 天', metrics: previous30Metrics });
  }

  const stores = writeMetricStores(rootDir, storeGroups);
  const shortcut = asShortcut(req.shortcut);
  return {
    scope: {
      shortcut: scope.shortcut,
      data_scope: scope.data_scope,
      label: scope.label,
      intended_use: scope.intended_use,
      dateRange: scope.dateRange,
      compareRange: scope.compareRange,
      granularity: scope.granularity,
    },
    primary_metrics: buildTaskMetrics(shortcut, primaryMetrics, supplemental),
    available_metric_stores: stores,
    fallback_default_metrics_range: defaultMetrics.range,
    usage_note: '优先使用 primary_metrics（已按任务类型精简）。如需要完整日趋势、完整排名或补充周期数据，请按 available_metric_stores 中的 read_with 调用 px-data.read_metric_file；如需要不同筛选范围，再调用 px-data.prefetch_metrics。',
  };
}

async function buildMessages(req: RunRequest, rootDir: string, registry: SkillRegistry, executor: SkillExecutor): Promise<{ messages: ChatMessage[]; initialSkills: string[]; primaryDataContext: Record<string, unknown> }> {
  const userText = (req.message || req.command || '').trim() || '请根据我的需求完成分析并交付。';
  const primaryDataContext = await buildPrimaryDataContext(req, rootDir);
  const catalog = registry.buildPromptContext();
  const primaryDataStr = `primary_data_context（本轮快捷入口默认主数据；可按需调用 px-data 补取）：\n${JSON.stringify(primaryDataContext, null, 2)}`;

  // 缓存分两层前缀：
  //  breakpoint 1 → SYSTEM_PROMPT（跨 run 稳定）
  //  breakpoint 2 → primary_data_context（同 run 内稳定，体积最大）
  const messages: ChatMessage[] = [
    { role: 'system', content: withCacheControl(SYSTEM_PROMPT) },
    { role: 'system', content: `协议与动作说明: ${JSON.stringify(executor.actionSpec())}` },
    { role: 'system', content: `本轮交付根目录：${rootDir}\n所有 generated 交付文件必须落在该目录下。` },
    { role: 'system', content: withCacheControl(primaryDataStr) },
  ];
  if (asShortcut(req.shortcut) === 'monthly') {
    messages.push({
      role: 'system',
      content: [
        '月报快捷入口运行时契约：',
        '1. 模型只负责一次性生成完整 monthly_report.md。',
        '2. 请直接输出 patient-education-monthly-report.write_text_deliverable 的 skill_call；不要先 read_skill_file。',
        '3. monthly_report.md 写入成功后，后端会自动转换 monthly_report.pdf 并结束本轮请求。',
        '4. 不要调用 md-to-pdf、run_skill_script 或 final；不要等待 PDF 转换结果。',
      ].join('\n'),
    });
  }
  if (asShortcut(req.shortcut) === 'ppt_svg') {
    messages.push({
      role: 'system',
      content: [
        'legacy PPT SVG 直出快捷入口运行时契约：',
        '1. 本轮必须走旧链路：先调用 ppt-master.ppt_master_bootstrap 新建项目。',
        '2. 必须用 ppt-master.write_project_file 或 write_project_files 写入 design_spec.md、spec_lock.md、notes/total.md 和 svg_output/*.svg。',
        '3. 每页 SVG 必须完整合法，使用 <svg width="1280" height="720" viewBox="0 0 1280 720" xmlns="http://www.w3.org/2000/svg">。',
        '4. 不要调用 ppt-master.render_ppt_from_specs；该快捷入口专门验证模型直接生成 SVG 的 legacy 链路。',
        '5. 页面建议 6-8 页；为避免超时，逐页或小批量写入 SVG，失败后从缺失页面继续，不要重复重写已成功文件。',
        '6. SVG 内文字必须可读，禁止中文省略号和三个连续英文句点；放不下就拆行、缩短或拆页。',
        '7. 最后调用 ppt-master.ppt_master_export 导出 PPTX；导出成功后后端会结束本轮请求。',
      ].join('\n'),
    });
  }
  if (catalog) messages.push({ role: 'system', content: catalog });
  messages.push({ role: 'user', content: `用户请求: ${userText}\n\n请按 new-ai skill_call/final 协议推进。` });
  return { messages, initialSkills: [], primaryDataContext };
}

function obj(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function sameRange(a: unknown, b: unknown): boolean {
  const aa = obj(a);
  const bb = obj(b);
  return String(aa.start || '') === String(bb.start || '') && String(aa.end || '') === String(bb.end || '');
}

function hasExtraPxFilters(params: Record<string, unknown>): boolean {
  return ['projectId', 'contentId', 'diseaseId', 'tenantId', 'compareRange'].some((key) => params[key] !== undefined && params[key] !== '');
}

function isPrimaryDataDuplicate(call: SkillCall, primaryDataContext: Record<string, unknown>): boolean {
  if (call.skill_id !== 'px-data' || call.action !== 'prefetch_metrics') return false;
  const params = obj(call.params);
  if (hasExtraPxFilters(params)) return false;
  const scope = obj(primaryDataContext.scope);
  const primaryRange = scope.dateRange;
  const requestedRange = params.dateRange;
  const sameDateRange = requestedRange ? sameRange(requestedRange, primaryRange) : !primaryRange;
  if (!sameDateRange) return false;
  const requestedGranularity = String(params.granularity || '');
  const primaryGranularity = String(scope.granularity || '');
  return !requestedGranularity || requestedGranularity === primaryGranularity;
}

function reusedPrimaryDataResult(call: SkillCall, primaryDataContext: Record<string, unknown>): SkillResult {
  return {
    ok: true,
    summary: 'px-data 请求与 primary_data_context 相同，已复用本轮主数据',
    detail: {
      kind: 'px_data_reused_primary_context',
      params: call.params || {},
      primary_scope: primaryDataContext.scope,
    },
    json: {
      ok: true,
      kind: 'px_metrics_reused_primary_context',
      params: call.params || {},
      metrics_location: 'primary_data_context.primary_metrics',
      note: '本次 px-data 请求范围与本轮主数据一致；为避免重复指标上下文，未再次返回同一份 metrics。',
    },
    files: [],
  };
}

const TASK_CONTRACT_SKILLS = new Set([
  'patient-education-data-overview',
]);

function shouldInjectFullSkillContext(skillId: string, action: string): boolean {
  if (action === 'read_skill_file') return false;
  return TASK_CONTRACT_SKILLS.has(skillId);
}

function buildSkillContextInjectionNotice(call: SkillCall): string {
  return [
    `完整 ${call.skill_id} 规范已注入。`,
    '重要：你上一条 skill_call 只是触发规范注入，尚未执行；不要假设它已经写入文件、创建项目、导出图片或产生任何 SKILL_RESULT。',
    '请基于完整规范重新输出下一步，只输出一个 JSON 对象。',
    '如果上一条 skill_call 仍符合完整规范，请原样或修正后再次输出；如果规范要求先生成源文件/manifest/notes/design/spec，请按正确顺序继续。',
  ].join('\n');
}

function textFromSuccessfulCall(call: SkillCall, result: SkillResult): string {
  if (result.ok === false) return '';
  if (typeof result.text === 'string' && result.text.trim()) return result.text.trim();
  if (call.action !== 'write_text_deliverable') return '';
  const params = (call.params || {}) as Record<string, unknown>;
  const content = params.content || params.markdown || params.text;
  return typeof content === 'string' ? content.trim() : '';
}

function isMonthlyMarkdownWrite(call: SkillCall, result: SkillResult): boolean {
  return call.skill_id === 'patient-education-monthly-report'
    && call.action === 'write_text_deliverable'
    && result.ok !== false
    && resultFiles(result).some((file) => fileName(file) === 'monthly_report.md');
}

function monthlyPdfAutoCall(): SkillCall {
  return {
    type: 'skill_call',
    skill_id: 'md-to-pdf',
    action: 'run_skill_script',
    params: {
      script: 'scripts/md_to_pdf.py',
      args: ['--input', 'monthly_report.md', '--output', 'monthly_report.pdf'],
      timeout_sec: 120,
    },
    thought: '后端自动将月度报告 Markdown 转换为 PDF 并完成交付。',
  };
}

function fmtNumber(value: number): string {
  return Math.round(value || 0).toLocaleString('zh-CN');
}

function fmtPct(value: number, digits = 1): string {
  return `${((value || 0) * 100).toFixed(digits)}%`;
}

function fmtDeltaPct(value: number): string {
  return `${value >= 0 ? '+' : ''}${(value || 0).toFixed(1)}%`;
}

function mdEscape(value: unknown): string {
  return String(value ?? '').replace(/\|/g, '｜').trim();
}

function listMd(items: string[]): string {
  return items.map((item) => `- ${item}`).join('\n');
}

function tableRows(rows: string[][]): string {
  return rows.map((row) => `| ${row.map(mdEscape).join(' |')} |`).join('\n');
}

function sectionList(title: string, items: string[]): string {
  return items.length ? `\n${title}\n\n${listMd(items)}\n` : '';
}

type MonthlyInsights = {
  executive_summary: string[];
  kpi_insights: string[];
  weekly_insights: string[];
  project_insights: string[];
  content_insights: string[];
  highlights: string[];
  diagnosis: Array<{ issue: string; evidence?: string; reason?: string }>;
  risks: string[];
  recommendations: string[];
};

function normalizeStringList(value: unknown, maxItems: number, maxLen = 120): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => String(item ?? '').replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .slice(0, maxItems)
    .map((item) => (item.length > maxLen ? `${item.slice(0, maxLen)}…` : item));
}

function normalizeMonthlyInsights(raw: unknown, metrics: PrefetchMetrics): MonthlyInsights {
  const value = obj(raw);
  const diagnosisRaw = Array.isArray(value.diagnosis) ? value.diagnosis : [];
  const diagnosis = diagnosisRaw.slice(0, 4).map((item) => {
    const row = obj(item);
    return {
      issue: String(row.issue || row.title || '').replace(/\s+/g, ' ').trim().slice(0, 80),
      evidence: String(row.evidence || '').replace(/\s+/g, ' ').trim().slice(0, 120),
      reason: String(row.reason || row.cause || '').replace(/\s+/g, ' ').trim().slice(0, 120),
    };
  }).filter((item) => item.issue);
  return {
    executive_summary: normalizeStringList(value.executive_summary, 5),
    kpi_insights: normalizeStringList(value.kpi_insights, 4),
    weekly_insights: normalizeStringList(value.weekly_insights, 4),
    project_insights: normalizeStringList(value.project_insights, 4),
    content_insights: normalizeStringList(value.content_insights, 4),
    highlights: normalizeStringList(value.highlights, 4),
    diagnosis,
    risks: normalizeStringList(value.risks, 4),
    recommendations: normalizeStringList(value.recommendations || value.next_actions, 6),
  };
}

function buildMonthlyInsightPrompt(current: PrefetchMetrics, previous: PrefetchMetrics, dateRange: DateRange, compareRange: DateRange): ChatMessage[] {
  const context = {
    task: 'monthly_report_insight_generation',
    instruction: [
      '你要写的是管理层月度复盘报告的“分析结论”，不是异常检测清单。',
      '请同时分析成绩、变化、贡献结构、内容方法、原因判断、经营含义和下月策略。',
      '即使没有明显异常，也要说明本月表现说明了什么、哪些做法值得延续、哪些结构需要优化。',
      '不要只写“未发现异常/保持观察”；每个模块都要有复盘视角和运营动作指向。',
      '只基于给定指标生成结论。不要输出 Markdown，不要生成文件，不要编造未提供的数据。',
    ].join('\n'),
    output_schema: {
      executive_summary: ['3-5 条，像月报开头一样总结本月整体表现、关键变化、主要贡献和下月重点'],
      kpi_insights: ['2-4 条，围绕阅读、互动、完读、时长、环比讲经营含义，不只是异常'],
      weekly_insights: ['2-4 条，复盘本月节奏、峰谷周、推送节奏和可复制动作'],
      project_insights: ['2-4 条，分析项目贡献结构、主力项目价值、资源倾斜和项目组合'],
      content_insights: ['2-4 条，分析内容类型/主题/表达方式，沉淀可复制方法和优化方向'],
      highlights: ['1-4 条，本月值得肯定的亮点、有效动作、可沉淀资产'],
      diagnosis: [{ issue: '需要关注的运营问题或结构问题', evidence: '数据证据', reason: '原因判断' }],
      risks: ['1-4 条，下月可能影响表现的风险或结构性隐患'],
      recommendations: ['3-6 条，具体到下月运营动作、内容策略、项目资源配置或复盘机制'],
    },
    period: dateRange,
    compare_period: compareRange,
    kpi: {
      current: current.coreKpi,
      previous: previous.coreKpi,
      month_delta: current.monthDelta,
    },
    weekly_trend: weeklyTrend(current.dailyTrend),
    top_projects: slimProjects(current.projects, 5),
    top_contents: slimContent(current.topContent, 6),
    low_finish_contents: [...current.topContent]
      .filter((item) => item.readCount > 0)
      .sort((a, b) => a.finishRate - b.finishRate)
      .slice(0, 3)
      .map((item) => ({ title: item.title, projectName: item.projectName, readCount: item.readCount, finishRate: item.finishRate })),
    backend_insights: current.insights,
  };
  return [
    {
      role: 'system',
      content: '你是资深患教内容运营负责人，正在为管理层写月度复盘报告。请写出“月报式”的分析：既讲结果，也讲变化、贡献、原因、策略和下月动作；不要只做异常判断。必须只输出一个合法 JSON 对象，字段为 executive_summary、kpi_insights、weekly_insights、project_insights、content_insights、highlights、diagnosis、risks、recommendations。不要输出 Markdown 或解释文字。',
    },
    { role: 'user', content: JSON.stringify(context, null, 2) },
  ];
}

function buildMonthlyReportMarkdown(current: PrefetchMetrics, previous: PrefetchMetrics, dateRange: DateRange, compareRange: DateRange, insights: MonthlyInsights): string {
  const k = current.coreKpi;
  const pk = previous.coreKpi;
  const kpiRows = [
    ['推送量', fmtNumber(k.pushCount), fmtNumber(pk.pushCount), fmtDeltaPct(current.monthDelta.pushCountPct)],
    ['送达量', fmtNumber(k.deliveredCount), fmtNumber(pk.deliveredCount), '-'],
    ['阅读人数', fmtNumber(k.readUsers), fmtNumber(pk.readUsers), '-'],
    ['阅读次数', fmtNumber(k.readCount), fmtNumber(pk.readCount), fmtDeltaPct(current.monthDelta.readCountPct)],
    ['互动次数', fmtNumber(k.interactionCount), fmtNumber(pk.interactionCount), fmtDeltaPct(current.monthDelta.interactionCountPct)],
    ['完读率', fmtPct(k.finishRate), fmtPct(pk.finishRate), '-'],
    ['平均阅读时长', `${(k.avgReadSec || 0).toFixed(0)} 秒`, `${(pk.avgReadSec || 0).toFixed(0)} 秒`, '-'],
  ];
  const weeklyRows = weeklyTrend(current.dailyTrend).map((row) => [
    String(row.label),
    fmtNumber(Number(row.pushCount)),
    fmtNumber(Number(row.readCount)),
    fmtNumber(Number(row.interactionCount)),
    fmtPct(Number(row.finishRate)),
  ]);
  const projectRows = slimProjects(current.projects, 8).map((item, index) => [
    String(index + 1),
    String(item.name || ''),
    fmtNumber(Number(item.readCount || 0)),
    fmtNumber(Number(item.interactionCount || 0)),
    fmtNumber(Number(item.contentCount || 0)),
  ]);
  const contentRows = slimContent(current.topContent, 8).map((item, index) => [
    String(index + 1),
    String(item.title || ''),
    String(item.projectName || '-'),
    fmtNumber(Number(item.readCount || 0)),
    fmtNumber(Number(item.interactionCount || 0)),
    fmtPct(Number(item.finishRate || 0)),
  ]);
  const diagnosisRows = insights.diagnosis.map((item, index) => [
    String(index + 1),
    item.issue,
    item.evidence || '-',
    item.reason || '-',
  ]);
  const executiveSummarySection = sectionList('## 一、执行摘要', insights.executive_summary);
  const kpiInsightSection = sectionList('**本节解读**', insights.kpi_insights);
  const weeklyInsightSection = sectionList('**本节解读**', insights.weekly_insights);
  const projectInsightSection = sectionList('**本节解读**', insights.project_insights);
  const contentInsightSection = sectionList('**本节解读**', insights.content_insights);
  const highlightsSection = sectionList('## 六、亮点与机会', insights.highlights);
  const diagnosisSection = diagnosisRows.length ? `## 七、主要问题诊断

| 序号 | 问题 | 数据证据 | 原因判断 |
|---:|---|---|---|
${tableRows(diagnosisRows)}
` : '';
  const risksSection = sectionList('## 八、风险提示', insights.risks);
  const recommendationsSection = sectionList('## 九、下阶段行动建议', insights.recommendations);

  return `# 患教内容运营月度报告

**报告周期**：${dateRange.start} 至 ${dateRange.end}  
**对比周期**：${compareRange.start} 至 ${compareRange.end}  
**数据来源**：PX SQL 聚合指标  
${executiveSummarySection}

## 二、核心指标表现

| 指标 | 本月 | 上月 | 环比 |
|---|---:|---:|---:|
${tableRows(kpiRows)}
${kpiInsightSection}

## 三、周度阅读与互动节奏

| 周期 | 推送量 | 阅读次数 | 互动次数 | 完读率 |
|---|---:|---:|---:|---:|
${tableRows(weeklyRows)}
${weeklyInsightSection}

## 四、项目贡献

| 排名 | 项目 | 阅读次数 | 互动次数 | 内容数 |
|---:|---|---:|---:|---:|
${tableRows(projectRows)}
${projectInsightSection}

## 五、内容表现

| 排名 | 内容 | 项目 | 阅读次数 | 互动次数 | 完读率 |
|---:|---|---|---:|---:|---:|
${tableRows(contentRows)}
${contentInsightSection}
${highlightsSection}
${diagnosisSection}
${risksSection}
${recommendationsSection}
`;
}

function parseInsightJson(raw: string): Record<string, unknown> | undefined {
  return SkillExecutor.parseJsonObject(raw);
}

async function generateMonthlyInsights(req: RunRequest, rootDir: string, current: PrefetchMetrics, previous: PrefetchMetrics, dateRange: DateRange, compareRange: DateRange): Promise<MonthlyInsights> {
  const ai = new AIService({ model: 'qwen3.6-plus', timeoutMs: 45_000 });
  const messages = buildMonthlyInsightPrompt(current, previous, dateRange, compareRange);
  const started = Date.now();
  runtimeLog('model_start', { step: 'monthly_insights', rootDir, model: ai.modelName(), messages, ...requestLog(req) });
  try {
    const result = await ai.chatDetailed(messages);
    const duration = Date.now() - started;
    runtimeLog('model_end', { step: 'monthly_insights', rootDir, duration_ms: duration, output: result.text, raw_response: result.rawResponse, request: result.request, cache_usage: result.cacheUsage, ...requestLog(req) });
    modelIoLog({
      step: 1,
      rootDir,
      model: ai.modelName(),
      duration_ms: duration,
      messages,
      output: result.text,
      request: result.request,
      meta: { ...requestLog(req), direct_pipeline: 'monthly_template_insights' },
      cache_usage: result.cacheUsage,
    });
    return normalizeMonthlyInsights(parseInsightJson(result.text), current);
  } catch (err) {
    const duration = Date.now() - started;
    runtimeLog('model_error', { step: 'monthly_insights', rootDir, duration_ms: duration, model: ai.modelName(), error: modelErrorLog(err), fallback_to_rule_based: true, ...requestLog(req) });
    modelIoLog({
      step: 1,
      rootDir,
      model: ai.modelName(),
      duration_ms: duration,
      messages,
      error: modelErrorLog(err),
      meta: { ...requestLog(req), direct_pipeline: 'monthly_template_insights', fallback_to_rule_based: true },
    });
    return normalizeMonthlyInsights(undefined, current);
  }
}

export async function* streamAssistant(req: RunRequest): AsyncGenerator<string> {
  const { rootDir } = createRunDirectory(req.conversation_id, req.run_id);
  const started = Date.now();
  const ai = new AIService();
  const registry = new SkillRegistry();
  const shortcut = asShortcut(req.shortcut);
  const isLegacyPptSvg = shortcut === 'ppt_svg';
  const executor = new SkillExecutor(rootDir, { allowManualPptSvg: isLegacyPptSvg });
  const trace: AgentDonePayload['trace'] = [];
  const backgroundJobs: BackgroundJob[] = [];
  const injected = new Set<string>();
  const skillsUsed = new Set<string>();
  let earlyTextEmitted = false;
  let earlyTextContent = '';
  const maxSteps = Number(process.env.AI_HELPER_MAX_STEPS || 60);
  const modelTimeoutRetries = Math.max(1, Number(process.env.AI_HELPER_MODEL_TIMEOUT_RETRIES || 3) || 3);

  const emit = (type: string, data: unknown): string => {
    runtimeLog('stream_event', { type, data, rootDir, ...requestLog(req) });
    return eventLine(type, data);
  };

  runtimeLog('request_start', { mode: 'new-ai-ts', rootDir, runtime_log_path: RUNTIME_LOG_PATH, model_io_log_path: MODEL_IO_LOG_PATH, run_model_io_log_path: path.join(rootDir, 'model_io.md'), ...requestLog(req) });
  yield emit('status', '开始处理请求...');
  yield emit('progress', { phase: 'planning', message: '正在预取 PX 主数据并加载技能目录', step: 0 });

  if (asShortcut(req.shortcut) === 'monthly') {
    // 原通用 agent 月报链路暂不走：它要求模型一次性生成完整 Markdown，容易慢/卡住。
    // 新链路：模型只生成结构化结论，Markdown/PDF 由后端模板确定性生成。
    const trace: AgentDonePayload['trace'] = [];
    const skillsUsed = new Set<string>(['monthly-template', 'md-to-pdf']);
    try {
      yield emit('progress', { phase: 'data', message: '正在聚合本月与上月指标', step: 1 });
      const defaultMetrics = await prefetchMetrics();
      const scope = resolvePrimaryDataScope(req, defaultMetrics.range.end);
      if (!scope.dateRange || !scope.compareRange) throw new Error('无法解析月报周期或对比周期');
      const currentMetrics = await prefetchMetrics({
        dateRange: scope.dateRange,
        compareRange: scope.compareRange,
        granularity: 'week',
        limit: 70,
        purpose: '后端模板月报：本月主数据',
      });
      const previousMetrics = await prefetchMetrics({
        dateRange: scope.compareRange,
        granularity: 'week',
        limit: 70,
        purpose: '后端模板月报：上月对比数据',
      });
      writeMetricStores(rootDir, [
        { prefix: 'primary', label: '本月主数据', metrics: currentMetrics },
        { prefix: 'previous_period', label: '上月对比数据', metrics: previousMetrics },
      ]);

      yield emit('progress', { phase: 'analysis', message: '正在调用 qwen3.6-plus 生成管理层结论', step: 2 });
      const insights = await generateMonthlyInsights(req, rootDir, currentMetrics, previousMetrics, scope.dateRange, scope.compareRange);
      const markdown = buildMonthlyReportMarkdown(currentMetrics, previousMetrics, scope.dateRange, scope.compareRange, insights);

      const mdCall: SkillCall = {
        type: 'skill_call',
        skill_id: 'patient-education-monthly-report',
        action: 'write_text_deliverable',
        params: { file_name: 'monthly_report.md', content: markdown },
        thought: '后端模板生成月报 Markdown。',
      };
      yield emit('progress', { phase: 'file_generation', message: '正在写入月报 Markdown', step: 3 });
      const mdResult = await executor.execute(mdCall);
      trace.push({ step: 'template_md', call: mdCall, result: mdResult });
      yield emit('skill_result', mdResult);
      if (mdResult.ok === false) throw new Error(mdResult.error || '月报 Markdown 写入失败');

      const pdfCall = monthlyPdfAutoCall();
      yield emit('progress', { phase: 'file_generation', message: '正在自动转换 PDF', step: 4 });
      const pdfResult = await executor.execute(pdfCall);
      trace.push({ step: 'template_pdf', call: pdfCall, result: pdfResult });
      yield emit('skill_result', pdfResult);

      const files = collectFiles(trace);
      if (files.length) yield emit('files', files);
      const finalAnswer = pdfResult.ok === false
        ? `月度报告 Markdown 已生成，但 PDF 自动转换失败：${pdfResult.error || '未知错误'}。请先下载 Markdown 文件。`
        : '月度报告已生成，Markdown 与 PDF 文件可在下方下载。';
      yield emit('text', finalAnswer);
      yield emit('progress', { phase: pdfResult.ok === false ? 'error' : 'complete', message: pdfResult.ok === false ? 'PDF 自动转换失败' : '月度报告生成完成', step: 5, ok: pdfResult.ok !== false });
      yield emit('done', { text: finalAnswer, files, skills_used: [...skillsUsed], trace, background_jobs: [] });
      runtimeLog('request_end', { rootDir, duration_ms: Date.now() - started, text: finalAnswer, files, skills_used: [...skillsUsed], trace, background_jobs: [], direct_monthly_template: true, model: 'qwen3.6-plus', ...requestLog(req) });
      return;
    } catch (err) {
      const text = `月报生成失败：${err instanceof Error ? err.message : String(err)}`;
      yield emit('text', text);
      yield emit('done', { text, files: collectFiles(trace), skills_used: [...skillsUsed], trace, background_jobs: [] });
      runtimeLog('request_end', { rootDir, duration_ms: Date.now() - started, text, files: collectFiles(trace), skills_used: [...skillsUsed], trace, background_jobs: [], direct_monthly_template: true, error: modelErrorLog(err), ...requestLog(req) });
      return;
    }
  }

  let messages: ChatMessage[];
  let primaryDataContext: Record<string, unknown>;
  try {
    ({ messages, primaryDataContext } = await buildMessages(req, rootDir, registry, executor));
  } catch (err) {
    const text = `PX 数据预取失败：${err instanceof Error ? err.message : String(err)}`;
    yield emit('text', text);
    yield emit('done', { text, files: [], skills_used: [], trace: [] });
    return;
  }

  yield emit('skills', registry.listSkills().map((x) => x.skill_id));

  for (let step = 1; step <= maxSteps; step += 1) {
    yield emit('progress', { phase: 'planning', message: `第 ${step} 步：模型正在规划下一步`, step });
    yield emit('thought', `[step ${step}] 正在调用模型...\n`);
    let raw = '';
    try {
      for (let attempt = 1; attempt <= modelTimeoutRetries; attempt += 1) {
        const modelStarted = Date.now();
        runtimeLog('model_start', { step, attempt, max_attempts: modelTimeoutRetries, rootDir, model: ai.modelName(), messages, ...requestLog(req) });
        try {
          const result = await ai.chatDetailed(messages);
          raw = result.text;
          const duration = Date.now() - modelStarted;
          runtimeLog('model_end', { step, attempt, max_attempts: modelTimeoutRetries, rootDir, duration_ms: duration, output: raw, raw_response: result.rawResponse, request: result.request, cache_usage: result.cacheUsage, recovered_from_reasoning_content: result.recoveredFromReasoningContent, ...requestLog(req) });
          modelIoLog({
            step,
            rootDir,
            model: ai.modelName(),
            duration_ms: duration,
            messages,
            output: raw,
            request: result.request,
            meta: { ...requestLog(req), attempt, max_attempts: modelTimeoutRetries },
            cache_usage: result.cacheUsage,
            recovered_from_reasoning_content: result.recoveredFromReasoningContent,
          });
          break;
        } catch (err) {
          const duration = Date.now() - modelStarted;
          if (isModelTimeoutError(err) && attempt < modelTimeoutRetries) {
            const text = `模型调用失败：${err instanceof Error ? err.message : String(err)}`;
            runtimeLog('model_error', { step, attempt, max_attempts: modelTimeoutRetries, rootDir, duration_ms: duration, error: modelErrorLog(err), retrying: true, ...requestLog(req) });
            modelIoLog({
              step,
              rootDir,
              model: ai.modelName(),
              duration_ms: duration,
              messages,
              error: modelErrorLog(err),
              meta: { ...requestLog(req), attempt, max_attempts: modelTimeoutRetries, retrying: true },
            });
            if (attempt === 1) messages.push({ role: 'user', content: buildModelTimeoutRetryObservation(text) });
            yield emit('progress', { phase: 'retry', message: `模型响应超时，自动重试 ${attempt + 1}/${modelTimeoutRetries}`, step, attempt, max_attempts: modelTimeoutRetries, ok: false });
            continue;
          }
          throw err;
        }
      }
    } catch (err) {
      const text = `模型调用失败：${err instanceof Error ? err.message : String(err)}`;
      runtimeLog('model_error', { step, rootDir, error: modelErrorLog(err), ...requestLog(req) });
      modelIoLog({
        step,
        rootDir,
        model: ai.modelName(),
        messages,
        error: modelErrorLog(err),
        meta: requestLog(req),
      });
      if (isRecoverableEmptyModelContent(err) && step < maxSteps) {
        messages.push({ role: 'user', content: buildModelErrorObservation(text) });
        yield emit('progress', { phase: 'retry', message: '模型调用未返回有效结果，已作为 observation 反馈并要求重试', step, ok: false });
        continue;
      }
      yield emit('text', text);
      yield emit('done', { text, files: collectFiles(trace), skills_used: [...skillsUsed], trace, background_jobs: backgroundJobs });
      return;
    }

    const parsed = SkillExecutor.parseJsonObject(raw);
    if (!parsed) {
      messages.push({ role: 'assistant', content: compactSkillCallForContext(raw) });
      messages.push({ role: 'user', content: 'INVALID_MODEL_JSON: 上一轮输出无法解析为单个 JSON 对象。请修正后只返回 skill_call 或 final JSON。' });
      yield emit('progress', { phase: 'retry', message: '模型输出格式需修正，正在要求重试', step, ok: false });
      continue;
    }

    const final = asFinal(parsed);
    if (final) {
      const missing = missingRequired(trace);
      if (missing.length) {
        messages.push({ role: 'assistant', content: compactSkillCallForContext(raw) });
        messages.push({ role: 'user', content: buildFinalRejection(missing) });
        yield emit('progress', { phase: 'retry', message: `交付未完成，缺少: ${missing.join(', ')}`, step, ok: false });
        continue;
      }
      const files = collectFiles(trace, final.deliverable_files);
      if (final.answer && !earlyTextEmitted) {
        earlyTextEmitted = true;
        yield emit('text', final.answer);
      }
      if (files.length) yield emit('files', files);
      yield emit('progress', { phase: 'complete', message: '处理完成', step, ok: true });
      yield emit('done', { text: final.answer, files, skills_used: [...skillsUsed], trace, background_jobs: backgroundJobs });
      runtimeLog('request_end', { rootDir, duration_ms: Date.now() - started, text: final.answer, files, skills_used: [...skillsUsed], trace, background_jobs: backgroundJobs, ...requestLog(req) });
      return;
    }

    if (!isSkillCall(parsed)) {
      messages.push({ role: 'assistant', content: compactSkillCallForContext(raw) });
      messages.push({ role: 'user', content: `UNSUPPORTED_MODEL_MESSAGE: type 必须为 skill_call 或 final，收到 ${String(parsed.type)}。请只返回一个 JSON 对象。` });
      yield emit('progress', { phase: 'retry', message: '模型消息类型不支持，正在要求重试', step, ok: false });
      continue;
    }

    const call = parsed;
    skillsUsed.add(call.skill_id);
    yield emit('skills', [...skillsUsed]);

    if (!injected.has(call.skill_id) && shouldInjectFullSkillContext(call.skill_id, call.action)) {
      const full = registry.buildFullSkillContext(call.skill_id);
      if (full) {
        injected.add(call.skill_id);
        messages.push({ role: 'assistant', content: compactSkillCallForContext(raw) });
        messages.push({ role: 'system', content: full });
        messages.push({ role: 'user', content: buildSkillContextInjectionNotice(call) });
        yield emit('progress', { phase: 'skill_context', message: `正在加载 ${call.skill_id} skill 的完整规范`, step, skill_id: call.skill_id, action: call.action });
        continue;
      }
    }

    const label = executor.describeCall(call);
    yield emit('progress', { phase: 'skill_call', message: `正在调用工具`, step, skill_id: call.skill_id, action: call.action, detail: label });
    if (call.thought) yield emit('thought', `[step ${step}] ${call.thought}\n`);

    let result: SkillResult;
    if (isPrimaryDataDuplicate(call, primaryDataContext)) {
      result = reusedPrimaryDataResult(call, primaryDataContext);
    } else if (executor.isBackgroundCall(call)) {
      if (call.skill_id === 'ppt-master' && call.action === 'ppt_master_export') {
        const pre = executor.pptMasterExportPrecheck((call.params || {}) as Record<string, unknown>);
        if (!pre.ok) {
          result = { ok: false, recoverable: true, summary: label, error: `ppt-master 导出前置条件未满足: ${pre.missing.join(', ')}`, detail: { kind: 'export_precheck', ...pre } };
          trace.push({ step, call, result });
          yield emit('skill_result', result);
          messages.push({ role: 'assistant', content: compactSkillCallForContext(raw) });
          messages.push({ role: 'user', content: SkillExecutor.observation(result) });
          continue;
        }
      }
      const job = scheduleBackgroundJob({ label, conversation_id: req.conversation_id, run_id: req.run_id, runner: () => executor.executeStrict(call) });
      backgroundJobs.push(job);
      result = { ok: true, background: true, summary: `${label} 已转入后台生成`, detail: { kind: 'background_export', job_id: job.id, status: job.status, expected_files: job.expected_files }, files: [] } as SkillResult;
      yield emit('background_job', job);
    } else {
      result = await executor.execute(call);
    }

    trace.push({ step, call, result });
    if (call.action === 'read_skill_file' && result.ok !== false) injected.add(call.skill_id);
    yield emit('skill_result', result);

    if (isMonthlyMarkdownWrite(call, result)) {
      const pdfCall = monthlyPdfAutoCall();
      skillsUsed.add(pdfCall.skill_id);
      yield emit('skills', [...skillsUsed]);
      yield emit('progress', { phase: 'file_generation', message: '月报正文已生成，后端正在自动转换 PDF', step, skill_id: pdfCall.skill_id, action: pdfCall.action, ok: true });
      const pdfResult = await executor.execute(pdfCall);
      trace.push({ step: `${step}.auto_pdf`, call: pdfCall, result: pdfResult });
      yield emit('skill_result', pdfResult);

      const files = collectFiles(trace);
      if (files.length) yield emit('files', files);

      const finalAnswer = pdfResult.ok === false
        ? `月度报告 Markdown 已生成，但 PDF 自动转换失败：${pdfResult.error || '未知错误'}。请先下载 Markdown 文件。`
        : '月度报告已生成，Markdown 与 PDF 文件可在下方下载。';
      if (!earlyTextEmitted) {
        earlyTextEmitted = true;
        yield emit('text', finalAnswer);
      }
      yield emit('progress', { phase: pdfResult.ok === false ? 'error' : 'complete', message: pdfResult.ok === false ? 'PDF 自动转换失败' : '月度报告 PDF 自动转换完成', step, ok: pdfResult.ok !== false });
      yield emit('done', { text: finalAnswer, files, skills_used: [...skillsUsed], trace, background_jobs: backgroundJobs });
      runtimeLog('request_end', { rootDir, duration_ms: Date.now() - started, text: finalAnswer, files, skills_used: [...skillsUsed], trace, background_jobs: backgroundJobs, auto_final_after_monthly_pdf: true, ...requestLog(req) });
      return;
    }

    const visibleText = textFromSuccessfulCall(call, result);
    if (visibleText && !earlyTextEmitted) {
      earlyTextEmitted = true;
      earlyTextContent = visibleText;
      yield emit('text', visibleText);
      yield emit('progress', { phase: 'file_generation', message: '文字已生成，继续生成文件', step, ok: true });
    }
    yield emit('progress', { phase: 'skill_complete', message: result.ok === false ? '工具执行失败，正在反馈给模型重试' : '工具执行完成', step, skill_id: call.skill_id, action: call.action, ok: result.ok !== false, detail: label });
    const files = collectFiles(trace);
    if (files.length) yield emit('files', files);
    const exportedPptFiles = resultFiles(result).filter((f) => /\.pptx$/i.test(fileName(f)));
    if (call.skill_id === 'ppt-master' && call.action === 'ppt_master_export' && result.ok !== false && exportedPptFiles.length) {
      const finalAnswer = earlyTextContent || 'PPT 已生成，可在下方文件中下载。';
      if (!earlyTextEmitted) {
        earlyTextEmitted = true;
        yield emit('text', finalAnswer);
      }
      yield emit('progress', { phase: 'complete', message: 'PPT 导出完成', step, ok: true });
      yield emit('done', { text: finalAnswer, files, skills_used: [...skillsUsed], trace, background_jobs: backgroundJobs });
      runtimeLog('request_end', { rootDir, duration_ms: Date.now() - started, text: finalAnswer, files, skills_used: [...skillsUsed], trace, background_jobs: backgroundJobs, auto_final_after_export: true, ...requestLog(req) });
      return;
    }
    messages.push({ role: 'assistant', content: compactSkillCallForContext(raw) });
    messages.push({ role: 'user', content: SkillExecutor.observation(result) });
  }

  const text = '已达到最大技能调用步数，请收敛请求范围后重试。';
  yield emit('text', text);
  yield emit('done', { text, files: collectFiles(trace), skills_used: [...skillsUsed], trace, background_jobs: backgroundJobs });
}

export async function runAssistant(req: RunRequest): Promise<{ text: string; files: string[]; skills_used: string[] }> {
  let text = '';
  let files: string[] = [];
  let skills_used: string[] = [];
  for await (const line of streamAssistant(req)) {
    const evt = JSON.parse(line) as { type: string; data: unknown };
    if (evt.type === 'text') text += String(evt.data || '');
    if (evt.type === 'files' && Array.isArray(evt.data)) files = evt.data as string[];
    if (evt.type === 'done' && evt.data && typeof evt.data === 'object') {
      const done = evt.data as { text?: string; files?: string[]; skills_used?: string[] };
      text = done.text || text;
      files = done.files || files;
      skills_used = done.skills_used || skills_used;
    }
  }
  return { text, files, skills_used };
}

export function listGeneratedFiles(): string[] {
  if (!fs.existsSync(GENERATED_DIR)) return [];
  const out: Array<{ path: string; mtime: number }> = [];
  const walk = (dir: string) => {
    for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
      const abs = path.join(dir, ent.name);
      if (ent.isDirectory()) walk(abs);
      else if (/\.(md|html|svg|png|pdf|pptx)$/i.test(ent.name)) out.push({ path: `/generated/${path.relative(GENERATED_DIR, abs).split(path.sep).join('/')}`, mtime: fs.statSync(abs).mtimeMs });
    }
  };
  walk(GENERATED_DIR);
  return out.sort((a, b) => b.mtime - a.mtime).slice(0, 50).map((x) => x.path);
}
