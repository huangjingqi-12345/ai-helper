import express, { Router, type NextFunction, type Request, type Response } from 'express';
import path from 'path';
import { runAssistant, streamAssistant, SHORTCUT_PROMPTS, SYSTEM_PROMPT, listGeneratedFiles } from '../ai-helper/agent.js';
import { AIService } from '../ai-helper/aiService.js';
import { AI_HELPER_ROOT, ensureAiHelperDirs } from '../ai-helper/paths.js';
import { prefetchMetrics } from '../ai-helper/metrics.js';
import { SkillRegistry } from '../ai-helper/skillRegistry.js';
import { getBackgroundJob, listBackgroundJobs } from '../ai-helper/backgroundJobs.js';
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
    const files = Array.isArray(obj.files)
      ? obj.files.filter((file): file is string => typeof file === 'string' && file.length <= 1000).slice(0, 80)
      : undefined;
    const pptSvgProgress = obj.pptSvgProgress && typeof obj.pptSvgProgress === 'object' ? obj.pptSvgProgress : undefined;
    const activePptContext = obj.activePptContext && typeof obj.activePptContext === 'object' ? obj.activePptContext : undefined;
    return [{
      id: String(obj.id || `${role}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`).slice(0, 120),
      role,
      text,
      files,
      pptSvgProgress,
      activePptContext,
    }];
  });
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
  const abortController = new AbortController();
  res.on('close', () => {
    if (completed) return;
    disconnected = true;
    abortController.abort();
    runtimeLog('stream_client_closed', {
      conversation_id: req.body?.conversation_id,
      run_id: req.body?.run_id,
      shortcut: req.body?.shortcut,
      message: req.body?.message,
      url: req.originalUrl,
    });
  });

  try {
    for await (const line of streamAssistant(req.body || {}, { signal: abortController.signal, userId: req.user?.id, tenantId: req.user?.tenantId, tenantType: req.user?.tenantType })) {
      if (res.destroyed || res.writableEnded) break;
      res.write(line);
    }
  } catch (err) {
    if (abortController.signal.aborted) {
      runtimeLog('stream_aborted', {
        conversation_id: req.body?.conversation_id,
        run_id: req.body?.run_id,
        shortcut: req.body?.shortcut,
        disconnected,
        url: req.originalUrl,
      });
      return;
    }
    logger.error({ err }, 'embedded AI helper stream error');
    if (!res.destroyed && !res.writableEnded) {
      res.write(JSON.stringify({ type: 'text', data: `AI helper 执行失败: ${err instanceof Error ? err.message : String(err)}` }) + '\n');
      res.write(JSON.stringify({ type: 'done', data: { text: 'AI helper 执行失败', files: [] } }) + '\n');
    }
  } finally {
    clearInterval(heartbeat);
    completed = true;
    runtimeLog('stream_response_finally', {
      conversation_id: req.body?.conversation_id,
      run_id: req.body?.run_id,
      shortcut: req.body?.shortcut,
      disconnected,
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
