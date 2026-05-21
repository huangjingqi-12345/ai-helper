import { Router } from 'express';
import { runCxStatsSync } from '../jobs/syncCxStats.js';
import { isCxStatsConfigured } from '../integrations/cxStats.js';
import { requirePermission } from '../middleware/auth.js';
import { appendAuditLog } from '../utils/audit.js';
import { asyncRoute } from './asyncRoute.js';

const router = Router();

router.use(requirePermission('ingest:write'));

router.post('/sync', asyncRoute(async (req, res) => {
  if (!isCxStatsConfigured()) {
    res.status(400).json({
      success: false,
      message: 'CX stats sync is not configured. Set CX_API_BASE_URL and CX_PHARMA_ACCESS_TOKEN.',
      timestamp: new Date().toISOString(),
    });
    return;
  }

  const result = await runCxStatsSync();
  await appendAuditLog(req, {
    action: 'cx_stats.sync',
    resourceType: 'behavior_daily_metrics',
    description: `Synced ${result.synced} CX stats rows`,
    metadata: result,
  });

  res.json({
    success: true,
    data: result,
    timestamp: new Date().toISOString(),
  });
}));

export default router;
