import type { Request } from 'express';
import { createHash, randomUUID } from 'crypto';
import { dbRun, DB_DRIVER } from '../db/connection.js';
import { logger } from './logger.js';

const jsonCast = DB_DRIVER === 'postgres' ? '::jsonb' : '';

function stableHash(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value ?? null)).digest('hex');
}

export interface AuditEventInput {
  action: string;
  resourceType?: string;
  resourceId?: string;
  description?: string;
  before?: unknown;
  after?: unknown;
  metadata?: Record<string, unknown>;
}

export async function appendAuditLog(req: Request, event: AuditEventInput): Promise<void> {
  const user = req.user;
  const now = new Date().toISOString();
  const metadata = {
    ...event.metadata,
    beforeHash: stableHash(event.before),
    afterHash: stableHash(event.after),
    roles: user?.roles ?? [],
    authProvider: user?.authProvider,
  };

  try {
    await dbRun(
      `
        INSERT INTO audit_logs (
          id, tenant_id, actor_user_id, actor_name, action, resource_type, resource_id,
          description, ip_address, user_agent, metadata, created_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?${jsonCast}, ?)
      `,
      [
        `audit-${randomUUID()}`,
        user?.tenantId ?? null,
        user?.id ?? null,
        user?.name ?? 'System',
        event.action,
        event.resourceType ?? null,
        event.resourceId ?? null,
        event.description ?? event.action,
        req.ip,
        req.header('user-agent') ?? null,
        JSON.stringify(metadata),
        now,
      ]
    );
  } catch (err) {
    logger.error({ err, event }, 'Failed to append audit log');
  }
}

