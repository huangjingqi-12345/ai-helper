import { Router } from 'express';
import { getOverviewStats, getOverviewProjects } from '../db/repositories.js';
import { logger } from '../utils/logger.js';
import { asyncRoute } from './asyncRoute.js';

const router = Router();

router.get('/', asyncRoute(async (_req, res) => {
  logger.info('GET /api/overview');
  const stats = await getOverviewStats();
  res.json({
    success: true,
    data: stats || { lastUpdated: new Date().toISOString() },
    timestamp: new Date().toISOString(),
  });
}));

router.get('/projects', asyncRoute(async (_req, res) => {
  logger.info('GET /api/overview/projects');
  const projects = await getOverviewProjects();
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
