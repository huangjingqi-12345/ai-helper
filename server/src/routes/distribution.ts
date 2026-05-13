import { Router } from 'express';
import {
  getStrategies,
  createStrategy,
  updateStrategy,
  getDistributionProjects,
  getDistributionProjectById,
  getDoctorCandidates,
} from '../db/repositories.js';
import { logger } from '../utils/logger.js';
import { asyncRoute } from './asyncRoute.js';

const router = Router();

router.get('/projects', asyncRoute(async (req, res) => {
  logger.info({ query: req.query }, 'GET /api/distribution/projects');
  const { status, priority, search, page = '1', pageSize = '50' } = req.query;
  const result = await getDistributionProjects({
    status: status as string | undefined,
    priority: priority as string | undefined,
    search: search as string | undefined,
    page: parseInt(page as string, 10),
    pageSize: parseInt(pageSize as string, 10),
  });

  res.json({
    success: true,
    data: result.data,
    pagination: {
      page: parseInt(page as string, 10),
      pageSize: parseInt(pageSize as string, 10),
      total: result.total,
      totalPages: result.totalPages,
    },
    timestamp: new Date().toISOString(),
  });
}));

router.get('/projects/:id', asyncRoute(async (req, res) => {
  logger.info({ id: String(req.params.id) }, 'GET /api/distribution/projects/:id');
  const project = await getDistributionProjectById(String(req.params.id));
  if (!project) {
    return res.status(404).json({ success: false, data: null, message: 'Distribution project not found', timestamp: new Date().toISOString() });
  }
  res.json({ success: true, data: project, timestamp: new Date().toISOString() });
}));

router.get('/projects/:id/doctors', asyncRoute(async (_req, res) => {
  logger.info('GET /api/distribution/projects/:id/doctors');
  const doctors = await getDoctorCandidates();
  res.json({ success: true, data: doctors, timestamp: new Date().toISOString() });
}));

router.get('/', asyncRoute(async (req, res) => {
  logger.info({ query: req.query }, 'GET /api/distribution');
  const { status, projectId, page = '1', pageSize = '20' } = req.query;

  const result = await getStrategies({
    status: status as string | undefined,
    projectId: projectId as string | undefined,
    page: parseInt(page as string, 10),
    pageSize: parseInt(pageSize as string, 10),
  });

  res.json({
    success: true,
    data: result.data,
    pagination: {
      page: parseInt(page as string, 10),
      pageSize: parseInt(pageSize as string, 10),
      total: result.total,
      totalPages: result.totalPages,
    },
    timestamp: new Date().toISOString(),
  });
}));

router.post('/', asyncRoute(async (req, res) => {
  logger.info({ body: req.body }, 'POST /api/distribution');
  const newStrategy = await createStrategy(req.body);
  res.status(201).json({ success: true, data: newStrategy, timestamp: new Date().toISOString() });
}));

router.put('/:id', asyncRoute(async (req, res) => {
  logger.info({ id: String(req.params.id), body: req.body }, 'PUT /api/distribution/:id');
  const updated = await updateStrategy(String(req.params.id), req.body);
  if (!updated) {
    return res.status(404).json({
      success: false,
      data: null,
      message: 'Strategy not found',
      timestamp: new Date().toISOString(),
    });
  }
  res.json({ success: true, data: updated, timestamp: new Date().toISOString() });
}));

export default router;
