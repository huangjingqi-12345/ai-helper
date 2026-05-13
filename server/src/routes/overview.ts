import { Router } from 'express';
import { getOverviewStats, getOverviewProjects } from '../db/repositories.js';
import { logger } from '../utils/logger.js';
import { asyncRoute } from './asyncRoute.js';
import { requirePermission } from '../middleware/auth.js';

const router = Router();

router.use(requirePermission('overview:read'));

router.get('/', asyncRoute(async (req, res) => {
  logger.info('GET /api/overview');
  const stats = await getOverviewStats(req.user!);
  res.json({
    success: true,
    data: stats || { lastUpdated: new Date().toISOString() },
    timestamp: new Date().toISOString(),
  });
}));

router.get('/projects', asyncRoute(async (req, res) => {
  logger.info('GET /api/overview/projects');
  const projects = await getOverviewProjects(req.user!);
  res.json({
    success: true,
    data: projects,
    pagination: {
      page: 1,
      pageSize: 20,
      total: projects.length,
      totalPages: 1,
    },
    timestamp: new Date().toISOString(),
  });
}));

export default router;
