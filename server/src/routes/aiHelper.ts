import express, { Router, type Request, type Response } from 'express';
import path from 'path';
import { runAssistant, streamAssistant, SHORTCUT_PROMPTS, SYSTEM_PROMPT, listGeneratedFiles } from '../ai-helper/agent.js';
import { AIService } from '../ai-helper/aiService.js';
import { AI_HELPER_ROOT, ensureAiHelperDirs } from '../ai-helper/paths.js';
import { prefetchMetrics } from '../ai-helper/metrics.js';
import { SkillRegistry } from '../ai-helper/skillRegistry.js';
import { getBackgroundJob, listBackgroundJobs } from '../ai-helper/backgroundJobs.js';
import { logger } from '../utils/logger.js';
import { DB_DRIVER } from '../db/connection.js';

ensureAiHelperDirs();

const router = Router();

router.get('/health', (_req, res) => {
  const ai = new AIService();
  res.json({ ok: true, embedded: true, runtime: 'node-ts', db_driver: DB_DRIVER, model_configured: ai.configured(), model: ai.modelName() });
});

router.get('/system_prompt', (_req, res) => {
  res.json({ system_prompt: SYSTEM_PROMPT, shortcuts: Object.keys(SHORTCUT_PROMPTS), shortcut_prompts: SHORTCUT_PROMPTS });
});

router.get('/data/summary', async (_req, res, next) => {
  try {
    res.json({ ok: true, metrics: await prefetchMetrics() });
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

router.post(['/run', '/command'], async (req, res, next) => {
  try {
    res.json({ ok: true, ...(await runAssistant(req.body || {})) });
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

  try {
    for await (const line of streamAssistant(req.body || {})) {
      res.write(line);
    }
  } catch (err) {
    logger.error({ err }, 'embedded AI helper stream error');
    res.write(JSON.stringify({ type: 'text', data: `AI helper 执行失败: ${err instanceof Error ? err.message : String(err)}` }) + '\n');
    res.write(JSON.stringify({ type: 'done', data: { text: 'AI helper 执行失败', files: [] } }) + '\n');
  } finally {
    res.end();
  }
});

export default router;

export const aiHelperAssetsProxy = express.static(path.resolve(AI_HELPER_ROOT), {
  fallthrough: false,
  setHeaders(res) {
    res.setHeader('Cache-Control', 'no-store');
  },
});
