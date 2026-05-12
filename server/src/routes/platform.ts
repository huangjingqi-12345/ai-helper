import { Router } from 'express';
import { getUsers, updateUser, getPlatformSettings, updatePlatformSettings } from '../db/repositories.js';
import { logger } from '../utils/logger.js';

const router = Router();

router.get('/users', (req, res) => {
  logger.info({ query: req.query }, 'GET /api/platform/users');
  const { page = '1', pageSize = '20' } = req.query;

  const result = getUsers({
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

router.put('/users/:id', (req, res) => {
  logger.info({ id: req.params.id, body: req.body }, 'PUT /api/platform/users/:id');
  const updated = updateUser(req.params.id, req.body);
  if (!updated) {
    return res.status(404).json({
      success: false,
      data: null,
      message: 'User not found',
      timestamp: new Date().toISOString(),
    });
  }
  res.json({ success: true, data: updated, timestamp: new Date().toISOString() });
});

router.get('/settings', (_req, res) => {
  logger.info('GET /api/platform/settings');
  const settings = getPlatformSettings();
  res.json({
    success: true,
    data: settings,
    timestamp: new Date().toISOString(),
  });
});

router.put('/settings', (req, res) => {
  logger.info({ body: req.body }, 'PUT /api/platform/settings');
  const updated = updatePlatformSettings(req.body);
  res.json({
    success: true,
    data: updated,
    timestamp: new Date().toISOString(),
  });
});

export default router;
