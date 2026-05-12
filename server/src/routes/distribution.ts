import { Router } from 'express';
import { getStrategies, createStrategy, updateStrategy } from '../db/repositories.js';
import { logger } from '../utils/logger.js';

const router = Router();

router.get('/', (req, res) => {
  logger.info({ query: req.query }, 'GET /api/distribution');
  const { status, page = '1', pageSize = '20' } = req.query;

  const result = getStrategies({
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

router.post('/', (req, res) => {
  logger.info({ body: req.body }, 'POST /api/distribution');
  const newStrategy = createStrategy(req.body);
  res.status(201).json({ success: true, data: newStrategy, timestamp: new Date().toISOString() });
});

router.put('/:id', (req, res) => {
  logger.info({ id: req.params.id, body: req.body }, 'PUT /api/distribution/:id');
  const updated = updateStrategy(req.params.id, req.body);
  if (!updated) {
    return res.status(404).json({
      success: false,
      data: null,
      message: 'Strategy not found',
      timestamp: new Date().toISOString(),
    });
  }
  res.json({ success: true, data: updated, timestamp: new Date().toISOString() });
});

export default router;
