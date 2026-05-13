import { Router } from 'express';
import overviewRoutes from './overview.js';
import contentRoutes from './content.js';
import behaviorRoutes from './behavior.js';
import distributionRoutes from './distribution.js';
import approvalRoutes from './approval.js';
import platformRoutes from './platform.js';
import logRoutes from './logs.js';
import authRoutes from './auth.js';
import tenantRoutes from './tenants.js';
import ingestRoutes from './ingest.js';
import importRoutes from './imports.js';
import exportRoutes from './exports.js';
import { authenticate } from '../middleware/auth.js';

const router = Router();

// Public health/readiness checks.
router.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
  });
});

router.get('/ready', (_req, res) => {
  res.json({
    status: 'ready',
    timestamp: new Date().toISOString(),
  });
});

// Everything below this line requires authenticated context in production.
router.use(authenticate);

router.use('/auth', authRoutes);
router.use('/tenants', tenantRoutes);
router.use('/overview', overviewRoutes);
router.use('/content', contentRoutes);
router.use('/behavior', behaviorRoutes);
router.use('/distribution', distributionRoutes);
router.use('/approval', approvalRoutes);
router.use('/platform', platformRoutes);
router.use('/ingest', ingestRoutes);
router.use('/imports', importRoutes);
router.use('/exports', exportRoutes);
router.use('/logs', logRoutes);

export default router;
