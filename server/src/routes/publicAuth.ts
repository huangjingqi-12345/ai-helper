import { Router } from 'express';
import { randomUUID } from 'crypto';
import { dbAll, dbGet, dbRun, DB_DRIVER } from '../db/connection.js';
import { createLocalSessionToken, hashPassword, verifyPassword } from '../utils/localAuth.js';
import { asyncRoute } from './asyncRoute.js';

const router = Router();
const jsonCast = DB_DRIVER === 'postgres' ? '::jsonb' : '';
const boolValue = (value: boolean): boolean | number => (DB_DRIVER === 'postgres' ? value : value ? 1 : 0);

type AccountType = 'ops' | 'pharma';

type LoginUserRow = {
  id: string;
  email: string;
  password_hash?: string | null;
  password_salt?: string | null;
  status?: string;
};

type TenantOptionRow = {
  id: string;
  short_name: string;
  name: string;
  tenant_type: AccountType;
  status: string;
};

const roleLabels: Record<string, string> = {
  ops_admin: '运营 · 平台管理员',
  ops_content: '运营 · 内容审核员',
  ops_distribution: '运营 · 分发执行员',
  pharma_compliance: '药企 · 合规',
  pharma_marketing: '药企 · 市场',
  pharma_bd: '药企 · BD',
  pharma_viewer: '药企 · 查看',
};

function asString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizedEmail(value: unknown): string {
  return asString(value).toLowerCase();
}

function fail(res: { status: (status: number) => { json: (body: unknown) => void } }, status: number, message: string): void {
  res.status(status).json({ success: false, data: null, message, timestamp: new Date().toISOString() });
}

function roleFor(accountType: AccountType, rawRole: string): { baseRole: 'admin' | 'editor' | 'viewer'; label: string; roleCode: string } {
  if (accountType === 'ops') {
    const roleCode = ['ops_admin', 'ops_content', 'ops_distribution'].includes(rawRole) ? rawRole : 'ops_content';
    return { baseRole: roleCode === 'ops_admin' ? 'admin' : 'editor', label: roleLabels[roleCode]!, roleCode };
  }

  const roleCode = ['pharma_compliance', 'pharma_marketing', 'pharma_bd', 'pharma_viewer'].includes(rawRole) ? rawRole : 'pharma_compliance';
  return { baseRole: roleCode === 'pharma_viewer' ? 'viewer' : 'admin', label: roleLabels[roleCode]!, roleCode };
}

async function findTenantByName(name: string): Promise<TenantOptionRow | undefined> {
  return dbGet<TenantOptionRow>(`
    SELECT id, short_name, name, tenant_type, status
    FROM tenants
    WHERE tenant_type = 'pharma' AND status IN ('active', 'draft') AND (LOWER(name) = LOWER(?) OR LOWER(short_name) = LOWER(?))
    LIMIT 1
  `, [name, name]);
}

async function createPharmaTenant(companyName: string, adminName: string, adminEmail: string): Promise<string> {
  const existing = await findTenantByName(companyName);
  if (existing) return existing.id;

  const now = new Date().toISOString();
  const id = `T-${randomUUID().slice(0, 8).toUpperCase()}`;
  const shortName = companyName.length > 8 ? companyName.slice(0, 8) : companyName;
  await dbRun(`
    INSERT INTO tenants (id, name, short_name, tenant_type, status, contract_no, contact_name, contact_email, description, can_export, created_at, updated_at)
    VALUES (?, ?, ?, 'pharma', 'active', '自助注册', ?, ?, '用户注册时自动创建的药企公司。', ?, ?, ?)
  `, [id, companyName, shortName, adminName, adminEmail, boolValue(true), now, now]);
  await dbRun(`
    INSERT INTO tenant_scopes (id, tenant_id, disease_ids, brand_ids, region_ids, gray_limit_percent, k_anonymity_threshold, can_view_aggregate_metrics, can_export_csv, created_at, updated_at)
    VALUES (?, ?, ?${jsonCast}, ?${jsonCast}, ?${jsonCast}, 50, 50, ?, ?, ?, ?)
  `, [`scope-${id}`, id, JSON.stringify([]), JSON.stringify([]), JSON.stringify(['全国']), boolValue(true), boolValue(true), now, now]);
  return id;
}

async function tenantIdForRegistration(accountType: AccountType, companyId: string, companyName: string, name: string, email: string): Promise<string> {
  if (accountType === 'ops') return 'T-PX';

  if (companyId) {
    const tenant = await dbGet<TenantOptionRow>('SELECT id, short_name, name, tenant_type, status FROM tenants WHERE id = ? AND tenant_type = \'pharma\' AND status IN (\'active\', \'draft\')', [companyId]);
    if (tenant) return tenant.id;
  }

  if (!companyName) throw new Error('请填写公司名称');
  return createPharmaTenant(companyName, name, email);
}

router.get('/registration-options', asyncRoute(async (_req, res) => {
  const rows = await dbAll<TenantOptionRow>(`
    SELECT id, short_name, name, tenant_type, status
    FROM tenants
    WHERE status IN ('active', 'draft')
    ORDER BY CASE WHEN id = 'T-PX' THEN 0 ELSE 1 END, short_name ASC
  `);

  res.json({
    success: true,
    data: {
      companies: rows.map((row) => ({ id: row.id, shortName: row.short_name, name: row.name, type: row.tenant_type })),
      roles: {
        ops: [
          { value: 'ops_content', label: roleLabels.ops_content },
          { value: 'ops_distribution', label: roleLabels.ops_distribution },
          { value: 'ops_admin', label: roleLabels.ops_admin },
        ],
        pharma: [
          { value: 'pharma_compliance', label: roleLabels.pharma_compliance },
          { value: 'pharma_marketing', label: roleLabels.pharma_marketing },
          { value: 'pharma_bd', label: roleLabels.pharma_bd },
          { value: 'pharma_viewer', label: roleLabels.pharma_viewer },
        ],
      },
    },
    timestamp: new Date().toISOString(),
  });
}));

router.post('/login', asyncRoute(async (req, res) => {
  const email = normalizedEmail(req.body?.email);
  const password = asString(req.body?.password);
  if (!email || !password) return fail(res, 400, '请输入邮箱和密码');

  const user = await dbGet<LoginUserRow>('SELECT id, email, password_hash, password_salt, status FROM users WHERE LOWER(email) = LOWER(?)', [email]);
  if (!user?.password_hash || !user.password_salt || !verifyPassword(password, user.password_salt, user.password_hash)) {
    return fail(res, 401, '邮箱或密码不正确');
  }
  if (user.status && user.status !== 'active') return fail(res, 403, '账号未启用或已冻结');

  await dbRun('UPDATE users SET last_login = ?, updated_at = ? WHERE id = ?', [new Date().toISOString(), new Date().toISOString(), user.id]);
  res.json({ success: true, data: { token: createLocalSessionToken(user.id) }, timestamp: new Date().toISOString() });
}));

router.post('/register', asyncRoute(async (req, res) => {
  const name = asString(req.body?.name);
  const email = normalizedEmail(req.body?.email);
  const password = asString(req.body?.password);
  const accountType = req.body?.accountType === 'ops' ? 'ops' : 'pharma';
  const companyId = asString(req.body?.companyId);
  const companyName = asString(req.body?.companyName);
  const selectedRole = asString(req.body?.role);

  if (!name || !email || !password) return fail(res, 400, '请输入姓名、邮箱和密码');
  if (!email.includes('@')) return fail(res, 400, '请输入有效邮箱');
  if (password.length < 8) return fail(res, 400, '密码至少 8 位');

  const existing = await dbGet<{ id: string }>('SELECT id FROM users WHERE LOWER(email) = LOWER(?)', [email]);
  if (existing) return fail(res, 409, '该邮箱已注册，请直接登录');

  let tenantId: string;
  try {
    tenantId = await tenantIdForRegistration(accountType, companyId, companyName, name, email);
  } catch (error) {
    return fail(res, 400, error instanceof Error ? error.message : '公司信息无效');
  }

  const now = new Date().toISOString();
  const id = `A-${randomUUID()}`;
  const { salt, hash } = hashPassword(password);
  const { baseRole, label } = roleFor(accountType, selectedRole);

  await dbRun(`
    INSERT INTO users (id, tenant_id, name, email, role, role_labels, view_type, region, status, has_2fa, password_hash, password_salt, last_login, note, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?${jsonCast}, ?, '全国', 'active', ?, ?, ?, ?, '自助注册账号。', ?, ?)
  `, [id, tenantId, name, email, baseRole, JSON.stringify([label]), accountType, boolValue(false), hash, salt, now, now, now]);

  res.status(201).json({ success: true, data: { token: createLocalSessionToken(id) }, timestamp: new Date().toISOString() });
}));

export default router;
