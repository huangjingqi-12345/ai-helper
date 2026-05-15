import type { NextFunction, Request, Response } from 'express';
import { createRemoteJWKSet, jwtVerify, type JWTPayload } from 'jose';
import { logger } from '../utils/logger.js';
import { verifyLocalSessionToken } from '../utils/localAuth.js';
import { dbGet } from '../db/connection.js';

export type AppRole =
  | 'px_super_admin'
  | 'px_ops_admin'
  | 'px_content_ops'
  | 'px_distribution_ops'
  | 'pharma_admin'
  | 'pharma_medical_reviewer'
  | 'pharma_marketing_reviewer'
  | 'pharma_viewer';

export type Permission =
  | '*'
  | 'overview:read'
  | 'content:read'
  | 'content:write'
  | 'content:submit_request'
  | 'behavior:read'
  | 'distribution:read'
  | 'distribution:write'
  | 'approval:read'
  | 'approval:write'
  | 'platform:read'
  | 'platform:write'
  | 'tenant:admin'
  | 'export:create'
  | 'export:read'
  | 'ingest:write'
  | 'logs:write';

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  tenantId: string;
  tenantType: 'ops' | 'pharma';
  roles: AppRole[];
  permissions: Permission[];
  authProvider: 'oidc' | 'dev' | 'local' | 'break_glass';
  mfa: boolean;
}

const ROLE_PERMISSIONS: Record<AppRole, Permission[]> = {
  px_super_admin: ['*'],
  px_ops_admin: ['*'],
  px_content_ops: [
    'overview:read',
    'content:read',
    'content:write',
    'behavior:read',
    'approval:read',
    'approval:write',
    'export:create',
    'export:read',
    'ingest:write',
    'logs:write',
  ],
  px_distribution_ops: [
    'overview:read',
    'content:read',
    'content:submit_request',
    'behavior:read',
    'distribution:read',
    'distribution:write',
    'export:create',
    'export:read',
    'ingest:write',
    'logs:write',
  ],
  pharma_admin: [
    'overview:read',
    'content:read',
    'content:submit_request',
    'behavior:read',
    'approval:read',
    'approval:write',
    'platform:read',
    'export:create',
    'export:read',
    'ingest:write',
  ],
  pharma_medical_reviewer: ['content:read', 'behavior:read', 'approval:read', 'approval:write'],
  pharma_marketing_reviewer: ['content:read', 'behavior:read', 'approval:read', 'approval:write'],
  pharma_viewer: ['overview:read', 'content:read', 'behavior:read', 'approval:read', 'export:read'],
};

const DEV_USERS: Record<string, AuthUser> = {
  'dev-px-admin': {
    id: 'A-001',
    email: 'qixc@px.health',
    name: '齐晓川',
    tenantId: 'T-PX',
    tenantType: 'ops',
    roles: ['px_super_admin'],
    permissions: ['*'],
    authProvider: 'dev',
    mfa: true,
  },
  'dev-px-ops': {
    id: 'A-002',
    email: 'luwx@px.health',
    name: '陆玟昕',
    tenantId: 'T-PX',
    tenantType: 'ops',
    roles: ['px_content_ops'],
    permissions: ROLE_PERMISSIONS.px_content_ops,
    authProvider: 'dev',
    mfa: true,
  },
  'dev-pharma-admin': {
    id: 'A-007',
    email: 'linx@novartis.cn',
    name: '林筱',
    tenantId: 'T-NV',
    tenantType: 'pharma',
    roles: ['pharma_admin'],
    permissions: ROLE_PERMISSIONS.pharma_admin,
    authProvider: 'dev',
    mfa: true,
  },
  'dev-pharma-viewer': {
    id: 'A-008',
    email: 'songzj@novartis.cn',
    name: '宋知节',
    tenantId: 'T-NV',
    tenantType: 'pharma',
    roles: ['pharma_viewer'],
    permissions: ROLE_PERMISSIONS.pharma_viewer,
    authProvider: 'dev',
    mfa: true,
  },
};

let jwks: ReturnType<typeof createRemoteJWKSet> | undefined;

type LocalUserRow = {
  id: string;
  tenant_id: string;
  tenant_type?: 'ops' | 'pharma';
  name: string;
  email: string;
  role: 'admin' | 'editor' | 'viewer';
  role_labels?: string | string[];
  view_type?: 'ops' | 'pharma';
  status?: 'active' | 'inactive' | 'frozen' | 'invited';
  has_2fa?: boolean | number | string;
};

function unique<T>(values: T[]): T[] {
  return [...new Set(values)];
}

export function rolePermissions(roles: AppRole[]): Permission[] {
  if (roles.includes('px_super_admin') || roles.includes('px_ops_admin')) return ['*'];
  return unique(roles.flatMap((role) => ROLE_PERMISSIONS[role] ?? []));
}

export function hasPermission(user: AuthUser, permission: Permission): boolean {
  return user.permissions.includes('*') || user.permissions.includes(permission);
}

function parseRoles(value: unknown): AppRole[] {
  const raw = Array.isArray(value) ? value : typeof value === 'string' ? value.split(/[,\s]+/) : [];
  const allowed = new Set(Object.keys(ROLE_PERMISSIONS));
  const roles = raw.map(String).filter((role): role is AppRole => allowed.has(role));
  return roles.length > 0 ? roles : ['pharma_viewer'];
}

function boolFromDb(value: unknown): boolean {
  return value === true || value === 1 || value === '1' || value === 'true';
}

function appRolesFromLocalUser(row: LocalUserRow): AppRole[] {
  const viewType = row.view_type || row.tenant_type || (row.tenant_id === 'T-PX' ? 'ops' : 'pharma');
  // Local self-service auth intentionally keeps the product model simple:
  // registered users are separated by ops/pharma view only; role labels are
  // collected for account metadata, not for a fine-grained RBAC matrix.
  return viewType === 'ops' ? ['px_ops_admin'] : ['pharma_admin'];
}

function authUserFromLocalRow(row: LocalUserRow): AuthUser | null {
  if (row.status && row.status !== 'active') return null;
  const tenantType = row.view_type || row.tenant_type || (row.tenant_id === 'T-PX' ? 'ops' : 'pharma');
  const roles = appRolesFromLocalUser(row);
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    tenantId: row.tenant_id,
    tenantType,
    roles,
    permissions: rolePermissions(roles),
    authProvider: 'local',
    mfa: boolFromDb(row.has_2fa),
  };
}

async function verifyLocalToken(token: string): Promise<AuthUser | null> {
  const session = verifyLocalSessionToken(token);
  if (!session) return null;
  const row = await dbGet<LocalUserRow>(`
    SELECT u.*, t.tenant_type
    FROM users u
    LEFT JOIN tenants t ON t.id = u.tenant_id
    WHERE u.id = ?
  `, [session.userId]);
  return row ? authUserFromLocalRow(row) : null;
}

function claimString(payload: JWTPayload, names: string[], fallback = ''): string {
  for (const name of names) {
    const value = payload[name];
    if (typeof value === 'string' && value.trim()) return value;
  }
  return fallback;
}

async function verifyOidcToken(token: string): Promise<AuthUser> {
  const jwksUrl = process.env.OIDC_JWKS_URL;
  const issuer = process.env.OIDC_ISSUER;
  const audience = process.env.OIDC_AUDIENCE;

  if (!jwksUrl || !issuer || !audience) {
    throw new Error('OIDC_JWKS_URL, OIDC_ISSUER, and OIDC_AUDIENCE are required when demo auth is disabled.');
  }

  jwks ??= createRemoteJWKSet(new URL(jwksUrl));
  const { payload } = await jwtVerify(token, jwks, { issuer, audience });
  const roles = parseRoles(payload.roles ?? payload.role ?? payload.groups);
  const tenantId = claimString(payload, ['tenant_id', 'tenantId'], 'T-UNKNOWN');
  const tenantType = claimString(payload, ['tenant_type', 'tenantType'], tenantId === 'T-PX' ? 'ops' : 'pharma') === 'ops' ? 'ops' : 'pharma';

  const mfa = payload.amr === 'mfa' || (Array.isArray(payload.amr) && payload.amr.includes('mfa')) || payload.mfa === true;
  const user: AuthUser = {
    id: claimString(payload, ['sub', 'user_id'], 'unknown'),
    email: claimString(payload, ['email'], 'unknown@example.invalid'),
    name: claimString(payload, ['name', 'preferred_username'], 'Authenticated user'),
    tenantId,
    tenantType,
    roles,
    permissions: rolePermissions(roles),
    authProvider: 'oidc',
    mfa,
  };

  const mfaRequired = process.env.REQUIRE_MFA === 'true' || (process.env.NODE_ENV === 'production' && process.env.REQUIRE_MFA !== 'false');
  if (mfaRequired && !user.mfa) {
    throw new Error('MFA claim required for production access.');
  }

  return user;
}

function getBearerToken(req: Request): string | null {
  const auth = req.header('authorization');
  if (!auth) return null;
  const match = auth.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() ?? null;
}

function demoAuthAllowed(): boolean {
  return process.env.NODE_ENV !== 'production' || process.env.ALLOW_DEMO_AUTH === 'true';
}

function verifyBreakGlassToken(token: string): AuthUser | null {
  const configured = process.env.BREAK_GLASS_ADMIN_TOKEN;
  if (!configured || token !== configured) return null;
  return {
    id: process.env.BREAK_GLASS_ADMIN_ID || 'break-glass-admin',
    email: process.env.BREAK_GLASS_ADMIN_EMAIL || 'breakglass@example.invalid',
    name: process.env.BREAK_GLASS_ADMIN_NAME || 'Break-glass Admin',
    tenantId: process.env.BREAK_GLASS_TENANT_ID || 'T-PX',
    tenantType: 'ops',
    roles: ['px_super_admin'],
    permissions: ['*'],
    authProvider: 'break_glass',
    mfa: true,
  };
}

export async function authenticate(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const token = getBearerToken(req);
    if (!token) {
      if (!demoAuthAllowed()) {
        res.status(401).json({ success: false, data: null, message: 'Authentication required', timestamp: new Date().toISOString() });
        return;
      }
      req.user = DEV_USERS['dev-px-admin'];
      next();
      return;
    }

    if (DEV_USERS[token] && demoAuthAllowed()) {
      req.user = DEV_USERS[token];
      next();
      return;
    }

    const localUser = await verifyLocalToken(token);
    if (localUser) {
      req.user = localUser;
      next();
      return;
    }

    const breakGlass = verifyBreakGlassToken(token);
    if (breakGlass) {
      logger.warn({ userId: breakGlass.id }, 'Break-glass admin token used');
      req.user = breakGlass;
      next();
      return;
    }

    req.user = await verifyOidcToken(token);
    next();
  } catch (err) {
    logger.warn({ err }, 'Authentication failed');
    res.status(401).json({ success: false, data: null, message: 'Invalid authentication token', timestamp: new Date().toISOString() });
  }
}

export function requirePermission(permission: Permission) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ success: false, data: null, message: 'Authentication required', timestamp: new Date().toISOString() });
      return;
    }
    if (!hasPermission(req.user, permission)) {
      res.status(403).json({ success: false, data: null, message: `Permission denied: ${permission}`, timestamp: new Date().toISOString() });
      return;
    }
    next();
  };
}

export function requirePxAdmin(req: Request, res: Response, next: NextFunction): void {
  if (!req.user) {
    res.status(401).json({ success: false, data: null, message: 'Authentication required', timestamp: new Date().toISOString() });
    return;
  }
  if (!hasPermission(req.user, 'tenant:admin') && !hasPermission(req.user, '*')) {
    res.status(403).json({ success: false, data: null, message: 'PX admin permission required', timestamp: new Date().toISOString() });
    return;
  }
  next();
}
