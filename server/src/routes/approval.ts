import { Router } from 'express';
import { getApprovalQueue, approveItem, rejectItem } from '../db/repositories.js';
import { logger } from '../utils/logger.js';

const router = Router();

router.get('/', (req, res) => {
  logger.info({ query: req.query }, 'GET /api/approval');
  const { status, page = '1', pageSize = '20' } = req.query;

  const result = getApprovalQueue({
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
});

router.post('/:id/approve', (req, res) => {
  logger.info({ id: req.params.id }, 'POST /api/approval/:id/approve');
  const item = approveItem(req.params.id, req.body.comments);
  if (!item) {
    return res.status(404).json({
      success: false,
      data: null,
      message: 'Approval item not found',
      timestamp: new Date().toISOString(),
    });
  }
  res.json({ success: true, data: item, timestamp: new Date().toISOString() });
});

router.post('/:id/reject', (req, res) => {
  logger.info({ id: req.params.id }, 'POST /api/approval/:id/reject');
  const item = rejectItem(req.params.id, req.body.comments);
  if (!item) {
    return res.status(404).json({
      success: false,
      data: null,
      message: 'Approval item not found',
      timestamp: new Date().toISOString(),
    });
  }
  res.json({ success: true, data: item, timestamp: new Date().toISOString() });
});

router.put('/:id', (req, res) => {
  logger.info({ id: req.params.id, body: req.body }, 'PUT /api/approval/:id');
  const action = req.body.action;
  const item = action === 'reject'
    ? rejectItem(req.params.id, req.body.comments)
    : approveItem(req.params.id, req.body.comments);
  if (!item) {
    return res.status(404).json({
      success: false,
      data: null,
      message: 'Approval item not found',
      timestamp: new Date().toISOString(),
    });
  }
  res.json({ success: true, data: item, timestamp: new Date().toISOString() });
});

export default router;
