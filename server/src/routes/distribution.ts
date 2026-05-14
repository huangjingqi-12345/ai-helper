import { Router } from 'express';
import {
  getStrategies,
  createStrategy,
  updateStrategy,
  getDistributionProjects,
  getDistributionProjectById,
  getDoctorCandidates,
  getContentRequestById,
  updateContentRequestStatus,
  defaultRequestDistributionConfig,
  getRequestDistributionConfig,
  upsertRequestDistributionConfig,
  getRequestDistributionBatches,
  createRequestDistributionBatch,
} from '../db/repositories.js';
import { logger } from '../utils/logger.js';
import { asyncRoute } from './asyncRoute.js';
import { requirePermission } from '../middleware/auth.js';
import { appendAuditLog } from '../utils/audit.js';

const router = Router();

router.use(requirePermission('distribution:read'));

router.get('/projects', asyncRoute(async (req, res) => {
  logger.info({ query: req.query }, 'GET /api/distribution/projects');
  const { status, priority, search, page = '1', pageSize = '50' } = req.query;
  const result = await getDistributionProjects({
    status: status as string | undefined,
    priority: priority as string | undefined,
    search: search as string | undefined,
    page: parseInt(page as string, 10),
    pageSize: parseInt(pageSize as string, 10),
    scope: req.user!,
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
  const project = await getDistributionProjectById(String(req.params.id), req.user!);
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

router.get('/requests/:id', asyncRoute(async (req, res) => {
  logger.info({ id: String(req.params.id) }, 'GET /api/distribution/requests/:id');
  const request = await getContentRequestById(String(req.params.id), req.user!);
  if (!request) {
    return res.status(404).json({ success: false, data: null, message: 'Distribution request not found', timestamp: new Date().toISOString() });
  }
  const requestProject = (request as { project?: { patientCap?: number } }).project;
  const config = await getRequestDistributionConfig(String(req.params.id))
    ?? defaultRequestDistributionConfig(String(req.params.id), Number(requestProject?.patientCap ?? 5000));
  const [doctors, batches] = await Promise.all([
    getDoctorCandidates(),
    getRequestDistributionBatches(String(req.params.id)),
  ]);
  res.json({
    success: true,
    data: { request, config, doctors, batches },
    timestamp: new Date().toISOString(),
  });
}));

router.post('/requests/:id/accept', requirePermission('distribution:write'), asyncRoute(async (req, res) => {
  logger.info({ id: String(req.params.id), body: req.body }, 'POST /api/distribution/requests/:id/accept');
  const note = typeof req.body?.note === 'string' ? req.body.note : undefined;
  const updated = await updateContentRequestStatus(String(req.params.id), 'accepted', note, req.user!);
  if (!updated) {
    return res.status(404).json({ success: false, data: null, message: 'Distribution request not found', timestamp: new Date().toISOString() });
  }
  await appendAuditLog(req, { action: 'distribution.request.accept', resourceType: 'content_request', resourceId: String(req.params.id), after: updated });
  res.json({ success: true, data: updated, timestamp: new Date().toISOString() });
}));

router.put('/requests/:id/config', requirePermission('distribution:write'), asyncRoute(async (req, res) => {
  logger.info({ id: String(req.params.id), body: req.body }, 'PUT /api/distribution/requests/:id/config');
  const saved = await upsertRequestDistributionConfig(String(req.params.id), req.body as Record<string, unknown>, req.user!);
  if (!saved) {
    return res.status(404).json({ success: false, data: null, message: 'Distribution request not found', timestamp: new Date().toISOString() });
  }
  await appendAuditLog(req, { action: 'distribution.request.config.save', resourceType: 'content_request', resourceId: String(req.params.id), after: saved });
  res.json({ success: true, data: saved, timestamp: new Date().toISOString() });
}));

router.post('/requests/:id/batches', requirePermission('distribution:write'), asyncRoute(async (req, res) => {
  logger.info({ id: String(req.params.id), body: req.body }, 'POST /api/distribution/requests/:id/batches');
  const batch = await createRequestDistributionBatch(String(req.params.id), req.body as Record<string, unknown>, req.user!);
  if (!batch) {
    return res.status(400).json({ success: false, data: null, message: 'Request not found or batch is empty', timestamp: new Date().toISOString() });
  }
  await appendAuditLog(req, { action: 'distribution.request.batch.submit', resourceType: 'content_request', resourceId: String(req.params.id), after: batch });
  res.status(201).json({ success: true, data: batch, timestamp: new Date().toISOString() });
}));

router.get('/', asyncRoute(async (req, res) => {
  logger.info({ query: req.query }, 'GET /api/distribution');
  const { status, projectId, page = '1', pageSize = '20' } = req.query;

  const result = await getStrategies({
    status: status as string | undefined,
    projectId: projectId as string | undefined,
    page: parseInt(page as string, 10),
    pageSize: parseInt(pageSize as string, 10),
    scope: req.user!,
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

router.post('/', requirePermission('distribution:write'), asyncRoute(async (req, res) => {
  logger.info({ body: req.body }, 'POST /api/distribution');
  const newStrategy = await createStrategy(req.body, req.user!);
  await appendAuditLog(req, { action: 'distribution.create', resourceType: 'distribution_strategy', resourceId: String((newStrategy as Record<string, unknown> | null)?.id ?? ''), after: newStrategy });
  res.status(201).json({ success: true, data: newStrategy, timestamp: new Date().toISOString() });
}));

router.put('/:id', requirePermission('distribution:write'), asyncRoute(async (req, res) => {
  logger.info({ id: String(req.params.id), body: req.body }, 'PUT /api/distribution/:id');
  const updated = await updateStrategy(String(req.params.id), req.body, req.user!);
  if (!updated) {
    return res.status(404).json({
      success: false,
      data: null,
      message: 'Strategy not found',
      timestamp: new Date().toISOString(),
    });
  }
  await appendAuditLog(req, { action: 'distribution.update', resourceType: 'distribution_strategy', resourceId: String(req.params.id), after: updated });
  res.json({ success: true, data: updated, timestamp: new Date().toISOString() });
}));

export default router;
