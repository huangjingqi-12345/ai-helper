import { afterEach, describe, expect, it, vi } from 'vitest';
import type { NextFunction, Request, Response } from 'express';
import { authenticate, hasPermission, rolePermissions, type AuthUser } from '../middleware/auth.js';

const originalNodeEnv = process.env.NODE_ENV;

afterEach(() => {
  process.env.NODE_ENV = originalNodeEnv;
  delete process.env.ALLOW_DEMO_AUTH;
});

describe('RBAC permission matrix', () => {
  it('grants PX admins all permissions', () => {
    const user: AuthUser = {
      id: 'u1',
      email: 'admin@example.cn',
      name: 'Admin',
      tenantId: 'T-PX',
      tenantType: 'ops',
      roles: ['px_super_admin'],
      permissions: rolePermissions(['px_super_admin']),
      authProvider: 'dev',
      mfa: true,
    };
    expect(hasPermission(user, 'tenant:admin')).toBe(true);
    expect(hasPermission(user, 'content:write')).toBe(true);
  });

  it('keeps pharma viewers read-only', () => {
    const user: AuthUser = {
      id: 'u2',
      email: 'viewer@example.cn',
      name: 'Viewer',
      tenantId: 'T-NV',
      tenantType: 'pharma',
      roles: ['pharma_viewer'],
      permissions: rolePermissions(['pharma_viewer']),
      authProvider: 'dev',
      mfa: true,
    };
    expect(hasPermission(user, 'behavior:read')).toBe(true);
    expect(hasPermission(user, 'content:write')).toBe(false);
    expect(hasPermission(user, 'tenant:admin')).toBe(false);
  });
});

describe('Production authentication boundary', () => {
  it('rejects unauthenticated API requests when demo auth is disabled', async () => {
    process.env.NODE_ENV = 'production';
    delete process.env.ALLOW_DEMO_AUTH;
    const req = { header: vi.fn().mockReturnValue(undefined) } as unknown as Request;
    const res = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn(),
    } as unknown as Response;
    const next = vi.fn() as unknown as NextFunction;

    await authenticate(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });
});
