import { Router } from 'express';
import overviewRoutes from './overview.js';
import contentRoutes from './content.js';
import behaviorRoutes from './behavior.js';
import distributionRoutes from './distribution.js';
import approvalRoutes from './approval.js';
import platformRoutes from './platform.js';
import logRoutes from './logs.js';
import authRoutes from './auth.js';
import publicAuthRoutes from './publicAuth.js';
import tenantRoutes from './tenants.js';
import ingestRoutes from './ingest.js';
import cxStatsSyncRoutes from './cxStatsSync.js';
import importRoutes from './imports.js';
import exportRoutes from './exports.js';
import aiHelperRoutes from './aiHelper.js';
import { authenticate } from '../middleware/auth.js';
import { DB_DRIVER, dbGet } from '../db/connection.js';

const router = Router();

// Public health/readiness checks.
router.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
  });
});

router.get('/ready', async (_req, res) => {
  try {
    const db = await dbGet<{ ok: number | string }>('SELECT 1 AS ok');

    if (Number(db?.ok) !== 1) {
      throw new Error('database readiness query returned no result');
    }

    res.json({
      status: 'ready',
      database: {
        driver: DB_DRIVER,
        connected: true,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    res.status(503).json({
      status: 'not_ready',
      database: {
        driver: DB_DRIVER,
        connected: false,
      },
      message: error instanceof Error ? error.message : 'database readiness check failed',
      timestamp: new Date().toISOString(),
    });
  }
});

// Login/register must be available before authenticated API middleware.
router.use('/auth', publicAuthRoutes);

// Everything below this line requires authenticated context in production.
router.use(authenticate);

router.use('/ai-helper', aiHelperRoutes);

router.use('/auth', authRoutes);
router.use('/tenants', tenantRoutes);
router.use('/overview', overviewRoutes);
router.use('/content', contentRoutes);
router.use('/behavior', behaviorRoutes);
router.use('/distribution', distributionRoutes);
router.use('/approval', approvalRoutes);
router.use('/platform', platformRoutes);
router.use('/ingest', ingestRoutes);
router.use('/cx-stats', cxStatsSyncRoutes);
router.use('/imports', importRoutes);
router.use('/exports', exportRoutes);
router.use('/logs', logRoutes);

export default router;
