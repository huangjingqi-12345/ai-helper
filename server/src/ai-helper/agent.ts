import fs from 'fs';
import path from 'path';
import { AIService, AIServiceError, type ChatMessage, type ChatResult, type ChatStreamProgress, type ContentBlock } from './aiService.js';
import { AI_HELPER_ROOT, createRunDirectory, GENERATED_DIR, toAssetPath } from './paths.js';
import { prefetchMetrics } from './metrics.js';
import { MODEL_IO_LOG_PATH, RUNTIME_LOG_PATH, modelIoLog, runtimeLog } from './runtimeLogger.js';
import type { AiDataScope, AiShortcut, PrefetchMetrics, PrefetchMetricsParams, ProjectMetric, RunRequest, StreamEvent, TopContentMetric } from './types.js';
import { DATA_QA_PROMPT, MONTHLY_PROMPT, OVERVIEW_PROMPT, PPT_EDIT_PREMIUM_SVG_PROMPT, PPT_EDIT_SVG_PROMPT, PPT_PREMIUM_SVG_PROMPT, SHORTCUT_PROMPTS, SYSTEM_PROMPT } from './promptTemplates.js';
import { SkillRegistry } from './skillRegistry.js';
import { SkillExecutor, type ActionSpecMode, type SkillCall, type SkillResult } from './skillExecutor.js';
import { scheduleBackgroundJob, type BackgroundJob } from './backgroundJobs.js';
import { renderPptDeckFromSpecs } from './pptSpecRenderer.js';
import { uploadAiHelperFiles, type AiHelperUploadContext } from './ossStorage.js';
import { dbAll } from '../db/connection.js';

export { SHORTCUT_PROMPTS, SYSTEM_PROMPT } from './promptTemplates.js';

interface AgentDonePayload {
  text: string;
  files: string[];
  skills_used: string[];
  trace: Array<{ step: number | string; call?: SkillCall; result?: SkillResult }>;
  background_jobs?: BackgroundJob[];
  activePptContext?: unknown;
}

function eventLine(type: string, data: unknown): string {
  return JSON.stringify({ type, data } satisfies StreamEvent) + '\n';
}

function sanitizeUserVisibleText(value: string): string {
  return value
    .replace(/管理层/g, '业务团队')
    .replace(/behavior_daily_metrics/gi, '行为指标数据')
    .replace(/SQL database via Px backend\s*\([^)]*\)/gi, 'PX 指标数据')
    .replace(/PX\s*SQL\s*聚合指标/gi, 'PX 指标数据')
    .replace(/SQL\s*聚合指标/gi, '指标数据')
    .replace(/后端\s*SQL\s*查询结果/g, '后端指标数据')
    .replace(/\bSQL\b/gi, '指标数据')
    .replace(/数据库字段名/g, '底层字段名')
    .replace(/数据库/g, '数据源');
}

function looksLikeLowLevelErrorText(text: string): boolean {
  return /模型调用(?:失败|超时|已取消)|AI helper 执行失败|HTTP\s*\d{3}|网络异常|未配置\s*(?:POE_API_KEY|OPENAI_API_KEY|API)|模型响应不是合法 JSON|模型返回为空|SKILL_RESULT|Traceback|Command failed|execFile|spawn\b|ENOENT|EACCES|ECONN[A-Z_]*|ETIMEDOUT|timeout|node_modules|\/app\/|\/Users\/|\\Users\\|python\d?|Pillow|PIL|OSS .*HTTP|SQL|PPT SVG 兼容性检查失败|导出前置条件未满足|foreignObject|<g opacity>|script\/style|HTML named entities/i.test(text);
}

function sanitizeClientVisibleText(value: string): string {
  const text = sanitizeUserVisibleText(value);
  if (!looksLikeLowLevelErrorText(text)) return text;
  if (/PPT SVG|<g opacity>|foreignObject|script\/style|HTML named entities/i.test(text)) return '页面内容校验未通过，正在自动修正。';
  if (/PPT 局部修改/.test(text)) return '这次 PPT 局部修改没有成功完成，已保留上一版 PPT 不变。你可以稍后重试，或换一种更明确的修改描述。';
  if (/PPT 快速版/.test(text)) return 'PPT 快速版生成失败，请稍后重试。';
  if (/PPT/.test(text)) return 'PPT 生成失败，请稍后重试。';
  if (/数据概览/.test(text) && /PDF/.test(text)) return '数据概览已生成，但 PDF 自动转换未完成，可先下载已生成的 Markdown、HTML 和图片文件。';
  if (/数据概览/.test(text)) return '数据概览生成失败，请稍后重试。';
  if (/月度报告|月报/.test(text) && /PDF/.test(text)) return '月度报告已生成，但 PDF 自动转换未完成，可先下载 Markdown 文件。';
  if (/月度报告|月报/.test(text)) return '月报生成失败，请稍后重试。';
  if (/数据预取|数据准备|PX 数据/.test(text)) return '数据准备失败，请稍后重试。';
  if (/PDF/.test(text)) return 'PDF 自动转换未完成，可先下载已生成文件。';
  return '处理过程中出现问题，请稍后重试。';
}

function sanitizePptEditPrefaceText(raw: string): string {
  const fallback = '我会基于上一版 PPT 自动定位需要调整的页面，保持其他页面不变，并直接完成局部修改。';
  const text = raw.replace(/```[\s\S]*?```/g, '').replace(/\s+/g, ' ').trim().slice(0, 300);
  if (!text) return fallback;
  const asksForClarification = /请(?:说明|提供|补充|告诉|描述|明确)|具体需要|需要调整哪些|哪些内容|哪些元素|您希望|你希望|是否需要|能否|可否|[？?]/.test(text);
  return asksForClarification ? fallback : text;
}

function sanitizePptEditFinalText(raw: string): string {
  const fallback = 'PPT 已按要求完成局部修改。';
  const text = raw.replace(/```[\s\S]*?```/g, '').replace(/\s+/g, ' ').trim().slice(0, 500);
  if (!text) return fallback;
  const asksForClarification = /请(?:说明|提供|补充|告诉|描述|明确)|具体需要|需要调整哪些|哪些内容|哪些元素|您希望|你希望|是否需要|能否|可否|[？?]/.test(text);
  return asksForClarification ? fallback : text;
}

function pptEditFailureFallbackText(ctx?: { exportedPptx?: string }, hasSvgDraft = false): string {
  if (hasSvgDraft && !ctx?.exportedPptx) {
    return '这次 PPT 没有成功导出为 PPTX，但已保留上一轮生成的 SVG 页面，可继续基于这些页面修改。';
  }
  return ctx?.exportedPptx
    ? '这次 PPT 局部修改没有成功完成，已保留上一版 PPT 不变。你可以稍后重试，或换一种更明确的修改描述。'
    : '这次 PPT 局部修改没有成功完成，请稍后重试。';
}

function sanitizeUserVisibleData<T>(value: T): T {
  if (typeof value === 'string') return sanitizeClientVisibleText(value) as T;
  if (Array.isArray(value)) return value.map((item) => sanitizeUserVisibleData(item)) as T;
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([key, item]) => [key, sanitizeUserVisibleData(item)])) as T;
  }
  return value;
}

function requestLog(req: RunRequest): Record<string, unknown> {
  return {
    conversation_id: req.conversation_id,
    run_id: req.run_id,
    message: req.message,
    command: req.command,
    shortcut: req.shortcut,
    data_scope: req.data_scope,
    date_range: req.date_range,
    compare_range: req.compare_range,
    date_label: req.date_label,
    granularity: req.granularity,
  };
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

interface StreamAssistantOptions {
  signal?: AbortSignal;
  userId?: string;
  tenantId?: string;
  tenantType?: 'ops' | 'pharma';
}

function enforcedTenantIdFromOptions(options: StreamAssistantOptions): string | undefined {
  return options.tenantType === 'pharma' && options.tenantId ? options.tenantId : undefined;
}

function abortError(): Error {
  const err = new Error('AI helper generation aborted');
  err.name = 'AbortError';
  return err;
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw abortError();
}

function isAbortError(err: unknown): boolean {
  return err instanceof Error && (err.name === 'AbortError' || /aborted|abort|取消|暂停/i.test(err.message));
}

function withHardTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new AIServiceError(`${message}（>${ms}ms）`)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => {
    if (timer) clearTimeout(timer);
  });
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
  const svg = typeof next.svg === 'string' ? next.svg : undefined;
  if (svg !== undefined) {
    next.svg = `[svg omitted from conversation context; chars=${svg.length}]`;
  }
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

function clipOneLine(value: unknown, maxChars = 120): string {
  const text = String(value ?? '').replace(/\s+/g, ' ').trim();
  return text.length > maxChars ? `${text.slice(0, maxChars)}…` : text;
}

function svgTextNodes(content: string): string[] {
  return [...content.matchAll(/<text\b[^>]*>([\s\S]*?)<\/text>/gi)]
    .map((m) => m[1].replace(/<[^>]+>/g, ' ').replace(/&nbsp;/gi, ' ').replace(/\s+/g, ' ').trim())
    .filter(Boolean);
}

function slideNoFromPath(filePath: string, fallback?: unknown): number | undefined {
  const fromParam = Number(fallback);
  if (Number.isInteger(fromParam) && fromParam > 0) return fromParam;
  const base = fileName(filePath);
  const match = base.match(/^(\d{1,2})[_-]/);
  if (!match) return undefined;
  const value = Number(match[1]);
  return Number.isInteger(value) && value > 0 ? value : undefined;
}

function isSvgProjectFile(filePath: string): boolean {
  const rel = filePath.replace(/\\/g, '/');
  return (rel.startsWith('svg_output/') || rel.includes('/svg_output/')) && rel.toLowerCase().endsWith('.svg');
}

function slideContextFromContent(params: Record<string, unknown>, filePath: string, content: unknown, index = 0): Record<string, unknown> {
  const svg = typeof content === 'string' ? content : '';
  const texts = svg ? svgTextNodes(svg) : [];
  const title = sanitizeUserVisibleText(clipOneLine(params.title || texts[0] || `第 ${slideNoFromPath(filePath, params.slide_no) || index + 1} 页`, 80));
  const coreConclusion = clipOneLine(
    params.core_conclusion || params.takeaway || params.conclusion || params.objective || texts.find((x) => x !== title && x.length >= 8) || '',
    140,
  );
  const item: Record<string, unknown> = {
    slide_no: slideNoFromPath(filePath, params.slide_no || params.slideNo) || index + 1,
    file: filePath,
    title,
  };
  if (coreConclusion) item.core_conclusion = sanitizeUserVisibleText(coreConclusion);
  return item;
}

function completedPptSvgSlides(call: SkillCall, result: SkillResult): Array<Record<string, unknown>> {
  if (result.ok === false || call.skill_id !== 'ppt-master') return [];
  const params = (call.params || {}) as Record<string, unknown>;
  if (call.action === 'write_ppt_svg_slide') {
    const file = resultFiles(result).find(isSvgProjectFile) || String(result.file || '');
    if (!file || !isSvgProjectFile(file)) return [];
    return [slideContextFromContent(params, file, params.svg || params.content)];
  }
  if (call.action === 'write_project_file') {
    const file = resultFiles(result).find(isSvgProjectFile) || String(result.file || '');
    const requested = String(params.path || '');
    if (!isSvgProjectFile(file || requested)) return [];
    return [slideContextFromContent(params, file || requested, params.content)];
  }
  if (call.action === 'write_project_files' && Array.isArray(params.files)) {
    const resultSvgFiles = resultFiles(result).filter(isSvgProjectFile);
    let svgIndex = 0;
    return (params.files as Array<Record<string, unknown>>)
      .map((item, index) => {
        const requested = String(item?.path || '');
        if (!isSvgProjectFile(requested)) return undefined;
        const matched = resultSvgFiles.find((file) => fileName(file) === fileName(requested));
        const file = matched || resultSvgFiles[svgIndex++] || requested;
        if (!isSvgProjectFile(file)) return undefined;
        return slideContextFromContent({ ...params, ...item }, file, item?.content, index);
      })
      .filter((item): item is Record<string, unknown> => Boolean(item));
  }
  return [];
}

function compactAssistantOutputForContext(raw: string, call: SkillCall, result: SkillResult): string {
  const slides = completedPptSvgSlides(call, result);
  if (slides.length) {
    return JSON.stringify({
      type: 'completed_deck_state',
      skill_id: call.skill_id,
      action: call.action,
      completed_slides: slides,
      note: 'SVG body omitted after successful write; this is historical state, not an executable skill_call. Continue with the next real skill_call.',
    });
  }
  return compactSkillCallForContext(raw);
}

function compactCallForTrace(call: SkillCall, result?: SkillResult): SkillCall {
  if (result) {
    const slides = completedPptSvgSlides(call, result);
    if (slides.length) {
      return {
        type: 'skill_call',
        skill_id: call.skill_id,
        action: call.action,
        thought: call.thought,
        params: { context_compacted: true, completed_slides: slides },
      };
    }
  }
  const params = call.params && typeof call.params === 'object' ? compactParamsForContext(call.params) : undefined;
  return { ...call, params };
}

function asFinal(obj: Record<string, unknown>): { answer: string; deliverable_files: string[] } | undefined {
  if (obj.type !== 'final') return undefined;
  return {
    answer: typeof obj.answer === 'string' ? obj.answer.trim() : '',
    deliverable_files: Array.isArray(obj.deliverable_files) ? obj.deliverable_files.filter((x): x is string => typeof x === 'string') : [],
  };
}

function fileName(file: string): string {
  const normalized = file.replace(/\\/g, '/');
  try {
    const pathName = /^https?:\/\//i.test(normalized) ? new URL(normalized).pathname : normalized;
    return decodeURIComponent(pathName.split('/').pop() || '') || file;
  } catch {
    return normalized.split('?')[0]?.split('/').pop() || file;
  }
}

function visibleDeliverables(files: string[]): string[] {
  const allowed = new Set(['md', 'svg', 'png', 'pdf', 'ppt', 'pptx', 'html', 'htm']);
  return [...new Set(files)]
    .map((f) => (f.startsWith('generated/') || f.startsWith('projects/') ? `/${f}` : f))
    .filter((f) => f.startsWith('/generated/') || f.startsWith('/projects/') || /^https?:\/\//i.test(f))
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

function projectSvgOutputFiles(projectPath: string): string[] {
  const project = projectPath.replace(/\\/g, '/').replace(/^\/+/, '');
  if (!project) return [];
  const root = path.resolve(AI_HELPER_ROOT, project);
  if (!root.startsWith(path.resolve(AI_HELPER_ROOT))) return [];
  const svgDir = path.join(root, 'svg_output');
  if (!fs.existsSync(svgDir)) return [];
  return fs.readdirSync(svgDir)
    .filter((name) => name.toLowerCase().endsWith('.svg'))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }))
    .map((name) => `/${project}/svg_output/${name}`);
}

function safeProjectRoot(projectPath: string): string {
  const project = projectPath.replace(/\\/g, '/').replace(/^\/+/, '');
  const root = path.resolve(AI_HELPER_ROOT, project);
  if (!project || !root.startsWith(path.resolve(AI_HELPER_ROOT))) throw new Error('invalid ppt project path');
  return root;
}

function successfulPptSvgSlideFiles(trace: AgentDonePayload['trace']): string[] {
  const files: string[] = [];
  for (const entry of trace) files.push(...resultFiles(entry.result).filter(isSvgProjectFile));
  return [...new Set(files)];
}

function hasSuccessfulBootstrap(trace: AgentDonePayload['trace']): boolean {
  return trace.some((entry) => entry.call?.skill_id === 'ppt-master' && entry.call.action === 'ppt_master_bootstrap' && entry.result?.ok !== false);
}

function hasPremiumDesignBundle(trace: AgentDonePayload['trace']): boolean {
  const names = new Set(collectFiles(trace).map(fileName));
  return names.has('design_spec.md') && names.has('spec_lock.md') && names.has('total.md');
}

function projectRelPathFromParam(value: unknown): string {
  return String(value || '').replace(/\\/g, '/').replace(/^\/+/, '');
}

function callProjectFilePaths(call: SkillCall): string[] {
  const params = (call.params || {}) as Record<string, unknown>;
  if (call.action === 'write_project_file') return [projectRelPathFromParam(params.path)];
  if (call.action === 'write_project_files' && Array.isArray(params.files)) {
    return params.files.map((item) => projectRelPathFromParam((item && typeof item === 'object' ? item as Record<string, unknown> : {}).path));
  }
  return [];
}

function pathIsNotesTotal(pathValue: string): boolean {
  const normalized = pathValue.replace(/\\/g, '/').replace(/^\/+/, '');
  return normalized === 'notes/total.md' || fileName(normalized).toLowerCase() === 'total.md';
}

function callWritesPremiumDesignBundle(call: SkillCall): boolean {
  if (call.skill_id !== 'ppt-master' || call.action !== 'write_project_files') return false;
  const paths = callProjectFilePaths(call);
  return paths.some((p) => fileName(p) === 'design_spec.md')
    && paths.some((p) => fileName(p) === 'spec_lock.md')
    && paths.some(pathIsNotesTotal)
    && !paths.some(isSvgProjectFile);
}

function callWritesSvgFileDirectly(call: SkillCall): boolean {
  if (call.skill_id !== 'ppt-master') return false;
  if (call.action === 'write_ppt_svg_slide') return false;
  return callProjectFilePaths(call).some(isSvgProjectFile);
}

function premiumPptStageInstruction(call: SkillCall, trace: AgentDonePayload['trace']): string | undefined {
  if (call.skill_id !== 'ppt-master') return undefined;
  if (call.action === 'emit_text') return undefined;
  const bootstrapped = hasSuccessfulBootstrap(trace);
  if (!bootstrapped && call.action !== 'ppt_master_bootstrap') {
    return [
      'PPT_PREMIUM_STAGE_ORDER:',
      '当前是 PPT 精美版。emit_text 后必须先调用 ppt-master.ppt_master_bootstrap 新建项目。',
      '请只输出 ppt_master_bootstrap 的 skill_call。',
    ].join('\n');
  }

  if (bootstrapped && !hasPremiumDesignBundle(trace)) {
    if (callWritesPremiumDesignBundle(call)) return undefined;
    return [
      'PPT_PREMIUM_DESIGN_BUNDLE_REQUIRED:',
      '项目已创建。下一步必须只调用 ppt-master.write_project_files，一次写入 design_spec.md、spec_lock.md、notes/total.md 三个文件。',
      '不要在这个步骤写 SVG，也不要调用 write_ppt_svg_slide 或 ppt_master_export。',
      'design_spec.md 写统一视觉主题、色彩、字体层级、卡片和图表风格；spec_lock.md 写 1280×720、安全字体 Microsoft YaHei, Arial, sans-serif、禁止 foreignObject/script/style/外链；notes/total.md 可先写每页占位讲稿。',
      '只输出一个 JSON 对象。',
    ].join('\n');
  }

  if (callWritesSvgFileDirectly(call)) {
    return [
      'PPT_PREMIUM_USE_NARROW_SVG_ACTION:',
      '精美版每页 SVG 必须使用 ppt-master.write_ppt_svg_slide 写入，不能用 write_project_file/write_project_files 直接写 svg_output 文件。',
      '请改为 write_ppt_svg_slide，并包含 project_path、slide_no、title、core_conclusion、svg。',
    ].join('\n');
  }

  if (call.action === 'ppt_master_export' && successfulPptSvgSlideFiles(trace).length < 6) {
    return [
      'PPT_PREMIUM_EXPORT_TOO_EARLY:',
      `当前仅成功生成 ${successfulPptSvgSlideFiles(trace).length} 页 SVG，精美版至少需要 6 页后才能导出。`,
      '请继续用 write_ppt_svg_slide 逐页生成缺失页面；每次只写 1 页。',
    ].join('\n');
  }

  return undefined;
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
  is_explicit_date_range?: boolean;
  label: string;
  intended_use: string;
  granularity: NonNullable<PrefetchMetricsParams['granularity']>;
  dateRange?: DateRange;
  compareRange?: DateRange;
  params: PrefetchMetricsParams;
}

function asShortcut(value: unknown): AiShortcut | undefined {
  return value === 'overview' || value === 'monthly' || value === 'ppt' || value === 'ppt_svg' || value === 'data_qa' ? value : undefined;
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

type IntentTask = 'data_qa' | 'overview' | 'monthly' | 'ppt' | 'ppt_edit' | 'chat';
type IntentPptMode = 'fast' | 'premium' | 'unspecified';

interface AssistantIntent {
  task: IntentTask;
  ppt_mode: IntentPptMode;
  confidence: number;
  is_followup: boolean;
  is_modification: boolean;
  date_range?: DateRange;
  compare_range?: DateRange;
  date_label?: string;
  granularity?: NonNullable<PrefetchMetricsParams['granularity']>;
  reason?: string;
}

function asIntentTask(value: unknown): IntentTask {
  return value === 'data_qa' || value === 'overview' || value === 'monthly' || value === 'ppt' || value === 'ppt_edit' || value === 'chat' ? value : 'chat';
}

function asIntentPptMode(value: unknown): IntentPptMode {
  return value === 'fast' || value === 'premium' || value === 'unspecified' ? value : 'unspecified';
}

function normalizeConfidence(value: unknown): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

function asGranularity(value: unknown): NonNullable<PrefetchMetricsParams['granularity']> | undefined {
  return value === 'day' || value === 'week' || value === 'month' ? value : undefined;
}

function normalizeDateRangeValue(value: unknown): DateRange | undefined {
  const item = obj(value);
  const start = typeof item.start === 'string' ? item.start.trim() : '';
  const end = typeof item.end === 'string' ? item.end.trim() : '';
  if (!start || !end) return undefined;
  const s = parseIsoDate(start);
  const e = parseIsoDate(end);
  if (!s || !e || s.getTime() > e.getTime()) return undefined;
  return { start: fmtDate(s), end: fmtDate(e) };
}

function shortcutFromIntent(intent: AssistantIntent | undefined): AiShortcut | undefined {
  if (!intent || intent.confidence < 0.7) return undefined;
  if (intent.task === 'data_qa') return 'data_qa';
  if (intent.task === 'overview') return 'overview';
  if (intent.task === 'monthly') return 'monthly';
  if (intent.task !== 'ppt' && intent.task !== 'ppt_edit') return undefined;
  return intent.ppt_mode === 'premium' ? 'ppt_svg' : 'ppt';
}

function contextAwarePptEditFallbackIntentFromText(req: RunRequest): AssistantIntent | undefined {
  const text = `${req.message || ''}\n${req.command || ''}`.replace(/\s+/g, '');
  if (!text) return undefined;
  const looksLikeContextEdit = /(不喜欢|不好看|不满意|太丑|换一个|重画|重做|重新画|改一下|调整|优化|替换|换风格|换版式|显示不全)/.test(text)
    && /(这个|这页|页面|封面|上一|上个|刚才|刚刚|前面|当前|这版|那版|第\d{1,2}页|第[一二三四五六七八九十]+页)/.test(text);
  if (!looksLikeContextEdit) return undefined;

  const history = normalizedHistory(req);
  const active = latestActivePptContext(req);
  const historyFiles = history.flatMap((item) => item.files || []);
  const historyText = history.map((item) => item.text).join('\n');
  const hasPptContext = Boolean(active)
    || historyFiles.some((file) => /(?:\/projects\/.*\/svg_output\/.*\.svg|\.pptx(?:$|\?)|_svg\.pptx(?:$|\?))/i.test(file))
    || /(PPT|ppt|幻灯片|演示文稿|汇报材料|可编辑PPT|可编辑的PPT|SVG页面|高精度SVG|逐页设计|页面大纲|第\s*\d{1,2}\s*页|封面)/.test(historyText);
  if (!hasPptContext) return undefined;

  const isPremium = Boolean(active?.slides.some((slide) => slide.svgPath || slide.assetUrl))
    || historyFiles.some((file) => /\/svg_output\/.*\.svg/i.test(file))
    || /(精美版|高精度SVG|SVG页面|逐页设计|视觉完成度|深色科技感)/.test(historyText);
  return {
    task: 'ppt_edit',
    ppt_mode: isPremium ? 'premium' : 'fast',
    confidence: 0.98,
    is_followup: true,
    is_modification: true,
    reason: '规则兜底：上下文PPT页面修改',
  };
}

function routeLabel(shortcut?: AiShortcut): string | undefined {
  if (shortcut === 'data_qa') return '数据问答';
  if (shortcut === 'overview') return '数据概览';
  if (shortcut === 'monthly') return '月度报告';
  if (shortcut === 'ppt') return 'PPT 快速版';
  if (shortcut === 'ppt_svg') return 'PPT 精美版';
  return undefined;
}

function strongFallbackIntentFromText(req: RunRequest): AssistantIntent | undefined {
  const text = `${req.message || ''}\n${req.command || ''}`.replace(/\s+/g, '');
  if (!text) return undefined;
  const wantsDeliverable = /(生成|制作|创建|导出|写|出|做|给我|我要|帮我)/.test(text);
  if (wantsDeliverable && /(月报|月度报告|自然月复盘报告|月度复盘报告)/.test(text)) {
    return {
      task: 'monthly',
      ppt_mode: 'unspecified',
      confidence: 0.95,
      is_followup: false,
      is_modification: false,
      reason: '规则兜底：明确月报交付',
    };
  }
  if (wantsDeliverable && /(数据概览|运营概览|KPI概览|dashboard|Dashboard|看板|概览报告)/.test(text)) {
    return {
      task: 'overview',
      ppt_mode: 'unspecified',
      confidence: 0.95,
      is_followup: false,
      is_modification: false,
      reason: '规则兜底：明确概览交付',
    };
  }
  if (wantsDeliverable && /(PPT|ppt|幻灯片|演示文稿|汇报材料)/.test(text) && !/(修改|调整|替换|重画|优化|改第|显示不全|上一份|刚才)/.test(text)) {
    return {
      task: 'ppt',
      ppt_mode: /精美|高级|高质量|视觉|SVG|svg/.test(text) ? 'premium' : 'fast',
      confidence: 0.9,
      is_followup: false,
      is_modification: false,
      reason: '规则兜底：明确PPT交付',
    };
  }
  return undefined;
}

async function classifyAssistantIntent(req: RunRequest, rootDir: string, signal?: AbortSignal): Promise<AssistantIntent | undefined> {
  const userText = (req.message || req.command || '').trim();
  if (!userText) return undefined;
  const previousTurn = historyTurnForPrompt(req, 900);
  const today = new Date().toISOString().slice(0, 10);
  const ai = new AIService({
    model: process.env.AI_HELPER_INTENT_MODEL || 'qwen3.7-max',
    timeoutMs: Math.max(8_000, Math.min(30_000, Number(process.env.AI_HELPER_INTENT_TIMEOUT_MS || 15_000) || 15_000)),
  });
  const messages: ChatMessage[] = [
    {
      role: 'system',
      content: [
        '你是 PX 医疗患教数据助手的意图分类器，只做路由判断。',
        '只输出一个 JSON 对象，不要 Markdown，不要解释文字。',
        'task 只能是 data_qa、overview、monthly、ppt、ppt_edit、chat。',
        'ppt_mode 只能是 fast、premium、unspecified；只有 task=ppt 或 ppt_edit 时才有意义。',
        'is_followup 必须是 boolean，判断本轮是否依赖上一轮上下文。',
        'is_modification 必须是 boolean，判断本轮是否在修改已有 PPT/报告/文件；不要细分修改类型。',
        '如果用户明确指定时间范围（如 2月份、上个月、本月、最近14天、2月1日到2月20日、2026年Q1），必须输出 date_range={start,end}；未指定则为 null。',
        '如果用户请求月报且有 date_range，compare_range 应输出上一自然月或紧邻等长对比周期；其他任务只有用户明确要求对比时才输出 compare_range。',
        `省略年份时按当前日期 ${today} 推断最近的历史周期；日期必须是 YYYY-MM-DD。`,
        'granularity 只能是 day、week、month；短周期/概览用 day，月报默认 week，长趋势可用 month。',
        '不要输出 tenantId、userId、底层查询或底层字段；只输出可由后端安全执行的结构化时间参数。',
        '分类标准：',
        '- data_qa：询问具体数据、指标变化、趋势表现、指标口径、数据来源、数据项含义、为什么为空/为 0、互动数怎么算等，只需文字回答；例如“本月数据有什么变化”应归为 data_qa。',
        '- overview：明确请求生成数据概览、dashboard、看板、KPI overview 等概览交付物。',
        '- monthly：明确请求生成月报、月度报告、按自然月复盘报告等报告交付物。',
        '- 如果用户只是问“本月/最近数据有什么变化、表现如何、趋势怎样”，没有说生成概览/月报/PPT/文件，归为 data_qa，不要归为 overview 或 monthly。',
        '- ppt：请求生成 PPT、幻灯片、演示文稿、汇报材料等文件交付。',
        '- ppt_edit：修改、调整、替换、重画、优化上一轮或已有 PPT，例如改第几页、改封面、文字显示不全、换风格、删元素、基于刚才那份 PPT 继续改。',
        '- chat：其他闲聊或无法判断。',
        'PPT 模式判断：',
        '- fast：用户明确要快速、稳定、简单版，或只说生成 PPT 但未指定视觉要求。',
        '- premium：用户明确想要更高视觉完成度、更精致设计、逐页精修、直接 SVG 设计等。',
        '- unspecified：确定是 PPT，但无法判断快版或精美版；后端会默认快速版。',
        '追问判断：',
        '- is_followup=true：只有 task=ppt_edit 且必须依赖 previous_turn/上一份 PPT 才能完成时为 true。',
        '- is_followup=false：新生成概览、月报、PPT 或普通数据问答，即使 previous_turn 存在也不要复用。',
        '- is_modification=true：task=ppt_edit 时必须为 true；其他 task 默认 false。',
        '低把握时降低 confidence，不要强行分类。',
      ].join('\n'),
    },
    {
      role: 'user',
      content: JSON.stringify({
        user_request: userText,
        previous_turn: previousTurn,
        current_date: today,
        output_schema: {
          task: 'data_qa|overview|monthly|ppt|ppt_edit|chat',
          ppt_mode: 'fast|premium|unspecified',
          confidence: '0~1 number',
          is_followup: 'boolean',
          is_modification: 'boolean',
          date_range: { start: 'YYYY-MM-DD', end: 'YYYY-MM-DD' },
          compare_range: { start: 'YYYY-MM-DD', end: 'YYYY-MM-DD' },
          date_label: '例如 2026年2月 / 最近14天；无则 null',
          granularity: 'day|week|month|null',
          reason: '不超过30字',
        },
      }, null, 2),
    },
  ];
  const started = Date.now();
  runtimeLog('model_start', { step: 'intent_classification', rootDir, model: ai.modelName(), messages, ...requestLog(req) });
  try {
    const result = await ai.chatDetailed(messages, signal);
    const duration = Date.now() - started;
    runtimeLog('model_end', { step: 'intent_classification', rootDir, duration_ms: duration, output: result.text, raw_response: result.rawResponse, request: result.request, cache_usage: result.cacheUsage, ...requestLog(req) });
    modelIoLog({
      step: 0,
      rootDir,
      model: ai.modelName(),
      duration_ms: duration,
      messages,
      output: result.text,
      request: result.request,
      meta: { ...requestLog(req), direct_pipeline: 'intent_classification' },
      cache_usage: result.cacheUsage,
      recovered_from_reasoning_content: result.recoveredFromReasoningContent,
    });
    const parsed = SkillExecutor.parseJsonObject(result.text);
    if (!parsed) return undefined;
    const dateRange = normalizeDateRangeValue(parsed.date_range ?? parsed.dateRange);
    const compareRange = normalizeDateRangeValue(parsed.compare_range ?? parsed.compareRange);
    return {
      task: asIntentTask(parsed.task),
      ppt_mode: asIntentPptMode(parsed.ppt_mode),
      confidence: normalizeConfidence(parsed.confidence),
      is_followup: parsed.is_followup === true,
      is_modification: parsed.is_modification === true,
      date_range: dateRange,
      compare_range: compareRange,
      date_label: typeof parsed.date_label === 'string' ? parsed.date_label.slice(0, 40) : undefined,
      granularity: asGranularity(parsed.granularity),
      reason: typeof parsed.reason === 'string' ? parsed.reason.slice(0, 80) : undefined,
    };
  } catch (err) {
    if (isAbortError(err)) throw err;
    const duration = Date.now() - started;
    runtimeLog('model_error', { step: 'intent_classification', rootDir, duration_ms: duration, error: modelErrorLog(err), fallback_to_general: true, ...requestLog(req) });
    modelIoLog({
      step: 0,
      rootDir,
      model: ai.modelName(),
      duration_ms: duration,
      messages,
      error: modelErrorLog(err),
      meta: { ...requestLog(req), direct_pipeline: 'intent_classification', fallback_to_general: true },
    });
    return undefined;
  }
}

function parseIsoDate(value: string): Date | undefined {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return undefined;
  const [y, m, d] = value.split('-').map(Number);
  const parsed = new Date(Date.UTC(y, m - 1, d));
  if (parsed.getUTCFullYear() !== y || parsed.getUTCMonth() !== m - 1 || parsed.getUTCDate() !== d) return undefined;
  return parsed;
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

function daysInclusive(value: DateRange): number {
  const start = parseIsoDate(value.start);
  const end = parseIsoDate(value.end);
  if (!start || !end) return 0;
  return Math.max(1, Math.round((end.getTime() - start.getTime()) / 86_400_000) + 1);
}

function isFullCalendarMonth(value: DateRange): boolean {
  const start = parseIsoDate(value.start);
  const end = parseIsoDate(value.end);
  return Boolean(start && end && sameDay(start, startOfMonth(start)) && sameDay(end, endOfMonth(start)));
}

function previousComparableRange(value: DateRange): DateRange | undefined {
  const start = parseIsoDate(value.start);
  const end = parseIsoDate(value.end);
  if (!start || !end) return undefined;
  if (isFullCalendarMonth(value)) {
    const compareEnd = addDays(start, -1);
    return range(startOfMonth(compareEnd), compareEnd);
  }
  const days = daysInclusive(value);
  const compareEnd = addDays(start, -1);
  return range(addDays(compareEnd, -(days - 1)), compareEnd);
}

function monthRange(year: number, month1: number): DateRange | undefined {
  if (!Number.isInteger(year) || !Number.isInteger(month1) || month1 < 1 || month1 > 12) return undefined;
  const start = new Date(Date.UTC(year, month1 - 1, 1));
  return range(start, endOfMonth(start));
}

function quarterRange(year: number, quarter: number): DateRange | undefined {
  if (!Number.isInteger(year) || !Number.isInteger(quarter) || quarter < 1 || quarter > 4) return undefined;
  const start = new Date(Date.UTC(year, (quarter - 1) * 3, 1));
  const end = endOfMonth(new Date(Date.UTC(year, quarter * 3 - 1, 1)));
  return range(start, end);
}

function inferYearForMonth(month1: number, anchor: Date): number {
  const anchorYear = anchor.getUTCFullYear();
  const anchorMonth = anchor.getUTCMonth() + 1;
  return month1 > anchorMonth ? anchorYear - 1 : anchorYear;
}

function parseMonthToken(value: string): number | undefined {
  const raw = value.trim();
  if (/^\d{1,2}$/.test(raw)) {
    const n = Number(raw);
    return n >= 1 && n <= 12 ? n : undefined;
  }
  const map: Record<string, number> = {
    一: 1,
    二: 2,
    两: 2,
    三: 3,
    四: 4,
    五: 5,
    六: 6,
    七: 7,
    八: 8,
    九: 9,
    十: 10,
    十一: 11,
    十二: 12,
    正: 1,
    腊: 12,
  };
  return map[raw];
}

function parseDayToken(value: string): number | undefined {
  const raw = value.trim();
  if (/^\d{1,2}$/.test(raw)) {
    const n = Number(raw);
    return n >= 1 && n <= 31 ? n : undefined;
  }
  const digit: Record<string, number> = { 一: 1, 二: 2, 两: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9 };
  if (digit[raw]) return digit[raw];
  if (raw === '十') return 10;
  let match = raw.match(/^十([一二三四五六七八九])$/);
  if (match) return 10 + digit[match[1]];
  match = raw.match(/^([一二三])十([一二三四五六七八九])?$/);
  if (match) return digit[match[1]] * 10 + (match[2] ? digit[match[2]] : 0);
  return undefined;
}

function dateFromParts(year: number, month1: number, day: number): Date | undefined {
  if (!Number.isInteger(year) || !Number.isInteger(month1) || !Number.isInteger(day)) return undefined;
  const iso = `${String(year).padStart(4, '0')}-${String(month1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  return parseIsoDate(iso);
}

function labelForRange(dateRange: DateRange, fallback = '用户指定周期'): string {
  if (isFullCalendarMonth(dateRange)) {
    const start = parseIsoDate(dateRange.start);
    if (start) return `${start.getUTCFullYear()}年${start.getUTCMonth() + 1}月`;
  }
  return dateRange.start === dateRange.end ? dateRange.start : `${dateRange.start} 至 ${dateRange.end}`;
}

function cleanDateLabel(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim().slice(0, 60) : undefined;
}

function findExplicitDateScope(req: RunRequest, anchorDate: Date): { dateRange: DateRange; compareRange?: DateRange; dateLabel?: string; granularity?: NonNullable<PrefetchMetricsParams['granularity']> } | undefined {
  const rawReq = obj(req);
  const directRange = normalizeDateRangeValue(req.date_range ?? rawReq.dateRange);
  const directCompare = normalizeDateRangeValue(req.compare_range ?? rawReq.compareRange);
  if (directRange) {
    return {
      dateRange: directRange,
      compareRange: directCompare,
      dateLabel: cleanDateLabel(req.date_label ?? rawReq.dateLabel) || labelForRange(directRange),
      granularity: asGranularity(req.granularity),
    };
  }

  const text = `${req.message || ''}\n${req.command || ''}`.trim();
  if (!text) return undefined;
  const normalized = text.replace(/[－—–~～]/g, '-').replace(/\s+/g, '');
  const anchorYear = anchorDate.getUTCFullYear();
  const anchorMonth = anchorDate.getUTCMonth() + 1;

  let match = normalized.match(/(\d{4})[-/.年](\d{1,2})[-/.月](\d{1,2})日?(?:到|至|--?|—|－|~|～)(\d{4})[-/.年](\d{1,2})[-/.月](\d{1,2})日?/);
  if (match) {
    const start = dateFromParts(Number(match[1]), Number(match[2]), Number(match[3]));
    const end = dateFromParts(Number(match[4]), Number(match[5]), Number(match[6]));
    if (start && end && start <= end) {
      const dateRange = range(start, end);
      return { dateRange, dateLabel: labelForRange(dateRange), granularity: 'day' };
    }
  }

  match = normalized.match(/(\d{1,2})月(\d{1,2})日?(?:到|至|--?|—|－|~|～)(\d{1,2})月(\d{1,2})日?/);
  if (match) {
    const startMonth = Number(match[1]);
    const endMonth = Number(match[3]);
    const startYear = inferYearForMonth(startMonth, anchorDate);
    const endYear = endMonth < startMonth ? startYear + 1 : startYear;
    const start = dateFromParts(startYear, startMonth, Number(match[2]));
    const end = dateFromParts(endYear, endMonth, Number(match[4]));
    if (start && end && start <= end) {
      const dateRange = range(start, end);
      return { dateRange, dateLabel: labelForRange(dateRange), granularity: 'day' };
    }
  }

  match = normalized.match(/(\d{4})年(\d{1,2})月(\d{1,2})日?(?:到|至|--?|—|－|~|～)(\d{1,2})日?/);
  if (match) {
    const year = Number(match[1]);
    const month1 = Number(match[2]);
    const start = dateFromParts(year, month1, Number(match[3]));
    const end = dateFromParts(year, month1, Number(match[4]));
    if (start && end && start <= end) {
      const dateRange = range(start, end);
      return { dateRange, dateLabel: labelForRange(dateRange), granularity: 'day' };
    }
  }

  match = normalized.match(/(\d{4})[-/.年](\d{1,2})[-/.月](\d{1,2})日?/);
  if (match) {
    const day = dateFromParts(Number(match[1]), Number(match[2]), Number(match[3]));
    if (day) {
      const dateRange = range(day, day);
      return { dateRange, dateLabel: labelForRange(dateRange), granularity: 'day' };
    }
  }

  match = normalized.match(/(\d{4})年?Q([1-4])|(\d{4})年?第?([一二三四1234])季度/);
  if (match) {
    const year = Number(match[1] || match[3]);
    const quarter = Number(match[2] || parseMonthToken(match[4]));
    const dateRange = quarterRange(year, quarter);
    if (dateRange) return { dateRange, compareRange: previousComparableRange(dateRange), dateLabel: `${year}年Q${quarter}`, granularity: 'month' };
  }

  match = normalized.match(/今年第?([一二三四1234])季度|今年Q([1-4])/);
  if (match) {
    const quarter = Number(match[2] || parseMonthToken(match[1]));
    const dateRange = quarterRange(anchorYear, quarter);
    if (dateRange) return { dateRange, compareRange: previousComparableRange(dateRange), dateLabel: `${anchorYear}年Q${quarter}`, granularity: 'month' };
  }

  match = normalized.match(/(\d{1,2})月(\d{1,2})日/);
  if (match) {
    const month1 = Number(match[1]);
    const year = inferYearForMonth(month1, anchorDate);
    const day = dateFromParts(year, month1, Number(match[2]));
    if (day) {
      const dateRange = range(day, day);
      return { dateRange, dateLabel: labelForRange(dateRange), granularity: 'day' };
    }
  }

  match = normalized.match(/(\d{4})[-/.年](\d{1,2})(?:月)?(?![\d-/.])(?:份|月报|月度报告|数据概览|概览|数据|报告)?/);
  if (match) {
    const dateRange = monthRange(Number(match[1]), Number(match[2]));
    if (dateRange) return { dateRange, compareRange: previousComparableRange(dateRange), dateLabel: labelForRange(dateRange), granularity: 'week' };
  }

  match = normalized.match(/([0-9一二两三四五六七八九十]{1,3})月(?:份)?(?:的)?(?:月报|月度报告|数据概览|概览|数据|报告|复盘)?/);
  if (match) {
    const month1 = parseMonthToken(match[1]);
    if (month1) {
      const dateRange = monthRange(inferYearForMonth(month1, anchorDate), month1);
      if (dateRange) return { dateRange, compareRange: previousComparableRange(dateRange), dateLabel: labelForRange(dateRange), granularity: 'week' };
    }
  }

  match = normalized.match(/最近|近|过去/);
  if (match) {
    const recent = normalized.match(/(?:最近|近|过去)(\d{1,3})(天|日|周|星期|个月|月)/);
    if (recent) {
      const amount = Math.max(1, Math.min(400, Number(recent[1])));
      const unit = recent[2];
      if (unit === '天' || unit === '日') {
        const dateRange = range(addDays(anchorDate, -(amount - 1)), anchorDate);
        return { dateRange, dateLabel: `最近${amount}天`, granularity: 'day' };
      }
      if (unit === '周' || unit === '星期') {
        const days = amount * 7;
        const dateRange = range(addDays(anchorDate, -(days - 1)), anchorDate);
        return { dateRange, dateLabel: `最近${amount}周`, granularity: 'day' };
      }
      if (unit === '个月' || unit === '月') {
        const start = startOfMonth(new Date(Date.UTC(anchorYear, anchorMonth - amount, 1)));
        const dateRange = range(start, anchorDate);
        return { dateRange, dateLabel: `最近${amount}个月`, granularity: amount > 3 ? 'month' : 'week' };
      }
    }
  }

  if (/上上个月|上上月/.test(normalized)) {
    const end = endOfMonth(new Date(Date.UTC(anchorYear, anchorMonth - 3, 1)));
    const dateRange = range(startOfMonth(end), end);
    return { dateRange, compareRange: previousComparableRange(dateRange), dateLabel: labelForRange(dateRange), granularity: 'week' };
  }
  if (/上个月|上月/.test(normalized)) {
    const end = endOfMonth(new Date(Date.UTC(anchorYear, anchorMonth - 2, 1)));
    const dateRange = range(startOfMonth(end), end);
    return { dateRange, compareRange: previousComparableRange(dateRange), dateLabel: labelForRange(dateRange), granularity: 'week' };
  }
  if (/本月|这个月|当月/.test(normalized)) {
    const dateRange = range(startOfMonth(anchorDate), anchorDate);
    return { dateRange, compareRange: previousComparableRange(dateRange), dateLabel: `${anchorYear}年${anchorMonth}月`, granularity: 'week' };
  }

  return undefined;
}

function explicitLimitForRange(dateRange: DateRange, granularity: NonNullable<PrefetchMetricsParams['granularity']>): number {
  const days = daysInclusive(dateRange);
  if (granularity === 'month') return Math.max(12, Math.min(60, Math.ceil(days / 28) + 4));
  if (granularity === 'week') return Math.max(12, Math.min(120, Math.ceil(days / 7) + 8));
  return Math.max(14, Math.min(800, days + 10));
}

function recentOneMonthRange(anchorIso?: string): DateRange {
  const anchor = parseIsoDate(String(anchorIso || '').slice(0, 10)) || parseIsoDate(new Date().toISOString().slice(0, 10))!;
  return range(addDays(anchor, -29), anchor);
}

function resolvePrimaryDataScope(req: RunRequest, latestMetricDate: string): PrimaryDataScope {
  const shortcut = asShortcut(req.shortcut);
  const dataScope = asDataScope(req.data_scope) || defaultDataScope(shortcut);
  const latest = parseIsoDate(latestMetricDate) || parseIsoDate(new Date().toISOString().slice(0, 10));

  if (latest) {
    const explicit = findExplicitDateScope(req, latest);
    if (explicit) {
      const shouldCompare = shortcut === 'monthly' || dataScope === 'latest_complete_month';
      const compareRange = explicit.compareRange || (shouldCompare ? previousComparableRange(explicit.dateRange) : undefined);
      const granularity = explicit.granularity
        || asGranularity(req.granularity)
        || (shortcut === 'monthly' ? 'week' : isPptShortcut(shortcut) && daysInclusive(explicit.dateRange) > 120 ? 'month' : 'day');
      const label = explicit.dateLabel || labelForRange(explicit.dateRange);
      const params: PrefetchMetricsParams = {
        dateRange: explicit.dateRange,
        ...(compareRange ? { compareRange } : {}),
        granularity,
        limit: explicitLimitForRange(explicit.dateRange, granularity),
        purpose: `用户指定数据周期：${label}`,
      };
      return {
        shortcut,
        data_scope: dataScope,
        is_explicit_date_range: true,
        label,
        intended_use: '按用户自然语言指定的时间范围聚合本轮主数据',
        granularity,
        dateRange: explicit.dateRange,
        compareRange,
        params,
      };
    }
  }

  if (!dataScope || !latest) {
    return {
      shortcut,
      data_scope: dataScope,
      label: latest ? '默认全局数据' : '当前暂无可用统计日期',
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
    intended_use: '生成患教运营 PPT 的趋势背景与关键结论',
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
      note: 'coreKpi/monthlyTrend/topContent/projects are complete metric aggregates for the requested range; dailyTrend is compacted for model context.',
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
      note: '月报默认只注入写作必需的本期 KPI、对比期核心 KPI、环比、周度节奏、项目/内容精简排名；完整日趋势和完整排名见 available_metric_stores。',
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
      note: 'PPT 默认注入周期月趋势、TOP 项目/内容和重点观察期摘要；完整日趋势和完整排名见 available_metric_stores。',
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

function tenantScopedParams(params: PrefetchMetricsParams = {}, enforcedTenantId?: string): PrefetchMetricsParams {
  return enforcedTenantId ? { ...params, tenantId: enforcedTenantId } : params;
}

async function buildPrimaryDataContext(req: RunRequest, rootDir: string, enforcedTenantId?: string): Promise<Record<string, unknown>> {
  const defaultMetrics = await prefetchMetrics(tenantScopedParams({}, enforcedTenantId));
  const scope = resolvePrimaryDataScope(req, defaultMetrics.range.end);
  const primaryMetrics = scope.params.dateRange ? await prefetchMetrics(tenantScopedParams(scope.params, enforcedTenantId)) : defaultMetrics;
  const supplemental: Record<string, unknown> = {};
  const storeGroups: Array<{ prefix: string; label: string; metrics: PrefetchMetrics }> = [
    { prefix: 'primary', label: '主数据', metrics: primaryMetrics },
  ];

  if (scope.data_scope === 'latest_complete_month' && scope.compareRange) {
    const previousMetrics = await prefetchMetrics(tenantScopedParams({
      dateRange: scope.compareRange,
      granularity: 'week',
      limit: 40,
      purpose: '月报环比对比',
    }, enforcedTenantId));
    supplemental.previous_period = {
      label: '前一个完整自然月',
      dateRange: scope.compareRange,
      metrics: compactMetricsForContext(previousMetrics),
    };
    storeGroups.push({ prefix: 'previous_period', label: '前一个完整自然月', metrics: previousMetrics });
  }

  const latest = parseIsoDate(defaultMetrics.range.end);
  if (scope.data_scope === 'last_1_year' && latest && !scope.is_explicit_date_range) {
    const recent30 = range(addDays(latest, -29), latest);
    const previous30 = range(addDays(latest, -59), addDays(latest, -30));
    const recent30Label = directPptRangeLabel(recent30, '重点观察期');
    const previous30Label = directPptRangeLabel(previous30, '对比观察期');
    const recent30Metrics = await prefetchMetrics(tenantScopedParams({
      dateRange: recent30,
      granularity: 'day',
      limit: 40,
      purpose: `PPT 核心结论重点观察期数据：${recent30Label}`,
    }, enforcedTenantId));
    const previous30Metrics = await prefetchMetrics(tenantScopedParams({
      dateRange: previous30,
      granularity: 'day',
      limit: 40,
      purpose: `PPT 核心结论对比观察期数据：${previous30Label}`,
    }, enforcedTenantId));
    supplemental.recent_30_days = {
      label: recent30Label,
      dateRange: recent30,
      metrics: compactMetricsForContext(recent30Metrics),
    };
    supplemental.previous_30_days = {
      label: previous30Label,
      dateRange: previous30,
      metrics: compactMetricsForContext(previous30Metrics),
    };
    storeGroups.push({ prefix: 'recent_30_days', label: recent30Label, metrics: recent30Metrics });
    storeGroups.push({ prefix: 'previous_30_days', label: previous30Label, metrics: previous30Metrics });
  }

  const stores = writeMetricStores(rootDir, storeGroups);
  const shortcut = asShortcut(req.shortcut);
  return {
    scope: {
      shortcut: scope.shortcut,
      data_scope: scope.data_scope,
      is_explicit_date_range: scope.is_explicit_date_range,
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

async function buildMessages(
  req: RunRequest,
  rootDir: string,
  registry: SkillRegistry,
  executor: SkillExecutor,
  options: { includePreviousTurn?: boolean; enforcedTenantId?: string } = {},
): Promise<{ messages: ChatMessage[]; initialSkills: string[]; primaryDataContext: Record<string, unknown> }> {
  const userText = (req.message || req.command || '').trim() || '请根据我的需求完成分析并交付。';
  const primaryDataContext = await buildPrimaryDataContext(req, rootDir, options.enforcedTenantId);
  const catalog = registry.buildPromptContext();
  const primaryDataStr = `primary_data_context（本轮快捷入口默认主数据；可按需调用 px-data 补取）：\n${JSON.stringify(primaryDataContext, null, 2)}`;
  const actionSpecMode = actionSpecModeForRequest(req);

  // 缓存分两层前缀：
  //  breakpoint 1 → SYSTEM_PROMPT（跨 run 稳定）
  //  breakpoint 2 → primary_data_context（同 run 内稳定，体积最大）
  const messages: ChatMessage[] = [
    { role: 'system', content: withCacheControl(SYSTEM_PROMPT) },
    { role: 'system', content: `协议与动作说明: ${JSON.stringify(executor.actionSpec({ mode: actionSpecMode }))}` },
    { role: 'system', content: `本轮交付根目录：${rootDir}\n所有 generated 交付文件必须落在该目录下。` },
    { role: 'system', content: withCacheControl(primaryDataStr) },
  ];
  for (const prompt of taskPromptAdditionsForRequest(req)) {
    if (prompt.trim()) messages.push({ role: 'system', content: prompt });
  }
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
    messages.push({ role: 'system', content: '运行时硬约束：shortcut=ppt_svg，必须使用 PPT 精美版直接 SVG 逐页设计链路；不要调用 render_ppt_from_specs。' });
  }
  if (catalog) messages.push({ role: 'system', content: catalog });
  const history = options.includePreviousTurn ? previousHistoryTurn(req) : [];
  if (history.length) {
    messages.push({
      role: 'system',
      content: [
        '以下仅为上一轮对话上下文，因为意图识别已判断本轮是追问/修改/继续。',
        '只用于理解省略指代、复用上一轮文件/结论/风格；不要重复执行上一轮任务，除非用户明确要求继续或修改。',
      ].join('\n'),
    });
    for (const item of history) {
      const fileLine = item.files?.length ? `\n关联文件：${item.files.join(', ')}` : '';
      messages.push({
        role: item.role,
        content: item.role === 'user'
          ? `上一轮用户消息：${item.text}${fileLine}`
          : `上一轮助手回复：${item.text}${fileLine}`,
      });
    }
  }
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
  return ['projectId', 'contentId', 'diseaseId', 'compareRange'].some((key) => params[key] !== undefined && params[key] !== '');
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

function actionSpecModeForRequest(req: RunRequest): ActionSpecMode {
  const shortcut = asShortcut(req.shortcut);
  if (shortcut === 'data_qa') return 'data-qa';
  if (shortcut === 'overview') return 'overview';
  if (shortcut === 'monthly') return 'monthly';
  if (shortcut === 'ppt_svg') return 'ppt-svg';
  return 'general';
}

function taskPromptAdditionsForRequest(req: RunRequest): string[] {
  const shortcut = asShortcut(req.shortcut);
  if (shortcut === 'data_qa') return [DATA_QA_PROMPT];
  if (shortcut === 'overview') return [OVERVIEW_PROMPT];
  if (shortcut === 'monthly') return [MONTHLY_PROMPT];
  if (shortcut === 'ppt_svg') return [PPT_PREMIUM_SVG_PROMPT];
  // 普通输入仍保留轻量 data-qa/overview/monthly 规则，避免注入 PPT/SVG 大规则。
  return [DATA_QA_PROMPT, OVERVIEW_PROMPT, MONTHLY_PROMPT];
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

type ActivePptSlideContext = {
  slideNo: number;
  title?: string;
  slideType?: string;
  svgPath?: string;
  assetUrl?: string;
  source?: 'generated' | 'copied' | 'missing';
  deckSpec?: Record<string, unknown>;
};

type ActivePptContext = {
  projectPath: string;
  exportedPptx?: string;
  slideCount: number;
  deckSpec?: Record<string, unknown>;
  slides: ActivePptSlideContext[];
};

type NormalizedHistoryItem = { role: 'user' | 'assistant'; text: string; files?: string[]; activePptContext?: ActivePptContext };

function normalizeActivePptContext(value: unknown): ActivePptContext | undefined {
  const root = obj(value);
  const projectPath = String(root.projectPath || root.project_path || '').replace(/^\/+/, '');
  const rawSlides = Array.isArray(root.slides) ? root.slides.map(obj) : [];
  if (!projectPath || !rawSlides.length) return undefined;
  const slides = rawSlides.flatMap((slide, index): ActivePptSlideContext[] => {
    const slideNo = Number(slide.slideNo || slide.slide_no || index + 1);
    if (!Number.isInteger(slideNo) || slideNo < 1 || slideNo > 99) return [];
    const deckSpec = obj(slide.deckSpec || slide.deck_spec);
    return [{
      slideNo,
      title: typeof slide.title === 'string' ? slide.title.slice(0, 120) : undefined,
      slideType: typeof slide.slideType === 'string' ? slide.slideType.slice(0, 80) : typeof slide.slide_type === 'string' ? slide.slide_type.slice(0, 80) : undefined,
      svgPath: typeof slide.svgPath === 'string' ? slide.svgPath.slice(0, 1000) : typeof slide.svg_path === 'string' ? slide.svg_path.slice(0, 1000) : undefined,
      assetUrl: typeof slide.assetUrl === 'string' ? slide.assetUrl.slice(0, 1200) : typeof slide.asset_url === 'string' ? slide.asset_url.slice(0, 1200) : undefined,
      source: slide.source === 'generated' || slide.source === 'copied' || slide.source === 'missing' ? slide.source : undefined,
      deckSpec: Object.keys(deckSpec).length ? deckSpec : undefined,
    }];
  });
  if (!slides.length) return undefined;
  const deckSpec = obj(root.deckSpec || root.deck_spec);
  return {
    projectPath,
    exportedPptx: typeof root.exportedPptx === 'string' ? root.exportedPptx.slice(0, 1000) : typeof root.exported_pptx === 'string' ? root.exported_pptx.slice(0, 1000) : undefined,
    slideCount: Number(root.slideCount || root.slide_count) || slides.length,
    deckSpec: Object.keys(deckSpec).length ? deckSpec : undefined,
    slides,
  };
}

function normalizedHistory(req: RunRequest): NormalizedHistoryItem[] {
  return (Array.isArray(req.history) ? req.history : [])
    .flatMap((item) => {
      const role = item?.role === 'user' || item?.role === 'assistant' ? item.role : undefined;
      const text = String(item?.text || '').trim();
      const files = Array.isArray(item?.files)
        ? item.files.filter((file): file is string => typeof file === 'string' && file.trim().length > 0).slice(0, 12)
        : undefined;
      const activePptContext = normalizeActivePptContext(item?.activePptContext);
      return role && (text || files?.length || activePptContext) ? [{ role, text: text.slice(0, 8000), files, activePptContext }] : [];
    })
    .slice(-10);
}

function latestActivePptContext(req: RunRequest): ActivePptContext | undefined {
  const history = normalizedHistory(req);
  for (let index = history.length - 1; index >= 0; index -= 1) {
    if (history[index].activePptContext) return history[index].activePptContext;
  }
  return undefined;
}

function pathPart(value: string): string {
  const normalized = value.replace(/\\/g, '/');
  try {
    return /^https?:\/\//i.test(normalized) ? decodeURIComponent(new URL(normalized).pathname) : normalized;
  } catch {
    return normalized;
  }
}

function pptProjectPathFromAnyFile(value: string): string | undefined {
  const normalized = pathPart(value).replace(/^\/+/, '');
  const projectsAt = normalized.indexOf('projects/');
  if (projectsAt < 0) return undefined;
  const fromProjects = normalized.slice(projectsAt);
  const marker = '/svg_output/';
  const markerAt = fromProjects.indexOf(marker);
  if (markerAt < 0) return undefined;
  const project = fromProjects.slice(0, markerAt);
  return project.startsWith('projects/') ? project : undefined;
}

function localSvgPathForProjectFile(projectPath: string, file: string): string | undefined {
  const name = fileName(file);
  if (!name.toLowerCase().endsWith('.svg')) return undefined;
  const project = projectPath.replace(/^\/+/, '').replace(/\/+$/, '');
  if (!project) return undefined;
  return `/${project}/svg_output/${name}`;
}

function upsertSlideContext(map: Map<number, ActivePptSlideContext>, slide: ActivePptSlideContext): void {
  const existing = map.get(slide.slideNo);
  map.set(slide.slideNo, {
    ...existing,
    ...slide,
    title: slide.title || existing?.title,
    slideType: slide.slideType || existing?.slideType,
    svgPath: slide.svgPath || existing?.svgPath,
    assetUrl: slide.assetUrl || existing?.assetUrl,
    source: slide.source || existing?.source,
    deckSpec: slide.deckSpec || existing?.deckSpec,
  });
}

function activePptContextFromTrace(trace: AgentDonePayload['trace'], fallback?: ActivePptContext): ActivePptContext | undefined {
  const projectFromTrace = [...trace].reverse().map((entry) => {
    const detail = obj(entry.result?.detail);
    const params = obj(entry.call?.params);
    return String(
      entry.result?.project_path
      || detail.project_path
      || params.project_path
      || params.source_project_path
      || params.sourceProjectPath
      || '',
    ).replace(/^\/+/, '');
  }).find(Boolean);
  const projectFromSvg = [...trace].reverse()
    .flatMap((entry) => resultFiles(entry.result))
    .map(pptProjectPathFromAnyFile)
    .find((project): project is string => Boolean(project));
  const projectPath = projectFromTrace || projectFromSvg || fallback?.projectPath;
  if (!projectPath) return fallback;

  const byNo = new Map<number, ActivePptSlideContext>();
  for (const slide of fallback?.slides || []) {
    upsertSlideContext(byNo, slide);
  }

  for (const localSvg of projectSvgOutputFiles(projectPath)) {
    const slideNo = slideNoFromPath(localSvg);
    if (slideNo) upsertSlideContext(byNo, { slideNo, svgPath: localSvg, source: 'generated' });
  }

  for (const entry of trace) {
    if (!entry.call || !entry.result) continue;
    const detail = obj(entry.result?.detail);
    const files = resultFiles(entry.result);
    if (entry.call.skill_id === 'ppt-master' && entry.call.action === 'write_ppt_svg_slide' && entry.result.ok !== false) {
      const slideNo = Number(detail.slide_no || obj(entry.call.params).slide_no || obj(entry.call.params).slideNo);
      if (Number.isInteger(slideNo) && slideNo > 0) {
        const localFromDetail = typeof detail.path === 'string' ? detail.path : undefined;
        const localFromFile = files.map((file) => localSvgPathForProjectFile(projectPath, file)).find(Boolean);
        const assetUrl = files.find((file) => /^https?:\/\//i.test(file));
        upsertSlideContext(byNo, {
          slideNo,
          title: typeof detail.title === 'string' ? detail.title : typeof obj(entry.call.params).title === 'string' ? String(obj(entry.call.params).title) : undefined,
          svgPath: localFromDetail || localFromFile,
          assetUrl,
          source: 'generated',
        });
      }
    }
    for (const completed of completedPptSvgSlides(entry.call, entry.result)) {
      const slideNo = Number(completed.slide_no);
      if (!Number.isInteger(slideNo) || slideNo <= 0) continue;
      const localFromDetail = typeof detail.path === 'string' ? detail.path : undefined;
      const localFromFile = files.map((file) => localSvgPathForProjectFile(projectPath, file)).find(Boolean);
      const assetUrl = files.find((file) => /^https?:\/\//i.test(file));
      upsertSlideContext(byNo, {
        slideNo,
        title: typeof completed.title === 'string' ? completed.title : undefined,
        svgPath: localFromDetail || localFromFile || (typeof completed.file === 'string' ? completed.file : undefined),
        assetUrl,
        source: 'generated',
      });
    }
  }

  const exportedPptx = [...trace].reverse()
    .flatMap((entry) => resultFiles(entry.result))
    .find((file) => /\.pptx$/i.test(fileName(file))) || fallback?.exportedPptx;
  const slides = [...byNo.values()]
    .filter((slide) => slide.svgPath || slide.assetUrl)
    .sort((a, b) => a.slideNo - b.slideNo);
  if (!slides.length) return fallback;
  return {
    projectPath,
    exportedPptx,
    slideCount: Math.max(fallback?.slideCount || 0, ...slides.map((slide) => slide.slideNo)),
    deckSpec: fallback?.deckSpec,
    slides,
  };
}

function isPptStateChangingCall(call?: SkillCall): boolean {
  return call?.skill_id === 'ppt-master' && [
    'ppt_master_bootstrap',
    'ppt_master_clone_for_edit',
    'render_ppt_from_specs',
    'write_ppt_svg_slide',
    'write_project_file',
    'write_project_files',
    'ppt_master_export',
  ].includes(call.action);
}

type AiHelperFileContextRow = {
  local_path?: string;
  asset_url?: string;
  object_key?: string;
  run_id?: string;
  created_at?: string;
};

function pptProjectPathFromFileRow(row: AiHelperFileContextRow): string | undefined {
  return pptProjectPathFromAnyFile(row.local_path || '') || pptProjectPathFromAnyFile(row.object_key || '') || pptProjectPathFromAnyFile(row.asset_url || '');
}

async function latestDraftPptContextFromFileRecords(req: RunRequest, userId?: string, tenantId?: string): Promise<ActivePptContext | undefined> {
  const conversationId = String(req.conversation_id || '').trim();
  if (!userId || !tenantId || !conversationId) return undefined;
  const rows = await dbAll<AiHelperFileContextRow>(`
    SELECT local_path, asset_url, object_key, run_id, created_at
    FROM ai_helper_files
    WHERE user_id = ? AND tenant_id = ? AND conversation_id = ?
      AND (
        local_path LIKE '/projects/%/svg_output/%.svg'
        OR object_key LIKE '%/projects/%/svg_output/%.svg'
        OR asset_url LIKE '%/projects/%/svg_output/%.svg'
      )
    ORDER BY created_at DESC
    LIMIT 300
  `, [userId, tenantId, conversationId]);
  const groups = new Map<string, AiHelperFileContextRow[]>();
  for (const row of rows) {
    const project = pptProjectPathFromFileRow(row);
    if (!project) continue;
    groups.set(project, [...(groups.get(project) || []), row]);
  }
  const [projectPath, projectRows] = [...groups.entries()][0] || [];
  if (!projectPath || !projectRows?.length) return undefined;
  const byNo = new Map<number, ActivePptSlideContext>();
  for (const row of projectRows) {
    const source = row.local_path || row.asset_url || row.object_key || '';
    const slideNo = slideNoFromPath(source);
    if (!slideNo || byNo.has(slideNo)) continue;
    const svgPath = row.local_path?.startsWith('/projects/') ? row.local_path : localSvgPathForProjectFile(projectPath, source);
    byNo.set(slideNo, {
      slideNo,
      svgPath,
      assetUrl: row.asset_url,
      source: 'generated',
      title: fileName(source).replace(/^\d{1,2}[_-]/, '').replace(/\.svg$/i, ''),
    });
  }
  const slides = [...byNo.values()].sort((a, b) => a.slideNo - b.slideNo);
  if (!slides.length) return undefined;
  return {
    projectPath,
    slideCount: Math.max(...slides.map((slide) => slide.slideNo)),
    slides,
  };
}

function previousHistoryTurn(req: RunRequest): NormalizedHistoryItem[] {
  const history = normalizedHistory(req);
  if (!history.length) return [];
  let lastAssistantIndex = -1;
  for (let index = history.length - 1; index >= 0; index -= 1) {
    if (history[index].role === 'assistant') {
      lastAssistantIndex = index;
      break;
    }
  }
  if (lastAssistantIndex >= 0) {
    let previousUserIndex = -1;
    for (let index = lastAssistantIndex - 1; index >= 0; index -= 1) {
      if (history[index].role === 'user') {
        previousUserIndex = index;
        break;
      }
    }
    return [
      ...(previousUserIndex >= 0 ? [history[previousUserIndex]] : []),
      history[lastAssistantIndex],
    ];
  }
  const lastUser = [...history].reverse().find((item) => item.role === 'user');
  return lastUser ? [lastUser] : [];
}

function historyTurnForPrompt(req: RunRequest, maxTextChars = 1200): Array<Record<string, unknown>> {
  return previousHistoryTurn(req).map((item) => ({
    role: item.role,
    text: item.text.slice(0, maxTextChars),
    files: item.files?.slice(0, 8),
    active_ppt: item.activePptContext ? {
      project_path: item.activePptContext.projectPath,
      exported_pptx: item.activePptContext.exportedPptx,
      slide_count: item.activePptContext.slideCount,
      slides: item.activePptContext.slides.map((slide) => ({
        slide_no: slide.slideNo,
        title: slide.title,
        slide_type: slide.slideType,
        svg_path: slide.svgPath,
        asset_url: slide.assetUrl,
        source: slide.source,
        deck_spec: slide.deckSpec,
      })),
    } : undefined,
  }));
}

function activePptContextForPrompt(ctx: ActivePptContext): Record<string, unknown> {
  return {
    source_project_path: ctx.projectPath,
    exported_pptx: ctx.exportedPptx,
    slide_count: ctx.slideCount,
    slides: ctx.slides.map((slide) => ({
      slide_no: slide.slideNo,
      title: slide.title,
      slide_type: slide.slideType,
      svg_path: slide.svgPath,
      asset_url: slide.assetUrl,
      source: slide.source,
      deck_spec: slide.deckSpec,
    })),
  };
}

function copiedSlidePathInProject(projectPath: string, slide: ActivePptSlideContext): string | undefined {
  const normalizedProject = projectPath.replace(/^\/+/, '').replace(/\/+$/, '');
  const svgDir = path.join(AI_HELPER_ROOT, normalizedProject, 'svg_output');
  if (!fs.existsSync(svgDir) || !fs.statSync(svgDir).isDirectory()) return undefined;
  const previousName = slide.svgPath?.replace(/\\/g, '/').split('/').pop();
  if (previousName) {
    const candidate = path.join(svgDir, previousName);
    if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
      return `/${normalizedProject}/svg_output/${previousName}`;
    }
  }
  const prefix = String(slide.slideNo).padStart(2, '0');
  const match = fs.readdirSync(svgDir)
    .filter((name) => name.toLowerCase().endsWith('.svg'))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }))
    .find((name) => name === `${prefix}.svg` || name.startsWith(`${prefix}_`) || name.startsWith(`${prefix}-`));
  return match ? `/${normalizedProject}/svg_output/${match}` : undefined;
}

function activePptContextFromEditTrace(source: ActivePptContext, trace: AgentDonePayload['trace']): ActivePptContext | undefined {
  const clone = trace.find((entry) => entry.call?.action === 'ppt_master_clone_for_edit')?.result;
  const projectPath = String(clone?.project_path || obj(clone?.detail).project_path || '');
  if (!projectPath) return undefined;
  const exported = trace.find((entry) => entry.call?.action === 'ppt_master_export')?.result;
  const exportedPptx = exported?.ok !== false && typeof exported?.file === 'string' ? exported.file : undefined;
  const byNo = new Map<number, ActivePptSlideContext>(source.slides.map((slide) => {
    const copiedPath = copiedSlidePathInProject(projectPath, slide);
    return [slide.slideNo, {
      ...slide,
      svgPath: copiedPath,
      source: copiedPath ? 'copied' as const : 'missing' as const,
    }];
  }));
  for (const entry of trace) {
    if (entry.call?.action !== 'write_ppt_svg_slide' || entry.result?.ok === false) continue;
    const detail = obj(entry.result?.detail);
    const slideNo = Number(detail.slide_no);
    if (!Number.isInteger(slideNo)) continue;
    const previous = byNo.get(slideNo);
    const svgPath = typeof detail.path === 'string' ? detail.path : copiedSlidePathInProject(projectPath, { slideNo, svgPath: previous?.svgPath });
    const assetUrl = resultFiles(entry.result).find((file) => /^https?:\/\//i.test(file));
    byNo.set(slideNo, {
      slideNo,
      title: typeof detail.title === 'string' ? detail.title : previous?.title,
      slideType: previous?.slideType,
      svgPath,
      assetUrl: assetUrl || previous?.assetUrl,
      source: svgPath ? 'generated' : 'missing',
      deckSpec: {
        ...(previous?.deckSpec || {}),
        slide_no: slideNo,
        title: typeof detail.title === 'string' ? detail.title : previous?.title,
        takeaway: typeof detail.core_conclusion === 'string' ? detail.core_conclusion : obj(previous?.deckSpec).takeaway,
        edited: true,
      },
    });
  }
  const slides = [...byNo.values()].sort((a, b) => a.slideNo - b.slideNo);
  return {
    ...source,
    projectPath,
    exportedPptx,
    slideCount: slides.length,
    slides,
  };
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
      script: 'scripts/md_to_pdf.ts',
      args: ['--input', 'monthly_report.md', '--output', 'monthly_report.pdf'],
      timeout_sec: 120,
    },
    thought: '后端自动将月度报告 Markdown 转换为 PDF 并完成交付。',
  };
}

function overviewPdfAutoCall(): SkillCall {
  return {
    type: 'skill_call',
    skill_id: 'md-to-pdf',
    action: 'run_skill_script',
    params: {
      script: 'scripts/md_to_pdf.ts',
      args: ['--input', 'overview_report.md', '--output', 'overview_report.pdf', '--title', '患教内容运营数据概览'],
      timeout_sec: 120,
    },
    thought: '后端自动将数据概览 Markdown 转换为 PDF。',
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

function formatMoM(current: number, previous: number): string {
  if (!previous) return current ? '上期为 0，本期已有产出' : '与上期持平';
  return `${current >= previous ? '较上期提升' : '较上期下降'} ${Math.abs(((current - previous) / previous) * 100).toFixed(1)}%`;
}

function hasBehaviorActivity(metrics: PrefetchMetrics): boolean {
  const k = metrics.coreKpi;
  return Boolean(k.pushCount || k.deliveredCount || k.readUsers || k.readCount || k.interactionCount || k.activeDays);
}

function hasMonthlyAnalysisActivity(metrics: PrefetchMetrics): boolean {
  const k = metrics.coreKpi;
  return Boolean(k.readUsers || k.readCount || k.interactionCount);
}

function hasProjectContribution(item: ProjectMetric | Record<string, unknown> | undefined): boolean {
  if (!item) return false;
  return Boolean(Number(item.readCount || 0) || Number(item.interactionCount || 0) || Number((item as Record<string, unknown>).readUsers || 0));
}

function hasContentContribution(item: TopContentMetric | Record<string, unknown> | undefined): boolean {
  if (!item) return false;
  return Boolean(Number(item.readCount || 0) || Number(item.interactionCount || 0) || Number((item as Record<string, unknown>).readUsers || 0));
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
  const fallback = fallbackMonthlyInsights(metrics);
  if (!hasBehaviorActivity(metrics)) return fallback;
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
    executive_summary: normalizeStringList(value.executive_summary, 5).length ? normalizeStringList(value.executive_summary, 5) : fallback.executive_summary,
    kpi_insights: normalizeStringList(value.kpi_insights, 4).length ? normalizeStringList(value.kpi_insights, 4) : fallback.kpi_insights,
    weekly_insights: normalizeStringList(value.weekly_insights, 4).length ? normalizeStringList(value.weekly_insights, 4) : fallback.weekly_insights,
    project_insights: normalizeStringList(value.project_insights, 4).length ? normalizeStringList(value.project_insights, 4) : fallback.project_insights,
    content_insights: normalizeStringList(value.content_insights, 4).length ? normalizeStringList(value.content_insights, 4) : fallback.content_insights,
    highlights: normalizeStringList(value.highlights, 4).length ? normalizeStringList(value.highlights, 4) : fallback.highlights,
    diagnosis: diagnosis.length ? diagnosis : fallback.diagnosis,
    risks: normalizeStringList(value.risks, 4).length ? normalizeStringList(value.risks, 4) : fallback.risks,
    recommendations: normalizeStringList(value.recommendations || value.next_actions, 6).length ? normalizeStringList(value.recommendations || value.next_actions, 6) : fallback.recommendations,
  };
}

function fallbackMonthlyInsights(metrics: PrefetchMetrics): MonthlyInsights {
  const k = metrics.coreKpi;
  if (!hasMonthlyAnalysisActivity(metrics)) {
    return {
      executive_summary: [
        hasBehaviorActivity(metrics)
          ? '本周期已有基础触达记录，但暂无阅读或互动样本，暂不输出增长、环比或结构贡献结论。'
          : '本周期暂无可分析的行为指标记录，暂不输出增长、环比或结构贡献结论。',
        '当前月报重点应放在确认数据是否已完成同步，以及核对统计周期、账号范围和项目内容是否已有实际触达。',
      ],
      kpi_insights: [
        hasBehaviorActivity(metrics)
          ? '当前缺少阅读和互动样本，暂不能判断内容消费质量或用户参与质量。'
          : '推送、阅读、互动等核心行为指标均为 0，暂不能判断内容触达效率或用户参与质量。',
        '完读率、平均阅读时长等质量指标缺少有效阅读样本，暂不做优劣判断。',
      ],
      weekly_insights: [
        '本周期暂无可分析的周度行为趋势，暂不判断峰谷变化。',
        '建议待数据同步完成后，再按周复盘推送、阅读、互动和完读之间的联动。',
      ],
      project_insights: [
        '当前暂无项目侧行为贡献数据，暂不输出项目排名或主力项目判断。',
      ],
      content_insights: [
        '当前暂无内容侧阅读或互动样本，暂不输出头部内容、低完读内容或可复制样本判断。',
      ],
      highlights: [],
      diagnosis: [
        {
          issue: '当前周期暂无有效行为样本',
          evidence: '推送、阅读、互动等核心行为指标均为 0',
          reason: '可能是该周期尚未产生行为数据，或业务数据同步尚未覆盖当前筛选范围',
        },
      ],
      risks: [
        '如果业务上确认本周期应有触达记录，需要优先核对数据同步、账号范围和统计周期配置。',
      ],
      recommendations: [
        '先确认该账号在本报告周期内是否已有实际推送、阅读或互动记录。',
        '核对数据同步任务是否覆盖当前月份、项目和内容范围。',
        '待产生有效行为样本后，再重新生成月报进行环比、结构贡献和内容表现复盘。',
      ],
    };
  }
  const topProject = metrics.projects.find(hasProjectContribution);
  const topContent = metrics.topContent.find(hasContentContribution);
  const lowFinish = [...metrics.topContent].filter((item) => item.readCount > 0).sort((a, b) => a.finishRate - b.finishRate)[0];
  const kpiInsights = k.readCount > 0
    ? [
        `阅读规模达到 ${fmtNumber(k.readCount)} 次，可作为本周期内容消费规模的复盘基础。`,
        k.interactionCount > 0
          ? `互动/阅读为 ${fmtPct(safeRate(k.interactionCount, k.readCount))}，可继续结合内容 CTA、问答和收藏机制提升深度参与。`
          : '本周期已有阅读但暂无互动沉淀，建议优先检查内容尾部行动引导和互动入口。',
      ]
    : [
        k.pushCount > 0
          ? `本周期已有推送 ${fmtNumber(k.pushCount)} 次，但暂无阅读样本，暂不判断阅读转化和内容消费质量。`
          : '本周期暂无可分析的推送和阅读样本，暂不判断触达效率。',
        '在缺少有效阅读样本前，互动率、完读率和平均阅读时长不做业务优劣判断。',
      ];
  const highlights = [
    topContent ? `已出现可复盘的高表现内容样本「${topContent.title}」。` : '',
    topProject ? `主力项目「${topProject.name}」形成了主要阅读贡献。` : '',
  ].filter(Boolean);
  const diagnosis = k.readCount > 0
    ? [{
        issue: k.interactionCount > 0 ? '互动深度仍有优化空间' : '阅读后的互动沉淀不足',
        evidence: `阅读 ${fmtNumber(k.readCount)} 次，互动 ${fmtNumber(k.interactionCount)} 次，互动/阅读 ${fmtPct(safeRate(k.interactionCount, k.readCount))}`,
        reason: '内容可能更偏阅读型触达，互动入口、问答引导和收藏提醒还可以继续强化',
      }]
    : [{
        issue: '暂无有效阅读样本',
        evidence: `推送 ${fmtNumber(k.pushCount)} 次，阅读 ${fmtNumber(k.readCount)} 次`,
        reason: '需要先确认触达链路、数据同步和统计周期，再判断内容表现',
      }];
  return {
    executive_summary: [
      `本周期累计阅读 ${fmtNumber(k.readCount)} 次、互动 ${fmtNumber(k.interactionCount)} 次，完读率 ${fmtPct(k.finishRate)}，平均阅读时长 ${(k.avgReadSec || 0).toFixed(0)} 秒。`,
      topProject ? `阅读贡献主要来自「${topProject.name}」，该项目贡献 ${fmtNumber(topProject.readCount)} 次阅读和 ${fmtNumber(topProject.interactionCount)} 次互动。` : '项目贡献结构暂无明显头部项目，需要继续积累有效阅读数据。',
      topContent ? `头部内容「${topContent.title}」表现最好，可作为后续内容选题和表达方式的复盘样本。` : '当前暂无可用于沉淀方法的头部内容样本。',
    ],
    kpi_insights: kpiInsights,
    weekly_insights: [
      '周度节奏建议结合高阅读周和推送节奏复盘，识别可复制的推送窗口和内容主题。',
      '如果周间波动较大，建议拆分分析推送频次、主题匹配度和头部内容带动效应。',
    ],
    project_insights: topProject ? [
      `「${topProject.name}」是本周期主力项目，后续可优先复盘其内容结构、推送策略和用户反馈。`,
      '项目组合上应关注主力项目与长尾项目之间的资源分配，避免阅读贡献过度集中。',
    ] : ['项目侧暂无足够贡献差异，建议继续观察不同疾病或项目线的内容供给和触达效率。'],
    content_insights: topContent ? [
      `「${topContent.title}」阅读 ${fmtNumber(topContent.readCount)} 次、完读率 ${fmtPct(topContent.finishRate)}，具备复用为选题模板的价值。`,
      lowFinish ? `低完读内容「${lowFinish.title}」完读率 ${fmtPct(lowFinish.finishRate)}，建议复盘标题承诺、正文长度和行动指引。` : '建议持续跟踪低完读内容，定位内容结构和阅读门槛问题。',
    ] : ['内容侧暂无明显头部样本，建议继续积累阅读和完读数据后再沉淀方法。'],
    highlights,
    diagnosis,
    risks: [
      '如果阅读贡献持续集中在少数项目或内容，后续增长会更依赖单点爆款，稳定性不足。',
      '如果互动率没有随阅读增长同步提升，内容价值难以沉淀为可持续的患者行为反馈。',
    ],
    recommendations: [
      '复盘头部内容的标题、结构、长度和行动指引，沉淀为下月选题模板。',
      '对低完读内容做结构优化，优先减少阅读门槛并前置关键信息。',
      '在内容尾部增加问答、收藏、复诊提醒或自测清单等明确 CTA。',
      '按项目建立周度复盘机制，跟踪阅读、互动、完读和内容供给的联动变化。',
    ],
  };
}

function buildMonthlySummaryText(current: PrefetchMetrics, previous: PrefetchMetrics | undefined, dateRange: DateRange, compareRange?: DateRange): string {
  const k = current.coreKpi;
  const pk = previous?.coreKpi;
  const hasCurrentActivity = hasBehaviorActivity(current);
  const hasCurrentAnalysisActivity = hasMonthlyAnalysisActivity(current);
  const hasCompare = Boolean(compareRange && previous && hasBehaviorActivity(previous));
  const topProject = current.projects.find(hasProjectContribution);
  const topContent = current.topContent.find(hasContentContribution);
  const readMoM = pk ? formatMoM(k.readCount, pk.readCount) : '';
  const interactionMoM = pk ? formatMoM(k.interactionCount, pk.interactionCount) : '';
  const pushMoM = pk ? formatMoM(k.pushCount, pk.pushCount) : '';
  if (!hasCurrentAnalysisActivity) {
    const backendInsights = current.insights.slice(0, 2);
    return [
      `## 患教内容运营月度报告摘要`,
      '',
      `**报告周期**：${dateRange.start} 至 ${dateRange.end}`,
      ...(hasCompare && compareRange ? [`**对比周期**：${compareRange.start} 至 ${compareRange.end}`] : []),
      '',
      hasCurrentActivity
        ? '本周期已有基础触达记录，但暂未获取到可分析的阅读或互动样本，因此暂不输出环比变化、结构贡献、头部项目或头部内容判断。'
        : '本周期暂未获取到可分析的推送、阅读或互动行为数据，因此暂不输出环比变化、结构贡献、头部项目或头部内容判断。',
      '',
      '**数据状态**：',
      `- 推送：**${fmtNumber(k.pushCount)}** 次`,
      `- 阅读：**${fmtNumber(k.readCount)}** 次`,
      `- 互动：**${fmtNumber(k.interactionCount)}** 次`,
      '',
      '**初步判断**：',
      ...(backendInsights.length ? backendInsights.map((insight) => `- ${insight}`) : ['- 当前周期暂无有效行为样本，请先确认业务数据是否已完成同步并覆盖当前账号与统计周期。']),
      '',
      '月度报告将按“数据状态说明 + 排查建议”生成，不会输出没有数据支撑的增长、排名或运营贡献结论。',
    ].join('\n');
  }
  const lines = [
    `## 患教内容运营月度报告摘要`,
    '',
    `**报告周期**：${dateRange.start} 至 ${dateRange.end}`,
    ...(hasCompare && compareRange ? [`**对比周期**：${compareRange.start} 至 ${compareRange.end}`] : []),
    '',
    `本周期累计推送 **${fmtNumber(k.pushCount)}** 次、送达 **${fmtNumber(k.deliveredCount)}** 次，触达阅读用户 **${fmtNumber(k.readUsers)}** 人，产生阅读 **${fmtNumber(k.readCount)}** 次、互动 **${fmtNumber(k.interactionCount)}** 次。完读率为 **${fmtPct(k.finishRate)}**，平均阅读时长约 **${(k.avgReadSec || 0).toFixed(0)} 秒**。`,
  ];
  const comparisonParts = [
    (k.pushCount || pk?.pushCount) ? `推送量${pushMoM}` : '',
    (k.readCount || pk?.readCount) ? `阅读次数${readMoM}` : '',
    (k.interactionCount || pk?.interactionCount) ? `互动次数${interactionMoM}` : '',
  ].filter(Boolean);
  if (hasCompare && hasCurrentAnalysisActivity && comparisonParts.length) {
    lines.push('', `**环比变化**：${comparisonParts.join('，')}。`);
  } else if (!hasCompare) {
    lines.push('', '**环比判断**：暂无可用对比周期，暂不输出环比结论。');
  } else if (!hasCurrentAnalysisActivity) {
    lines.push('', '**环比判断**：本周期暂无足够阅读或互动样本，暂不输出环比结论。');
  }
  if (hasCurrentAnalysisActivity && (topProject || topContent)) {
    lines.push('', '**结构贡献**：');
    if (topProject) lines.push(`- 项目侧，「${topProject.name}」贡献阅读 **${fmtNumber(topProject.readCount)}** 次、互动 **${fmtNumber(topProject.interactionCount)}** 次，是本周期主要贡献项目。`);
    if (topContent) lines.push(`- 内容侧，「${topContent.title}」阅读 **${fmtNumber(topContent.readCount)}** 次，完读率 **${fmtPct(topContent.finishRate)}**，可作为内容复盘重点。`);
  } else if (!hasCurrentAnalysisActivity) {
    lines.push('', '**结构贡献**：当前周期暂无项目或内容侧行为贡献数据，暂不输出项目排名、头部内容或主要贡献判断。');
  }
  const backendInsights = current.insights.slice(0, 2);
  if (backendInsights.length) {
    lines.push('', '**初步判断**：');
    for (const insight of backendInsights) lines.push(`- ${insight}`);
  }
  return lines.join('\n');
}

function buildMonthlyInsightPrompt(current: PrefetchMetrics, previous: PrefetchMetrics | undefined, dateRange: DateRange, compareRange?: DateRange): ChatMessage[] {
  const hasCompare = Boolean(compareRange && previous && hasBehaviorActivity(previous));
  const context = {
    task: 'monthly_report_insight_generation',
    instruction: [
      '你要写的是月度复盘报告的“分析结论”，不是异常检测清单。',
      '禁止在任何输出字段中出现用户明确排除的受众称谓；如需表达受众或用途，改用“业务团队”“运营复盘”“汇报决策”等表述。',
      '请同时分析成绩、变化、贡献结构、内容方法、原因判断、经营含义和下月策略。',
      '即使没有明显异常，也要说明本周期表现说明了什么、哪些做法值得延续、哪些结构需要优化。',
      hasCompare ? '本轮有可用对比周期，可以输出环比和对比结论。' : '本轮没有可用对比周期，禁止输出环比、较上期、对比月等对比结论。',
      '不要只写“未发现异常/保持观察”；每个模块都要有复盘视角和运营动作指向。',
      '只基于给定指标生成结论。不要输出 Markdown，不要生成文件，不要编造未提供的数据。',
    ].join('\n'),
    output_schema: {
      executive_summary: ['3-5 条，像月报开头一样总结本周期整体表现、关键变化、主要贡献和下月重点'],
      kpi_insights: ['2-4 条，围绕阅读、互动、完读、时长、环比讲经营含义，不只是异常'],
      weekly_insights: ['2-4 条，复盘本周期节奏、峰谷周、推送节奏和可复制动作'],
      project_insights: ['2-4 条，分析项目贡献结构、主力项目价值、资源倾斜和项目组合'],
      content_insights: ['2-4 条，分析内容类型/主题/表达方式，沉淀可复制方法和优化方向'],
      highlights: ['1-4 条，本周期值得肯定的亮点、有效动作、可沉淀资产'],
      diagnosis: [{ issue: '需要关注的运营问题或结构问题', evidence: '数据证据', reason: '原因判断' }],
      risks: ['1-4 条，下月可能影响表现的风险或结构性隐患'],
      recommendations: ['3-6 条，具体到下月运营动作、内容策略、项目资源配置或复盘机制'],
    },
    period: dateRange,
    compare_period: hasCompare ? compareRange : undefined,
    kpi: {
      current: current.coreKpi,
      previous: hasCompare ? previous?.coreKpi : undefined,
      month_delta: hasCompare ? current.monthDelta : undefined,
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
      content: '你是资深患教内容运营负责人，正在写月度复盘报告。请写出“月报式”的分析：既讲结果，也讲变化、贡献、原因、策略和下月动作；不要只做异常判断。禁止出现用户明确排除的受众称谓。必须只输出一个合法 JSON 对象，字段为 executive_summary、kpi_insights、weekly_insights、project_insights、content_insights、highlights、diagnosis、risks、recommendations。不要输出 Markdown 或解释文字。',
    },
    { role: 'user', content: JSON.stringify(context, null, 2) },
  ];
}

function buildMonthlyReportMarkdown(current: PrefetchMetrics, previous: PrefetchMetrics | undefined, dateRange: DateRange, compareRange: DateRange | undefined, insights: MonthlyInsights): string {
  const k = current.coreKpi;
  const pk = previous?.coreKpi;
  const hasCompare = Boolean(compareRange && previous && hasBehaviorActivity(previous));
  const hasCurrentActivity = hasBehaviorActivity(current);
  const hasCurrentAnalysisActivity = hasMonthlyAnalysisActivity(current);
  if (!hasCurrentAnalysisActivity) {
    const statusLabel = (value: number, okText: string) => value ? okText : '暂无样本';
    const statusRows = [
      ['推送次数', fmtNumber(k.pushCount), statusLabel(k.pushCount, '已有基础触达记录')],
      ['送达次数', fmtNumber(k.deliveredCount), statusLabel(k.deliveredCount, '已有基础触达记录')],
      ['阅读人数', fmtNumber(k.readUsers), '暂无阅读样本'],
      ['阅读次数', fmtNumber(k.readCount), '暂无阅读样本'],
      ['互动次数', fmtNumber(k.interactionCount), '暂无互动样本'],
      ['有效行为天数', fmtNumber(k.activeDays), statusLabel(k.activeDays, '已有基础触达记录')],
    ];
    return `# 患教内容运营月度报告

**报告周期**：${dateRange.start} 至 ${dateRange.end}
${hasCompare && compareRange ? `**对比周期**：${compareRange.start} 至 ${compareRange.end}  \n` : ''}**数据来源**：PX 指标数据

> **核心判断**：${hasCurrentActivity ? '本周期已有基础触达记录，但暂无可分析的阅读或互动样本' : '本周期暂未获取到可分析的推送、阅读或互动行为数据'}，因此不输出环比增长、结构贡献、头部项目、头部内容或运营成效判断。

## 01｜数据状态

| 指标 | 当前值 | 判断 |
|---|---:|---|
${tableRows(statusRows)}

## 02｜本期结论

${listMd(insights.executive_summary)}

## 03｜暂不输出的分析项

- **环比变化**：当前周期缺少有效行为样本，直接计算“持平”或“增长”容易误导，因此暂不输出。
- **项目贡献**：暂无项目侧阅读或互动贡献数据，暂不判断主力项目或项目排名。
- **内容表现**：暂无内容侧阅读或互动样本，暂不判断头部内容、低完读内容或可复制样本。
- **阅读质量**：暂无有效阅读样本，暂不判断完读率和平均阅读时长表现。

## 04｜建议优先排查

${listMd(insights.recommendations)}

## 05｜风险提示

${listMd(insights.risks)}

## 附：口径说明

阅读人数、阅读次数、互动次数、完读率和平均阅读时长均来自 PX 指标数据。当前报告仅说明数据状态和排查建议，不对无样本指标做业务成效解读。
`;
  }
  const topProjects = slimProjects(current.projects.filter(hasProjectContribution), 3);
  const topContents = slimContent(current.topContent.filter(hasContentContribution), 5);
  const topProject = current.projects.find(hasProjectContribution);
  const topContent = current.topContent.find(hasContentContribution);
  const lowFinish = [...current.topContent].filter((item) => item.readCount > 0).sort((a, b) => a.finishRate - b.finishRate)[0];
  const top3Reads = current.topContent.slice(0, 3).reduce((sum, item) => sum + (item.readCount || 0), 0);
  const top3Share = safeRate(top3Reads, k.readCount);
  const deliveryRate = safeRate(k.deliveredCount, k.pushCount);
  const readConversion = safeRate(k.readUsers, k.deliveredCount);
  const interactionRate = safeRate(k.interactionCount, k.readCount);
  const delta = (currentValue: number, previousValue?: number) => hasCompare && previousValue ? fmtDeltaPct(((currentValue - previousValue) / previousValue) * 100) : '暂无对比';
  const qualityDelta = (currentValue: number, previousValue?: number, unit = 'pct') => hasCompare && previousValue !== undefined ? `${currentValue - previousValue >= 0 ? '+' : ''}${(currentValue - previousValue).toFixed(1)}${unit}` : '暂无对比';
  const weeklyRows = weeklyTrend(current.dailyTrend).map((row) => [
    String(row.label),
    fmtNumber(Number(row.readCount)),
    fmtNumber(Number(row.interactionCount)),
    fmtPct(Number(row.finishRate)),
    `${Number(row.avgReadSec || 0).toFixed(0)} 秒`,
  ]);
  const kpiRows = [
    ['触达规模', fmtNumber(k.pushCount), fmtNumber(k.deliveredCount), fmtPct(deliveryRate)],
    ['阅读转化', fmtNumber(k.readUsers), fmtNumber(k.readCount), fmtPct(readConversion)],
    ['互动深度', fmtNumber(k.interactionCount), fmtPct(interactionRate), hasCurrentActivity ? delta(k.interactionCount, pk?.interactionCount) : '暂无有效样本'],
    ['阅读质量', fmtPct(k.finishRate), `${(k.avgReadSec || 0).toFixed(0)} 秒`, hasCurrentActivity ? qualityDelta(k.finishRate * 100, pk?.finishRate !== undefined ? pk.finishRate * 100 : undefined, 'pct') : '暂无有效样本'],
  ];
  const contentRows = topContents.map((item, index) => [
    String(index + 1),
    String(item.title || ''),
    fmtNumber(Number(item.readCount || 0)),
    fmtPct(Number(item.finishRate || 0)),
  ]);
  const projectStory = topProjects.length
    ? topProjects.map((item, index) => `${index + 1}. **${item.name}**：阅读 ${fmtNumber(Number(item.readCount || 0))} 次，互动 ${fmtNumber(Number(item.interactionCount || 0))} 次，内容储备 ${fmtNumber(Number(item.contentCount || 0))} 篇。`).join('\n')
    : '暂无足够项目贡献数据。';
  const diagnosisNarrative = insights.diagnosis.length
    ? insights.diagnosis.map((item, index) => `**${index + 1}. ${item.issue}**  \n证据：${item.evidence || '待补充'}  \n判断：${item.reason || '待结合运营动作继续复盘'}`).join('\n\n')
    : '当前没有明显异常，但仍建议持续跟踪阅读、互动和完读之间的联动变化。';
  const headline = [
    hasCurrentActivity
      ? `本周期阅读 ${fmtNumber(k.readCount)} 次，互动 ${fmtNumber(k.interactionCount)} 次，完读率 ${fmtPct(k.finishRate)}。`
      : '本周期暂无可分析的行为指标记录，暂不输出增长、环比或结构贡献结论。',
    topProject ? `主力项目为「${topProject.name}」。` : '',
    topContent ? `头部内容为「${topContent.title}」。` : '',
  ].filter(Boolean).join(' ');

  return `# 患教内容运营月度报告

**报告周期**：${dateRange.start} 至 ${dateRange.end}
${hasCompare && compareRange ? `**对比周期**：${compareRange.start} 至 ${compareRange.end}  \n` : ''}**数据来源**：PX 指标数据

> **核心判断**：${headline}

## 01｜本期经营仪表盘

> **阅读规模**  
> ${hasCurrentActivity ? `${fmtNumber(k.readCount)} 次阅读${hasCompare ? `，环比 ${delta(k.readCount, pk?.readCount)}` : ''}。这是本周期内容消费规模的核心判断基准。` : '当前周期暂无阅读样本，暂不做阅读规模和环比判断。'}

> **互动深度**  
> ${fmtNumber(k.interactionCount)} 次互动，互动/阅读 ${fmtPct(interactionRate)}。需要关注阅读是否有效沉淀为问答、收藏、提醒等后续动作。

> **阅读质量**  
> 完读率 ${fmtPct(k.finishRate)}，平均阅读 ${(k.avgReadSec || 0).toFixed(0)} 秒。该指标用于判断内容是否真正被完整消费。

> **结构集中度**  
> ${hasCurrentActivity ? `TOP3 内容贡献 ${fmtPct(top3Share)} 阅读量，${top3Share >= 0.5 ? '头部内容带动明显，需要沉淀可复制方法。' : '内容贡献相对分散，可继续扩展多主题覆盖。'}` : '当前周期暂无内容侧行为贡献，暂不判断内容集中度。'}

${sectionList('## 02｜本期关键结论', insights.executive_summary)}

## 03｜核心指标体检

| 观察维度 | 本期关键值 | 辅助指标 | 变化或效率 |
|---|---:|---:|---:|
${tableRows(kpiRows)}

${insights.kpi_insights.length ? `> **指标解读**：${insights.kpi_insights.join(' ')}` : ''}

## 04｜阅读与互动节奏

本周期节奏不只看总量，更要看每周推送、阅读、互动是否同步变化。如果阅读增长但互动没有同步提升，说明内容触达有效，但行动引导仍需加强。

| 周期 | 阅读次数 | 互动次数 | 完读率 | 平均阅读 |
|---|---:|---:|---:|---:|
${tableRows(weeklyRows)}

${insights.weekly_insights.length ? `> **节奏判断**：${insights.weekly_insights.join(' ')}` : ''}

## 05｜项目贡献故事线

${projectStory}

${insights.project_insights.length ? `> **项目判断**：${insights.project_insights.join(' ')}` : ''}

## 06｜内容表现复盘

${topContent ? `**可复制样本**：头部内容「${topContent.title}」贡献 ${fmtNumber(topContent.readCount)} 次阅读，完读率 ${fmtPct(topContent.finishRate)}。建议重点复盘它的标题承诺、正文结构、场景颗粒度和行动指引。` : '**可复制样本**：当前暂无显著头部内容，建议继续积累阅读与完读数据。'}

${lowFinish ? `**需优化样本**：低完读内容「${lowFinish.title}」完读率 ${fmtPct(lowFinish.finishRate)}。建议检查内容长度、开头信息密度、患者场景匹配度和结尾 CTA。` : '**需优化样本**：当前暂无可识别的低完读样本。'}

| 排名 | 内容 | 阅读次数 | 完读率 |
|---:|---|---:|---:|
${tableRows(contentRows)}

${insights.content_insights.length ? `> **内容判断**：${insights.content_insights.join(' ')}` : ''}

${sectionList('## 07｜亮点与机会', insights.highlights)}

## 08｜问题诊断

${diagnosisNarrative}

${sectionList('## 09｜风险提示', insights.risks)}

## 10｜下月行动路线图

${insights.recommendations.map((item, index) => `${index + 1}. **行动 ${index + 1}**：${item}`).join('\n')}

---

## 附：阅读口径说明

阅读人数、阅读次数、互动次数、完读率和平均阅读时长均来自 PX 指标数据。项目与内容排名按本报告周期内阅读次数排序。${hasCompare ? '环比使用本报告周期与对比周期的同口径核心指标计算。' : '本报告未使用对比周期，因此不输出环比结论。'}
`;
}

function parseInsightJson(raw: string): Record<string, unknown> | undefined {
  return SkillExecutor.parseJsonObject(raw);
}

function buildDirectPptModelContext(primaryDataContext: Record<string, unknown>): Record<string, unknown> {
  const metrics = obj(primaryDataContext.primary_metrics);
  const activeProjects = Array.isArray(metrics.projects)
    ? metrics.projects.map(obj).filter((item) => Number(item.readCount || 0) > 0 || Number(item.pushCount || 0) > 0 || Number(item.contentCount || 0) > 0)
    : [];
  const activeDiseases = Array.isArray(metrics.diseases)
    ? metrics.diseases.map(obj).filter((item) => Number(item.reads || 0) > 0 || Number(item.pushCount || 0) > 0 || Number(item.interactions || 0) > 0)
    : [];
  return {
    scope: primaryDataContext.scope,
    core_metrics: metrics.coreKpi,
    trend_summary: {
      range: metrics.range,
      monthlyTrend: Array.isArray(metrics.monthlyTrend) ? metrics.monthlyTrend.slice(-12) : [],
      recent_30_days: metrics.recent_30_days,
      previous_30_days: metrics.previous_30_days,
      insights: metrics.insights,
    },
    top_content: Array.isArray(metrics.topContent) ? metrics.topContent.slice(0, 5) : [],
    project_comparison: activeProjects.slice(0, 5),
    disease_distribution: activeDiseases.slice(0, 4),
  };
}

interface DirectPptBatchOptions {
  startSlide: number;
  endSlide: number;
  totalSlides: number;
  generatedSlides: Array<Record<string, unknown>>;
  retryIssue?: string;
  previousTurn?: Array<Record<string, unknown>>;
}

function directPptSlideOutline(slides: Array<Record<string, unknown>>): Array<Record<string, unknown>> {
  return slides.map((slide, index) => ({
    slide_no: Number(slide.slide_no || index + 1),
    slide_type: slide.slide_type,
    title: slide.title,
    takeaway: slide.takeaway,
  }));
}

function shortUserGoal(userText: string): string {
  const normalized = userText.replace(/\s+/g, ' ').trim();
  return sanitizeUserVisibleText(normalized.slice(0, 180) || '生成 PPT 快速版患教运营汇报材料。');
}

function buildDirectPptMessages(userText: string, primaryDataContext: Record<string, unknown>, options: DirectPptBatchOptions): ChatMessage[] {
  const context = buildDirectPptModelContext(primaryDataContext);
  const alreadyGenerated = directPptSlideOutline(options.generatedSlides);
  const middleCount = Math.max(0, options.totalSlides - 2);
  const contract = {
    task: 'direct_ppt_deck_spec_generation_in_batches',
    output: '只输出合法 JSON 对象，不要 markdown，不要 skill_call，不要解释文字',
    batch_control: {
      total_slides: options.totalSlides,
      already_generated_count: options.generatedSlides.length,
      already_generated_slides: alreadyGenerated,
      current_batch_slide_range: { start: options.startSlide, end: options.endSlide },
      continuation_rule: `本次 slides 必须从第 ${options.startSlide} 页开始，接在已完成页面后面；不要重写第 1-${Math.max(0, options.startSlide - 1)} 页。`,
      partial_allowed: '如果本轮无法稳定写到 end，可只输出从 start 开始的连续若干页；后端会记录最后页码并继续请求下一批。',
    },
    output_contract: {
      shape: '{title,subtitle,theme,design_tokens,data_display,slides:[...]}',
      slide_fields: 'slide_no, slide_type, title, subtitle, takeaway, emphasis, bullets, metrics, chart, components, notes',
      slide_types: 'cover | executive_summary | kpi_dashboard | trend | comparison | ranking | diagnosis | roadmap | closing',
      theme_values: 'executive_blue | medical_green | warm_orange | dark_tech',
      layout_variant_values: {
        cover: 'hero_split | statement_cover | title_wall',
        executive_summary: 'board_summary | insight_split',
        kpi_dashboard: 'metric_wall | hero_metric | scorecard',
        trend: 'chart_plus_insights | full_bleed_chart | timeline_band',
        comparison: 'bar_with_insights | matrix',
        ranking: 'leaderboard | content_cards',
        diagnosis: 'quadrant | funnel_focus',
        roadmap: 'timeline | swimlane',
      },
      component_types: 'metric_card | insight_card | risk_card | action_card | chart_panel | ranking_list | matrix | callout',
      chart_types: 'line | area | bar | ranking | funnel | matrix | donut | heatmap | treemap | scatter | gauge',
      design_tokens: {
        background: 'soft_blobs | gradient_mesh | diagonal_ribbon | grid_dots | clean',
        card_style: 'soft | outlined | glass | solid_header',
        chart_style: 'minimal | annotated | bold | sparkline',
        number_style: 'hero | compact | badge | plain',
        accent_shape: 'ribbon | corner_blob | vertical_rule | orbit | none',
        density: 'low | medium | high',
        colors: '可用 accent_color / primary_color / secondary_color / background_color / card_fill / chart_palette',
      },
      notes: '30-60 字，便于快速口播',
    },
    hard_rules: [
      `本次输出第 ${options.startSlide}-${options.endSlide} 页；可以少于 ${options.endSlide - options.startSlide + 1} 页，但必须从第 ${options.startSlide} 页连续输出，不能跳页。`,
      '每页字段尽量完整；如样式或组件不完整，后端会用模板补齐，不要为追求完美拉长输出。',
      `这是 PPT 快速版，完整 deck 固定生成 ${options.totalSlides} 页，目标 2-3 分钟内稳定产出；第 1 页必须是 cover，第 ${options.totalSlides} 页必须是 closing；当前批次若不包含第 ${options.totalSlides} 页，不要提前输出 closing。`,
      `中间 ${middleCount} 页优先覆盖核心结论、关键指标、趋势变化、内容/项目表现、行动建议；如页面有限，不要为了凑类型牺牲可读性。`,
      '除封面和结束页外，每页必须有 title、takeaway、2-4 个数据点或可渲染 chart、2 条 bullets 或 insight/action/risk components。',
      '必须为每页设置 layout_variant、visual_intent、emphasis、design_tokens 中至少 2 类字段，让后端可按语义选择更丰富模板。',
      'theme 必须使用枚举值，不要输出 medical_professional 这类未知 theme；如需医疗专业风格，用 medical_green 或 executive_blue。',
      'chart.type 不要全部使用 bar/ranking；趋势优先 line/area，结构可用 donut/treemap/matrix，诊断用 funnel/matrix，行动用 timeline/swimlane。',
      'ranking/ranking_list 只能绑定同口径可比较指标；不同单位指标用 metric_card、insight_card 或 matrix。',
      '严禁任何字段出现中文省略号、连续三个英文句点或省略号实体；放不下就改短、换行、拆条目。',
      '只基于提供的数据生成结论，不得编造新指标、新项目、新内容。',
    ],
    user_goal: shortUserGoal(userText),
    previous_turn_context: options.previousTurn?.length
      ? {
          usage: '意图识别判断本轮是追问/修改/继续时才提供。可复用上一轮需求、文件或风格；不得把上一轮旧任务当成必须重复执行。',
          messages: options.previousTurn,
        }
      : undefined,
    previous_batch_issue: options.retryIssue || undefined,
    data_context: context,
  };
  return [
    {
      role: 'system',
      content: '你是患教运营 PPT 快速版策略顾问。你的任务是按批次生成结构化 deck spec JSON，模型只负责内容、叙事、组件和数据绑定；后端负责记录已生成页、拼接完整 deck、布局、渲染和导出。优先稳定、清晰、快速，必须只输出 JSON 对象。',
    },
    { role: 'user', content: JSON.stringify(contract, null, 2) },
  ];
}

function directPptActiveProjects(metrics: Record<string, unknown>): Array<Record<string, unknown>> {
  return Array.isArray(metrics.projects)
    ? metrics.projects.map(obj).filter((item) => Number(item.readCount || 0) > 0 || Number(item.pushCount || 0) > 0 || Number(item.contentCount || 0) > 0)
    : [];
}

function directPptRangeLabel(value: Record<string, unknown>, fallback = '当前周期'): string {
  const start = String(value.start || '').trim();
  const end = String(value.end || '').trim();
  if (start && end) return start === end ? start : `${start} 至 ${end}`;
  return start || end || fallback;
}

function directPptMonthLabel(value: unknown, includeYear: boolean): string {
  const raw = String(value || '').trim();
  const match = raw.match(/^(\d{4})-(\d{2})$/);
  if (!match) return raw || '当前月';
  const month = `${Number(match[2])}月`;
  return includeYear ? `${match[1]}年${month}` : month;
}

function directPptTrendSummary(monthlyTrend: Array<Record<string, unknown>>): string {
  if (monthlyTrend.length >= 2) {
    const first = monthlyTrend[0];
    const last = monthlyTrend[monthlyTrend.length - 1];
    const includeYear = new Set(monthlyTrend.map((item) => String(item.month || '').slice(0, 4))).size > 1;
    const firstLabel = directPptMonthLabel(first.month, includeYear);
    const lastLabel = directPptMonthLabel(last.month, includeYear);
    const firstReads = Number(first.readCount || 0);
    const lastReads = Number(last.readCount || 0);
    const direction = lastReads >= firstReads ? '提升' : '回落';
    return `${firstLabel}至${lastLabel}阅读${direction}，需同步观察互动与完读质量`;
  }
  if (monthlyTrend.length === 1) return `${directPptMonthLabel(monthlyTrend[0].month, true)}已有阅读与互动数据，建议继续积累趋势样本`;
  return '当前周期趋势样本有限，建议持续积累月度数据后再判断节奏变化';
}

function directPptTopNames(items: Array<Record<string, unknown>>, key: string, fallback: string): string {
  const names = items.map((item) => String(item[key] || '').trim()).filter(Boolean).slice(0, 2);
  return names.length ? names.join('、') : fallback;
}

function directPptTemplateDeck(primaryDataContext: Record<string, unknown>, totalSlides: number): Record<string, unknown> {
  const scope = obj(primaryDataContext.scope);
  const metrics = obj(primaryDataContext.primary_metrics);
  const kpi = obj(metrics.coreKpi);
  const rangeValue = obj(metrics.range);
  const recent30 = obj(metrics.recent_30_days);
  const recent30Kpi = obj(recent30.coreKpi);
  const previous30 = obj(metrics.previous_30_days);
  const previous30Kpi = obj(previous30.coreKpi);
  const monthlyTrend = Array.isArray(metrics.monthlyTrend) ? metrics.monthlyTrend.map(obj).slice(-6) : [];
  const topContent = Array.isArray(metrics.topContent) ? metrics.topContent.map(obj).slice(0, 5) : [];
  const projects = directPptActiveProjects(metrics).slice(0, 4);
  const topProject = projects[0];
  const topItem = topContent[0];
  const rangeText = directPptRangeLabel(
    { start: rangeValue.start || obj(scope.dateRange).start, end: rangeValue.end || obj(scope.dateRange).end },
    String(scope.label || '当前周期'),
  );
  const focusWindowLabel = directPptRangeLabel(obj(recent30.range), String(scope.label || '重点观察期'));
  const previousWindowLabel = directPptRangeLabel(obj(previous30.range), '对比观察期');
  const interactionRate = safeRate(kpi.interactionCount, kpi.readCount);
  const deliveryRate = safeRate(kpi.deliveredCount, kpi.pushCount);
  const readConversion = safeRate(kpi.readUsers, kpi.deliveredCount);
  const recentReadDelta = Number(previous30Kpi.readCount || 0)
    ? (Number(recent30Kpi.readCount || 0) - Number(previous30Kpi.readCount || 0)) / Number(previous30Kpi.readCount || 0)
    : 0;
  const recentInteractionDelta = Number(previous30Kpi.interactionCount || 0)
    ? (Number(recent30Kpi.interactionCount || 0) - Number(previous30Kpi.interactionCount || 0)) / Number(previous30Kpi.interactionCount || 0)
    : 0;
  const top3Read = topContent.slice(0, 3).reduce((sum, item) => sum + Number(item.readCount || 0), 0);
  const top3Share = safeRate(top3Read, kpi.readCount);
  const topContentGroupLabel = topContent.length >= 3 ? 'TOP3' : topContent.length > 0 ? `TOP${topContent.length}` : '头部';
  const bestFinish = [...topContent].filter((item) => Number(item.readCount || 0) > 0).sort((a, b) => Number(b.finishRate || 0) - Number(a.finishRate || 0))[0];
  const lowFinish = [...topContent].filter((item) => Number(item.readCount || 0) > 0).sort((a, b) => Number(a.finishRate || 0) - Number(b.finishRate || 0))[0];
  const projectTotalReads = projects.reduce((sum, item) => sum + Number(item.readCount || 0), 0);
  const topProjectShare = safeRate(topProject?.readCount, projectTotalReads || kpi.readCount);
  const projectMatrixItems = projects.slice(0, 3).map((item) => `${String(item.name || '项目')}：阅读 ${fmtCnInt(item.readCount)}，互动 ${fmtCnInt(item.interactionCount)}，内容 ${fmtCnInt(item.contentCount)} 篇`);
  const contentPatternItems = [
    topItem ? `标杆：${String(topItem.title)}，阅读 ${fmtCnInt(topItem.readCount)}，完读率 ${fmtCnPct(topItem.finishRate)}` : '',
    bestFinish ? `高完读：${String(bestFinish.title)}，完读率 ${fmtCnPct(bestFinish.finishRate)}` : '',
    lowFinish ? `待优化：${String(lowFinish.title)}，完读率 ${fmtCnPct(lowFinish.finishRate)}` : '',
    `${topContentGroupLabel} 内容贡献 ${fmtCnPct(top3Share)} 阅读，适合沉淀选题模板`,
  ].filter(Boolean);
  const leadingProjectNames = directPptTopNames(projects, 'name', '主力项目');
  const leadingDiseaseNames = directPptTopNames(Array.isArray(metrics.diseases) ? metrics.diseases.map(obj) : [], 'name', leadingProjectNames);
  const executiveSubtitle = `${focusWindowLabel}表现、头部内容和项目结构`;
  const trendInsightText = directPptTrendSummary(monthlyTrend);
  const actionItems = [
    topItem ? `模板沉淀：复盘「${String(topItem.title).slice(0, 18)}」的选题、标题和结构` : '模板沉淀：提炼高阅读内容的选题、标题和结构',
    lowFinish ? `质量优化：优先改版「${String(lowFinish.title).slice(0, 18)}」等低完读样本` : '质量优化：持续监控低完读内容并改成清单、图解和步骤化表达',
    `触达策略：围绕${leadingProjectNames}分层推送，跟踪阅读到互动转化`,
    `项目组合：巩固${leadingDiseaseNames}等高贡献方向，并补齐低覆盖项目的连续内容`,
  ];
  const notes = (text: string) => text.slice(0, 60);
  const metric = (label: string, value: unknown, unit = '', note = '', status: string = 'neutral', delta?: string) => ({ label, value, unit, note, status, delta });
  const defaultDeck: Record<string, unknown> = {
    title: '患教运营数据阶段性汇报',
    subtitle: `${String(scope.label || '当前周期')}｜${rangeText}`,
    theme: 'executive_blue',
    design_tokens: {
      background: 'soft_blobs',
      card_style: 'glass',
      chart_style: 'bold',
      density: 'medium',
      icon_style: 'circle',
      accent_shape: 'orbit',
      number_style: 'hero',
      accent_color: '#2563EB',
      panel_alt_fill: '#EEF6FF',
      corner_radius: 20,
      gap: 18,
    },
    data_display: { number_format: 'compact_cn', show_axis: true, show_grid: true, show_value_labels: true, show_legend: true, highlight_max: true },
  };
  const trendIncludeYear = new Set(monthlyTrend.map((item) => String(item.month || '').slice(0, 4)).filter(Boolean)).size > 1;
  const trendCategories = monthlyTrend.map((item) => directPptMonthLabel(item.month, trendIncludeYear));
  const trendValues = monthlyTrend.map((item) => Number(item.readCount || 0));
  const rankingItems = topContent.map((item) => ({ label: String(item.title || '未命名内容'), value: Number(item.readCount || 0), note: `完读率 ${fmtCnPct(item.finishRate)}` }));
  const projectItems = projects.map((item) => ({ label: String(item.name || '未命名项目'), value: Number(item.readCount || 0), note: `互动 ${fmtCnInt(item.interactionCount)}` }));
  const kpiTable = [
    { 指标: '推送量', 数值: fmtCnInt(kpi.pushCount), 口径: '内容触达入口', 判断: '规模基础' },
    { 指标: '送达量', 数值: fmtCnInt(kpi.deliveredCount), 口径: `送达率 ${fmtCnPct(deliveryRate)}`, 判断: '触达稳定' },
    { 指标: '阅读用户', 数值: fmtCnInt(kpi.readUsers), 口径: `送达后阅读 ${fmtCnPct(readConversion)}`, 判断: '转化空间' },
    { 指标: '阅读次数', 数值: fmtCnInt(kpi.readCount), 口径: '内容消费规模', 判断: '核心结果' },
    { 指标: '互动次数', 数值: fmtCnInt(kpi.interactionCount), 口径: `互动/阅读 ${fmtCnPct(interactionRate)}`, 判断: '深度转化' },
    { 指标: '完读率', 数值: fmtCnPct(kpi.finishRate), 口径: `平均 ${Number(kpi.avgReadSec || 0).toFixed(0)} 秒`, 判断: '质量基线' },
  ];
  const monthlyTable = monthlyTrend.slice(-4).map((item) => ({
    月份: String(item.month || ''),
    阅读: fmtCnInt(item.readCount),
    互动: fmtCnInt(item.interactionCount),
    推送: fmtCnInt(item.pushCount),
    阅读用户: fmtCnInt(item.readUsers),
  }));
  const contentTable = topContent.slice(0, 5).map((item, index) => ({
    排名: index + 1,
    内容: String(item.title || '').slice(0, 18),
    阅读: fmtCnInt(item.readCount),
    互动: fmtCnInt(item.interactionCount),
    完读率: fmtCnPct(item.finishRate),
  }));
  const projectTable = projects.slice(0, 4).map((item) => ({
    项目: String(item.name || '').slice(0, 16),
    疾病: String(item.disease || ''),
    内容: fmtCnInt(item.contentCount),
    阅读: fmtCnInt(item.readCount),
    互动: fmtCnInt(item.interactionCount),
  }));
  const diagnosisTable = [
    { 问题: '头部集中', 数据证据: `${topContentGroupLabel} 内容占比 ${fmtCnPct(top3Share)}`, 原因判断: '高表现主题可复制但依赖度高', 动作: '沉淀模板并扩展相邻主题' },
    { 问题: '低完读内容', 数据证据: lowFinish ? `${String(lowFinish.title || '').slice(0, 12)} ${fmtCnPct(lowFinish.finishRate)}` : '暂无低完读样本', 原因判断: '场景切入与结构分层不足', 动作: '改成清单、图解和步骤化表达' },
    { 问题: '互动转化', 数据证据: `互动/阅读 ${fmtCnPct(interactionRate)}`, 原因判断: '阅读后行动引导仍可加强', 动作: '增加问答、收藏和提醒 CTA' },
    { 问题: '项目组合', 数据证据: topProject ? `头部项目阅读 ${fmtCnInt(topProject.readCount)}` : '项目数据不足', 原因判断: `${leadingProjectNames}贡献较高，低覆盖项目需补强`, 动作: '按项目贡献和覆盖缺口补齐连续主题' },
  ];
  const actionTable = [
    { 优先级: 'P0', 动作: '沉淀爆款模板', 负责人: '内容运营', 衡量指标: 'TOP 内容复用数、完读率' },
    { 优先级: 'P0', 动作: '低完读内容改版', 负责人: '编辑与医学审核', 衡量指标: '完读率、平均阅读时长' },
    { 优先级: 'P1', 动作: '分层推送实验', 负责人: '运营策略', 衡量指标: '送达后阅读、互动/阅读' },
    { 优先级: 'P1', 动作: '补强病种矩阵', 负责人: '项目负责人', 衡量指标: '项目阅读占比、互动次数' },
  ];
  const slides: Array<Record<string, unknown>> = [
    {
      slide_no: 1,
      slide_type: 'cover',
      visual_intent: 'growth_story',
      layout_variant: 'statement_cover',
      title: '患教运营数据阶段性汇报',
      subtitle: rangeText,
      takeaway: `累计阅读 ${fmtCnInt(kpi.readCount)} 次，互动 ${fmtCnInt(kpi.interactionCount)} 次，完读率 ${fmtCnPct(kpi.finishRate)}`,
      emphasis: 'hero_metric',
	      bullets: [
	        `覆盖 ${fmtCnInt(kpi.projectCount)} 个项目、${fmtCnInt(kpi.contentCount)} 篇内容、${fmtCnInt(kpi.activeDays)} 个活跃日`,
	        `${focusWindowLabel}阅读 ${fmtCnInt(recent30Kpi.readCount || kpi.readCount)} 次，互动 ${fmtCnInt(recent30Kpi.interactionCount || kpi.interactionCount)} 次`,
	        topItem ? `头部内容「${String(topItem.title)}」是当前可复用样本` : '聚焦阅读、互动、完读和项目贡献的复盘闭环',
	      ],
      metrics: [
        metric('阅读次数', kpi.readCount, '次', '累计内容消费规模', 'good'),
        metric('互动次数', kpi.interactionCount, '次', '互动深度表现', 'neutral'),
        metric('完读率', fmtCnPct(kpi.finishRate), '', '内容质量指标', 'good'),
      ],
      components: [
        { type: 'hero_metric', title: '阅读规模', value: fmtCnInt(kpi.readCount), unit: '次', note: `互动 ${fmtCnInt(kpi.interactionCount)} 次`, tone: 'good' },
        { type: 'metric_card', title: '完读率', value: fmtCnPct(kpi.finishRate), note: `平均阅读 ${Number(kpi.avgReadSec || 0).toFixed(0)} 秒`, tone: 'good' },
        { type: 'callout', title: '汇报目标', text: '用核心数据判断运营表现、内容机会和下一步动作。', tone: 'neutral' },
      ],
      notes: notes('本页说明报告周期、核心指标和汇报目标，帮助业务团队快速建立全局判断。'),
    },
    {
      slide_no: 2,
	      slide_type: 'executive_summary',
	      visual_intent: 'executive_summary',
	      layout_variant: 'hero_metric',
	      title: '核心结论',
	      subtitle: executiveSubtitle,
	      takeaway: `${focusWindowLabel}阅读 ${fmtCnInt(recent30Kpi.readCount || kpi.readCount)} 次，较${previousWindowLabel}${recentReadDelta >= 0 ? '提升' : '回落'} ${Math.abs(recentReadDelta * 100).toFixed(1)}%`,
      emphasis: 'insight',
      bullets: [
        `送达率 ${fmtCnPct(deliveryRate)}，送达后阅读转化 ${fmtCnPct(readConversion)}`,
        `互动/阅读 ${fmtCnPct(interactionRate)}，可继续强化行动引导`,
        topItem ? `头部内容「${String(topItem.title)}」贡献最高阅读` : '头部内容贡献仍需继续观察',
      ],
	      metrics: [
	        metric('观察期阅读', recent30Kpi.readCount || kpi.readCount, '次', focusWindowLabel, 'good', `${recentReadDelta >= 0 ? '+' : ''}${(recentReadDelta * 100).toFixed(1)}%`),
	        metric('观察期互动', recent30Kpi.interactionCount || kpi.interactionCount, '次', focusWindowLabel, 'good', `${recentInteractionDelta >= 0 ? '+' : ''}${(recentInteractionDelta * 100).toFixed(1)}%`),
	        metric('送达后阅读', fmtCnPct(readConversion), '', '阅读用户/送达量', 'neutral'),
	        metric('互动/阅读', fmtCnPct(interactionRate), '', '互动转化效率', 'neutral'),
      ],
      components: [
	        { type: 'matrix', title: '核心判断表', table: [
	          { 维度: '规模', 数据: `阅读 ${fmtCnInt(kpi.readCount)} 次`, 结论: '作为当前周期消费规模基准' },
	          { 维度: '转化', 数据: `送达后阅读 ${fmtCnPct(readConversion)}`, 结论: '人群分层仍有提升空间' },
	          { 维度: '质量', 数据: `完读率 ${fmtCnPct(kpi.finishRate)}`, 结论: '用于判断内容完整消费质量' },
          { 维度: '内容', 数据: topItem ? `TOP 内容 ${fmtCnInt(topItem.readCount)} 次` : '暂无头部样本', 结论: '可沉淀选题模板' },
	        ], tone: 'neutral' },
	        { type: 'action_card', title: '运营抓手', text: '复制头部内容结构，提升低完读内容的场景切入和行动指引。', tone: 'good' },
	        { type: 'risk_card', title: '关注风险', text: `如果持续依赖${leadingProjectNames}等少数高贡献项目，需要同步补足低覆盖项目内容连续性。`, tone: 'warn' },
	      ],
	      notes: notes('本页先给出整体判断，强调观察期表现、头部内容和后续优化抓手。'),
    },
    {
      slide_no: 3,
      slide_type: 'kpi_dashboard',
      visual_intent: 'growth_story',
      layout_variant: 'dashboard',
      title: '关键指标',
      subtitle: '触达、阅读、互动和质量四类指标',
      takeaway: `累计推送 ${fmtCnInt(kpi.pushCount)} 次，带来 ${fmtCnInt(kpi.readCount)} 次阅读`,
      emphasis: 'hero_metric',
      bullets: [
        `送达率 ${fmtCnPct(deliveryRate)}，说明触达基础稳定`,
        `送达后阅读转化 ${fmtCnPct(readConversion)}，仍有分层推送优化空间`,
        `互动/阅读 ${fmtCnPct(interactionRate)}，需要通过 CTA 与问答机制继续放大`,
      ],
      metrics: [
        metric('推送量', kpi.pushCount, '次', '触达规模', 'neutral'),
        metric('送达量', kpi.deliveredCount, '次', `送达率 ${fmtCnPct(deliveryRate)}`, 'good'),
        metric('阅读次数', kpi.readCount, '次', '消费规模', 'good'),
        metric('阅读用户', kpi.readUsers, '人', `阅读转化 ${fmtCnPct(readConversion)}`, 'good'),
        metric('互动次数', kpi.interactionCount, '次', `互动率 ${fmtCnPct(interactionRate)}`, 'neutral'),
        metric('平均阅读', Number(kpi.avgReadSec || 0).toFixed(0), '秒', '内容停留', 'neutral'),
      ],
      chart: {
        type: 'funnel',
        title: '触达转化漏斗',
        items: [
          { label: '推送', value: Number(kpi.pushCount || 0), note: '触达入口' },
          { label: '送达', value: Number(kpi.deliveredCount || 0), note: fmtCnPct(deliveryRate) },
          { label: '阅读用户', value: Number(kpi.readUsers || 0), note: fmtCnPct(readConversion) },
          { label: '互动', value: Number(kpi.interactionCount || 0), note: fmtCnPct(interactionRate) },
        ],
      },
      components: [
        { type: 'matrix', title: '核心 KPI 明细表', table: kpiTable, tone: 'neutral' },
        { type: 'funnel_panel', title: '触达转化漏斗', metrics: [
          metric('推送', kpi.pushCount, '次', '触达入口'),
          metric('送达', kpi.deliveredCount, '次', fmtCnPct(deliveryRate)),
          metric('阅读用户', kpi.readUsers, '人', fmtCnPct(readConversion)),
          metric('互动', kpi.interactionCount, '次', fmtCnPct(interactionRate)),
        ] },
	        { type: 'insight_card', title: '指标解读', text: `当前周期阅读 ${fmtCnInt(kpi.readCount)} 次，后续重点是阅读到互动的深度转化。`, tone: 'neutral' },
	      ],
	      notes: notes('本页用四类 KPI 建立仪表盘，重点关注阅读规模和阅读质量是否匹配。'),
    },
    {
      slide_no: 4,
      slide_type: 'trend',
      visual_intent: 'growth_story',
      layout_variant: 'chart_plus_insights',
      title: '阅读与互动趋势',
      subtitle: '按月观察运营节奏变化',
      takeaway: monthlyTrend.length ? `${String(monthlyTrend.at(-1)?.month || '最新月')}阅读 ${fmtCnInt(monthlyTrend.at(-1)?.readCount)} 次` : '近期阅读与互动保持活跃',
	      emphasis: 'chart',
	      bullets: [
	        trendInsightText,
	        monthlyTrend.length ? '互动量需与阅读同步观察，判断内容是否能承接后续动作' : '月度样本不足时，优先观察日级阅读和互动是否稳定',
	        monthlyTrend.length ? `${directPptMonthLabel(monthlyTrend.at(-1)?.month, trendIncludeYear)}表现需要结合推送频次与用户疲劳判断` : '趋势数据不足时，应先补齐连续统计窗口',
	      ],
	      metrics: [
	        metric('观察期阅读', recent30Kpi.readCount || kpi.readCount, '次', focusWindowLabel, 'good'),
	        metric('观察期互动', recent30Kpi.interactionCount || kpi.interactionCount, '次', focusWindowLabel, 'neutral'),
	      ],
      chart: {
        type: 'area',
        title: '月度阅读与互动趋势',
        categories: trendCategories,
        series: [
          { name: '阅读次数', values: trendValues },
          { name: '互动次数', values: monthlyTrend.map((item) => Number(item.interactionCount || 0)) },
        ],
        value_suffix: '次',
      },
      components: [
        { type: 'chart_panel', title: '月度阅读与互动趋势', chart: {
          type: 'area',
          categories: trendCategories,
          series: [
            { name: '阅读次数', values: trendValues },
            { name: '互动次数', values: monthlyTrend.map((item) => Number(item.interactionCount || 0)) },
          ],
	        } },
	        { type: 'matrix', title: '月度数据表', table: monthlyTable, tone: 'neutral' },
	        { type: 'insight_card', title: '趋势判断', text: trendInsightText, tone: 'good' },
      ],
      notes: notes('本页从月度趋势看节奏，说明阅读规模增长后仍要跟踪互动和完读质量。'),
    },
    {
      slide_no: 5,
      slide_type: 'comparison',
      visual_intent: 'comparison',
      layout_variant: 'split_chart',
      title: '内容与项目表现',
      subtitle: '识别可复制内容和主力项目',
      takeaway: topProject ? `主力项目「${String(topProject.name)}」贡献阅读 ${fmtCnInt(topProject.readCount)} 次` : '内容与项目贡献需要持续积累',
      emphasis: 'ranking',
	      bullets: [
	        topProject ? `头部项目贡献阅读占比 ${fmtCnPct(topProjectShare)}，${String(topProject.name)}是当前高贡献方向` : '项目贡献仍需继续积累',
        topItem ? `头部内容「${String(topItem.title)}」完读率 ${fmtCnPct(topItem.finishRate)}` : '头部内容样本仍需继续沉淀',
        '排行仅比较同口径阅读次数，质量指标单独观察',
      ],
      metrics: [
        metric('TOP 内容数', topContent.length, '篇', '参与本页排名', 'neutral'),
        metric('活跃项目数', projects.length, '个', '有阅读或推送项目', 'neutral'),
        metric(`${topContentGroupLabel} 内容占比`, fmtCnPct(top3Share), '', '阅读集中度', 'neutral'),
      ],
      chart: { type: 'ranking', title: '内容阅读 TOP5', items: rankingItems },
      components: [
        { type: 'matrix', title: '内容 TOP5 明细表', table: contentTable, tone: 'neutral' },
        { type: 'matrix', title: '项目贡献表', table: projectTable, tone: 'neutral' },
        { type: 'insight_card', title: '内容方法', items: contentPatternItems.slice(0, 3), tone: 'good' },
      ],
      notes: notes('本页比较内容和项目贡献，重点识别可复制主题和需要进一步优化的内容类型。'),
    },
    {
      slide_no: 6,
      slide_type: 'diagnosis',
      visual_intent: 'diagnosis',
      layout_variant: 'risk_matrix',
      title: '问题诊断与机会判断',
      subtitle: '把数据证据转成可执行的优化方向',
      takeaway: '当前不是单一数据异常，而是内容集中度、低完读样本和互动转化的结构优化问题',
      emphasis: 'balanced',
      bullets: [
        `${topContentGroupLabel} 内容贡献 ${fmtCnPct(top3Share)} 阅读，说明方法可复制但集中度需要控制`,
        lowFinish ? `低完读样本「${String(lowFinish.title || '').slice(0, 18)}」完读率 ${fmtCnPct(lowFinish.finishRate)}` : '低完读样本需要持续监控',
        `互动/阅读 ${fmtCnPct(interactionRate)}，后续要用 CTA 与服务承接提升行动转化`,
      ],
      metrics: [
        metric(`${topContentGroupLabel} 内容占比`, fmtCnPct(top3Share), '', '阅读集中度', 'neutral'),
        metric('最低完读率', lowFinish ? fmtCnPct(lowFinish.finishRate) : '暂无', '', '优化样本', 'warn'),
        metric('互动/阅读', fmtCnPct(interactionRate), '', '深度转化', 'neutral'),
      ],
      components: [
        { type: 'matrix', title: '诊断表', table: diagnosisTable, tone: 'warn' },
        { type: 'risk_card', title: '核心风险', text: '如果只放大推送量而不优化内容结构，阅读表现可能无法稳定转化为互动和长期留存。', tone: 'warn' },
        { type: 'action_card', title: '优先机会', text: '从头部内容中提炼标题、结构、图解和行动指引模板，优先复制到相邻疾病场景。', tone: 'good' },
      ],
      notes: notes('本页把表现数据转成问题诊断，明确后续优先优化方向。'),
    },
    {
      slide_no: 7,
      slide_type: 'closing',
      visual_intent: 'action_plan',
      layout_variant: 'timeline',
      title: '下一步行动建议',
      subtitle: '围绕内容复制、质量优化和项目拓展推进',
      takeaway: '沉淀高表现内容模板，优化低完读内容，强化分层触达和互动引导',
      emphasis: 'timeline',
      bullets: actionItems,
      metrics: [
        metric('优先模板', topItem ? String(topItem.title) : '高阅读内容', '', '作为复盘样本', 'good'),
        metric('优化方向', '完读率与互动率', '', '质量提升重点', 'neutral'),
      ],
      components: [
        { type: 'matrix', title: '行动计划表', table: actionTable, tone: 'good' },
        { type: 'timeline', title: '推进节奏', items: actionItems, tone: 'good' },
        { type: 'takeaway_band', title: '目标', text: '从单次数据复盘转向内容资产沉淀与精细化转化。', tone: 'good' },
      ],
      notes: notes('本页收束为三类行动：复制模板、优化质量、按人群和项目提升转化。'),
    },
  ];
  const selectedSlides = totalSlides >= slides.length
    ? slides.slice(0, totalSlides)
    : [...slides.slice(0, Math.max(1, totalSlides - 1)), { ...slides[slides.length - 1], slide_no: totalSlides }];
  defaultDeck.slides = selectedSlides;
  return sanitizeDirectPptDeck(defaultDeck);
}

function sanitizeDirectPptDeck<T>(value: T): T {
  if (typeof value === 'string') {
    return sanitizeUserVisibleText(value)
      .replace(/(?:…+|⋯+|\.{3,}|。{3,}|&hellip;)/gi, ' ')
      .replace(/\s{2,}/g, ' ')
      .trim() as T;
  }
  if (Array.isArray(value)) return value.map((item) => sanitizeDirectPptDeck(item)) as T;
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([key, item]) => [key, sanitizeDirectPptDeck(item)])) as T;
  }
  return value;
}

function completeDirectPptDeckWithTemplate(deck: Record<string, unknown>, primaryDataContext: Record<string, unknown>, totalSlides: number): Record<string, unknown> {
  const template = directPptTemplateDeck(primaryDataContext, totalSlides);
  const templateSlides = Array.isArray(template.slides) ? template.slides.map(obj) : [];
  const modelSlides = Array.isArray(deck.slides) ? deck.slides.map(obj) : [];
  const byNo = new Map<number, Record<string, unknown>>();
  for (const slide of modelSlides) {
    const no = slideNoFromValue(slide.slide_no);
    if (no && no >= 1 && no <= totalSlides) byNo.set(no, sanitizeDirectPptDeck(slide));
  }
  const slides = templateSlides.map((fallback, index) => {
    const no = index + 1;
    const model = byNo.get(no);
    if (!model) return fallback;
    const merged: Record<string, unknown> = {
      ...fallback,
      ...model,
      slide_no: no,
      bullets: Array.isArray(model.bullets) && model.bullets.length ? model.bullets : fallback.bullets,
      metrics: Array.isArray(model.metrics) && model.metrics.length ? model.metrics : fallback.metrics,
      components: Array.isArray(model.components) && model.components.length ? model.components : fallback.components,
      chart: model.chart || fallback.chart,
      notes: model.notes || fallback.notes,
    };
    if (!String(merged.takeaway || '').trim()) merged.takeaway = fallback.takeaway;
    if (!String(merged.title || '').trim()) merged.title = fallback.title;
    return sanitizeDirectPptDeck(merged);
  });
  return sanitizeDirectPptDeck({
    ...template,
    ...deck,
    title: deck.title || template.title,
    subtitle: deck.subtitle || template.subtitle,
    theme: deck.theme || template.theme,
    design_tokens: { ...obj(template.design_tokens), ...obj(deck.design_tokens) },
    data_display: { ...obj(template.data_display), ...obj(deck.data_display) },
    slides,
  });
}

function normalizeDirectPptDeck(raw: string): Record<string, unknown> | undefined {
  const parsed = SkillExecutor.parseJsonObject(raw);
  if (!parsed) return undefined;
  const deck = obj(parsed.deck || parsed.ppt || parsed.presentation || parsed);
  return Array.isArray(deck.slides) ? sanitizeDirectPptDeck(deck) : undefined;
}

function slideNoFromValue(value: unknown): number | undefined {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? Math.trunc(n) : undefined;
}

function normalizeDirectPptDeckFragment(raw: string, expectedStartSlide: number): Record<string, unknown> | undefined {
  const deck = normalizeDirectPptDeck(raw);
  if (!deck) return undefined;
  const slides = Array.isArray(deck.slides) ? deck.slides.map(obj) : [];
  deck.slides = slides.map((slide, index) => ({
    ...slide,
    slide_no: slideNoFromValue(slide.slide_no ?? slide.page_no ?? slide.page ?? slide.index) ?? expectedStartSlide + index,
  }));
  return deck;
}

function mergeDirectPptDeckFragment(
  current: Record<string, unknown>,
  fragment: Record<string, unknown>,
  expectedStartSlide: number,
  totalSlides: number,
): { ok: boolean; issue?: string; deck: Record<string, unknown>; added: number; lastSlideNo: number } {
  if (hasForbiddenEllipsis(fragment)) {
    return { ok: false, issue: 'deck spec 分批输出中包含省略号，违反硬性禁用规则', deck: current, added: 0, lastSlideNo: expectedStartSlide - 1 };
  }

  const currentSlides = Array.isArray(current.slides) ? current.slides.map(obj) : [];
  const fragmentSlides = Array.isArray(fragment.slides) ? fragment.slides.map(obj) : [];
  if (!fragmentSlides.length) {
    return { ok: false, issue: '本批次没有输出 slides', deck: current, added: 0, lastSlideNo: expectedStartSlide - 1 };
  }

  const preparedSlides: Array<Record<string, unknown>> = fragmentSlides
    .map((slide, index): Record<string, unknown> => ({
      ...slide,
      slide_no: slideNoFromValue(slide.slide_no ?? slide.page_no ?? slide.page ?? slide.index) ?? expectedStartSlide + index,
    }))
    .filter((slide) => Number(slide.slide_no) >= expectedStartSlide && Number(slide.slide_no) <= totalSlides)
    .sort((a, b) => Number(a.slide_no) - Number(b.slide_no));

  if (!preparedSlides.length || Number(preparedSlides[0].slide_no) !== expectedStartSlide) {
    return { ok: false, issue: `本批次必须从第 ${expectedStartSlide} 页开始连续输出`, deck: current, added: 0, lastSlideNo: expectedStartSlide - 1 };
  }

  const accepted: Array<Record<string, unknown>> = [];
  for (let i = 0; i < preparedSlides.length; i += 1) {
    const expectedNo = expectedStartSlide + i;
    const slide = preparedSlides[i];
    if (Number(slide.slide_no) !== expectedNo) break;
    if (!String(slide.title || '').trim()) {
      return { ok: false, issue: `第 ${expectedNo} 页缺少 title`, deck: current, added: 0, lastSlideNo: expectedStartSlide - 1 };
    }
    accepted.push(slide);
  }

  if (!accepted.length) {
    return { ok: false, issue: `本批次未能形成从第 ${expectedStartSlide} 页开始的连续页面`, deck: current, added: 0, lastSlideNo: expectedStartSlide - 1 };
  }

  const nextDeck: Record<string, unknown> = { ...current };
  for (const key of ['title', 'subtitle', 'theme', 'design_tokens', 'data_display']) {
    if (nextDeck[key] === undefined && fragment[key] !== undefined) nextDeck[key] = fragment[key];
  }
  nextDeck.slides = [...currentSlides, ...accepted];
  return {
    ok: true,
    deck: nextDeck,
    added: accepted.length,
    lastSlideNo: Number(accepted[accepted.length - 1].slide_no),
  };
}

function hasForbiddenEllipsis(value: unknown): boolean {
  if (typeof value === 'string') return /(?:…+|⋯+|\.{3,}|。{3,}|&hellip;)/i.test(value);
  if (Array.isArray(value)) return value.some(hasForbiddenEllipsis);
  if (value && typeof value === 'object') return Object.values(value as Record<string, unknown>).some(hasForbiddenEllipsis);
  return false;
}

function validateDirectPptDeck(deck: Record<string, unknown>, expectedSlides = 6): string[] {
  const issues: string[] = [];
  const slides = Array.isArray(deck.slides) ? deck.slides.map(obj) : [];
  if (slides.length !== expectedSlides) issues.push(`slides 必须拼接成完整 ${expectedSlides} 页，当前 ${slides.length} 页`);
  if (hasForbiddenEllipsis(deck)) issues.push('deck spec 中包含省略号，违反硬性禁用规则');
  const firstType = normalizeTypeForCheck(slides[0]?.slide_type);
  const lastType = normalizeTypeForCheck(slides.at(-1)?.slide_type);
  if (firstType !== 'cover') issues.push('第 1 页必须是 cover');
  if (!['closing', 'thanks'].includes(lastType)) issues.push('最后 1 页必须是 closing');
  slides.slice(1, -1).forEach((slide, index) => {
    const pageNo = index + 2;
    if (!String(slide.title || '').trim()) issues.push(`第 ${pageNo} 页缺少 title`);
    if (!String(slide.takeaway || '').trim()) issues.push(`第 ${pageNo} 页缺少 takeaway`);
  });
  return issues;
}

function normalizeTypeForCheck(value: unknown): string {
  return String(value || '').trim().toLowerCase().replace(/[\s-]+/g, '_');
}

function compactDeckForLog(deck: Record<string, unknown>): Record<string, unknown> {
  const slides = Array.isArray(deck.slides) ? deck.slides.map((slide) => {
    const row = obj(slide);
    return {
      slide_type: row.slide_type,
      title: row.title,
      component_count: Array.isArray(row.components) ? row.components.length : 0,
      metric_count: Array.isArray(row.metrics) ? row.metrics.length : 0,
      bullet_count: Array.isArray(row.bullets) ? row.bullets.length : 0,
      has_chart: Boolean(row.chart),
    };
  }) : [];
  return { title: deck.title, subtitle: deck.subtitle, theme: deck.theme, slide_count: slides.length, slides };
}

function fmtCnInt(value: unknown): string {
  const n = Number(value || 0);
  return Number.isFinite(n) ? Math.round(n).toLocaleString('zh-CN') : '0';
}

function fmtCnPct(value: unknown, digits = 1): string {
  const n = Number(value || 0);
  return Number.isFinite(n) ? `${(n * 100).toFixed(digits)}%` : '0.0%';
}

function safeRate(numerator: unknown, denominator: unknown): number {
  const a = Number(numerator || 0);
  const b = Number(denominator || 0);
  return b ? a / b : 0;
}

function buildOverviewSummaryText(primaryDataContext: Record<string, unknown>): string {
  const scope = obj(primaryDataContext.scope);
  const metrics = obj(primaryDataContext.primary_metrics);
  const rangeValue = obj(metrics.range);
  const kpi = obj(metrics.coreKpi);
  const projects = Array.isArray(metrics.projects) ? metrics.projects.map(obj) : [];
  const topContent = Array.isArray(metrics.topContent) ? metrics.topContent.map(obj) : [];
  const insights = Array.isArray(metrics.insights) ? metrics.insights.map(String).filter(Boolean) : [];
  const topProject = projects[0];
  const topItem = topContent[0];
  const deliveryRate = safeRate(kpi.deliveredCount, kpi.pushCount);
  const readConversion = safeRate(kpi.readUsers, kpi.deliveredCount);
  const interactionRate = safeRate(kpi.interactionCount, kpi.readCount);
  const rangeText = `${String(rangeValue.start || obj(scope.dateRange).start || '')} 至 ${String(rangeValue.end || obj(scope.dateRange).end || '')}`;
  const lines = [
    `## 患教内容运营数据概览｜${String(scope.label || '当前周期')}`,
    '',
    `**数据周期**：${rangeText}`,
    '',
    `本周期累计推送 **${fmtCnInt(kpi.pushCount)}** 次，送达 **${fmtCnInt(kpi.deliveredCount)}** 次，触达阅读用户 **${fmtCnInt(kpi.readUsers)}** 人，产生阅读 **${fmtCnInt(kpi.readCount)}** 次，互动 **${fmtCnInt(kpi.interactionCount)}** 次。整体送达率为 **${fmtCnPct(deliveryRate)}**，送达后阅读转化为 **${fmtCnPct(readConversion)}**，互动/阅读为 **${fmtCnPct(interactionRate)}**，完读率 **${fmtCnPct(kpi.finishRate)}**，平均阅读时长约 **${Number(kpi.avgReadSec || 0).toFixed(0)} 秒**。`,
    '',
  ];
  if (topProject || topItem) {
    lines.push('**结构判断**：');
    if (topProject) lines.push(`- 项目贡献最高的是「${String(topProject.name || '未命名项目')}」，贡献阅读 **${fmtCnInt(topProject.readCount)}** 次、互动 **${fmtCnInt(topProject.interactionCount)}** 次。`);
    if (topItem) lines.push(`- TOP 内容为「${String(topItem.title || '未命名内容')}」，阅读 **${fmtCnInt(topItem.readCount)}** 次，完读率 **${fmtCnPct(topItem.finishRate)}**。`);
    lines.push('');
  }
  if (insights.length) {
    lines.push('**重点关注**：');
    for (const item of insights.slice(0, 3)) lines.push(`- ${item}`);
    lines.push('');
  }
  return lines.join('\n');
}

function buildDirectPptEarlySummaryText(primaryDataContext: Record<string, unknown>, totalSlides: number): string {
  const scope = obj(primaryDataContext.scope);
  const metrics = obj(primaryDataContext.primary_metrics);
  const rangeValue = obj(metrics.range);
  const kpi = obj(metrics.coreKpi);
  const projects = directPptActiveProjects(metrics);
  const topContent = Array.isArray(metrics.topContent) ? metrics.topContent.map(obj) : [];
  const topProject = projects[0];
  const topItem = topContent[0];
  const rangeText = `${String(rangeValue.start || obj(scope.dateRange).start || '')} 至 ${String(rangeValue.end || obj(scope.dateRange).end || '')}`;
  const lines = [
    `已完成数据聚合，正在生成 ${totalSlides} 页 PPT 快速版。`,
    `数据周期：${rangeText}。`,
    `核心指标：推送 ${fmtCnInt(kpi.pushCount)} 次，阅读 ${fmtCnInt(kpi.readCount)} 次，互动 ${fmtCnInt(kpi.interactionCount)} 次，完读率 ${fmtCnPct(kpi.finishRate)}。`,
  ];
  if (topProject) lines.push(`主力项目：${String(topProject.name || '')}，阅读 ${fmtCnInt(topProject.readCount)} 次。`);
  if (topItem) lines.push(`头部内容：${String(topItem.title || '')}，阅读 ${fmtCnInt(topItem.readCount)} 次。`);
  return sanitizeUserVisibleText(lines.filter(Boolean).join('\n'));
}

function buildOverviewVisualPlan(primaryDataContext: Record<string, unknown>): Record<string, unknown> {
  const scope = obj(primaryDataContext.scope);
  const metrics = obj(primaryDataContext.primary_metrics);
  const kpi = obj(metrics.coreKpi);
  const projects = Array.isArray(metrics.projects) ? metrics.projects.map(obj) : [];
  const topContent = Array.isArray(metrics.topContent) ? metrics.topContent.map(obj) : [];
  const insights = Array.isArray(metrics.insights) ? metrics.insights.map(String).filter(Boolean) : [];
  const dateRange = obj(scope.dateRange);
  const topProject = projects[0];
  const topItem = topContent[0];
  const planInsights = [
    `核心表现：推送${fmtCnInt(kpi.pushCount)}次，送达${fmtCnInt(kpi.deliveredCount)}次，阅读人数${fmtCnInt(kpi.readUsers)}，完读率${fmtCnPct(kpi.finishRate)}。`,
    topProject ? `项目贡献：${String(topProject.name || '头部项目')}贡献${fmtCnInt(topProject.readCount)}次阅读，是当前主要阅读来源。` : '',
    topItem ? `内容表现：${String(topItem.title || '头部内容')}阅读${fmtCnInt(topItem.readCount)}次，可作为后续选题参考。` : '',
    ...insights,
  ].filter(Boolean).slice(0, 5);
  return {
    title: `患教内容运营数据概览（${String(scope.label || '当前周期')}）`,
    subtitle: dateRange.start && dateRange.end ? `${dateRange.start} 至 ${dateRange.end}` : undefined,
    dateRange: dateRange.start && dateRange.end ? { start: dateRange.start, end: dateRange.end } : undefined,
    insights: planInsights,
    top_content_count: 5,
    breakdown_count: 3,
  };
}

async function generateMonthlyInsights(req: RunRequest, rootDir: string, current: PrefetchMetrics, previous: PrefetchMetrics | undefined, dateRange: DateRange, compareRange: DateRange | undefined, signal?: AbortSignal): Promise<MonthlyInsights> {
  if (!hasMonthlyAnalysisActivity(current)) {
    runtimeLog('monthly_insights_fallback', { rootDir, reason: 'no_current_read_or_interaction_activity', dateRange, compareRange, ...requestLog(req) });
    return fallbackMonthlyInsights(current);
  }
  const monthlyInsightTimeoutMs = Math.max(
    20_000,
    Math.min(60_000, Number(process.env.AI_HELPER_MONTHLY_INSIGHT_TIMEOUT_MS || 55_000) || 55_000),
  );
  const ai = new AIService({
    model: process.env.AI_HELPER_MONTHLY_INSIGHT_MODEL || 'qwen3.7-max',
    timeoutMs: monthlyInsightTimeoutMs,
  });
  const messages = buildMonthlyInsightPrompt(current, previous, dateRange, compareRange);
  const maxAttempts = 1;
  let lastError: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const started = Date.now();
    runtimeLog('model_start', { step: 'monthly_insights', attempt, max_attempts: maxAttempts, timeout_ms: monthlyInsightTimeoutMs, rootDir, model: ai.modelName(), messages, ...requestLog(req) });
    try {
      const result = await withHardTimeout(
        ai.chatDetailed(messages, signal),
        monthlyInsightTimeoutMs + 5_000,
        '月报复盘结论生成超时，已切换为规则结论',
      );
      const duration = Date.now() - started;
      runtimeLog('model_end', { step: 'monthly_insights', attempt, max_attempts: maxAttempts, rootDir, duration_ms: duration, output: result.text, raw_response: result.rawResponse, request: result.request, cache_usage: result.cacheUsage, ...requestLog(req) });
      modelIoLog({
        step: attempt,
        rootDir,
        model: ai.modelName(),
        duration_ms: duration,
        messages,
        output: result.text,
        request: result.request,
        meta: { ...requestLog(req), direct_pipeline: 'monthly_template_insights', attempt, max_attempts: maxAttempts },
        cache_usage: result.cacheUsage,
      });
      return normalizeMonthlyInsights(parseInsightJson(result.text), current);
    } catch (err) {
      if (isAbortError(err)) throw err;
      lastError = err;
      const duration = Date.now() - started;
      runtimeLog('model_error', { step: 'monthly_insights', attempt, max_attempts: maxAttempts, rootDir, duration_ms: duration, model: ai.modelName(), error: modelErrorLog(err), fallback_to_rule_based: attempt >= maxAttempts, ...requestLog(req) });
      modelIoLog({
        step: attempt,
        rootDir,
        model: ai.modelName(),
        duration_ms: duration,
        messages,
        error: modelErrorLog(err),
        meta: { ...requestLog(req), direct_pipeline: 'monthly_template_insights', attempt, max_attempts: maxAttempts, fallback_to_rule_based: attempt >= maxAttempts },
      });
    }
  }
  runtimeLog('monthly_insights_fallback', { rootDir, reason: modelErrorLog(lastError), ...requestLog(req) });
  return fallbackMonthlyInsights(current);
}

export async function* streamAssistant(req: RunRequest, options: StreamAssistantOptions = {}): AsyncGenerator<string> {
  const { rootDir } = createRunDirectory(req.conversation_id, req.run_id);
  const signal = options.signal;
  const enforcedTenantId = enforcedTenantIdFromOptions(options);
  throwIfAborted(signal);
  const started = Date.now();
  const ai = new AIService();
  const registry = new SkillRegistry();
  const explicitShortcut = asShortcut(req.shortcut);
  const hasPreviousTurn = previousHistoryTurn(req).length > 0;
  const contextFallbackIntent = !explicitShortcut ? contextAwarePptEditFallbackIntentFromText(req) : undefined;
  const classifiedIntent = !explicitShortcut && !contextFallbackIntent ? await classifyAssistantIntent(req, rootDir, signal) : undefined;
  const contextFallbackShortcut = shortcutFromIntent(contextFallbackIntent);
  const classifiedShortcut = shortcutFromIntent(classifiedIntent);
  const fallbackIntent = !explicitShortcut && !contextFallbackShortcut && !classifiedShortcut ? strongFallbackIntentFromText(req) : undefined;
  const effectiveIntent = contextFallbackIntent || (classifiedShortcut ? classifiedIntent : (fallbackIntent || classifiedIntent));
  const classifiedPptEdit = Boolean(effectiveIntent?.task === 'ppt_edit' || (effectiveIntent?.task === 'ppt' && effectiveIntent.is_modification));
  const includePreviousTurn = Boolean(classifiedPptEdit && hasPreviousTurn);
  const shortcut = explicitShortcut || contextFallbackShortcut || classifiedShortcut || shortcutFromIntent(fallbackIntent);
  const reqWithIntentRange: RunRequest = {
    ...req,
    date_range: normalizeDateRangeValue(req.date_range ?? obj(req).dateRange) || effectiveIntent?.date_range || req.date_range,
    compare_range: normalizeDateRangeValue(req.compare_range ?? obj(req).compareRange) || effectiveIntent?.compare_range || req.compare_range,
    date_label: cleanDateLabel(req.date_label ?? obj(req).dateLabel) || effectiveIntent?.date_label || req.date_label,
    granularity: asGranularity(req.granularity) || effectiveIntent?.granularity || req.granularity,
  };
  const effectiveReq: RunRequest = shortcut
    ? { ...reqWithIntentRange, shortcut, data_scope: asDataScope(reqWithIntentRange.data_scope) || defaultDataScope(shortcut) }
    : reqWithIntentRange;
  const isPremiumPptSvg = shortcut === 'ppt_svg';
  const uploadContext: AiHelperUploadContext = {
    userId: options.userId,
    tenantId: options.tenantId,
    conversationId: req.conversation_id,
    runId: req.run_id,
  };
  const publishedFileCache = new Map<string, string>();
  const publishFiles = async (files: string[]): Promise<string[]> => {
    const missing = [...new Set(files.filter((file) => !publishedFileCache.has(file)))];
    if (missing.length) {
      const published = await uploadAiHelperFiles(missing, uploadContext);
      missing.forEach((file, index) => publishedFileCache.set(file, published[index] || file));
    }
    return files.map((file) => publishedFileCache.get(file) || file);
  };
  const executor = new SkillExecutor(rootDir, { allowManualPptSvg: isPremiumPptSvg, signal, publishFiles, tenantId: enforcedTenantId });
  const trace: AgentDonePayload['trace'] = [];
  const backgroundJobs: BackgroundJob[] = [];
  const injected = new Set<string>();
  const skillsUsed = new Set<string>();
  let earlyTextEmitted = false;
  let earlyTextContent = '';
  const maxSteps = Number(process.env.AI_HELPER_MAX_STEPS || 60);
  const modelTimeoutRetries = Math.max(1, Number(process.env.AI_HELPER_MODEL_TIMEOUT_RETRIES || 3) || 3);

  const emit = (type: string, data: unknown): string => {
    throwIfAborted(signal);
    const safeData = sanitizeUserVisibleData(data);
    runtimeLog('stream_event', { type, data: safeData, rootDir, ...requestLog(effectiveReq) });
    return eventLine(type, safeData);
  };

  const modelProgressMessage = (progress: ChatStreamProgress, meta: Record<string, unknown>): string => {
    const donePrefix = progress.done ? '模型响应已完成：' : '';
    if (progress.action === 'write_ppt_svg_slide') {
      const page = progress.slideNo ? `第 ${progress.slideNo} 页` : 'PPT 页面';
      const title = progress.slideTitle ? `「${progress.slideTitle}」` : '';
      const conclusion = progress.coreConclusion ? `，核心内容：${progress.coreConclusion}` : '';
      return `${donePrefix}正在绘制${page}${title}${conclusion}`;
    }
    if (progress.action === 'render_ppt_from_specs') return `${donePrefix}正在生成 PPT 页面预览方案`;
    if (progress.action === 'ppt_master_export') return `${donePrefix}正在准备导出可编辑 PPTX`;
    if (progress.action === 'write_project_files' || progress.action === 'write_project_file') return `${donePrefix}正在整理 PPT 结构、设计规范和讲稿备注`;
    if (progress.action === 'emit_text') return `${donePrefix}正在生成用户可见摘要`;
    if (progress.action === 'read_metric_file' || progress.action === 'prefetch_metrics') return `${donePrefix}正在规划补充读取指标数据`;
    if (progress.responseType === 'final') return `${donePrefix}正在整理最终回复`;

    const batchStart = Number(meta.batch_start);
    const batchEnd = Number(meta.batch_end);
    if (Number.isInteger(batchStart) && Number.isInteger(batchEnd) && batchStart > 0 && batchEnd >= batchStart) {
      return batchStart === batchEnd
        ? `${donePrefix}正在生成第 ${batchStart} 页内容草稿与页面结构`
        : `${donePrefix}正在生成第 ${batchStart}-${batchEnd} 页内容草稿与页面结构`;
    }
    if (progress.contentChars >= 1000) return `${donePrefix}模型正在输出结构化方案`;
    if (progress.chunkCount > 0) return `${donePrefix}模型正在分析下一步动作`;
    return `${donePrefix}模型正在输出结构化计划`;
  };

  const callModelWithProgress = async function* (
    modelClient: AIService,
    callMessages: ChatMessage[],
    meta: Record<string, unknown>,
  ): AsyncGenerator<string, ChatResult> {
    const queue: string[] = [];
    let wake: (() => void) | undefined;
    let settled = false;
    let result: ChatResult | undefined;
    let error: unknown;
    const notify = () => {
      if (wake) {
        const fn = wake;
        wake = undefined;
        fn();
      }
    };
    const push = (line: string) => {
      queue.push(line);
      notify();
    };
    void modelClient.chatDetailed(callMessages, signal, {
      onProgress: (progress) => {
        push(emit('model_progress', {
          phase: 'model_stream',
          message: modelProgressMessage(progress, meta),
          model: modelClient.modelName(),
          step: meta.step,
          attempt: meta.attempt,
          max_attempts: meta.max_attempts,
          batch_start: meta.batch_start,
          batch_end: meta.batch_end,
          chunk_count: progress.chunkCount,
          content_chars: progress.contentChars,
          reasoning_chars: progress.reasoningChars,
          total_chars: progress.totalChars,
          elapsed_ms: progress.elapsedMs,
          first_chunk_ms: progress.firstChunkMs,
          action: progress.action,
          response_type: progress.responseType,
          slide_no: progress.slideNo,
          slide_title: progress.slideTitle,
          core_conclusion: progress.coreConclusion,
          done: progress.done === true,
        }));
      },
    }).then((value) => {
      result = value;
    }).catch((err) => {
      error = err;
    }).finally(() => {
      settled = true;
      notify();
    });

    while (!settled || queue.length) {
      while (queue.length) yield queue.shift()!;
      if (!settled) {
        await new Promise<void>((resolve) => {
          wake = resolve;
          if (settled || queue.length) {
            wake = undefined;
            resolve();
          }
        });
      }
    }
    if (error) throw error;
    if (!result) throw new AIServiceError('模型流式调用未返回结果');
    return result;
  };

  runtimeLog('request_start', { mode: 'new-ai-ts', rootDir, runtime_log_path: RUNTIME_LOG_PATH, model_io_log_path: MODEL_IO_LOG_PATH, run_model_io_log_path: path.join(rootDir, 'model_io.md'), classified_intent: classifiedIntent, context_fallback_intent: contextFallbackIntent, fallback_intent: fallbackIntent, include_previous_turn: includePreviousTurn, inferred_shortcut: !explicitShortcut && shortcut ? shortcut : undefined, ...requestLog(effectiveReq) });
  yield emit('status', '开始处理请求...');
  const routeNote = !explicitShortcut && shortcut === 'ppt' && effectiveIntent?.task === 'ppt' && effectiveIntent.ppt_mode === 'unspecified'
    ? '已为你选择 PPT 快速版；如需更强视觉效果，可使用 PPT 精美版。'
    : undefined;
  if (shortcut) {
    yield emit('route', {
      shortcut,
      data_scope: effectiveReq.data_scope,
      date_range: effectiveReq.date_range,
      compare_range: effectiveReq.compare_range,
      date_label: effectiveReq.date_label,
      label: routeLabel(shortcut),
      inferred: !explicitShortcut,
      task: effectiveIntent?.task,
      ppt_mode: shortcut === 'ppt_svg' ? 'premium' : shortcut === 'ppt' ? 'fast' : effectiveIntent?.ppt_mode,
      confidence: effectiveIntent?.confidence,
      is_followup: effectiveIntent?.is_followup,
      is_modification: effectiveIntent?.is_modification,
      history_included: includePreviousTurn,
      note: routeNote,
    });
  }
  if (routeNote) yield emit('text', `${routeNote}\n\n`);
  yield emit('progress', { phase: 'planning', message: '正在预取 PX 主数据并加载技能目录', step: 0 });

  if (shortcut === 'overview') {
    const trace: AgentDonePayload['trace'] = [];
    const skillsUsed = new Set<string>(['patient-education-data-overview', 'md-to-pdf']);
    try {
      yield emit('progress', { phase: 'data', message: '正在聚合本轮数据周期的核心指标、项目贡献与内容表现', step: 1 });
      const primaryDataContext = await buildPrimaryDataContext(effectiveReq, rootDir, enforcedTenantId);
      const summaryText = buildOverviewSummaryText(primaryDataContext);
      const emitTextResult = await executor.execute({
        type: 'skill_call',
        skill_id: 'patient-education-data-overview',
        action: 'emit_text',
        params: { content: summaryText },
        thought: '后端确定性流程先输出用户可见文字总结。',
      });
      yield emit('skill_result', emitTextResult);
      if (emitTextResult.text) yield emit('text', emitTextResult.text);
      yield emit('progress', { phase: 'file_generation', message: '文字总结已生成，继续生成概览文件', step: 2, ok: true });

      const visualPlan = buildOverviewVisualPlan(primaryDataContext);
      const overviewCall: SkillCall = {
        type: 'skill_call',
        skill_id: 'patient-education-data-overview',
        action: 'run_skill_script',
        params: {
          script: 'scripts/render_overview_assets.ts',
          args: ['--visual-plan', JSON.stringify(visualPlan)],
          timeout_sec: 120,
        },
        thought: '后端确定性流程自动生成 Markdown、HTML、PNG 概览文件。',
      };
      yield emit('progress', { phase: 'file_generation', message: '正在生成 Markdown、HTML 和 PNG 概览文件', step: 3, skill_id: overviewCall.skill_id, action: overviewCall.action });
      const overviewResult = await executor.execute(overviewCall);
      trace.push({ step: 'auto_overview_assets', call: compactCallForTrace(overviewCall, overviewResult), result: overviewResult });
      yield emit('skill_result', overviewResult);
      if (overviewResult.ok === false) throw new Error(overviewResult.error || '数据概览文件生成失败');

      const pdfCall = overviewPdfAutoCall();
      yield emit('progress', { phase: 'file_generation', message: '正在将 Markdown 概览转换为 PDF', step: 4, skill_id: pdfCall.skill_id, action: pdfCall.action });
      const pdfResult = await executor.execute(pdfCall);
      trace.push({ step: 'auto_overview_pdf', call: compactCallForTrace(pdfCall, pdfResult), result: pdfResult });
      yield emit('skill_result', pdfResult);

      const files = collectFiles(trace);
      if (files.length) yield emit('files', files);
      const finalAnswer = pdfResult.ok === false
        ? '数据概览已生成：\n上方已先输出文字总结。\nMarkdown、HTML 和 PNG 文件可在下方查看与下载。\nPDF 自动转换未完成，可先下载已生成文件。'
        : '数据概览已生成：\n上方已先输出文字总结。\nMarkdown、HTML、PNG 和 PDF 文件可在下方查看与下载。';
      yield emit('text', `\n\n${finalAnswer}`);
      yield emit('progress', { phase: pdfResult.ok === false ? 'error' : 'complete', message: pdfResult.ok === false ? '数据概览 PDF 转换失败' : '数据概览生成完成', step: 5, ok: pdfResult.ok !== false });
      yield emit('done', { text: `${summaryText}\n\n${finalAnswer}`, files, skills_used: [...skillsUsed], trace, background_jobs: [] });
      runtimeLog('request_end', { rootDir, duration_ms: Date.now() - started, text: finalAnswer, files, skills_used: [...skillsUsed], trace, background_jobs: [], direct_overview_pipeline: true, ...requestLog(effectiveReq) });
      return;
    } catch (err) {
      if (isAbortError(err)) throw err;
      const files = collectFiles(trace);
      const text = '数据概览生成失败，请稍后重试。';
      yield emit('text', text);
      yield emit('progress', { phase: 'error', message: '数据概览生成失败', step: 99, ok: false });
      yield emit('done', { text, files, skills_used: ['patient-education-data-overview'], trace, background_jobs: [] });
      runtimeLog('request_end', { rootDir, duration_ms: Date.now() - started, text, files, skills_used: ['patient-education-data-overview'], trace, background_jobs: [], direct_overview_pipeline: true, error: modelErrorLog(err), ...requestLog(effectiveReq) });
      return;
    }
  }

  let activePptContext = latestActivePptContext(effectiveReq);
  if (classifiedPptEdit && !activePptContext) {
    activePptContext = await latestDraftPptContextFromFileRecords(effectiveReq, uploadContext.userId, uploadContext.tenantId).catch((err) => {
      runtimeLog('draft_ppt_context_restore_failed', { rootDir, error: modelErrorLog(err), ...requestLog(effectiveReq) });
      return undefined;
    });
    if (activePptContext) {
      runtimeLog('draft_ppt_context_restored', { rootDir, active_ppt_context: activePptContextForPrompt(activePptContext), ...requestLog(effectiveReq) });
    }
  }
  const isDraftPptEdit = Boolean(activePptContext && !activePptContext.exportedPptx);
  const isPptLocalEdit = classifiedPptEdit && (shortcut === 'ppt' || shortcut === 'ppt_svg') && activePptContext;
  if (isPptLocalEdit && activePptContext) {
    const editActivePptContext = activePptContext;
    const trace: AgentDonePayload['trace'] = [];
    const skillsUsed = new Set<string>(['ppt-master']);
    const editExecutor = new SkillExecutor(rootDir, { allowManualPptSvg: true, signal, publishFiles, tenantId: enforcedTenantId });
    const isPremiumLocalEdit = shortcut === 'ppt_svg' || effectiveIntent?.ppt_mode === 'premium';
    let expectedEditPages: number[] = [];
    const writtenEditPages = new Set<number>();
    let exported = false;
    let clonedProjectPath = '';
    const parseEditPageNumbers = (value: unknown): number[] => (
      Array.isArray(value)
        ? [...new Set(value.map(Number).filter((n) => Number.isInteger(n) && n > 0 && n < 100))].sort((a, b) => a - b)
        : []
    );
    const editMessages: ChatMessage[] = [
      { role: 'system', content: withCacheControl(SYSTEM_PROMPT) },
      { role: 'system', content: `协议与动作说明: ${JSON.stringify(editExecutor.actionSpec({ mode: 'ppt-edit-svg' }))}` },
      { role: 'system', content: `本轮交付根目录：${rootDir}\n最终导出的 PPTX 必须落在该目录下。` },
      { role: 'system', content: isPremiumLocalEdit ? PPT_EDIT_PREMIUM_SVG_PROMPT : PPT_EDIT_SVG_PROMPT },
      {
        role: 'user',
        content: JSON.stringify({
          task: isPremiumLocalEdit ? 'premium_edit_existing_ppt_pages' : 'edit_existing_ppt_pages',
          user_request: (effectiveReq.message || effectiveReq.command || '').trim(),
          edit_quality: isPremiumLocalEdit ? 'premium_local_page_redesign' : 'local_page_edit',
          active_ppt_context: activePptContextForPrompt(editActivePptContext),
          required_behavior: [
            '先判断 edit_pages 和 copy_pages。',
            '禁止向用户追问或要求补充说明；信息不完整时必须基于上下文自行推断并直接开始修改。',
            '必须先调用 ppt_master_clone_for_edit。',
            '只对 edit_pages 调用 write_ppt_svg_slide。',
            '其他页面由 clone 工具复用，不要重画。',
            ...(isPremiumLocalEdit ? ['“精美版”只适用于 edit_pages 的视觉质量，不代表全量重做。'] : []),
            ...(isDraftPptEdit
              ? [
                '当前上一版还只是 SVG 草稿，尚未导出 PPTX；本轮不要强制导出 PPTX。',
                '完成目标 SVG 页面重绘后即可 final，并返回更新后的 SVG 页面预览；用户满意后再继续生成或导出 PPTX。',
              ]
              : ['最后调用 ppt_master_export。']),
          ],
        }, null, 2),
      },
    ];
    try {
      const userEditRequest = (effectiveReq.message || effectiveReq.command || '').trim();
      const prefaceMessages: ChatMessage[] = [
        {
          role: 'system',
          content: [
            '你是 PX 医疗患教数据助手。当前用户要修改上一份 PPT。',
            '请先输出一段给用户看的中文说明，说明你理解到的修改目标、将优先定位相关页面并完成局部修改。',
            '禁止询问用户、禁止让用户补充说明、禁止输出“请说明您具体需要调整哪些内容或元素”等追问；即使需求较笼统，也要说明会基于上一版上下文自动定位并直接开始修改。',
            '要求：只输出自然语言，不要 JSON，不要 Markdown 表格，不要提 skill、工具、内部路径、底层字段、run_id/conversation_id 等底层细节。',
            '控制在 80 字以内，语气直接、明确。',
          ].join('\n'),
        },
        {
          role: 'user',
          content: JSON.stringify({
            user_request: userEditRequest,
            ppt_context: {
              slide_count: editActivePptContext.slideCount,
              slides: editActivePptContext.slides.map((slide) => ({
                slide_no: slide.slideNo,
                title: slide.title,
                slide_type: slide.slideType,
              })),
            },
          }, null, 2),
        },
      ];
      const prefaceStarted = Date.now();
      runtimeLog('model_start', { step: 'ppt_edit_preface', rootDir, model: ai.modelName(), messages: prefaceMessages, ...requestLog(effectiveReq) });
      const prefaceResult = yield* callModelWithProgress(ai, prefaceMessages, { step: 'ppt_edit_preface' });
      const prefaceDuration = Date.now() - prefaceStarted;
      runtimeLog('model_end', { step: 'ppt_edit_preface', rootDir, duration_ms: prefaceDuration, output: prefaceResult.text, raw_response: prefaceResult.rawResponse, request: prefaceResult.request, cache_usage: prefaceResult.cacheUsage, ...requestLog(effectiveReq) });
      modelIoLog({
        step: 0,
        rootDir,
        model: ai.modelName(),
        duration_ms: prefaceDuration,
        messages: prefaceMessages,
        output: prefaceResult.text,
        request: prefaceResult.request,
        meta: { ...requestLog(effectiveReq), direct_pipeline: 'ppt_edit_preface' },
        cache_usage: prefaceResult.cacheUsage,
        recovered_from_reasoning_content: prefaceResult.recoveredFromReasoningContent,
      });
      const prefaceText = sanitizePptEditPrefaceText(prefaceResult.text);
      yield emit('text', `${prefaceText}\n\n`);
      yield emit('progress', { phase: 'planning', message: '已识别为 PPT 局部修改，正在准备上一版页面上下文', step: 1, history_included: true });
      for (let step = 1; step <= 10; step += 1) {
        const modelStarted = Date.now();
        runtimeLog('model_start', { step: `ppt_edit_${step}`, rootDir, model: ai.modelName(), messages: editMessages, ...requestLog(effectiveReq) });
        const result = yield* callModelWithProgress(ai, editMessages, { step: `ppt_edit_${step}` });
        const duration = Date.now() - modelStarted;
        runtimeLog('model_end', { step: `ppt_edit_${step}`, rootDir, duration_ms: duration, output: result.text, raw_response: result.rawResponse, request: result.request, cache_usage: result.cacheUsage, ...requestLog(effectiveReq) });
        modelIoLog({
          step,
          rootDir,
          model: ai.modelName(),
          duration_ms: duration,
          messages: editMessages,
          output: result.text,
          request: result.request,
          meta: { ...requestLog(effectiveReq), direct_pipeline: 'ppt_edit_pages' },
          cache_usage: result.cacheUsage,
          recovered_from_reasoning_content: result.recoveredFromReasoningContent,
        });

        const parsed = SkillExecutor.parseJsonObject(result.text);
        if (!parsed) throw new Error('PPT 编辑模型未返回合法 JSON');
        const final = asFinal(parsed);
        if (final) {
          if (!exported && !isDraftPptEdit) {
            editMessages.push({ role: 'assistant', content: result.text });
            editMessages.push({ role: 'user', content: '尚未导出新的 PPTX。请继续调用 ppt_master_export，导出完成后再 final。' });
            continue;
          }
          if (isDraftPptEdit && expectedEditPages.length && !expectedEditPages.every((page) => writtenEditPages.has(page))) {
            editMessages.push({ role: 'assistant', content: result.text });
            editMessages.push({ role: 'user', content: `尚未完成目标 SVG 页面重绘，缺少第 ${expectedEditPages.filter((page) => !writtenEditPages.has(page)).join(', ')} 页。请继续调用 write_ppt_svg_slide。` });
            continue;
          }
          const files = collectFiles(trace, final.deliverable_files);
          const nextPptContext = activePptContextFromEditTrace(editActivePptContext, trace);
          if (files.length) yield emit('files', files);
          const finalText = sanitizePptEditFinalText(final.answer);
          yield emit('done', { text: finalText, files, skills_used: [...skillsUsed], trace, background_jobs: [], activePptContext: nextPptContext });
          runtimeLog('request_end', { rootDir, duration_ms: Date.now() - started, text: finalText, files, skills_used: [...skillsUsed], trace, direct_ppt_edit_pipeline: true, ...requestLog(effectiveReq) });
          return;
        }
        if (!isSkillCall(parsed)) throw new Error('PPT 编辑模型输出既不是 skill_call 也不是 final');
        const call = parsed;
        call.params = { ...obj(call.params) };
        if (call.action === 'ppt_master_bootstrap') {
          editMessages.push({ role: 'assistant', content: result.text });
          editMessages.push({
            role: 'user',
            content: [
              'INVALID_PPT_EDIT_ACTION:',
              '这是 PPT 局部编辑，禁止新建项目或重做整套 PPT。',
              '请改为先调用 ppt_master_clone_for_edit，复制上一版项目，只清空并重绘 edit_pages。',
            ].join('\n'),
          });
          yield emit('progress', { phase: 'retry', message: '局部编辑禁止重做整套 PPT，正在要求改为复制上一版后只改目标页', step, ok: false });
          continue;
        }
        if (call.action === 'ppt_master_clone_for_edit') {
          const params = obj(call.params);
          if (!params.source_project_path && !params.sourceProjectPath) params.source_project_path = editActivePptContext.projectPath;
          const editPages = parseEditPageNumbers(params.edit_pages || params.editPages);
          if (editPages.length && !parseEditPageNumbers(params.copy_pages || params.copyPages).length) {
            params.copy_pages = Array.from({ length: editActivePptContext.slideCount }, (_, i) => i + 1).filter((page) => !editPages.includes(page));
          }
          call.params = params;
        }
        if (call.action === 'read_project_file') {
          call.params = { ...obj(call.params), project_path: clonedProjectPath || editActivePptContext.projectPath };
        }
        if (['write_ppt_svg_slide', 'write_project_file', 'write_project_files', 'ppt_master_export'].includes(call.action)) {
          if (!clonedProjectPath) {
            editMessages.push({ role: 'assistant', content: result.text });
            editMessages.push({
              role: 'user',
              content: [
                'INVALID_PPT_EDIT_ORDER:',
                '还没有复制上一版 PPT 项目，不能写入页面或导出。',
                `请先调用 ppt_master_clone_for_edit，source_project_path 必须为 "${editActivePptContext.projectPath}"，并传入 edit_pages 和 copy_pages。`,
              ].join('\n'),
            });
            yield emit('progress', { phase: 'retry', message: '局部编辑需要先复制上一版 PPT，正在要求先克隆项目', step, ok: false });
            continue;
          }
          call.params = { ...obj(call.params), project_path: clonedProjectPath };
        }
        if (call.action === 'write_ppt_svg_slide' && expectedEditPages.length) {
          const requestedSlideNo = Number(obj(call.params).slide_no);
          if (!expectedEditPages.includes(requestedSlideNo)) {
            editMessages.push({ role: 'assistant', content: result.text });
            editMessages.push({
              role: 'user',
              content: `INVALID_PPT_EDIT_PAGE: 只能重绘 edit_pages=${expectedEditPages.join(', ')}，不能重写第 ${requestedSlideNo || '未知'} 页。请只写目标页，其他页面由 clone 工具复用。`,
            });
            yield emit('progress', { phase: 'retry', message: '局部编辑不能重写非目标页，正在要求只写目标页', step, ok: false });
            continue;
          }
        }
        if (call.action === 'ppt_master_export' && expectedEditPages.length && !expectedEditPages.every((page) => writtenEditPages.has(page))) {
          throw new Error(`PPT 编辑页尚未全部写入，缺少第 ${expectedEditPages.filter((page) => !writtenEditPages.has(page)).join(', ')} 页`);
        }
        if (isDraftPptEdit && call.action === 'ppt_master_export') {
          editMessages.push({ role: 'assistant', content: result.text });
          editMessages.push({ role: 'user', content: '当前源 PPT 仍是 SVG 草稿，用户希望先快速编辑预览，不要导出 PPTX。请在完成目标页 write_ppt_svg_slide 后直接 final，并返回更新后的 SVG 预览。' });
          yield emit('progress', { phase: 'retry', message: '草稿 PPT 先返回 SVG 预览，正在避免过早导出', step, ok: false });
          continue;
        }
        yield emit('progress', { phase: 'file_generation', message: `正在执行 PPT 局部修改：${call.action}`, step: Math.min(6, step + 1), skill_id: call.skill_id, action: call.action });
        const skillResult = await editExecutor.execute(call);
        trace.push({ step, call: compactCallForTrace(call, skillResult), result: skillResult });
        yield emit('skill_result', skillResult);
        if (skillResult.ok !== false && isPptStateChangingCall(call)) {
          const draftContext = activePptContextFromTrace(trace, editActivePptContext);
          if (draftContext) yield emit('active_ppt_context', draftContext);
        }
        const files = resultFiles(skillResult);
        if (files.length) yield emit('files', visibleDeliverables(files));
        if (call.action === 'ppt_master_clone_for_edit') {
          expectedEditPages = Array.isArray(obj(skillResult.detail).edit_pages) ? (obj(skillResult.detail).edit_pages as unknown[]).map(Number).filter((n) => Number.isInteger(n)) : [];
          clonedProjectPath = String(skillResult.project_path || obj(skillResult.detail).project_path || '');
        }
        if (call.action === 'write_ppt_svg_slide') {
          const slideNo = Number(obj(skillResult.detail).slide_no);
          if (Number.isInteger(slideNo)) writtenEditPages.add(slideNo);
        }
        if (call.action === 'ppt_master_export' && skillResult.ok !== false) exported = true;
        editMessages.push({ role: 'assistant', content: result.text });
        const failureHint = skillResult.ok === false
          ? [
            '',
            '上一步工具执行失败，但这是可修复问题，不要结束任务。',
            '请阅读 error/detail，修正参数或 SVG 后重新调用对应工具。',
            String(skillResult.error || '').includes('<g opacity>')
              ? '特别注意：PPT SVG 禁止 <g opacity>，请把 opacity 下推到每个子元素（如 rect/path/text/image 的 opacity、fill-opacity 或 stroke-opacity），然后重新调用 write_ppt_svg_slide。'
              : '',
          ].filter(Boolean).join('\n')
          : '';
editMessages.push({ role: 'user', content: `SKILL_RESULT:
${JSON.stringify(skillResult, null, 2)}
${failureHint}
${isDraftPptEdit ? '请继续，直到完成目标 SVG 页面并 final；当前是草稿编辑，不要导出 PPTX。' : '请继续，直到导出 PPTX 后 final。'}` });
        if (skillResult.ok === false) {
          yield emit('progress', { phase: 'retry', message: 'PPT 局部修改工具执行失败，已把错误返回模型修正', step, ok: false, skill_id: call.skill_id, action: call.action });
          continue;
        }
      }
      throw new Error('PPT 局部修改步骤过多，已停止');
    } catch (err) {
      if (isAbortError(err)) throw err;
      const nextPptContext = activePptContextFromEditTrace(editActivePptContext, trace);
      const draftSvgFiles = nextPptContext
        ? nextPptContext.slides.map((slide) => slide.svgPath).filter((file): file is string => Boolean(file))
        : [];
      const activeContextForFailure = nextPptContext || editActivePptContext;
      const text = pptEditFailureFallbackText(activeContextForFailure, draftSvgFiles.length > 0 && !nextPptContext?.exportedPptx);
      const fallbackFiles = nextPptContext
        ? visibleDeliverables([...(nextPptContext.exportedPptx ? [nextPptContext.exportedPptx] : []), ...draftSvgFiles])
        : editActivePptContext.exportedPptx
          ? visibleDeliverables([editActivePptContext.exportedPptx])
          : collectFiles(trace);
      if (fallbackFiles.length) yield emit('files', fallbackFiles);
      yield emit('text', text);
      yield emit('progress', { phase: 'error', message: nextPptContext ? 'PPT 局部修改未完成，已保留 SVG 草稿' : 'PPT 局部修改未完成，已保留上一版', step: 99, ok: false });
      yield emit('done', { text, files: fallbackFiles, skills_used: [...skillsUsed], trace, background_jobs: [], activePptContext: activeContextForFailure });
      runtimeLog('request_end', { rootDir, duration_ms: Date.now() - started, text, files: fallbackFiles, skills_used: [...skillsUsed], trace, direct_ppt_edit_pipeline: true, error: modelErrorLog(err), user_visible_error_sanitized: true, active_ppt_context_from_draft: Boolean(nextPptContext), ...requestLog(effectiveReq) });
      return;
    }
  }

  if (classifiedPptEdit && !activePptContext) {
    const text = '没有找到可修改的上一份 PPT。请先生成一份 PPT，或在包含 PPT 的同一会话里说明要修改哪一页。';
    yield emit('text', text);
    yield emit('progress', { phase: 'error', message: '缺少可修改的 PPT 上下文', step: 99, ok: false });
    yield emit('done', { text, files: [], skills_used: [], trace: [], background_jobs: [] });
    runtimeLog('request_end', { rootDir, duration_ms: Date.now() - started, text, files: [], skills_used: [], trace: [], background_jobs: [], missing_ppt_edit_context: true, ...requestLog(effectiveReq) });
    return;
  }

  if (shortcut === 'ppt') {
    try {
      const userText = (effectiveReq.message || effectiveReq.command || '').trim() || SHORTCUT_PROMPTS['/ppt'] || '请生成 PPT 快速版患教运营汇报材料。';
      const trace: AgentDonePayload['trace'] = [];
      const skillsUsed = new Set<string>(['ppt-master']);

      yield emit('progress', { phase: 'data', message: '正在聚合 PPT 快速版所需核心指标、趋势、内容与项目数据', step: 1 });
      const primaryDataContext = await buildPrimaryDataContext(effectiveReq, rootDir, enforcedTenantId);
      const totalSlides = Math.max(6, Math.min(8, Number(process.env.AI_HELPER_PPT_FAST_SLIDES || 7) || 7));
      const earlySummaryText = buildDirectPptEarlySummaryText(primaryDataContext, totalSlides);
      yield emit('text', earlySummaryText);
      yield emit('progress', { phase: 'analysis', message: '已输出数据摘要，继续生成 PPT 文件', step: 1, ok: true });

      const bootstrapCall: SkillCall = {
        type: 'skill_call',
        skill_id: 'ppt-master',
        action: 'ppt_master_bootstrap',
        params: { project_name: 'px_ai_ppt', format: 'ppt169' },
        thought: '后端确定性流程自动创建 PPT 项目。',
      };
      yield emit('progress', { phase: 'file_generation', message: '正在初始化 PPT 项目', step: 2, skill_id: bootstrapCall.skill_id, action: bootstrapCall.action });
      const bootstrapResult = await executor.execute(bootstrapCall);
      trace.push({ step: 'auto_bootstrap', call: compactCallForTrace(bootstrapCall, bootstrapResult), result: bootstrapResult });
      yield emit('skill_result', bootstrapResult);
      if (bootstrapResult.ok === false) throw new Error(bootstrapResult.error || 'PPT 项目初始化失败');
      const projectPath = String(bootstrapResult.project_path || obj(bootstrapResult.detail).project_path || '');
      if (!projectPath) throw new Error('PPT 项目初始化成功但未返回 project_path');

      const pptAi = new AIService({
        model: process.env.AI_HELPER_PPT_SPEC_MODEL || 'qwen3.7-max',
        timeoutMs: Math.max(20_000, Number(process.env.AI_HELPER_PPT_SPEC_TIMEOUT_MS || 45_000) || 45_000),
      });
      const specBatchSize = Math.max(1, Math.min(totalSlides, Number(process.env.AI_HELPER_PPT_SPEC_BATCH_SIZE || 2) || 2));
      const maxSpecAttempts = 1;
      let deck: Record<string, unknown> = { slides: [] };
      let nextSlide = 1;
      let modelStep = 1;
      let priorBatchIssue = '';
      let skipRemainingSpecModel = false;
      let pptSpecTimeoutCount = 0;
      const pptSpecTimeoutSkipThreshold = Math.max(1, Number(process.env.AI_HELPER_PPT_SPEC_TIMEOUT_SKIP_THRESHOLD || 2) || 2);
      const emittedPreviewFiles = new Set<string>();
      const fallbackDeck = directPptTemplateDeck(primaryDataContext, totalSlides);
      const renderPreview = async (uptoSlide: number): Promise<{ fresh: string[]; count: number }> => {
        const previewDeck = completeDirectPptDeckWithTemplate(deck, primaryDataContext, totalSlides);
        const previewSlides = Array.isArray(previewDeck.slides) ? previewDeck.slides.map(obj).slice(0, Math.max(1, uptoSlide)) : [];
        const rendered = await renderPptDeckFromSpecs(safeProjectRoot(projectPath), projectPath, { ...previewDeck, project_path: projectPath, slides: previewSlides });
        const svgs = rendered.files.filter((file) => file.toLowerCase().endsWith('.svg') && file.includes('/svg_output/'));
        const fresh = svgs.filter((file) => !emittedPreviewFiles.has(file));
        svgs.forEach((file) => emittedPreviewFiles.add(file));
        return { fresh: await publishFiles(fresh), count: svgs.length };
      };

      while (nextSlide <= totalSlides) {
        const batchStart = nextSlide;
        const batchEnd = Math.min(totalSlides, batchStart + specBatchSize - 1);
        let retryIssue = priorBatchIssue;
        let batchCompleted = false;
        for (let attempt = 1; !skipRemainingSpecModel && attempt <= maxSpecAttempts; attempt += 1) {
          const messages = buildDirectPptMessages(userText, primaryDataContext, {
            startSlide: batchStart,
            endSlide: batchEnd,
            totalSlides,
            generatedSlides: Array.isArray(deck.slides) ? deck.slides.map(obj) : [],
            retryIssue,
            previousTurn: includePreviousTurn ? historyTurnForPrompt(effectiveReq, 1800) : undefined,
          });
          const modelStarted = Date.now();
          yield emit('progress', {
            phase: 'analysis',
            message: `正在生成第 ${batchStart}-${batchEnd} 页内容草稿`,
            step: 3,
            batch_start: batchStart,
            batch_end: batchEnd,
            attempt,
            max_attempts: maxSpecAttempts,
          });
          runtimeLog('model_start', {
            step: 'direct_ppt_spec_batch',
            batch_start: batchStart,
            batch_end: batchEnd,
            attempt,
            max_attempts: maxSpecAttempts,
            rootDir,
            model: pptAi.modelName(),
            messages,
            ...requestLog(effectiveReq),
          });
          try {
            const result = yield* callModelWithProgress(pptAi, messages, {
              step: 'direct_ppt_spec_batch',
              batch_start: batchStart,
              batch_end: batchEnd,
              attempt,
              max_attempts: maxSpecAttempts,
            });
            const duration = Date.now() - modelStarted;
            runtimeLog('model_end', {
              step: 'direct_ppt_spec_batch',
              batch_start: batchStart,
              batch_end: batchEnd,
              attempt,
              max_attempts: maxSpecAttempts,
              rootDir,
              duration_ms: duration,
              output: result.text,
              raw_response: result.rawResponse,
              request: result.request,
              cache_usage: result.cacheUsage,
              ...requestLog(effectiveReq),
            });
            modelIoLog({
              step: modelStep,
              rootDir,
              model: pptAi.modelName(),
              duration_ms: duration,
              messages,
              output: result.text,
              request: result.request,
              meta: {
                ...requestLog(effectiveReq),
                direct_pipeline: 'ppt_deck_spec_batch',
                batch_start: batchStart,
                batch_end: batchEnd,
                attempt,
                max_attempts: maxSpecAttempts,
                already_generated: batchStart - 1,
              },
              cache_usage: result.cacheUsage,
              recovered_from_reasoning_content: result.recoveredFromReasoningContent,
            });
            modelStep += 1;

            const fragment = normalizeDirectPptDeckFragment(result.text, batchStart);
            const merge = fragment
              ? mergeDirectPptDeckFragment(deck, fragment, batchStart, totalSlides)
              : { ok: false, issue: '模型输出不是合法 deck spec JSON', deck, added: 0, lastSlideNo: batchStart - 1 };
            if (!merge.ok) {
              retryIssue = merge.issue || 'deck spec 分批输出无法拼接';
              runtimeLog('direct_ppt_deck_spec_batch_fallback', {
                rootDir,
                batch_start: batchStart,
                batch_end: batchEnd,
                reason: retryIssue,
                fallback: 'template_batch',
                ...requestLog(effectiveReq),
              });
              priorBatchIssue = `第 ${batchStart}-${batchEnd} 页模型输出不完整，原因：${retryIssue}；该批次已由模板补齐，后续批次请输出更短、更完整的 JSON。`;
              break;
            }
            deck = merge.deck;
            nextSlide = merge.lastSlideNo + 1;
            batchCompleted = true;
            priorBatchIssue = '';
            runtimeLog('direct_ppt_deck_spec_batch_ready', {
              rootDir,
              batch_start: batchStart,
              batch_end: batchEnd,
              added: merge.added,
              next_slide: nextSlide,
              deck: compactDeckForLog(deck),
              ...requestLog(effectiveReq),
            });
            yield emit('progress', {
              phase: 'analysis',
              message: `已生成到第 ${merge.lastSlideNo} 页，${nextSlide <= totalSlides ? `继续生成第 ${nextSlide} 页` : '准备渲染'}`,
              step: 3,
              generated_slides: Array.isArray(deck.slides) ? deck.slides.length : 0,
              next_slide: nextSlide <= totalSlides ? nextSlide : undefined,
            });
            break;
          } catch (err) {
            if (isAbortError(err)) throw err;
            const duration = Date.now() - modelStarted;
            runtimeLog('model_error', {
              step: 'direct_ppt_spec_batch',
              batch_start: batchStart,
              batch_end: batchEnd,
              attempt,
              max_attempts: maxSpecAttempts,
              rootDir,
              duration_ms: duration,
              model: pptAi.modelName(),
              error: modelErrorLog(err),
              ...requestLog(effectiveReq),
            });
            modelIoLog({
              step: modelStep,
              rootDir,
              model: pptAi.modelName(),
              duration_ms: duration,
              messages,
              error: modelErrorLog(err),
              meta: {
                ...requestLog(effectiveReq),
                direct_pipeline: 'ppt_deck_spec_batch',
                batch_start: batchStart,
                batch_end: batchEnd,
                attempt,
                max_attempts: maxSpecAttempts,
                already_generated: batchStart - 1,
              },
            });
            modelStep += 1;
            retryIssue = err instanceof Error ? err.message : String(err);
            if (attempt >= maxSpecAttempts) {
              const isTimeoutError = /超时|timeout/i.test(retryIssue);
              if (isTimeoutError) pptSpecTimeoutCount += 1;
              const shouldSkipRemainingForTimeout = isTimeoutError && pptSpecTimeoutCount >= pptSpecTimeoutSkipThreshold;
              runtimeLog('direct_ppt_deck_spec_batch_fallback', {
                rootDir,
                batch_start: batchStart,
                batch_end: batchEnd,
                reason: retryIssue,
                fallback: 'template_batch',
                timeout_count: pptSpecTimeoutCount,
                timeout_skip_threshold: pptSpecTimeoutSkipThreshold,
                skip_remaining_spec_model: shouldSkipRemainingForTimeout,
                ...requestLog(effectiveReq),
              });
              priorBatchIssue = isTimeoutError && !shouldSkipRemainingForTimeout
                ? `第 ${batchStart}-${batchEnd} 页模型调用超时，已由模板补齐；后续批次仍继续尝试模型生成，请输出更短、更完整的 JSON。`
                : `第 ${batchStart}-${batchEnd} 页模型调用失败，原因：${retryIssue}；该批次已由模板补齐，后续批次请输出更短、更完整的 JSON。`;
              if (shouldSkipRemainingForTimeout) skipRemainingSpecModel = true;
              break;
            }
          }
        }
        if (!batchCompleted) {
          const templateSlides = Array.isArray(fallbackDeck.slides)
            ? fallbackDeck.slides.map(obj).filter((slide) => Number(slide.slide_no) >= batchStart && Number(slide.slide_no) <= batchEnd)
            : [];
          const fallbackMerge = mergeDirectPptDeckFragment(deck, { ...fallbackDeck, slides: templateSlides }, batchStart, totalSlides);
          if (!fallbackMerge.ok) throw new Error(`模板兜底失败：${fallbackMerge.issue || retryIssue || `第 ${batchStart}-${batchEnd} 页`}`);
          deck = fallbackMerge.deck;
          nextSlide = fallbackMerge.lastSlideNo + 1;
          yield emit('progress', {
            phase: 'analysis',
            message: skipRemainingSpecModel
              ? `模型已连续响应较慢，剩余页面将用模板快速补齐；正在生成第 ${batchStart}-${batchEnd} 页`
              : `第 ${batchStart}-${batchEnd} 页已用模板补齐，继续生成后续页面`,
            step: 3,
            generated_slides: Array.isArray(deck.slides) ? deck.slides.length : 0,
            timeout_count: pptSpecTimeoutCount || undefined,
            timeout_skip_threshold: pptSpecTimeoutSkipThreshold,
            fallback: true,
          });
        }
        const preview = await renderPreview(nextSlide - 1);
        if (preview.fresh.length) yield emit('files', preview.fresh);
        if (preview.count) {
          yield emit('progress', { phase: 'file_generation', message: `已生成 ${preview.count} 页预览`, step: 4, generated_slides: preview.count, ok: true });
        }
      }
      deck = completeDirectPptDeckWithTemplate(deck, primaryDataContext, totalSlides);
      const fullDeckIssues = validateDirectPptDeck(deck, totalSlides);
      if (fullDeckIssues.length) {
        runtimeLog('direct_ppt_deck_spec_full_fallback', { rootDir, issues: fullDeckIssues, fallback: 'full_template', ...requestLog(effectiveReq) });
        deck = completeDirectPptDeckWithTemplate({ slides: [] }, primaryDataContext, totalSlides);
        const fallbackIssues = validateDirectPptDeck(deck, totalSlides);
        if (fallbackIssues.length) throw new Error(`模板 deck spec 校验失败：${fallbackIssues.join('；')}`);
      }

      const finalPreview = await renderPreview(totalSlides);
      if (finalPreview.fresh.length) yield emit('files', finalPreview.fresh);
      if (finalPreview.count) yield emit('progress', { phase: 'file_generation', message: `已生成 ${finalPreview.count} 页预览`, step: 4, generated_slides: finalPreview.count, ok: true });

      runtimeLog('direct_ppt_deck_spec_ready', { rootDir, deck: compactDeckForLog(deck), pre_rendered: true, ...requestLog(effectiveReq) });
      const renderCall: SkillCall = {
        type: 'skill_call',
        skill_id: 'ppt-master',
        action: 'render_ppt_from_specs',
        params: { ...deck, project_path: projectPath },
        thought: 'PPT 页面已按批次预渲染完成，记录渲染结果并继续导出。',
      };
      const projectRootAbs = safeProjectRoot(projectPath);
      const renderFiles = [
        `/${projectPath}/design_spec.md`,
        `/${projectPath}/spec_lock.md`,
        ...projectSvgOutputFiles(projectPath),
        `/${projectPath}/notes/total.md`,
        `/${projectPath}/visual_qa.json`,
      ].filter((file) => fs.existsSync(path.join(AI_HELPER_ROOT, file.replace(/^\/+/, ''))));
      const renderResult: SkillResult = {
        ok: true,
        summary: `已生成 ${projectSvgOutputFiles(projectPath).length} 页 PPT SVG 预览`,
        detail: { kind: 'ppt_spec_render', project_path: projectPath, svg_count: projectSvgOutputFiles(projectPath).length, rendering: 'programmatic_svg_from_slide_specs', pre_rendered: true, project_root: projectRootAbs },
        files: await publishFiles(renderFiles),
      };
      trace.push({ step: 'auto_render_specs', call: compactCallForTrace(renderCall, renderResult), result: renderResult });
      yield emit('skill_result', renderResult);
      if (renderResult.files?.length) yield emit('files', renderResult.files);

      const exportCall: SkillCall = {
        type: 'skill_call',
        skill_id: 'ppt-master',
        action: 'ppt_master_export',
        params: { project_path: projectPath },
        thought: '后端确定性流程自动导出 PPTX。',
      };
      yield emit('progress', { phase: 'file_generation', message: '正在导出可编辑 PPTX', step: 5, skill_id: exportCall.skill_id, action: exportCall.action });
      const exportResult = await executor.execute(exportCall);
      trace.push({ step: 'auto_export', call: compactCallForTrace(exportCall, exportResult), result: exportResult });
      yield emit('skill_result', exportResult);
      if (exportResult.ok === false) throw new Error(exportResult.error || 'PPTX 导出失败');

      const files = collectFiles(trace);
      if (files.length) yield emit('files', files);
      const finalAnswer = 'PPT 快速版已生成，页面预览和可编辑 PPTX 文件可在下方查看与下载。';
      yield emit('text', finalAnswer);
      yield emit('progress', { phase: 'complete', message: 'PPT 快速版生成完成', step: 6, ok: true });
      yield emit('done', { text: `${earlySummaryText}\n\n${finalAnswer}`, files, skills_used: [...skillsUsed], trace, background_jobs: [] });
      runtimeLog('request_end', { rootDir, duration_ms: Date.now() - started, text: finalAnswer, files, skills_used: [...skillsUsed], trace, background_jobs: [], direct_ppt_pipeline: true, ...requestLog(effectiveReq) });
      return;
    } catch (err) {
      if (isAbortError(err)) throw err;
      const text = 'PPT 快速版生成失败，请稍后重试。';
      yield emit('text', text);
      yield emit('progress', { phase: 'error', message: 'PPT 快速版生成失败', step: 99, ok: false });
      yield emit('done', { text, files: [], skills_used: ['ppt-master'], trace: [], background_jobs: [] });
      runtimeLog('request_end', { rootDir, duration_ms: Date.now() - started, text, files: [], skills_used: ['ppt-master'], trace: [], background_jobs: [], direct_ppt_pipeline: true, error: modelErrorLog(err), ...requestLog(effectiveReq) });
      return;
    }
  }

  if (asShortcut(effectiveReq.shortcut) === 'monthly') {
    // 原通用 agent 月报链路暂不走：它要求模型一次性生成完整 Markdown，容易慢/卡住。
    // 新链路：模型只生成结构化结论，Markdown/PDF 由后端模板确定性生成。
    const trace: AgentDonePayload['trace'] = [];
    const skillsUsed = new Set<string>(['monthly-template', 'md-to-pdf']);
    try {
      yield emit('progress', { phase: 'data', message: '正在聚合报告周期指标，并按可用性准备对比数据', step: 1 });
      const defaultMetrics = await prefetchMetrics(tenantScopedParams({}, enforcedTenantId));
      const scope = resolvePrimaryDataScope(effectiveReq, defaultMetrics.range.end);
      let dateRange = scope.dateRange || recentOneMonthRange(defaultMetrics.range.end);
      let compareRange = scope.compareRange || previousComparableRange(dateRange);
      let currentMetrics = await prefetchMetrics(tenantScopedParams({
        dateRange,
        ...(compareRange ? { compareRange } : {}),
        granularity: 'week',
        limit: 70,
        purpose: '后端模板月报：本月主数据',
      }, enforcedTenantId));
      if (!scope.is_explicit_date_range && !hasBehaviorActivity(currentMetrics) && hasBehaviorActivity(defaultMetrics)) {
        const recentRange = recentOneMonthRange(defaultMetrics.range.end);
        if (!sameRange(recentRange, dateRange)) {
          dateRange = recentRange;
          compareRange = previousComparableRange(dateRange);
          currentMetrics = await prefetchMetrics(tenantScopedParams({
            dateRange,
            ...(compareRange ? { compareRange } : {}),
            granularity: 'week',
            limit: 70,
            purpose: '后端模板月报兜底：最近一月主数据',
          }, enforcedTenantId));
          runtimeLog('monthly_recent_one_month_fallback', { rootDir, dateRange, compareRange, reason: 'default_complete_month_has_no_data', ...requestLog(effectiveReq) });
        }
      }
      let previousMetrics: PrefetchMetrics | undefined;
      let usableCompareRange: DateRange | undefined;
      if (compareRange) {
        const candidatePrevious = await prefetchMetrics(tenantScopedParams({
          dateRange: compareRange,
          granularity: 'week',
          limit: 70,
          purpose: '后端模板月报：对比周期数据',
        }, enforcedTenantId));
        if (hasBehaviorActivity(candidatePrevious)) {
          previousMetrics = candidatePrevious;
          usableCompareRange = compareRange;
        } else {
          runtimeLog('monthly_compare_omitted', { rootDir, compareRange, reason: 'compare_period_has_no_data', ...requestLog(effectiveReq) });
        }
      }
      writeMetricStores(rootDir, [
        { prefix: 'primary', label: '本期主数据', metrics: currentMetrics },
        ...(previousMetrics ? [{ prefix: 'previous_period', label: '对比周期数据', metrics: previousMetrics }] : []),
      ]);

      const monthlySummaryText = buildMonthlySummaryText(currentMetrics, previousMetrics, dateRange, usableCompareRange);
      const emitTextResult = await executor.execute({
        type: 'skill_call',
        skill_id: 'patient-education-monthly-report',
        action: 'emit_text',
        params: { content: monthlySummaryText },
        thought: '后端确定性流程先输出月报文字摘要。',
      });
      yield emit('skill_result', emitTextResult);
      if (emitTextResult.text) yield emit('text', emitTextResult.text);

      yield emit('progress', { phase: 'analysis', message: '正在生成月报复盘结论', step: 2 });
      const insights = await generateMonthlyInsights(effectiveReq, rootDir, currentMetrics, previousMetrics, dateRange, usableCompareRange, signal);
      const markdown = buildMonthlyReportMarkdown(currentMetrics, previousMetrics, dateRange, usableCompareRange, insights);

      const mdCall: SkillCall = {
        type: 'skill_call',
        skill_id: 'patient-education-monthly-report',
        action: 'write_text_deliverable',
        params: { file_name: 'monthly_report.md', content: markdown },
        thought: '后端模板生成月报 Markdown。',
      };
      yield emit('progress', { phase: 'file_generation', message: '正在写入月报 Markdown', step: 3 });
      const mdResult = await executor.execute(mdCall);
      trace.push({ step: 'template_md', call: compactCallForTrace(mdCall, mdResult), result: mdResult });
      yield emit('skill_result', mdResult);
      if (mdResult.ok === false) throw new Error(mdResult.error || '月报 Markdown 写入失败');

      const pdfCall = monthlyPdfAutoCall();
      yield emit('progress', { phase: 'file_generation', message: '正在自动转换 PDF', step: 4 });
      const pdfResult = await executor.execute(pdfCall);
      trace.push({ step: 'template_pdf', call: compactCallForTrace(pdfCall, pdfResult), result: pdfResult });
      yield emit('skill_result', pdfResult);

      const files = collectFiles(trace);
      if (files.length) yield emit('files', files);
      const finalAnswer = pdfResult.ok === false
        ? '月度报告已生成，但 PDF 自动转换未完成，可先下载 Markdown 文件。'
        : '月度报告已生成，Markdown 与 PDF 文件可在下方下载。';
      yield emit('progress', { phase: pdfResult.ok === false ? 'error' : 'complete', message: pdfResult.ok === false ? 'PDF 自动转换失败' : '月度报告生成完成', step: 5, ok: pdfResult.ok !== false });
      yield emit('done', { text: `${monthlySummaryText}\n\n${finalAnswer}`, files, skills_used: [...skillsUsed], trace, background_jobs: [] });
      runtimeLog('request_end', { rootDir, duration_ms: Date.now() - started, text: finalAnswer, files, skills_used: [...skillsUsed], trace, background_jobs: [], direct_monthly_template: true, ...requestLog(effectiveReq) });
      return;
    } catch (err) {
      if (isAbortError(err)) throw err;
      const text = '月报生成失败，请稍后重试。';
      yield emit('text', text);
      yield emit('done', { text, files: collectFiles(trace), skills_used: [...skillsUsed], trace, background_jobs: [] });
      runtimeLog('request_end', { rootDir, duration_ms: Date.now() - started, text, files: collectFiles(trace), skills_used: [...skillsUsed], trace, background_jobs: [], direct_monthly_template: true, error: modelErrorLog(err), ...requestLog(effectiveReq) });
      return;
    }
  }

  let messages: ChatMessage[];
  let primaryDataContext: Record<string, unknown>;
  try {
    ({ messages, primaryDataContext } = await buildMessages(effectiveReq, rootDir, registry, executor, { includePreviousTurn, enforcedTenantId }));
  } catch (err) {
    if (isAbortError(err)) throw err;
    const text = '数据准备失败，请稍后重试。';
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
        runtimeLog('model_start', { step, attempt, max_attempts: modelTimeoutRetries, rootDir, model: ai.modelName(), messages, ...requestLog(effectiveReq) });
        try {
          const result = yield* callModelWithProgress(ai, messages, { step, attempt, max_attempts: modelTimeoutRetries });
          raw = result.text;
          const duration = Date.now() - modelStarted;
          runtimeLog('model_end', { step, attempt, max_attempts: modelTimeoutRetries, rootDir, duration_ms: duration, output: raw, raw_response: result.rawResponse, request: result.request, cache_usage: result.cacheUsage, recovered_from_reasoning_content: result.recoveredFromReasoningContent, ...requestLog(effectiveReq) });
          modelIoLog({
            step,
            rootDir,
            model: ai.modelName(),
            duration_ms: duration,
            messages,
            output: raw,
            request: result.request,
            meta: { ...requestLog(effectiveReq), attempt, max_attempts: modelTimeoutRetries },
            cache_usage: result.cacheUsage,
            recovered_from_reasoning_content: result.recoveredFromReasoningContent,
          });
          break;
        } catch (err) {
          if (isAbortError(err)) throw err;
          const duration = Date.now() - modelStarted;
          if (isModelTimeoutError(err) && attempt < modelTimeoutRetries) {
            const text = `模型调用失败：${err instanceof Error ? err.message : String(err)}`;
            runtimeLog('model_error', { step, attempt, max_attempts: modelTimeoutRetries, rootDir, duration_ms: duration, error: modelErrorLog(err), retrying: true, ...requestLog(effectiveReq) });
            modelIoLog({
              step,
              rootDir,
              model: ai.modelName(),
              duration_ms: duration,
              messages,
              error: modelErrorLog(err),
              meta: { ...requestLog(effectiveReq), attempt, max_attempts: modelTimeoutRetries, retrying: true },
            });
            if (attempt === 1) messages.push({ role: 'user', content: buildModelTimeoutRetryObservation(text) });
            yield emit('progress', { phase: 'retry', message: `响应时间较长，正在自动重试 ${attempt + 1}/${modelTimeoutRetries}`, step, attempt, max_attempts: modelTimeoutRetries, ok: false });
            continue;
          }
          throw err;
        }
      }
    } catch (err) {
      if (isAbortError(err)) throw err;
      const modelObservationText = `模型调用失败：${err instanceof Error ? err.message : String(err)}`;
      const text = '处理过程中出现问题，请稍后重试。';
      runtimeLog('model_error', { step, rootDir, error: modelErrorLog(err), ...requestLog(effectiveReq) });
      modelIoLog({
        step,
        rootDir,
        model: ai.modelName(),
        messages,
        error: modelErrorLog(err),
        meta: requestLog(effectiveReq),
      });
      if (isRecoverableEmptyModelContent(err) && step < maxSteps) {
        messages.push({ role: 'user', content: buildModelErrorObservation(modelObservationText) });
        yield emit('progress', { phase: 'retry', message: '响应未返回有效结果，正在自动重试', step, ok: false });
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

    if (parsed.type === 'completed_deck_state') {
      messages.push({ role: 'assistant', content: compactSkillCallForContext(raw) });
      messages.push({
        role: 'user',
        content: [
          'NON_EXECUTABLE_COMPLETED_DECK_STATE:',
          '上一轮输出的是历史进度压缩状态，不是可执行工具调用。',
          '请基于 completed_slides 继续下一步，输出一个真实 skill_call。',
          '如果还缺页面，请调用 ppt-master.write_ppt_svg_slide，并包含 project_path、slide_no、title、core_conclusion、svg。',
          '如果已经至少 6 页且 notes/total.md 已存在，请调用 ppt-master.ppt_master_export。',
        ].join('\n'),
      });
      yield emit('progress', { phase: 'retry', message: '模型复述了历史进度，正在要求继续真实工具调用', step, ok: false });
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
      const activeContext = activePptContextFromTrace(trace);
      yield emit('done', { text: final.answer, files, skills_used: [...skillsUsed], trace, background_jobs: backgroundJobs, activePptContext: activeContext });
      runtimeLog('request_end', { rootDir, duration_ms: Date.now() - started, text: final.answer, files, skills_used: [...skillsUsed], trace, background_jobs: backgroundJobs, active_ppt_context: activeContext, ...requestLog(effectiveReq) });
      return;
    }

    if (!isSkillCall(parsed)) {
      messages.push({ role: 'assistant', content: compactSkillCallForContext(raw) });
      messages.push({ role: 'user', content: `UNSUPPORTED_MODEL_MESSAGE: type 必须为 skill_call 或 final，收到 ${String(parsed.type)}。请只返回一个 JSON 对象。` });
      yield emit('progress', { phase: 'retry', message: '模型消息类型不支持，正在要求重试', step, ok: false });
      continue;
    }

    const call = parsed;
    if (call.params && typeof call.params === 'object' && (call.params as Record<string, unknown>).context_compacted === true) {
      messages.push({ role: 'assistant', content: compactSkillCallForContext(raw) });
      messages.push({
        role: 'user',
        content: [
          'NON_EXECUTABLE_COMPACTED_STATE:',
          '上一轮输出的是历史进度压缩状态，不是可执行工具调用。',
          '请基于 completed_slides 继续下一步，输出一个真实 skill_call：必须包含 project_path、slide_no、title、core_conclusion、svg，或在页面完成后调用 ppt_master_export。',
          '不要原样复述 context_compacted。',
        ].join('\n'),
      });
      yield emit('progress', { phase: 'retry', message: '模型复述了压缩状态，正在要求继续下一步真实工具调用', step, ok: false });
      continue;
    }

    if (isPremiumPptSvg && !earlyTextEmitted && call.action !== 'emit_text') {
      messages.push({ role: 'assistant', content: compactSkillCallForContext(raw) });
      messages.push({
        role: 'user',
        content: [
          'PPT_SVG_REQUIRES_EARLY_TEXT:',
          'PPT 精美版需要先输出用户可见文本，再慢慢生成 SVG/PPT。',
          '请先调用 emit_text，content 写 300-800 字中文汇报摘要、页面大纲、预计耗时 5-10 分钟和生成计划。',
          'emit_text 成功后再继续 ppt_master_bootstrap、写 SVG、导出 PPTX。',
          '只输出一个 JSON 对象。',
        ].join('\n'),
      });
      yield emit('progress', { phase: 'retry', message: 'PPT 精美版需先输出摘要，正在要求模型先输出文字', step, ok: false });
      continue;
    }

    if (isPremiumPptSvg) {
      const stageInstruction = premiumPptStageInstruction(call, trace);
      if (stageInstruction) {
        messages.push({ role: 'assistant', content: compactSkillCallForContext(raw) });
        messages.push({ role: 'user', content: stageInstruction });
        yield emit('progress', { phase: 'retry', message: 'PPT 精美版执行顺序需修正，正在要求模型按阶段继续', step, ok: false });
        continue;
      }
    }

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
          trace.push({ step, call: compactCallForTrace(call, result), result });
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

    trace.push({ step, call: compactCallForTrace(call, result), result });
    if (call.action === 'read_skill_file' && result.ok !== false) injected.add(call.skill_id);
    yield emit('skill_result', result);
    if (result.ok !== false && isPptStateChangingCall(call)) {
      const draftContext = activePptContextFromTrace(trace);
      if (draftContext) yield emit('active_ppt_context', draftContext);
    }

    if (isMonthlyMarkdownWrite(call, result)) {
      const pdfCall = monthlyPdfAutoCall();
      skillsUsed.add(pdfCall.skill_id);
      yield emit('skills', [...skillsUsed]);
      yield emit('progress', { phase: 'file_generation', message: '月报正文已生成，后端正在自动转换 PDF', step, skill_id: pdfCall.skill_id, action: pdfCall.action, ok: true });
      const pdfResult = await executor.execute(pdfCall);
      trace.push({ step: `${step}.auto_pdf`, call: compactCallForTrace(pdfCall, pdfResult), result: pdfResult });
      yield emit('skill_result', pdfResult);

      const files = collectFiles(trace);
      if (files.length) yield emit('files', files);

      const finalAnswer = pdfResult.ok === false
        ? '月度报告已生成，但 PDF 自动转换未完成，可先下载 Markdown 文件。'
        : '月度报告已生成，Markdown 与 PDF 文件可在下方下载。';
      if (!earlyTextEmitted) {
        earlyTextEmitted = true;
        yield emit('text', finalAnswer);
      }
      yield emit('progress', { phase: pdfResult.ok === false ? 'error' : 'complete', message: pdfResult.ok === false ? 'PDF 自动转换失败' : '月度报告 PDF 自动转换完成', step, ok: pdfResult.ok !== false });
      yield emit('done', { text: finalAnswer, files, skills_used: [...skillsUsed], trace, background_jobs: backgroundJobs });
      runtimeLog('request_end', { rootDir, duration_ms: Date.now() - started, text: finalAnswer, files, skills_used: [...skillsUsed], trace, background_jobs: backgroundJobs, auto_final_after_monthly_pdf: true, ...requestLog(effectiveReq) });
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
      const activeContext = activePptContextFromTrace(trace);
      yield emit('done', { text: finalAnswer, files, skills_used: [...skillsUsed], trace, background_jobs: backgroundJobs, activePptContext: activeContext });
      runtimeLog('request_end', { rootDir, duration_ms: Date.now() - started, text: finalAnswer, files, skills_used: [...skillsUsed], trace, background_jobs: backgroundJobs, active_ppt_context: activeContext, auto_final_after_export: true, ...requestLog(effectiveReq) });
      return;
    }
    messages.push({ role: 'assistant', content: compactAssistantOutputForContext(raw, call, result) });
    messages.push({ role: 'user', content: SkillExecutor.observation(result) });
  }

  const text = '已达到最大技能调用步数，请收敛请求范围后重试。';
  yield emit('text', text);
  yield emit('done', { text, files: collectFiles(trace), skills_used: [...skillsUsed], trace, background_jobs: backgroundJobs, activePptContext: activePptContextFromTrace(trace) });
}

export async function runAssistant(req: RunRequest, options: StreamAssistantOptions = {}): Promise<{ text: string; files: string[]; skills_used: string[] }> {
  let text = '';
  let files: string[] = [];
  let skills_used: string[] = [];
  for await (const line of streamAssistant(req, options)) {
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
