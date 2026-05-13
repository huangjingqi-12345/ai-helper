import { Router } from 'express';
import type { Request } from 'express';
import {
  getUsers,
  updateUser,
  getPlatformSettings,
  updatePlatformSettings,
  getTenantOptions,
  getTenants,
  createTenant,
  updateTenantStatus,
  getAccounts,
  createAccount,
  updateAccountStatus,
  updateAccount2fa,
  getApprovalFlows,
  getTeamMembers,
  updateTeamMemberRole,
  createTeamMember,
  deleteTeamMember,
  getAuditLogs,
} from '../db/repositories.js';
import { logger } from '../utils/logger.js';
import { asyncRoute } from './asyncRoute.js';
import { requirePermission, requirePxAdmin } from '../middleware/auth.js';
import { appendAuditLog } from '../utils/audit.js';

const router = Router();

router.use(requirePermission('platform:read'));

function canUseTenantOverride(req: Request): boolean {
  return Boolean(req.user?.tenantType === 'ops' || req.user?.permissions.includes('*') || req.user?.permissions.includes('tenant:admin'));
}

function tenantIdFromAuth(req: Request, candidate?: unknown): string {
  if (canUseTenantOverride(req) && typeof candidate === 'string' && candidate.trim()) return candidate.trim();
  return req.user!.tenantId;
}

router.get('/tenants/options', requirePxAdmin, asyncRoute(async (_req, res) => {
  logger.info('GET /api/platform/tenants/options');
  const tenants = await getTenantOptions();
  res.json({ success: true, data: tenants, timestamp: new Date().toISOString() });
}));

router.get('/tenants', requirePxAdmin, asyncRoute(async (_req, res) => {
  logger.info('GET /api/platform/tenants');
  const tenants = await getTenants();
  res.json({ success: true, data: tenants, timestamp: new Date().toISOString() });
}));

router.post('/tenants', requirePxAdmin, requirePermission('platform:write'), asyncRoute(async (req, res) => {
  logger.info({ body: req.body }, 'POST /api/platform/tenants');
  const tenant = await createTenant(req.body);
  await appendAuditLog(req, { action: 'tenant.create', resourceType: 'tenant', resourceId: String((tenant as Record<string, unknown> | null)?.id ?? ''), after: tenant });
  res.status(201).json({ success: true, data: tenant, timestamp: new Date().toISOString() });
}));

router.patch('/tenants/:id/status', requirePxAdmin, requirePermission('platform:write'), asyncRoute(async (req, res) => {
  logger.info({ id: String(req.params.id), body: req.body }, 'PATCH /api/platform/tenants/:id/status');
  const tenant = await updateTenantStatus(String(req.params.id), String(req.body.status));
  if (!tenant) return res.status(404).json({ success: false, data: null, message: 'Tenant not found', timestamp: new Date().toISOString() });
  await appendAuditLog(req, { action: 'tenant.status.update', resourceType: 'tenant', resourceId: String(req.params.id), after: tenant });
  res.json({ success: true, data: tenant, timestamp: new Date().toISOString() });
}));

router.get('/accounts', requirePxAdmin, asyncRoute(async (_req, res) => {
  logger.info('GET /api/platform/accounts');
  const accounts = await getAccounts();
  res.json({ success: true, data: accounts, timestamp: new Date().toISOString() });
}));

router.post('/accounts', requirePxAdmin, requirePermission('platform:write'), asyncRoute(async (req, res) => {
  logger.info({ body: req.body }, 'POST /api/platform/accounts');
  const account = await createAccount(req.body);
  await appendAuditLog(req, { action: 'account.create', resourceType: 'user', resourceId: String((account as Record<string, unknown> | null)?.id ?? ''), after: account });
  res.status(201).json({ success: true, data: account, timestamp: new Date().toISOString() });
}));

router.patch('/accounts/:id/status', requirePxAdmin, requirePermission('platform:write'), asyncRoute(async (req, res) => {
  logger.info({ id: String(req.params.id), body: req.body }, 'PATCH /api/platform/accounts/:id/status');
  const account = await updateAccountStatus(String(req.params.id), String(req.body.status));
  if (!account) return res.status(404).json({ success: false, data: null, message: 'Account not found', timestamp: new Date().toISOString() });
  await appendAuditLog(req, { action: 'account.status.update', resourceType: 'user', resourceId: String(req.params.id), after: account });
  res.json({ success: true, data: account, timestamp: new Date().toISOString() });
}));

router.patch('/accounts/:id/2fa', requirePxAdmin, requirePermission('platform:write'), asyncRoute(async (req, res) => {
  logger.info({ id: String(req.params.id), body: req.body }, 'PATCH /api/platform/accounts/:id/2fa');
  const account = await updateAccount2fa(String(req.params.id), Boolean(req.body.has2fa));
  if (!account) return res.status(404).json({ success: false, data: null, message: 'Account not found', timestamp: new Date().toISOString() });
  await appendAuditLog(req, { action: 'account.mfa.update', resourceType: 'user', resourceId: String(req.params.id), after: account });
  res.json({ success: true, data: account, timestamp: new Date().toISOString() });
}));

router.get('/approval-flows', asyncRoute(async (req, res) => {
  logger.info({ query: req.query }, 'GET /api/platform/approval-flows');
  const flows = await getApprovalFlows(tenantIdFromAuth(req, req.query.tenantId));
  res.json({ success: true, data: flows, timestamp: new Date().toISOString() });
}));

router.get('/team', asyncRoute(async (req, res) => {
  logger.info({ query: req.query }, 'GET /api/platform/team');
  const members = await getTeamMembers(tenantIdFromAuth(req, req.query.tenantId));
  res.json({ success: true, data: members, timestamp: new Date().toISOString() });
}));

router.post('/team', requirePermission('platform:write'), asyncRoute(async (req, res) => {
  logger.info({ body: req.body }, 'POST /api/platform/team');
  const member = await createTeamMember(tenantIdFromAuth(req, req.body.tenantId), req.body);
  res.status(201).json({ success: true, data: member, timestamp: new Date().toISOString() });
}));

router.patch('/team/:id/role', requirePermission('platform:write'), asyncRoute(async (req, res) => {
  logger.info({ id: String(req.params.id), body: req.body }, 'PATCH /api/platform/team/:id/role');
  const member = await updateTeamMemberRole(String(req.params.id), String(req.body.role), req.user!);
  if (!member) return res.status(404).json({ success: false, data: null, message: 'Team member not found', timestamp: new Date().toISOString() });
  res.json({ success: true, data: member, timestamp: new Date().toISOString() });
}));

router.delete('/team/:id', requirePermission('platform:write'), asyncRoute(async (req, res) => {
  logger.info({ id: String(req.params.id) }, 'DELETE /api/platform/team/:id');
  const deleted = await deleteTeamMember(String(req.params.id), req.user!);
  if (!deleted) return res.status(404).json({ success: false, data: null, message: 'Team member not found', timestamp: new Date().toISOString() });
  res.json({ success: true, data: null, timestamp: new Date().toISOString() });
}));

router.get('/audit-logs', asyncRoute(async (req, res) => {
  logger.info({ query: req.query }, 'GET /api/platform/audit-logs');
  const logs = await getAuditLogs(tenantIdFromAuth(req, req.query.tenantId));
  res.json({ success: true, data: logs, timestamp: new Date().toISOString() });
}));

router.get('/users', asyncRoute(async (req, res) => {
  logger.info({ query: req.query }, 'GET /api/platform/users');
  const { page = '1', pageSize = '20' } = req.query;

  const result = await getUsers({
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

router.put('/users/:id', requirePermission('platform:write'), asyncRoute(async (req, res) => {
  logger.info({ id: String(req.params.id), body: req.body }, 'PUT /api/platform/users/:id');
  const updated = await updateUser(String(req.params.id), req.body);
  if (!updated) {
    return res.status(404).json({
      success: false,
      data: null,
      message: 'User not found',
      timestamp: new Date().toISOString(),
    });
  }
  res.json({ success: true, data: updated, timestamp: new Date().toISOString() });
}));

router.get('/settings', asyncRoute(async (_req, res) => {
  logger.info('GET /api/platform/settings');
  const settings = await getPlatformSettings();
  res.json({
    success: true,
    data: settings,
    timestamp: new Date().toISOString(),
  });
}));

router.put('/settings', requirePermission('platform:write'), asyncRoute(async (req, res) => {
  logger.info({ body: req.body }, 'PUT /api/platform/settings');
  const updated = await updatePlatformSettings(req.body);
  res.json({
    success: true,
    data: updated,
    timestamp: new Date().toISOString(),
  });
}));

export default router;
