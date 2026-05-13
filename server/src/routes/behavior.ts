import { Router } from 'express';
import { getBehaviorSummary, getBehaviorTrends } from '../db/repositories.js';
import { logger } from '../utils/logger.js';
import { asyncRoute } from './asyncRoute.js';
import { requirePermission } from '../middleware/auth.js';

const router = Router();

router.use(requirePermission('behavior:read'));

router.get('/', asyncRoute(async (req, res) => {
  logger.info({ query: req.query }, 'GET /api/behavior');
  const summary = await getBehaviorSummary(req.user!);
  res.json({
    success: true,
    data: summary,
    timestamp: new Date().toISOString(),
  });
}));

router.get('/trends', asyncRoute(async (req, res) => {
  logger.info({ query: req.query }, 'GET /api/behavior/trends');
  const { type = 'reads' } = req.query;
  const data = await getBehaviorTrends(type as string, req.user!);
  res.json({
    success: true,
    data,
    timestamp: new Date().toISOString(),
  });
}));

export default router;
