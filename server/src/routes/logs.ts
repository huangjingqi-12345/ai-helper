import { Router } from 'express';
import { logger } from '../utils/logger.js';
import { requirePermission } from '../middleware/auth.js';

const router = Router();

// Frontend log ingestion endpoint
router.post('/', requirePermission('logs:write'), (req, res) => {
  const entries = Array.isArray(req.body) ? req.body : [req.body];
  entries.forEach((entry: Record<string, unknown>) => {
    const level = (entry.level as string || 'INFO').toLowerCase();
    const message = `[FE:${entry.category || 'UNKNOWN'}] ${entry.message || 'No message'}`;
    const data = { page: entry.page, data: entry.data, userId: entry.userId };

    if (level === 'error') {
      logger.error(data, message);
    } else if (level === 'warn') {
      logger.warn(data, message);
    } else if (level === 'debug') {
      logger.debug(data, message);
    } else {
      logger.info(data, message);
    }
  });

  res.json({ success: true, data: null, message: `Ingested ${entries.length} log(s)`, timestamp: new Date().toISOString() });
});

export default router;
