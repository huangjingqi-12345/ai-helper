import { describe, expect, it } from 'vitest';
import { canHandleApprovalTask } from '../db/repositories.js';
import type { AuthUser } from '../middleware/auth.js';

const opsUser: Pick<AuthUser, 'tenantId' | 'tenantType' | 'permissions' | 'id' | 'name'> = {
  id: 'A-002',
  name: '陆玟昕',
  tenantId: 'T-PX',
  tenantType: 'ops',
  permissions: ['approval:read', 'approval:write'],
};

const pharmaUser: Pick<AuthUser, 'tenantId' | 'tenantType' | 'permissions' | 'id' | 'name'> = {
  id: 'A-007',
  name: '林筱',
  tenantId: 'T-NV',
  tenantType: 'pharma',
  permissions: ['approval:read', 'approval:write'],
};

describe('approval task node authorization', () => {
  it('only lets PX users handle PX operation review nodes', () => {
    expect(canHandleApprovalTask({ tenant_id: 'T-NV', status: 'pending', reviewer_type: 'px_ops' }, opsUser)).toBe(true);
    expect(canHandleApprovalTask({ tenant_id: 'T-NV', status: 'pending', reviewer_type: 'pharma_med' }, opsUser)).toBe(false);
  });

  it('only lets pharma users handle pharma review nodes', () => {
    expect(canHandleApprovalTask({ tenant_id: 'T-NV', status: 'pending', reviewer_type: 'pharma_med' }, pharmaUser)).toBe(true);
    expect(canHandleApprovalTask({ tenant_id: 'T-NV', status: 'pending', reviewer_type: 'px_ops' }, pharmaUser)).toBe(false);
  });

  it('does not allow completed tasks to be handled again', () => {
    expect(canHandleApprovalTask({ tenant_id: 'T-NV', status: 'approved', reviewer_type: 'pharma_med' }, pharmaUser)).toBe(false);
  });
});
