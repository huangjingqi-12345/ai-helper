import { Router } from 'express';
import { getApprovalQueue, approveItem, rejectItem, getApprovalTasks, handleApprovalTask } from '../db/repositories.js';
import { logger } from '../utils/logger.js';
import { asyncRoute } from './asyncRoute.js';

const router = Router();


router.get('/tasks', asyncRoute(async (req, res) => {
  logger.info({ query: req.query }, 'GET /api/approval/tasks');
  const { status, page = '1', pageSize = '50' } = req.query;
  const result = await getApprovalTasks({
    status: status as string | undefined,
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

router.put('/tasks/:id', asyncRoute(async (req, res) => {
  logger.info({ id: String(req.params.id), body: req.body }, 'PUT /api/approval/tasks/:id');
  const action = req.body.action === 'reject' ? 'reject' : 'approve';
  const item = await handleApprovalTask(String(req.params.id), action, req.body.comments, req.body.rejectReason);
  if (!item) {
    return res.status(404).json({
      success: false,
      data: null,
      message: 'Approval task not found',
      timestamp: new Date().toISOString(),
    });
  }
  res.json({ success: true, data: item, timestamp: new Date().toISOString() });
}));

router.get('/', asyncRoute(async (req, res) => {
  logger.info({ query: req.query }, 'GET /api/approval');
  const { status, page = '1', pageSize = '20' } = req.query;

  const result = await getApprovalQueue({
    status: status as string | undefined,
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

router.post('/:id/approve', asyncRoute(async (req, res) => {
  logger.info({ id: String(req.params.id) }, 'POST /api/approval/:id/approve');
  const item = await approveItem(String(req.params.id), req.body.comments);
  if (!item) {
    return res.status(404).json({
      success: false,
      data: null,
      message: 'Approval item not found',
      timestamp: new Date().toISOString(),
    });
  }
  res.json({ success: true, data: item, timestamp: new Date().toISOString() });
}));

router.post('/:id/reject', asyncRoute(async (req, res) => {
  logger.info({ id: String(req.params.id) }, 'POST /api/approval/:id/reject');
  const item = await rejectItem(String(req.params.id), req.body.comments);
  if (!item) {
    return res.status(404).json({
      success: false,
      data: null,
      message: 'Approval item not found',
      timestamp: new Date().toISOString(),
    });
  }
  res.json({ success: true, data: item, timestamp: new Date().toISOString() });
}));

router.put('/:id', asyncRoute(async (req, res) => {
  logger.info({ id: String(req.params.id), body: req.body }, 'PUT /api/approval/:id');
  const action = req.body.action;
  const item = action === 'reject'
    ? await rejectItem(String(req.params.id), req.body.comments)
    : await approveItem(String(req.params.id), req.body.comments);
  if (!item) {
    return res.status(404).json({
      success: false,
      data: null,
      message: 'Approval item not found',
      timestamp: new Date().toISOString(),
    });
  }
  res.json({ success: true, data: item, timestamp: new Date().toISOString() });
}));

export default router;
