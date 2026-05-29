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
    return [{
      id: String(obj.id || `${role}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`).slice(0, 120),
      role,
      text,
      runId,
      files,
      pptSvgProgress,
      activePptContext,
    }];
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

function pushStreamRunEvent(run: StreamRun, line: string): void {
  run.events.push(line);
  if (run.events.length > STREAM_RUN_MAX_EVENTS) run.events.splice(0, run.events.length - STREAM_RUN_MAX_EVENTS);
  for (const listener of [...run.listeners]) listener(line);
  const evt = parseStreamLine(line);
  if (evt?.type === 'done' && evt.data && typeof evt.data === 'object') {
    run.donePayload = evt.data as Record<string, unknown>;
  }
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
  messages[index] = {
    ...current,
    text: typeof done.text === 'string' ? done.text : current.text,
    files: Array.isArray(done.files) ? done.files.filter((file): file is string => typeof file === 'string') : current.files,
    activePptContext: done.activePptContext && typeof done.activePptContext === 'object' ? done.activePptContext : current.activePptContext,
  };
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
  return {
    conversationId: row.conversation_id,
    messages: parseStoredMessages(row.messages),
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
    run = startOrGetStreamRun(req.body || {}, { userId: req.user?.id, tenantId: req.user?.tenantId, tenantType: req.user?.tenantType });
    writeLine = (line: string) => {
      if (res.destroyed || res.writableEnded) return;
      try {
        res.write(line);
      } catch {
        closeResolve?.();
      }
    };
    run.listeners.add(writeLine);
    for (const line of run.events) writeLine(line);
    if (!run.finishedAt) {
      await Promise.race([
        closePromise,
        new Promise<void>((resolve) => {
          run?.waiters.add(resolve);
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
