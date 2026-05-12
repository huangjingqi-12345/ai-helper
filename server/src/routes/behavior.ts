import { Router } from 'express';
import { getBehaviorSummary, getBehaviorTrends } from '../db/repositories.js';
import { logger } from '../utils/logger.js';

const router = Router();

router.get('/', (req, res) => {
  logger.info({ query: req.query }, 'GET /api/behavior');
  const summary = getBehaviorSummary();
  res.json({
    success: true,
    data: summary,
    timestamp: new Date().toISOString(),
  });
});

router.get('/trends', (req, res) => {
  logger.info({ query: req.query }, 'GET /api/behavior/trends');
  const { type = 'reads' } = req.query;
  const data = getBehaviorTrends(type as string);
  res.json({
    success: true,
    data,
    timestamp: new Date().toISOString(),
  });
});

export default router;
