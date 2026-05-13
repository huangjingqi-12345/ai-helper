import { Router } from 'express';
import { getApprovalQueue, approveItem, rejectItem, getApprovalTasks, handleApprovalTask } from '../db/repositories.js';
import { logger } from '../utils/logger.js';
import { asyncRoute } from './asyncRoute.js';
import { requirePermission } from '../middleware/auth.js';
import { appendAuditLog } from '../utils/audit.js';
import { asObject, enumValue, optionalString } from '../utils/validation.js';

const router = Router();

router.use(requirePermission('approval:read'));

function validateApprovalAction(body: unknown): { action: 'approve' | 'reject'; comments?: string; rejectReason?: string } {
  const data = asObject(body);
  return {
    action: enumValue(data.action ?? 'approve', 'action', ['approve', 'reject'] as const),
    comments: optionalString(data.comments, 'comments', 2000),
    rejectReason: optionalString(data.rejectReason, 'rejectReason', 1000),
  };
}

router.get('/tasks', asyncRoute(async (req, res) => {
  logger.info({ query: req.query }, 'GET /api/approval/tasks');
  const { status, page = '1', pageSize = '50' } = req.query;
  const result = await getApprovalTasks({
    status: status as string | undefined,
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

router.put('/tasks/:id', requirePermission('approval:write'), asyncRoute(async (req, res) => {
  logger.info({ id: String(req.params.id), body: req.body }, 'PUT /api/approval/tasks/:id');
  const { action, comments, rejectReason } = validateApprovalAction(req.body);
  const item = await handleApprovalTask(String(req.params.id), action, comments, rejectReason, req.user!);
  if (!item) {
    return res.status(404).json({
      success: false,
      data: null,
      message: 'Approval task not found',
      timestamp: new Date().toISOString(),
    });
  }
  await appendAuditLog(req, { action: action === 'approve' ? 'approval.approve' : 'approval.reject', resourceType: 'approval_task', resourceId: String(req.params.id), after: item, metadata: { rejectReason } });
  res.json({ success: true, data: item, timestamp: new Date().toISOString() });
}));

router.get('/', asyncRoute(async (req, res) => {
  logger.info({ query: req.query }, 'GET /api/approval');
  const { status, page = '1', pageSize = '20' } = req.query;

  const result = await getApprovalQueue({
    status: status as string | undefined,
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

router.post('/:id/approve', requirePermission('approval:write'), asyncRoute(async (req, res) => {
  logger.info({ id: String(req.params.id) }, 'POST /api/approval/:id/approve');
  const item = await approveItem(String(req.params.id), req.body.comments, req.user!);
  if (!item) {
    return res.status(404).json({
      success: false,
      data: null,
      message: 'Approval item not found',
      timestamp: new Date().toISOString(),
    });
  }
  await appendAuditLog(req, { action: 'approval.approve', resourceType: 'approval_item', resourceId: String(req.params.id), after: item });
  res.json({ success: true, data: item, timestamp: new Date().toISOString() });
}));

router.post('/:id/reject', requirePermission('approval:write'), asyncRoute(async (req, res) => {
  logger.info({ id: String(req.params.id) }, 'POST /api/approval/:id/reject');
  const item = await rejectItem(String(req.params.id), req.body.comments, req.user!);
  if (!item) {
    return res.status(404).json({
      success: false,
      data: null,
      message: 'Approval item not found',
      timestamp: new Date().toISOString(),
    });
  }
  await appendAuditLog(req, { action: 'approval.reject', resourceType: 'approval_item', resourceId: String(req.params.id), after: item });
  res.json({ success: true, data: item, timestamp: new Date().toISOString() });
}));

router.put('/:id', requirePermission('approval:write'), asyncRoute(async (req, res) => {
  logger.info({ id: String(req.params.id), body: req.body }, 'PUT /api/approval/:id');
  const { action, comments } = validateApprovalAction(req.body);
  const item = action === 'reject'
    ? await rejectItem(String(req.params.id), comments, req.user!)
    : await approveItem(String(req.params.id), comments, req.user!);
  if (!item) {
    return res.status(404).json({
      success: false,
      data: null,
      message: 'Approval item not found',
      timestamp: new Date().toISOString(),
    });
  }
  await appendAuditLog(req, { action: action === 'approve' ? 'approval.approve' : 'approval.reject', resourceType: 'approval_item', resourceId: String(req.params.id), after: item });
  res.json({ success: true, data: item, timestamp: new Date().toISOString() });
}));

export default router;
