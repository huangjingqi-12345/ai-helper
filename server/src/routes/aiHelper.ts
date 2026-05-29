import express, { Router, type NextFunction, type Request, type Response } from 'express';
import path from 'path';
import { runAssistant, streamAssistant, SHORTCUT_PROMPTS, SYSTEM_PROMPT, listGeneratedFiles } from '../ai-helper/agent.js';
import { AIService } from '../ai-helper/aiService.js';
import { AI_HELPER_ROOT, ensureAiHelperDirs } from '../ai-helper/paths.js';
import { prefetchMetrics } from '../ai-helper/metrics.js';
import { SkillRegistry } from '../ai-helper/skillRegistry.js';
import { getBackgroundJob, listBackgroundJobs } from '../ai-helper/backgroundJobs.js';
import type { RunRequest } from '../ai-helper/types.js';
import { logger } from '../utils/logger.js';
import { DB_DRIVER, dbGet, dbRun } from '../db/connection.js';
import { runtimeLog } from '../ai-helper/runtimeLogger.js';
import { cleanupExpiredAiHelperFiles, deleteAiHelperFilesForUser } from '../ai-helper/ossStorage.js';

ensureAiHelperDirs();

const router = Router();
const AI_SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_PERSISTED_MESSAGES = 80;
const MAX_SESSION_JSON_CHARS = 1_500_000;

type PersistedChatMessage = {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  runId?: string;
  files?: string[];
  loading?: boolean;
  loadingStatus?: string;
  loadingElapsed?: string;
  loadingStartedAt?: number;
  pptSvgProgress?: unknown;
  activePptContext?: unknown;
};

type AiHelperSessionRow = {
  user_id: string;
  tenant_id: string;
  conversation_id: string;
  messages: string;
  created_at: string;
  updated_at: string;
  expires_at: string;
};

function nowIso(): string {
  return new Date().toISOString();
}

function expiresAtFrom(updatedAt = Date.now()): string {
  return new Date(updatedAt + AI_SESSION_TTL_MS).toISOString();
}

async function cleanupExpiredAiSessions(): Promise<void> {
  const now = nowIso();
  await dbRun('DELETE FROM ai_helper_sessions WHERE expires_at <= ?', [now]);
  await cleanupExpiredAiHelperFiles(now);
}

const aiSessionCleanupTimer = setInterval(() => {
  cleanupExpiredAiSessions().catch((err) => logger.warn({ err }, 'AI helper expired session cleanup failed'));
}, 60 * 60 * 1000);
aiSessionCleanupTimer.unref?.();

function sanitizeMessages(value: unknown): PersistedChatMessage[] {
  if (!Array.isArray(value)) return [];
  return value.slice(-MAX_PERSISTED_MESSAGES).flatMap((item): PersistedChatMessage[] => {
    if (!item || typeof item !== 'object') return [];
    const obj = item as Record<string, unknown>;
    const role = obj.role === 'user' || obj.role === 'assistant' ? obj.role : undefined;
    if (!role) return [];
    const text = String(obj.text ?? '').slice(0, 120_000);
    const runId = typeof obj.runId === 'string' ? obj.runId.slice(0, 120) : typeof obj.run_id === 'string' ? obj.run_id.slice(0, 120) : undefined;
    const files = Array.isArray(obj.files)
      ? obj.files.filter((file): file is string => typeof file === 'string' && file.length <= 1000).slice(0, 80)
      : undefined;
    const pptSvgProgress = obj.pptSvgProgress && typeof obj.pptSvgProgress === 'object' ? obj.pptSvgProgress : undefined;
    const activePptContext = obj.activePptContext && typeof obj.activePptContext === 'object' ? obj.activePptContext : undefined;
    const loadingStatus = typeof obj.loadingStatus === 'string' ? obj.loadingStatus.slice(0, 500) : undefined;
    const loadingElapsed = typeof obj.loadingElapsed === 'string' ? obj.loadingElapsed.slice(0, 80) : undefined;
    const loadingStartedAt = typeof obj.loadingStartedAt === 'number' && Number.isFinite(obj.loadingStartedAt) ? obj.loadingStartedAt : undefined;
    const message: PersistedChatMessage = {
      id: String(obj.id || `${role}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`).slice(0, 120),
      role,
      text,
    };
    if (runId) message.runId = runId;
    if (files) message.files = files;
    if (obj.loading === true) message.loading = true;
    if (loadingStatus) message.loadingStatus = loadingStatus;
    if (loadingElapsed) message.loadingElapsed = loadingElapsed;
    if (loadingStartedAt) message.loadingStartedAt = loadingStartedAt;
    if (pptSvgProgress) message.pptSvgProgress = pptSvgProgress;
    if (activePptContext) message.activePptContext = activePptContext;
    return [message];
  });
}

type StreamRunStatus = 'running' | 'done' | 'failed' | 'cancelled';
type StreamRun = {
  key: string;
  conversationId: string;
  runId: string;
  userId?: string;
  tenantId?: string;
  tenantType?: 'ops' | 'pharma';
  status: StreamRunStatus;
  events: string[];
  listeners: Set<(line: string) => void>;
  waiters: Set<() => void>;
  abortController: AbortController;
  createdAt: number;
  finishedAt?: number;
  donePayload?: Record<string, unknown>;
  activePptContext?: unknown;
  error?: unknown;
};

const STREAM_RUN_TTL_MS = 2 * 60 * 60 * 1000;
const STREAM_RUN_MAX_EVENTS = 3000;
const streamRuns = new Map<string, StreamRun>();

function streamRunKey(conversationId: string, runId: string): string {
  return `${conversationId}::${runId}`;
}

function cleanupStreamRuns(): void {
  const cutoff = Date.now() - STREAM_RUN_TTL_MS;
  for (const [key, run] of streamRuns.entries()) {
    if (run.finishedAt && run.finishedAt < cutoff) streamRuns.delete(key);
  }
}

function parseStreamLine(line: string): { type?: string; data?: unknown } | undefined {
  try {
    const parsed = JSON.parse(line);
    return parsed && typeof parsed === 'object' ? parsed as { type?: string; data?: unknown } : undefined;
  } catch {
    return undefined;
  }
}

function normalizeAssetPath(value: string): string {
  const raw = (value || '').trim().replace(/\\/g, '/');
  if (!raw) return '';
  if (raw.startsWith('generated/') || raw.startsWith('projects/')) return `/${raw}`;
  return raw;
}

function fileNameFromPath(value: string): string {
  const pathName = /^https?:\/\//i.test(value) ? new URL(value).pathname : value;
  return decodeURIComponent(pathName.split('?')[0]?.split('/').pop() || '');
}

function sortedUniqueAssetPaths(paths: string[]): string[] {
  return [...new Set(paths.map(normalizeAssetPath).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }));
}

function isPptSvgSlidePath(value: string): boolean {
  const lower = normalizeAssetPath(value).toLowerCase();
  return lower.endsWith('.svg') && lower.includes('/svg_output/');
}

function isPptxPath(value: string): boolean {
  return normalizeAssetPath(value).toLowerCase().endsWith('.pptx');
}

function isVisibleSessionFile(value: string): boolean {
  const normalized = normalizeAssetPath(value);
  if (!normalized) return false;
  if (/^https?:\/\//i.test(normalized)) return true;
  const lower = normalized.toLowerCase();
  if (lower.startsWith('/data/') || lower.startsWith('data/')) return false;
  // /projects 下的 SVG/设计中间产物只用于页面预览和上下文，不作为下载文件展示。
  if (lower.startsWith('/projects/') || lower.startsWith('projects/')) return false;
  if (!lower.startsWith('/generated/') && !lower.startsWith('generated/')) return false;
  const name = fileNameFromPath(normalized).toLowerCase();
  const ext = name.includes('.') ? name.split('.').pop() || '' : '';
  if (ext === 'json' || ext === 'csv') return false;
  if (name.includes('manifest') || name.endsWith('_qa.json') || name.includes('_qa.')) return false;
  if (name.includes('compat') || name.includes('keynote') || name.endsWith('_svg.pptx')) return false;
  return ['md', 'pdf', 'html', 'htm', 'png', 'jpg', 'jpeg', 'webp', 'ppt', 'pptx'].includes(ext);
}

function visibleSessionFiles(files: string[] = []): string[] {
  return [...new Set(files.map(normalizeAssetPath).filter(isVisibleSessionFile))];
}

function collectStringFiles(value: unknown, out: string[] = []): string[] {
  if (typeof value === 'string') {
    out.push(value);
    return out;
  }
  if (Array.isArray(value)) {
    value.forEach((item) => collectStringFiles(item, out));
    return out;
  }
  if (value && typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    for (const key of ['file', 'path', 'pptx', 'pdf', 'html']) collectStringFiles(obj[key], out);
    collectStringFiles(obj.files, out);
  }
  return out;
}

function activePptContextFiles(value: unknown): string[] {
  const root = value && typeof value === 'object' ? value as Record<string, unknown> : {};
  const slides = Array.isArray(root.slides) ? root.slides : [];
  const files: string[] = [];
  if (typeof root.exportedPptx === 'string') files.push(root.exportedPptx);
  if (typeof root.exported_pptx === 'string') files.push(root.exported_pptx);
  for (const item of slides) {
    if (!item || typeof item !== 'object') continue;
    const slide = item as Record<string, unknown>;
    for (const key of ['svgPath', 'svg_path', 'assetUrl', 'asset_url']) {
      if (typeof slide[key] === 'string') files.push(slide[key] as string);
    }
  }
  return files;
}

function runFilesFromEvents(run: StreamRun): string[] {
  const files: string[] = [];
  for (const line of run.events) {
    const evt = parseStreamLine(line);
    if (!evt) continue;
    if (['files', 'skill_result', 'done'].includes(String(evt.type))) collectStringFiles(evt.data, files);
    if (evt.type === 'active_ppt_context') files.push(...activePptContextFiles(evt.data));
  }
  if (run.donePayload) collectStringFiles(run.donePayload, files);
  return sortedUniqueAssetPaths(files);
}

function pptProgressFromFiles(files: string[] = [], existing: unknown): unknown {
  const current = existing && typeof existing === 'object' ? existing as Record<string, unknown> : {};
  const currentSlides = Array.isArray(current.slides) ? current.slides.filter((item): item is string => typeof item === 'string') : [];
  const slides = sortedUniqueAssetPaths([...currentSlides, ...files.filter(isPptSvgSlidePath)]);
  if (!slides.length && !Object.keys(current).length) return undefined;
  const exportedPpt = files.find(isPptxPath) || (typeof current.exportedPpt === 'string' ? current.exportedPpt : undefined);
  return {
    ...current,
    slides,
    completed: Boolean(current.completed) || Boolean(exportedPpt),
    exportedPpt,
    mode: current.mode || 'spec',
    title: current.title || 'PPT 快速版页面预览',
  };
}

function normalizeSessionAssistantMessage(message: PersistedChatMessage, extraFiles: string[] = []): PersistedChatMessage {
  const allFiles = sortedUniqueAssetPaths([...(message.files || []), ...extraFiles]);
  const normalized: PersistedChatMessage = { ...message };
  const files = visibleSessionFiles(allFiles);
  const pptSvgProgress = pptProgressFromFiles(allFiles, message.pptSvgProgress);
  if (files.length) normalized.files = files;
  else delete normalized.files;
  if (pptSvgProgress) normalized.pptSvgProgress = pptSvgProgress;
  else delete normalized.pptSvgProgress;
  if (!normalized.loading) {
    delete normalized.loading;
    delete normalized.loadingStatus;
    delete normalized.loadingElapsed;
    delete normalized.loadingStartedAt;
  } else {
    if (!normalized.loadingStatus) delete normalized.loadingStatus;
    if (!normalized.loadingElapsed) delete normalized.loadingElapsed;
    if (!normalized.loadingStartedAt) delete normalized.loadingStartedAt;
  }
  return normalized;
}

function pushStreamRunEvent(run: StreamRun, line: string): void {
  run.events.push(line);
  if (run.events.length > STREAM_RUN_MAX_EVENTS) run.events.splice(0, run.events.length - STREAM_RUN_MAX_EVENTS);
  for (const listener of [...run.listeners]) listener(line);
  const evt = parseStreamLine(line);
  if (evt?.type === 'done' && evt.data && typeof evt.data === 'object') {
    run.donePayload = evt.data as Record<string, unknown>;
  }
  if (evt?.type === 'active_ppt_context' && evt.data && typeof evt.data === 'object') {
    run.activePptContext = evt.data;
    void persistAiHelperRunDraft(run).catch((err) => logger.warn({ err, runId: run.runId }, 'AI helper draft PPT context persistence failed'));
  }
}

async function persistAiHelperRunDraft(run: StreamRun): Promise<void> {
  if (!run.userId || !run.tenantId || !run.activePptContext) return;
  const row = await dbGet<AiHelperSessionRow>('SELECT * FROM ai_helper_sessions WHERE user_id = ?', [run.userId]);
  if (!row || row.conversation_id !== run.conversationId) return;
  const messages = parseStoredMessages(row.messages);
  const index = messages.findIndex((message) => message.role === 'assistant' && message.runId === run.runId);
  if (index < 0) return;
  const current = messages[index];
  const runFiles = runFilesFromEvents(run);
  const contextFiles = activePptContextFiles(run.activePptContext);
  messages[index] = normalizeSessionAssistantMessage({
    ...current,
    files: visibleSessionFiles([...(current.files || []), ...runFiles, ...contextFiles]),
    pptSvgProgress: pptProgressFromFiles([...(current.files || []), ...runFiles, ...contextFiles], current.pptSvgProgress),
    activePptContext: run.activePptContext,
    loading: true,
  }, [...runFiles, ...contextFiles]);
  const now = nowIso();
  await dbRun(`
    INSERT INTO ai_helper_sessions (user_id, tenant_id, conversation_id, messages, created_at, updated_at, expires_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(user_id) DO UPDATE SET
      tenant_id = excluded.tenant_id,
      conversation_id = excluded.conversation_id,
      messages = excluded.messages,
      updated_at = excluded.updated_at,
      expires_at = excluded.expires_at
  `, [run.userId, run.tenantId, run.conversationId, JSON.stringify(sanitizeMessages(messages)), row.created_at || now, now, expiresAtFrom()]);
}

function finishStreamRun(run: StreamRun, status: StreamRunStatus, error?: unknown): void {
  run.status = status;
  run.error = error;
  run.finishedAt = Date.now();
  for (const waiter of [...run.waiters]) waiter();
  run.waiters.clear();
}

async function persistAiHelperRunCompletion(run: StreamRun): Promise<void> {
  if (!run.userId || !run.tenantId || !run.donePayload) return;
  const row = await dbGet<AiHelperSessionRow>('SELECT * FROM ai_helper_sessions WHERE user_id = ?', [run.userId]);
  if (!row || row.conversation_id !== run.conversationId) return;
  const messages = parseStoredMessages(row.messages);
  const index = messages.findIndex((message) => message.role === 'assistant' && message.runId === run.runId);
  if (index < 0) return;
  const done = run.donePayload;
  const current = messages[index];
  const doneFiles = Array.isArray(done.files) ? done.files.filter((file): file is string => typeof file === 'string') : [];
  const activePptContext = done.activePptContext && typeof done.activePptContext === 'object' ? done.activePptContext : run.activePptContext || current.activePptContext;
  const contextFiles = activePptContextFiles(activePptContext);
  messages[index] = normalizeSessionAssistantMessage({
    ...current,
    text: typeof done.text === 'string' ? done.text : current.text,
    files: visibleSessionFiles([...(current.files || []), ...doneFiles, ...contextFiles]),
    pptSvgProgress: pptProgressFromFiles([...(current.files || []), ...doneFiles, ...contextFiles], current.pptSvgProgress),
    activePptContext,
    loading: false,
    loadingStatus: undefined,
    loadingElapsed: undefined,
    loadingStartedAt: undefined,
  }, [...doneFiles, ...contextFiles]);
  const now = nowIso();
  await dbRun(`
    INSERT INTO ai_helper_sessions (user_id, tenant_id, conversation_id, messages, created_at, updated_at, expires_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(user_id) DO UPDATE SET
      tenant_id = excluded.tenant_id,
      conversation_id = excluded.conversation_id,
      messages = excluded.messages,
      updated_at = excluded.updated_at,
      expires_at = excluded.expires_at
  `, [run.userId, run.tenantId, run.conversationId, JSON.stringify(sanitizeMessages(messages)), row.created_at || now, now, expiresAtFrom()]);
}

function startOrGetStreamRun(reqBody: RunRequest, auth: { userId?: string; tenantId?: string; tenantType?: 'ops' | 'pharma' }): StreamRun {
  cleanupStreamRuns();
  const conversationId = String(reqBody.conversation_id || '').trim();
  const runId = String(reqBody.run_id || '').trim();
  if (!conversationId || !runId) throw new Error('conversation_id and run_id are required');
  const key = streamRunKey(conversationId, runId);
  const existing = streamRuns.get(key);
  if (existing) return existing;
  const run: StreamRun = {
    key,
    conversationId,
    runId,
    userId: auth.userId,
    tenantId: auth.tenantId,
    tenantType: auth.tenantType,
    status: 'running',
    events: [],
    listeners: new Set(),
    waiters: new Set(),
    abortController: new AbortController(),
    createdAt: Date.now(),
  };
  streamRuns.set(key, run);
  void (async () => {
    try {
      for await (const line of streamAssistant(reqBody, {
        signal: run.abortController.signal,
        userId: auth.userId,
        tenantId: auth.tenantId,
        tenantType: auth.tenantType,
      })) {
        pushStreamRunEvent(run, line);
      }
      finishStreamRun(run, run.status === 'cancelled' ? 'cancelled' : 'done');
      await persistAiHelperRunCompletion(run).catch((err) => logger.warn({ err, runId }, 'AI helper run completion persistence failed'));
    } catch (err) {
      const cancelled = run.abortController.signal.aborted;
      if (!run.donePayload) {
        const text = cancelled ? '已暂停生成。' : '处理过程中出现问题，请稍后重试。';
        pushStreamRunEvent(run, JSON.stringify({ type: 'text', data: text }) + '\n');
        pushStreamRunEvent(run, JSON.stringify({ type: 'done', data: { text, files: [] } }) + '\n');
      }
      finishStreamRun(run, cancelled ? 'cancelled' : 'failed', err);
      await persistAiHelperRunCompletion(run).catch((persistErr) => logger.warn({ err: persistErr, runId }, 'AI helper failed run persistence failed'));
      runtimeLog('stream_run_error', { conversation_id: conversationId, run_id: runId, cancelled, error: err instanceof Error ? { name: err.name, message: err.message, stack: err.stack } : err });
    }
  })();
  return run;
}

function attachStreamRun(reqBody: RunRequest): StreamRun | undefined {
  const conversationId = String(reqBody.conversation_id || '').trim();
  const runId = String(reqBody.run_id || '').trim();
  if (!conversationId || !runId) return undefined;
  return getStreamRun(conversationId, runId);
}

function getStreamRun(conversationId: string, runId: string): StreamRun | undefined {
  cleanupStreamRuns();
  return streamRuns.get(streamRunKey(conversationId, runId));
}

function parseStoredMessages(raw: string): PersistedChatMessage[] {
  try {
    return sanitizeMessages(JSON.parse(raw));
  } catch {
    return [];
  }
}

function sessionPayload(row: AiHelperSessionRow): Record<string, unknown> {
  const messages = parseStoredMessages(row.messages).map((message) => {
    if (message.role !== 'assistant') return message;
    if (!message.runId) return normalizeSessionAssistantMessage(message);
    const run = getStreamRun(row.conversation_id, message.runId);
    if (!run) return normalizeSessionAssistantMessage(message);
    const runFiles = runFilesFromEvents(run);
    if (run.status === 'running') {
      const activePptContext = run.activePptContext || message.activePptContext;
      const contextFiles = activePptContextFiles(activePptContext);
      return {
        ...normalizeSessionAssistantMessage({ ...message, activePptContext }, [...runFiles, ...contextFiles]),
        loading: true,
      };
    }
    if (run.donePayload) {
      const doneFiles = Array.isArray(run.donePayload.files) ? run.donePayload.files.filter((file): file is string => typeof file === 'string') : [];
      const activePptContext = run.donePayload.activePptContext && typeof run.donePayload.activePptContext === 'object' ? run.donePayload.activePptContext : run.activePptContext || message.activePptContext;
      const contextFiles = activePptContextFiles(activePptContext);
      return {
        ...normalizeSessionAssistantMessage({ ...message, activePptContext }, [...runFiles, ...doneFiles, ...contextFiles]),
        text: typeof run.donePayload.text === 'string' ? run.donePayload.text : message.text,
        activePptContext,
        loading: false,
        loadingStatus: undefined,
        loadingElapsed: undefined,
        loadingStartedAt: undefined,
      };
    }
    return { ...normalizeSessionAssistantMessage(message, runFiles), loading: false, loadingStatus: undefined, loadingElapsed: undefined, loadingStartedAt: undefined };
  });
  return {
    conversationId: row.conversation_id,
    messages,
    updatedAt: row.updated_at,
    expiresAt: row.expires_at,
  };
}

export function aiHelperHealth(_req: Request, res: Response): void {
  const ai = new AIService();
  res.json({ ok: true, embedded: true, runtime: 'node-ts', db_driver: DB_DRIVER, model_configured: ai.configured(), model: ai.modelName() });
}

router.get('/health', aiHelperHealth);

router.get('/system_prompt', (_req, res) => {
  res.json({ system_prompt: SYSTEM_PROMPT, shortcuts: Object.keys(SHORTCUT_PROMPTS), shortcut_prompts: SHORTCUT_PROMPTS });
});

router.get('/data/summary', async (_req, res, next) => {
  try {
    res.json({ ok: true, metrics: await prefetchMetrics(_req.user?.tenantType === 'pharma' ? { tenantId: _req.user.tenantId } : {}) });
  } catch (err) {
    next(err);
  }
});

router.get('/data-sources', (_req, res) => {
  res.json({
    sources: [
      { id: 'sql', label: `SQL database (${DB_DRIVER})`, description: '通过 Px 后端数据库连接实时聚合患教指标', available: true },
    ],
    default: 'sql',
    db_driver: DB_DRIVER,
  });
});

router.get('/skills', (_req, res) => {
  const registry = new SkillRegistry();
  res.json({ skills: registry.listSkills() });
});

router.get('/jobs', (req, res) => {
  res.json({ jobs: listBackgroundJobs({ conversation_id: String(req.query.conversation_id || ''), run_id: String(req.query.run_id || '') }) });
});

router.get('/jobs/:id', (req, res) => {
  res.json(getBackgroundJob(req.params.id));
});

router.get('/files', (_req, res) => {
  res.json({ files: listGeneratedFiles() });
});

export async function getAiHelperSession(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    await cleanupExpiredAiSessions();
    const userId = req.user!.id;
    const row = await dbGet<AiHelperSessionRow>('SELECT * FROM ai_helper_sessions WHERE user_id = ?', [userId]);
    res.json({ success: true, data: row ? sessionPayload(row) : null, timestamp: nowIso() });
  } catch (err) {
    next(err);
  }
}

export async function putAiHelperSession(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    await cleanupExpiredAiSessions();
    const userId = req.user!.id;
    const tenantId = req.user!.tenantId;
    const conversationId = String(req.body?.conversation_id || req.body?.conversationId || '').trim();
    if (!conversationId) {
      res.status(400).json({ success: false, data: null, message: 'conversation_id is required', timestamp: nowIso() });
      return;
    }
    const messages = sanitizeMessages(req.body?.messages);
    const messagesJson = JSON.stringify(messages);
    if (messagesJson.length > MAX_SESSION_JSON_CHARS) {
      res.status(413).json({ success: false, data: null, message: 'AI helper session is too large', timestamp: nowIso() });
      return;
    }
    const now = nowIso();
    const expiresAt = expiresAtFrom();
    await dbRun(`
      INSERT INTO ai_helper_sessions (user_id, tenant_id, conversation_id, messages, created_at, updated_at, expires_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(user_id) DO UPDATE SET
        tenant_id = excluded.tenant_id,
        conversation_id = excluded.conversation_id,
        messages = excluded.messages,
        updated_at = excluded.updated_at,
        expires_at = excluded.expires_at
    `, [userId, tenantId, conversationId, messagesJson, now, now, expiresAt]);
    res.json({ success: true, data: { conversationId, messages, updatedAt: now, expiresAt }, timestamp: nowIso() });
  } catch (err) {
    next(err);
  }
}

export async function deleteAiHelperSession(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    await dbRun('DELETE FROM ai_helper_sessions WHERE user_id = ?', [req.user!.id]);
    await deleteAiHelperFilesForUser(req.user!.id);
    res.json({ success: true, data: { deleted: true }, timestamp: nowIso() });
  } catch (err) {
    next(err);
  }
}

router.get('/session', getAiHelperSession);
router.put('/session', putAiHelperSession);
router.delete('/session', deleteAiHelperSession);

router.post(['/run', '/command'], async (req, res, next) => {
  try {
    res.json({ ok: true, ...(await runAssistant(req.body || {}, { userId: req.user?.id, tenantId: req.user?.tenantId, tenantType: req.user?.tenantType })) });
  } catch (err) {
    next(err);
  }
});

router.post('/runs/:runId/cancel', (req, res) => {
  const conversationId = String(req.body?.conversation_id || req.query.conversation_id || '').trim();
  const runId = String(req.params.runId || '').trim();
  const run = conversationId && runId ? getStreamRun(conversationId, runId) : undefined;
  if (run && run.status === 'running') {
    run.status = 'cancelled';
    run.abortController.abort();
  }
  res.json({ ok: true, cancelled: Boolean(run), status: run?.status || 'missing' });
});

router.post(['/run/stream', '/command/stream'], async (req: Request, res: Response) => {
  res.status(200);
  res.setHeader('Content-Type', 'application/x-ndjson; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders?.();

  const heartbeatMs = Math.max(5_000, Number(process.env.AI_HELPER_STREAM_HEARTBEAT_MS || 15_000) || 15_000);
  const heartbeat = setInterval(() => {
    if (res.destroyed || res.writableEnded) return;
    try {
      res.write(JSON.stringify({ type: 'heartbeat', data: { ts: new Date().toISOString() } }) + '\n');
    } catch {
      clearInterval(heartbeat);
    }
  }, heartbeatMs);
  let completed = false;
  let disconnected = false;
  let run: StreamRun | undefined;
  let writeLine: ((line: string) => void) | undefined;
  let closeResolve: (() => void) | undefined;
  const closePromise = new Promise<void>((resolve) => {
    closeResolve = resolve;
  });
  res.on('close', () => {
    if (completed) return;
    disconnected = true;
    runtimeLog('stream_client_closed', {
      conversation_id: req.body?.conversation_id,
      run_id: req.body?.run_id,
      shortcut: req.body?.shortcut,
      message: req.body?.message,
      url: req.originalUrl,
      detached_background_run: true,
    });
    closeResolve?.();
  });

  try {
    const attachOnly = req.body?.attach_only === true;
    run = attachOnly
      ? attachStreamRun(req.body || {})
      : startOrGetStreamRun(req.body || {}, { userId: req.user?.id, tenantId: req.user?.tenantId, tenantType: req.user?.tenantType });
    if (attachOnly && !run) {
      res.write(JSON.stringify({ type: 'done', data: { text: '', files: [] } }) + '\n');
      return;
    }
    if (!run) return;
    const activeRun = run;
    writeLine = (line: string) => {
      if (res.destroyed || res.writableEnded) return;
      try {
        res.write(line);
      } catch {
        closeResolve?.();
      }
    };
    activeRun.listeners.add(writeLine);
    for (const line of activeRun.events) writeLine(line);
    if (!activeRun.finishedAt) {
      await Promise.race([
        closePromise,
        new Promise<void>((resolve) => {
          activeRun.waiters.add(resolve);
        }),
      ]);
    }
  } catch (err) {
    logger.error({ err }, 'embedded AI helper stream error');
    if (!res.destroyed && !res.writableEnded) {
      const text = '处理过程中出现问题，请稍后重试。';
      res.write(JSON.stringify({ type: 'text', data: text }) + '\n');
      res.write(JSON.stringify({ type: 'done', data: { text, files: [] } }) + '\n');
    }
  } finally {
    clearInterval(heartbeat);
    completed = true;
    if (run && writeLine) run.listeners.delete(writeLine);
    runtimeLog('stream_response_finally', {
      conversation_id: req.body?.conversation_id,
      run_id: req.body?.run_id,
      shortcut: req.body?.shortcut,
      disconnected,
      stream_run_status: run?.status,
      destroyed: res.destroyed,
      writable_ended: res.writableEnded,
      url: req.originalUrl,
    });
    if (!res.destroyed && !res.writableEnded) res.end();
  }
});

export default router;

export const aiHelperAssetsProxy = express.static(path.resolve(AI_HELPER_ROOT), {
  fallthrough: false,
  setHeaders(res) {
    res.setHeader('Cache-Control', 'no-store');
  },
});
