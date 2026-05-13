import { Router } from 'express';
import { requirePermission } from '../middleware/auth.js';
import { getTenantByIdPublic } from '../db/repositories.js';
import { asyncRoute } from './asyncRoute.js';

const router = Router();

router.get('/current', requirePermission('overview:read'), asyncRoute(async (req, res) => {
  const tenant = await getTenantByIdPublic(req.user!.tenantId);
  res.json({
    success: true,
    data: {
      id: req.user!.tenantId,
      type: req.user!.tenantType,
      name: tenant?.name ?? req.user!.tenantId,
      shortName: tenant?.shortName ?? req.user!.tenantId,
      isolationMode: process.env.TENANT_ISOLATION_MODE || 'hybrid-schema',
      aggregateOnly: true,
      kAnonymityThreshold: tenant?.kAnonymityThreshold ?? 50,
    },
    timestamp: new Date().toISOString(),
  });
}));

export default router;

