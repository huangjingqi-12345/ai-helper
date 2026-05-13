import { Router } from 'express';
import { requirePermission } from '../middleware/auth.js';
import { appendAuditLog } from '../utils/audit.js';
import { asyncRoute } from './asyncRoute.js';

const router = Router();

router.get('/me', requirePermission('overview:read'), asyncRoute(async (req, res) => {
  await appendAuditLog(req, {
    action: 'auth.me',
    resourceType: 'user',
    resourceId: req.user?.id,
    description: 'Current authenticated user inspected their session context',
  });

  res.json({
    success: true,
    data: {
      id: req.user!.id,
      email: req.user!.email,
      name: req.user!.name,
      tenantId: req.user!.tenantId,
      tenantType: req.user!.tenantType,
      roles: req.user!.roles,
      permissions: req.user!.permissions,
      authProvider: req.user!.authProvider,
      mfa: req.user!.mfa,
    },
    timestamp: new Date().toISOString(),
  });
}));

export default router;

