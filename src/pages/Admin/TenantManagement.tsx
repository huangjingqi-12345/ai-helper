import { useEffect, useMemo, useState, type ChangeEvent, type ReactNode } from 'react';
import {
  Building2,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  FileSignature,
  Filter,
  Globe2,
  Mail,
  Phone,
  Pill,
  Power,
  Search,
  ShieldCheck,
  Sparkles,
  UserPlus,
  Users,
  X,
} from 'lucide-react';
import { PageHeader } from '@/components/PageHeader';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { showToast } from '@/components/ui/Toast';
import { useLogger } from '@/hooks/useLogger';
import {
  createAccount as createAccountApi,
  createTenant as createTenantApi,
  getAccounts,
  getTenants,
  updateTenantStatus,
} from '@/api/endpoints/platform';
import type { AccountRow, AccountStatus, TenantRow, TenantStatus } from '@/types/platform';

const STATUS_OPTIONS = [
  { value: '', label: '全部状态' },
  { value: 'active', label: '已启用' },
  { value: 'inactive', label: '已停用' },
  { value: 'draft', label: '草稿' },
];

const TENANT_DETAIL_META: Record<string, {
  sales: string;
  success: string;
  createdAt: string;
  updatedAt: string;
}> = {
  'T-PX': { sales: '齐晓川', success: '齐晓川', createdAt: '2025-09-01 09:00', updatedAt: '2026-04-28 09:00' },
  'T-NV': { sales: '沈书远', success: '陆玟昕', createdAt: '2025-10-12 14:20', updatedAt: '2026-04-20 11:15' },
  'T-AZ': { sales: '沈书远', success: '周予安', createdAt: '2025-11-03 10:08', updatedAt: '2026-04-15 16:42' },
  'T-MSD': { sales: '罗淮安', success: '陆玟昕', createdAt: '2025-12-18 15:50', updatedAt: '2026-04-22 09:30' },
  'T-RC': { sales: '罗淮安', success: '周予安', createdAt: '2026-01-05 09:00', updatedAt: '2026-04-26 18:10' },
  'T-LL': { sales: '沈书远', success: '周予安', createdAt: '2026-02-09 10:30', updatedAt: '2026-05-02 11:20' },
  'T-SY': { sales: '罗淮安', success: '陆玟昕', createdAt: '2026-04-30 17:00', updatedAt: '2026-04-30 17:00' },
};

const ACCOUNT_ROLE_CODES: Record<string, string> = {
  '运营 · 平台管理员': 'ops-admin',
  '运营 · 内容审核员': 'ops-reviewer',
  '运营 · 分发执行员': 'ops-distributor',
  '药企 · 合规': 'pharma-compliance',
  '药企 · BD': 'pharma-bd',
  '药企 · 市场': 'pharma-marketing',
};

type TenantDraft = TenantRow & {
  adminName?: string;
  adminEmail?: string;
  salesManager?: string;
  successManager?: string;
  phone?: string;
};

function statusLabel(status: TenantStatus): string {
  if (status === 'active') return '已启用';
  if (status === 'inactive') return '已停用';
  return '草稿';
}

function statusBadgeClass(status: TenantStatus): string {
  if (status === 'active') return 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300';
  if (status === 'inactive') return 'border-rose-500/40 bg-rose-500/10 text-rose-300';
  return 'border-zinc-500/40 bg-zinc-500/10 text-zinc-300';
}

function accountStatusLabel(status: AccountStatus): string {
  if (status === 'active') return '已激活';
  if (status === 'frozen') return '已冻结';
  return '已邀请';
}

function accountStatusClass(status: AccountStatus): string {
  if (status === 'active') return 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300';
  if (status === 'frozen') return 'border-rose-500/40 bg-rose-500/10 text-rose-300';
  return 'border-zinc-500/40 bg-zinc-500/10 text-zinc-300';
}

function tenantTypeLabel(tenant: TenantRow): string {
  return tenant.type === '自营' ? 'Px 自营' : tenant.type;
}

function avatarClass(tenant: TenantRow): string {
  return tenant.type === '自营' ? 'bg-sky-500/15 text-sky-300' : 'bg-amber-500/15 text-amber-300';
}

function tenantMeta(tenant: TenantRow) {
  return TENANT_DETAIL_META[tenant.id] ?? {
    sales: '待分配',
    success: '待分配',
    createdAt: '2025-09-01 09:00',
    updatedAt: '2026-04-28 09:00',
  };
}

function roleCode(role: string): string {
  return ACCOUNT_ROLE_CODES[role] ?? role;
}

function visibleScopeLabel(tenant: TenantRow): string {
  if (tenant.id === 'T-PX' || tenant.diseaseScope.includes('全部病种') || tenant.diseaseScope === '*') return '全部病种';
  if (tenant.diseaseScope.startsWith('0') || tenant.diseaseScope === '待配置' || tenant.diseaseScope === '—') return '0 种病';
  const diseaseCount = tenant.diseaseScope.split('/').map((item) => item.trim()).filter(Boolean).length;
  return `${diseaseCount || 0} 种病`;
}

function normalizeDetailScope(value: string, kind: 'disease' | 'brand' | 'region'): string {
  if (value === '*' || value.includes('*')) {
    if (kind === 'disease') return '全部病种 · 仅 Px 自营运营组';
    if (kind === 'brand') return '全部品牌';
    return '全国 / 不限地域';
  }
  return value || '—';
}

export function TenantManagement(): JSX.Element {
  const { log } = useLogger('TenantManagement');
  const [tenants, setTenants] = useState<TenantRow[]>([]);
  const [accounts, setAccounts] = useState<AccountRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [statusOpen, setStatusOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [selectedTenant, setSelectedTenant] = useState<TenantRow | null>(null);
  const [inviteTenant, setInviteTenant] = useState<TenantRow | null>(null);

  const loadData = async (): Promise<void> => {
    setLoading(true);
    try {
      const [tenantRes, accountRes] = await Promise.all([getTenants(), getAccounts()]);
      setTenants(tenantRes.data);
      setAccounts(accountRes.data);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadData();
  }, []);

  const filtered = useMemo(() => tenants.filter((tenant) => {
    if (statusFilter && tenant.status !== statusFilter) return false;
    if (!search.trim()) return true;
    const haystack = `${tenant.name}${tenant.shortName}${tenant.contract}${tenant.contact}`.toLowerCase();
    return haystack.includes(search.trim().toLowerCase());
  }), [search, statusFilter, tenants]);

  const activeTenants = tenants.filter((tenant) => tenant.status === 'active').length;
  const inactiveTenants = tenants.filter((tenant) => tenant.status === 'inactive').length;
  const pharma = tenants.filter((tenant) => tenant.type === '药企租户').length;
  const totalAccounts = accounts.length || tenants.reduce((sum, tenant) => sum + tenant.accounts, 0);

  const toggleTenantStatus = async (id: string): Promise<void> => {
    const currentTenant = tenants.find((tenant) => tenant.id === id);
    if (!currentTenant) return;
    if (currentTenant.status === 'draft') {
      showToast('草稿租户需完成签约与范围配置后才能启用', 'info');
      return;
    }
    if (currentTenant.id === 'T-PX') {
      showToast('Px 自营运营组不可停用', 'info');
      return;
    }
    const nextStatus: TenantStatus = currentTenant.status === 'active' ? 'inactive' : 'active';
    try {
      const res = await updateTenantStatus(id, nextStatus);
      setTenants((current) => current.map((tenant) => tenant.id === id ? res.data : tenant));
      setSelectedTenant((current) => current?.id === id ? res.data : current);
      log.action('Toggle tenant', { id, status: nextStatus });
      showToast(`已${nextStatus === 'active' ? '启用' : '停用'}「${currentTenant.shortName}」并写入 SQLite`, 'success');
    } catch (error) {
      log.error('Toggle tenant failed', error);
      showToast('租户状态更新失败，请检查后端服务', 'error');
    }
  };

  const addTenant = async (tenant: TenantDraft): Promise<void> => {
    try {
      await createTenantApi(tenant as TenantRow);
      await loadData();
      setCreateOpen(false);
      showToast('租户已创建并写入 SQLite，首位管理员邀请已发送', 'success');
    } catch (error) {
      log.error('Create tenant failed', error);
      showToast('租户创建失败，请检查后端服务', 'error');
    }
  };

  const inviteAccount = async (account: AccountRow): Promise<void> => {
    try {
      await createAccountApi(account);
      await loadData();
      setInviteTenant(null);
      showToast(`已邀请 ${account.name}，账号已写入 SQLite`, 'success');
    } catch (error) {
      log.error('Invite account failed', error);
      showToast('邀请账号失败，请检查后端服务', 'error');
    }
  };

  const kpis = [
    { label: '全部租户', value: tenants.length, icon: Building2, tone: 'text-foreground' },
    { label: '药企租户', value: pharma, icon: Pill, tone: 'text-amber-300' },
    { label: '已启用', value: activeTenants, icon: ShieldCheck, tone: 'text-emerald-300' },
    { label: '已停用', value: inactiveTenants, icon: Power, tone: 'text-rose-300' },
    { label: '账号合计', value: totalAccounts, icon: Users, tone: 'text-sky-300' },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="平台管理 · 租户管理"
        title="租户与可见范围"
        subtitle="按租户维度配置药企可见的脱敏聚合范围（病种 / 品牌 / 区域）与账号隔离，确保合规墙不被穿透。"
        actions={
          <Button onClick={() => { log.action('Add tenant clicked'); setCreateOpen(true); }} className="gap-1.5 bg-primary text-primary-foreground hover:bg-primary/90">
            <Building2 className="h-4 w-4" />
            新增租户
          </Button>
        }
      />

      <div className="grid grid-cols-5 gap-3">
        {kpis.map((item) => (
          <Card key={item.label} className="bg-bg-card p-4">
            <div className="flex items-center gap-2 text-[11px] uppercase tracking-wider text-muted-foreground">
              <item.icon className="h-3.5 w-3.5" />
              {item.label}
            </div>
            <div className={`mt-2 text-2xl font-semibold tabular-nums ${item.tone}`}>{item.value}</div>
          </Card>
        ))}
      </div>

      <div className="flex items-center gap-3">
        <div className="relative max-w-md flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="搜索租户名 / 简称 / 合同号 / 联系人"
            className="h-9 w-full rounded-lg border border-border bg-bg-card pl-9 pr-3 text-[13px] text-text-primary placeholder:text-text-muted focus:border-accent-blue focus:outline-none"
          />
        </div>
        <div className="relative flex h-9 items-center gap-2 rounded-lg border border-border bg-bg-card px-2 text-[12px]">
          <Filter className="h-3.5 w-3.5 text-muted-foreground" />
          <button
            type="button"
            onClick={() => setStatusOpen((open) => !open)}
            className="flex h-7 w-[120px] items-center justify-between rounded bg-transparent px-2 text-left text-[12px] text-text-primary"
          >
            <span>{STATUS_OPTIONS.find((option) => option.value === statusFilter)?.label ?? '全部状态'}</span>
            <ChevronDown className={`h-3.5 w-3.5 text-muted-foreground transition-transform ${statusOpen ? 'rotate-180' : ''}`} />
          </button>
          {statusOpen && (
            <>
              <div className="fixed inset-0 z-30" onClick={() => setStatusOpen(false)} />
              <div className="absolute left-0 top-10 z-40 w-40 overflow-hidden rounded-lg border border-border bg-bg-card shadow-lg">
                {STATUS_OPTIONS.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => {
                      setStatusFilter(option.value);
                      setStatusOpen(false);
                    }}
                    className={`block w-full px-3 py-2 text-left text-xs hover:bg-bg-tertiary ${statusFilter === option.value ? 'text-accent-blue' : 'text-text-secondary'}`}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
        <span className="ml-auto text-[12px] text-muted-foreground">{filtered.length} / {tenants.length} 条</span>
      </div>

      <Card className="overflow-hidden border-border bg-bg-card p-0">
        <table className="w-full text-[13px]">
          <thead className="bg-bg-secondary text-[11px] uppercase tracking-wider text-muted-foreground">
            <tr className="text-left">
              <th className="px-4 py-3 font-medium">租户</th>
              <th className="px-3 py-3 font-medium">类型 / 状态</th>
              <th className="px-3 py-3 font-medium">合同 / 联系人</th>
              <th className="px-3 py-3 font-medium">可见范围</th>
              <th className="px-3 py-3 font-medium">账号</th>
              <th className="px-3 py-3 text-right font-medium">操作</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr><td colSpan={6} className="px-4 py-10 text-center text-sm text-text-muted">正在从 SQLite 加载租户...</td></tr>
            )}
            {!loading && filtered.map((tenant) => {
              const accountCount = accounts.filter((account) => account.tenantId === tenant.id).length || tenant.accounts;
              return (
                <tr
                  key={tenant.id}
                  className="cursor-pointer border-t border-border transition-colors hover:bg-bg-tertiary"
                  onClick={() => { log.action('View tenant details', { id: tenant.id }); setSelectedTenant(tenant); }}
                >
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div className={`grid h-9 w-9 place-items-center rounded-md text-[12px] font-semibold ${avatarClass(tenant)}`}>
                        {tenant.shortName.slice(0, 2)}
                      </div>
                      <div className="leading-tight">
                        <div className="font-medium text-foreground">{tenant.name}</div>
                        <div className="text-[11px] text-muted-foreground">{tenant.id} · {tenant.shortName}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-3 py-3 text-[12px]">
                    <div className="text-foreground">{tenantTypeLabel(tenant)}</div>
                    <span className={`mt-1 inline-block rounded border px-1.5 py-px text-[10px] tracking-wider ${statusBadgeClass(tenant.status)}`}>{statusLabel(tenant.status)}</span>
                  </td>
                  <td className="px-3 py-3 text-[12px] leading-tight">
                    {tenant.contract && tenant.contract !== '未签约' ? (
                      <div className="flex items-center gap-1 text-foreground"><FileSignature className="h-3 w-3 text-muted-foreground" />{tenant.contract}</div>
                    ) : (
                      <div className="text-muted-foreground">未签约</div>
                    )}
                    <div className="text-[11px] text-muted-foreground">{tenant.contact}</div>
                  </td>
                  <td className="px-3 py-3 text-[12px]">
                    <span className="inline-flex items-center gap-1 rounded-full bg-bg-secondary px-2 py-0.5 text-[10px] tracking-wider text-text-secondary">
                      <Pill className="h-2.5 w-2.5" />
                      {visibleScopeLabel(tenant)}
                    </span>
                  </td>
                  <td className="px-3 py-3 text-[12px] tabular-nums text-text-secondary">{accountCount} / {tenant.accounts}</td>
                  <td className="px-3 py-3 text-right">
                    <div className="inline-flex items-center gap-1.5" onClick={(event) => event.stopPropagation()}>
                      <TenantSwitch
                        checked={tenant.status === 'active'}
                        disabled={tenant.status === 'draft'}
                        label={tenant.shortName}
                        onClick={() => { void toggleTenantStatus(tenant.id); }}
                      />
                      <span className="ml-1 text-[11px] text-muted-foreground">启用</span>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="ml-2 h-7 gap-1 text-[11px]"
                        onClick={() => { log.action('View tenant details', { id: tenant.id }); setSelectedTenant(tenant); }}
                      >
                        详情 <ChevronRight className="h-3 w-3" />
                      </Button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Card>

      <RightDrawer open={createOpen} onClose={() => setCreateOpen(false)} maxWidth="max-w-[760px]">
        <AddTenantWizard onCreate={addTenant} />
      </RightDrawer>

      <RightDrawer open={!!selectedTenant} onClose={() => setSelectedTenant(null)} maxWidth="max-w-[520px]">
        {selectedTenant && (
          <TenantDetail
            tenant={selectedTenant}
            accounts={accounts.filter((account) => account.tenantId === selectedTenant.id)}
            onInvite={() => setInviteTenant(selectedTenant)}
          />
        )}
      </RightDrawer>

      <RightDrawer open={!!inviteTenant} onClose={() => setInviteTenant(null)} maxWidth="max-w-[760px]">
        {inviteTenant && <InviteAccountWizard tenant={inviteTenant} onInvite={inviteAccount} />}
      </RightDrawer>
    </div>
  );
}

function TenantSwitch({ checked, disabled, label, onClick }: { checked: boolean; disabled?: boolean; label: string; onClick: () => void }): JSX.Element {
  return (
    <button
      type="button"
      aria-label={`${label} 启用`}
      disabled={disabled}
      onClick={onClick}
      className={`relative h-5 w-9 rounded-full border transition-colors ${checked ? 'border-cyan-400/40 bg-cyan-400/90' : 'border-border bg-secondary'} ${disabled ? 'cursor-not-allowed opacity-55' : 'hover:ring-2 hover:ring-cyan-400/20'}`}
    >
      <span className={`absolute top-1/2 h-3.5 w-3.5 -translate-y-1/2 rounded-full transition-transform ${checked ? 'translate-x-[17px] bg-slate-950' : 'translate-x-1 bg-muted-foreground'}`} />
    </button>
  );
}

function RightDrawer({ open, onClose, maxWidth, children }: { open: boolean; onClose: () => void; maxWidth: string; children: ReactNode }): JSX.Element | null {
  useEffect(() => {
    if (open) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-black/65" onClick={onClose} />
      <aside className={`fixed inset-y-0 right-0 z-10 w-full ${maxWidth} overflow-hidden border-l border-border bg-bg-secondary shadow-[-24px_0_60px_rgba(0,0,0,0.35)]`}>
        <button
          type="button"
          aria-label="Close"
          onClick={onClose}
          className="absolute right-4 top-4 z-20 rounded-md p-1 text-text-muted transition-colors hover:bg-bg-tertiary hover:text-text-primary"
        >
          <X className="h-5 w-5" />
        </button>
        {children}
      </aside>
    </div>
  );
}

function TenantDetail({ tenant, accounts, onInvite }: { tenant: TenantRow; accounts: AccountRow[]; onInvite: () => void }): JSX.Element {
  const meta = tenantMeta(tenant);
  const displayedAccounts = accounts.length > 0 ? accounts : Array.from({ length: tenant.accounts }, (_, index) => ({
    id: `fallback-${tenant.id}-${index}`,
    name: `账号 ${index + 1}`,
    email: 'unset@example.cn',
    tenant: tenant.shortName,
    tenantId: tenant.id,
    view: '药企视图' as const,
    roles: ['药企 · 合规'],
    status: 'invited' as AccountStatus,
    has2fa: false,
    lastLogin: '—',
    note: '',
  }));

  return (
    <div className="h-full overflow-y-auto px-6 py-12">
      <h2 className="sr-only">租户详情</h2>
      <p className="sr-only">查看与配置租户可见范围、账号列表与合规口径。</p>
      <div className="space-y-5">
        <div className="flex items-start gap-3">
          <div className={`grid h-12 w-12 shrink-0 place-items-center rounded-lg text-[14px] font-semibold ${avatarClass(tenant)}`}>
            {tenant.shortName.slice(0, 2)}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h3 className="text-[17px] font-semibold text-foreground">{tenant.name}</h3>
              <span className={`rounded border px-1.5 py-px text-[10px] tracking-wider ${statusBadgeClass(tenant.status)}`}>{statusLabel(tenant.status)}</span>
            </div>
            <div className="mt-0.5 text-[12px] text-muted-foreground">
              {tenant.id} · {tenantTypeLabel(tenant)} · 合同 {tenant.contract || '未签约'}
            </div>
            <div className="mt-1 text-[12px] text-muted-foreground">联系人：{tenant.contact}</div>
            <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-muted-foreground">
              <span>销售经理：<span className="text-foreground">{meta.sales}</span></span>
              <span>成功经理：<span className="text-foreground">{meta.success}</span></span>
            </div>
          </div>
        </div>

        {tenant.description && (
          <div className="rounded-md border border-border bg-bg-tertiary p-3 text-[12px] leading-relaxed text-muted-foreground">
            {tenant.description}
          </div>
        )}

        <Card className="bg-bg-card p-4">
          <div className="flex items-center gap-2 text-[12px] font-semibold tracking-wide text-foreground">
            <ShieldCheck className="h-3.5 w-3.5 text-primary" />
            可见范围配置（按租户的合规口径）
          </div>
          <div className="my-3 h-px bg-border/80" />
          <ScopeRow label="病种范围" icon={<Pill className="h-3 w-3" />} value={normalizeDetailScope(tenant.diseaseScope, 'disease')} />
          <ScopeRow label="品牌范围" icon={<FileSignature className="h-3 w-3" />} value={normalizeDetailScope(tenant.brandScope, 'brand')} />
          <ScopeRow label="区域范围" icon={<Globe2 className="h-3 w-3" />} value={normalizeDetailScope(tenant.regionScope, 'region')} />
        </Card>

        <Card className="bg-bg-card p-4">
          <div className="mb-2 flex items-center justify-between">
            <div className="flex items-center gap-2 text-[12px] font-semibold tracking-wide text-foreground">
              <Users className="h-3.5 w-3.5 text-primary" />
              关联账号 · {displayedAccounts.length} 人
            </div>
            <Button size="sm" variant="ghost" className="h-7 gap-1 text-[11px]" onClick={onInvite}>邀请账号</Button>
          </div>
          <div className="mb-2 h-px bg-border/80" />
          {displayedAccounts.length === 0 ? (
            <div className="py-6 text-center text-[12px] text-muted-foreground">该租户尚未关联账号。</div>
          ) : (
            <ul className="divide-y divide-border text-[12px]">
              {displayedAccounts.map((account) => (
                <li key={account.id} className="flex items-center justify-between py-2">
                  <div className="leading-tight">
                    <div className="text-foreground">{account.name} <span className="text-muted-foreground">· {account.email}</span></div>
                    <div className="mt-0.5 flex flex-wrap gap-1 text-[10.5px] text-muted-foreground">
                      {account.roles.map((role) => (
                        <span key={role} className="rounded border border-border bg-bg-secondary px-1.5 py-px tracking-wider">{roleCode(role)}</span>
                      ))}
                    </div>
                  </div>
                  <span className={`rounded border px-1.5 py-px text-[10px] tracking-wider ${accountStatusClass(account.status)}`}>
                    {accountStatusLabel(account.status)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <div className="text-[11px] text-muted-foreground">
          创建于 {meta.createdAt} · 最后变更 {meta.updatedAt}
        </div>
      </div>
    </div>
  );
}

function ScopeRow({ label, value, icon }: { label: string; value: string; icon: ReactNode }): JSX.Element {
  return (
    <div className="mt-2 flex items-start gap-3 text-[12px]">
      <span className="mt-0.5 flex h-5 items-center gap-1 rounded border border-border bg-bg-tertiary px-2 text-[11px] text-muted-foreground">
        {icon}{label}
      </span>
      <span className="flex-1 leading-relaxed text-foreground">{value}</span>
    </div>
  );
}

function AddTenantWizard({ onCreate }: { onCreate: (tenant: TenantDraft) => void | Promise<void> }): JSX.Element {
  const steps = [
    { id: 1, title: '基础信息', desc: '租户身份与主联系人', icon: Building2 },
    { id: 2, title: '合规可见范围', desc: '病种 / 品牌 / 区域', icon: ShieldCheck },
    { id: 3, title: '邀请管理员', desc: '首位药企方管理员', icon: UserPlus },
    { id: 4, title: '摘要确认', desc: '提交后生成租户与账号', icon: CheckCircle2 },
  ] as const;
  const [step, setStep] = useState(1);
  const [form, setForm] = useState({
    name: '',
    shortName: '',
    contract: '',
    phone: '',
    contactName: '',
    contactEmail: '',
    salesManager: '',
    successManager: '',
    note: '',
    diseaseScope: '乳腺癌',
    brandScope: '待配置品牌',
    regionScope: '全国',
    gray: '50',
    kAnon: '50',
    adminName: '',
    adminEmail: '',
    adminRole: '药企 · 合规',
    require2fa: true,
  });

  const update = (key: keyof typeof form) => (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const value = event.target instanceof HTMLInputElement && event.target.type === 'checkbox' ? event.target.checked : event.target.value;
    setForm((current) => ({ ...current, [key]: value }));
  };

  const errors = useMemo(() => validateTenantForm(form, step), [form, step]);
  const canNext = errors.length === 0;
  const activeStep = steps.find((item) => item.id === step) ?? steps[0];

  const next = (): void => {
    if (!canNext) return;
    setStep((current) => Math.min(current + 1, 4));
  };

  const create = (): void => {
    if (!canNext) return;
    onCreate({
      id: `T-NEW-${Date.now().toString().slice(-4)}`,
      name: form.name.trim(),
      shortName: form.shortName.trim(),
      type: '药企租户',
      status: 'active',
      contract: form.contract.trim() || '未签约',
      contact: `${form.contactName.trim()} · ${form.contactEmail.trim()}`,
      description: form.note.trim() || '通过新建租户向导创建。',
      diseaseScope: form.diseaseScope.trim(),
      brandScope: form.brandScope.trim(),
      regionScope: form.regionScope.trim(),
      gray: `灰度 ≤ ${form.gray}%`,
      kAnon: `k-匿 ${form.kAnon}`,
      accounts: 1,
      canExport: true,
      adminName: form.adminName.trim(),
      adminEmail: form.adminEmail.trim(),
      salesManager: form.salesManager.trim(),
      successManager: form.successManager.trim(),
      phone: form.phone.trim(),
    });
  };

  return (
    <div className="flex h-full flex-col bg-bg-secondary">
      <h2 className="sr-only">新建租户</h2>
      <p className="sr-only">4 步完成药企租户创建：基础信息、合规可见范围、首位管理员、摘要确认。</p>
      <div className="flex items-start gap-3 border-b border-border px-6 pb-5 pt-6">
        <div className="grid h-10 w-10 place-items-center rounded-lg bg-amber-500/20 text-amber-300">
          <Building2 className="h-5 w-5" />
        </div>
        <div className="flex-1">
          <div className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">平台管理 · 新建租户</div>
          <h3 className="mt-0.5 text-[18px] font-semibold text-foreground">创建一家药企租户</h3>
          <p className="mt-1 text-[12.5px] leading-relaxed text-muted-foreground">
            通过 4 步完成租户登记、合规口径设置与首位管理员邀请；提交后系统将立即生效，新管理员将收到激活邮件。
          </p>
        </div>
      </div>

      <div className="flex min-h-0 flex-1 overflow-hidden">
        <aside className="w-[200px] shrink-0 border-r border-border bg-bg-card p-4">
          <ol className="space-y-1">
            {steps.map((item) => {
              const Icon = item.icon;
              const isActive = item.id === step;
              const isDone = item.id < step;
              return (
                <li key={item.id}>
                  <button
                    type="button"
                    onClick={() => isDone && setStep(item.id)}
                    disabled={!isDone && !isActive}
                    className={`flex w-full items-start gap-2.5 rounded-md px-2.5 py-2 text-left text-[12.5px] transition-colors ${isActive ? 'bg-amber-500/10 text-amber-200' : isDone ? 'text-muted-foreground hover:bg-bg-tertiary hover:text-foreground' : 'text-muted-foreground/60'}`}
                  >
                    <span className={`mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full text-[10px] font-semibold ${isActive ? 'bg-amber-400 text-amber-950' : isDone ? 'bg-emerald-500/20 text-emerald-300' : 'border border-border bg-card text-muted-foreground'}`}>
                      {isDone ? <Check className="h-3 w-3" /> : <Icon className="h-3 w-3" />}
                    </span>
                    <span className="leading-tight">
                      <span className="block font-medium">{item.title}</span>
                      <span className="mt-0.5 block text-[10.5px] text-muted-foreground/80">{item.desc}</span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ol>
        </aside>

        <div className="flex-1 overflow-y-auto px-6 py-5">
          {step === 1 && <TenantStepIdentity form={form} update={update} />}
          {step === 2 && <TenantStepScope form={form} update={update} />}
          {step === 3 && <TenantStepAdmin form={form} update={update} />}
          {step === 4 && <TenantStepSummary form={form} />}
        </div>
      </div>

      <div className="flex items-center gap-3 border-t border-border bg-bg-card px-6 py-3.5">
        <div className="flex-1 text-[11.5px] text-muted-foreground">
          {errors.length > 0 ? <span className="text-rose-400">{errors[0]}</span> : <span>第 {step} / {steps.length} 步 · {activeStep.title}</span>}
        </div>
        {step > 1 && (
          <Button variant="ghost" size="sm" onClick={() => setStep((current) => Math.max(current - 1, 1))} className="gap-1">
            <ChevronLeft className="h-3.5 w-3.5" />上一步
          </Button>
        )}
        {step < 4 ? (
          <Button size="sm" disabled={!canNext} onClick={next} className="gap-1 bg-amber-500 text-amber-950 hover:bg-amber-400">
            下一步<ChevronRight className="h-3.5 w-3.5" />
          </Button>
        ) : (
          <Button size="sm" disabled={!canNext} onClick={create} className="gap-1 bg-emerald-500 text-emerald-950 hover:bg-emerald-400">
            <Sparkles className="h-3.5 w-3.5" />创建租户
          </Button>
        )}
      </div>
    </div>
  );
}

function TenantStepIdentity({ form, update }: { form: TenantWizardForm; update: TenantWizardUpdate }): JSX.Element {
  return (
    <div className="space-y-4">
      <SectionTitle icon={<Building2 className="h-3.5 w-3.5" />} title="租户身份" desc="此处信息将作为租户的法人主体登记，用于合同与对外披露。" />
      <div className="grid grid-cols-2 gap-4">
        <Field label="租户名称（法人主体）" required value={form.name} onChange={update('name')} placeholder="例：诺华制药（中国）有限公司" />
        <Field label="租户简称（≤12 字）" required value={form.shortName} onChange={update('shortName')} placeholder="例：诺华" />
        <Field label="合同号" value={form.contract} onChange={update('contract')} placeholder="例：PXC-2026-A006" hint="可后期补登；用于合规对账" icon={<FileSignature className="h-3.5 w-3.5" />} />
        <Field label="主联系电话" value={form.phone} onChange={update('phone')} placeholder="+86 138-0000-0000" hint="用于运营紧急沟通" icon={<Phone className="h-3.5 w-3.5" />} />
        <Field label="主联系人姓名" required value={form.contactName} onChange={update('contactName')} placeholder="例：林筱" />
        <Field label="主联系人邮箱" required value={form.contactEmail} onChange={update('contactEmail')} placeholder="compliance@novartis.cn" hint="将用于合规通知与年度审计" icon={<Mail className="h-3.5 w-3.5" />} />
        <Field label="签约销售经理" required value={form.salesManager} onChange={update('salesManager')} placeholder="例：沈书远" hint="Px 侧负责本租户的销售对接" />
        <Field label="客户成功经理" required value={form.successManager} onChange={update('successManager')} placeholder="例：陆玟昕" hint="Px 侧负责本租户的交付与续约" />
      </div>
      <label className="block text-[12px] text-muted-foreground">
        备注 <span className="float-right text-[10.5px] text-muted-foreground/75">可填写本次合作的特殊范围与历史背景</span>
        <textarea value={form.note} onChange={update('note')} placeholder="例：乳腺癌 HER2 + CDK4/6 线，仅限相关药品的脱敏聚合。" className="mt-1.5 min-h-20 w-full rounded-lg border border-border bg-bg-tertiary px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:border-accent-blue focus:outline-none" />
      </label>
    </div>
  );
}

function TenantStepScope({ form, update }: { form: TenantWizardForm; update: TenantWizardUpdate }): JSX.Element {
  return (
    <div className="space-y-4">
      <SectionTitle icon={<ShieldCheck className="h-3.5 w-3.5" />} title="合规可见范围" desc="配置药企可见的脱敏聚合边界；所有小样本单元按 k-匿名阈值屏蔽。" />
      <div className="grid grid-cols-2 gap-4">
        <Field label="病种范围" required value={form.diseaseScope} onChange={update('diseaseScope')} placeholder="例：乳腺癌" hint="多个病种用 / 分隔" icon={<Pill className="h-3.5 w-3.5" />} />
        <Field label="品牌范围" required value={form.brandScope} onChange={update('brandScope')} placeholder="例：飞赛尔 / 来曲唑" hint="限定该租户可看品牌" icon={<FileSignature className="h-3.5 w-3.5" />} />
        <Field label="区域范围" required value={form.regionScope} onChange={update('regionScope')} placeholder="例：华东 / 华北 / 华南" hint="全国可填 全国" icon={<Globe2 className="h-3.5 w-3.5" />} />
        <Field label="灰度比例上限（%）" value={form.gray} onChange={update('gray')} placeholder="50" />
        <Field label="k-匿名阈值" value={form.kAnon} onChange={update('kAnon')} placeholder="50" />
      </div>
      <div className="rounded-lg border border-border bg-bg-tertiary p-3 text-xs leading-relaxed text-text-muted">
        所有聚合指标低于 k 阈值时将被屏蔽；导出范围默认仅包含脱敏聚合 CSV，禁止导出患者明细。
      </div>
    </div>
  );
}

function TenantStepAdmin({ form, update }: { form: TenantWizardForm; update: TenantWizardUpdate }): JSX.Element {
  return (
    <div className="space-y-4">
      <SectionTitle icon={<UserPlus className="h-3.5 w-3.5" />} title="邀请管理员" desc="为该租户创建首位药企方管理员账号，并发送激活邮件。" />
      <div className="grid grid-cols-2 gap-4">
        <Field label="管理员姓名" required value={form.adminName} onChange={update('adminName')} placeholder="例：宋知节" />
        <Field label="管理员邮箱" required value={form.adminEmail} onChange={update('adminEmail')} placeholder="admin@example.cn" icon={<Mail className="h-3.5 w-3.5" />} />
        <label className="block text-[12px] text-muted-foreground">
          默认角色
          <select value={form.adminRole} onChange={update('adminRole')} className="mt-1.5 h-9 w-full rounded-lg border border-border bg-bg-tertiary px-3 text-sm text-text-primary focus:border-accent-blue focus:outline-none">
            <option>药企 · 合规</option>
            <option>药企 · BD</option>
            <option>药企 · 市场</option>
          </select>
        </label>
        <label className="mt-6 flex h-9 items-center gap-2 rounded-lg border border-border bg-bg-tertiary px-3 text-xs text-text-secondary">
          <input type="checkbox" checked={form.require2fa} onChange={update('require2fa')} />
          要求首次登录开启 2FA
        </label>
      </div>
      <div className="rounded-lg border border-border bg-bg-tertiary p-3 text-xs leading-relaxed text-text-muted">
        首位管理员默认拥有药企视图，可后续在账号管理中追加 BD / 市场角色或冻结账号。
      </div>
    </div>
  );
}

function TenantStepSummary({ form }: { form: TenantWizardForm }): JSX.Element {
  return (
    <div className="space-y-4">
      <SectionTitle icon={<CheckCircle2 className="h-3.5 w-3.5 text-emerald-300" />} title="提交摘要" desc="再次核对以下信息，提交后租户立即可登录。" />
      <Card className="bg-bg-card p-4 text-[12.5px]">
        <div className="text-[10.5px] uppercase tracking-wider text-muted-foreground">租户身份</div>
        <div className="mt-1 text-[14px] font-semibold text-foreground">{form.name || '未填写'}</div>
        <div className="text-[11.5px] text-muted-foreground">简称 {form.shortName || '未填写'} · 类型 药企租户 · 合同 {form.contract || '未签约'}</div>
        <div className="mt-1 text-[11.5px] text-muted-foreground">联系人 {form.contactName || '未填写'} · {form.contactEmail || '未填写'}{form.phone && ` · ${form.phone}`}</div>
        <div className="mt-1 text-[11.5px] text-muted-foreground">销售经理 {form.salesManager || '—'} · 成功经理 {form.successManager || '—'}</div>
      </Card>
      <Card className="bg-bg-card p-4 text-[12.5px]">
        <div className="text-[10.5px] uppercase tracking-wider text-muted-foreground">可见范围</div>
        <div className="mt-2 grid grid-cols-3 gap-2">
          <InfoTile label="病种范围" value={form.diseaseScope || '—'} />
          <InfoTile label="品牌范围" value={form.brandScope || '—'} />
          <InfoTile label="区域范围" value={form.regionScope || '—'} />
        </div>
        <div className="mt-2 text-[11.5px] text-muted-foreground">灰度 ≤ {form.gray}% · k={form.kAnon}</div>
      </Card>
      <Card className="bg-bg-card p-4 text-[12.5px]">
        <div className="text-[10.5px] uppercase tracking-wider text-muted-foreground">首位管理员</div>
        <div className="mt-1 text-foreground">{form.adminName || '未填写'} · {form.adminEmail || '未填写'}</div>
        <div className="mt-1 text-[11.5px] text-muted-foreground">{form.adminRole} · {form.require2fa ? '要求 2FA' : '不强制 2FA'}</div>
      </Card>
    </div>
  );
}

type TenantWizardForm = {
  name: string;
  shortName: string;
  contract: string;
  phone: string;
  contactName: string;
  contactEmail: string;
  salesManager: string;
  successManager: string;
  note: string;
  diseaseScope: string;
  brandScope: string;
  regionScope: string;
  gray: string;
  kAnon: string;
  adminName: string;
  adminEmail: string;
  adminRole: string;
  require2fa: boolean;
};

type TenantWizardUpdate = (key: keyof TenantWizardForm) => (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => void;

function validateTenantForm(form: TenantWizardForm, step: number): string[] {
  const errors: string[] = [];
  if (step >= 1) {
    if (!form.name.trim()) errors.push('租户名称必填。');
    if (!form.shortName.trim()) errors.push('租户简称必填。');
    if (!form.contactName.trim()) errors.push('主联系人姓名必填。');
    if (!/^\S+@\S+\.\S+$/.test(form.contactEmail.trim())) errors.push('主联系人邮箱格式不合法。');
    if (!form.salesManager.trim()) errors.push('签约销售经理必填。');
    if (!form.successManager.trim()) errors.push('客户成功经理必填。');
  }
  if (step >= 2) {
    if (!form.diseaseScope.trim()) errors.push('病种范围必填。');
    if (!form.brandScope.trim()) errors.push('品牌范围必填。');
    if (!form.regionScope.trim()) errors.push('区域范围必填。');
  }
  if (step >= 3) {
    if (!form.adminName.trim()) errors.push('管理员姓名必填。');
    if (!/^\S+@\S+\.\S+$/.test(form.adminEmail.trim())) errors.push('管理员邮箱格式不合法。');
  }
  return errors;
}

function InviteAccountWizard({ tenant, onInvite }: { tenant: TenantRow; onInvite: (account: AccountRow) => void | Promise<void> }): JSX.Element {
  const steps = [
    { id: 1, title: '账号信息', desc: '姓名 / 邮箱', icon: Mail },
    { id: 2, title: '视图与角色', desc: '药企角色', icon: UserPlus },
    { id: 3, title: '信息确认', desc: '提交后发送邀请邮件', icon: CheckCircle2 },
  ] as const;
  const [step, setStep] = useState(1);
  const [form, setForm] = useState({ name: '', email: '', notes: '', roleIds: ['药企 · 合规'], require2fa: true });
  const update = (key: keyof typeof form) => (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const value = event.target instanceof HTMLInputElement && event.target.type === 'checkbox' ? event.target.checked : event.target.value;
    setForm((current) => ({ ...current, [key]: value }));
  };
  const errors = useMemo(() => validateInviteForm(form, step), [form, step]);
  const canNext = errors.length === 0;
  const activeStep = steps.find((item) => item.id === step) ?? steps[0];

  const toggleRole = (role: string): void => {
    setForm((current) => ({
      ...current,
      roleIds: current.roleIds.includes(role) ? current.roleIds.filter((item) => item !== role) : [...current.roleIds, role],
    }));
  };

  const submit = (): void => {
    if (!canNext) return;
    onInvite({
      id: `A-${Date.now().toString().slice(-6)}`,
      name: form.name.trim(),
      email: form.email.trim(),
      tenant: tenant.shortName,
      tenantId: tenant.id,
      view: tenant.type === '自营' ? '运营视图' : '药企视图',
      roles: form.roleIds,
      status: 'invited',
      has2fa: form.require2fa,
      lastLogin: '—',
      note: form.notes.trim() || `从 ${tenant.shortName} 租户详情邀请。`,
    });
  };

  return (
    <div className="flex h-full flex-col bg-bg-secondary">
      <h2 className="sr-only">邀请账号</h2>
      <div className="flex items-start gap-3 border-b border-border px-6 pb-5 pt-6">
        <div className="grid h-10 w-10 place-items-center rounded-lg bg-sky-500/20 text-sky-300"><UserPlus className="h-5 w-5" /></div>
        <div className="flex-1">
          <div className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">平台管理 · 邀请账号</div>
          <h3 className="mt-0.5 text-[18px] font-semibold text-foreground">为 {tenant.shortName} 邀请新账号</h3>
          <p className="mt-1 text-[12.5px] leading-relaxed text-muted-foreground">新账号将继承该租户的合规可见范围；提交后发送激活邮件并写入 SQLite。</p>
        </div>
      </div>
      <div className="flex min-h-0 flex-1 overflow-hidden">
        <aside className="w-[200px] shrink-0 border-r border-border bg-bg-card p-4">
          <ol className="space-y-1">
            {steps.map((item) => {
              const Icon = item.icon;
              const isActive = item.id === step;
              const isDone = item.id < step;
              return (
                <li key={item.id}>
                  <button
                    type="button"
                    disabled={!isDone && !isActive}
                    onClick={() => isDone && setStep(item.id)}
                    className={`flex w-full items-start gap-2.5 rounded-md px-2.5 py-2 text-left text-[12.5px] transition-colors ${isActive ? 'bg-sky-500/10 text-sky-200' : isDone ? 'text-muted-foreground hover:bg-bg-tertiary hover:text-foreground' : 'text-muted-foreground/60'}`}
                  >
                    <span className={`mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full text-[10px] font-semibold ${isActive ? 'bg-sky-400 text-sky-950' : isDone ? 'bg-emerald-500/20 text-emerald-300' : 'border border-border bg-card text-muted-foreground'}`}>
                      {isDone ? <Check className="h-3 w-3" /> : <Icon className="h-3 w-3" />}
                    </span>
                    <span className="leading-tight"><span className="block font-medium">{item.title}</span><span className="mt-0.5 block text-[10.5px] text-muted-foreground/80">{item.desc}</span></span>
                  </button>
                </li>
              );
            })}
          </ol>
        </aside>
        <div className="flex-1 overflow-y-auto px-6 py-5">
          {step === 1 && (
            <div className="space-y-4">
              <SectionTitle icon={<Mail className="h-3.5 w-3.5" />} title="账号信息" desc={`归属租户：${tenant.name}（${tenant.shortName}）`} />
              <div className="grid grid-cols-2 gap-4">
                <Field label="账号姓名" required value={form.name} onChange={update('name')} placeholder="例：宋知节" />
                <Field label="账号邮箱" required value={form.email} onChange={update('email')} placeholder="songzj@example.cn" icon={<Mail className="h-3.5 w-3.5" />} />
              </div>
              <label className="block text-[12px] text-muted-foreground">备注<textarea value={form.notes} onChange={update('notes')} placeholder="可填写邀请原因或交接说明" className="mt-1.5 min-h-20 w-full rounded-lg border border-border bg-bg-tertiary px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:border-accent-blue focus:outline-none" /></label>
            </div>
          )}
          {step === 2 && (
            <div className="space-y-4">
              <SectionTitle icon={<UserPlus className="h-3.5 w-3.5" />} title="视图与角色" desc="药企租户仅能分配药企视图角色；多角色权限取最宽松合并。" />
              <div className="grid grid-cols-3 gap-2">
                {['药企 · 合规', '药企 · BD', '药企 · 市场'].map((role) => (
                  <button key={role} type="button" onClick={() => toggleRole(role)} className={`rounded-lg border p-3 text-left text-sm ${form.roleIds.includes(role) ? 'border-accent-blue bg-accent-blue/15 text-accent-blue' : 'border-border bg-bg-tertiary text-text-secondary'}`}>
                    {role}<div className="mt-1 text-[10px] text-text-muted">{roleCode(role)}</div>
                  </button>
                ))}
              </div>
              <label className="inline-flex items-center gap-2 rounded-lg border border-border bg-bg-tertiary px-3 py-2 text-xs text-text-secondary"><input type="checkbox" checked={form.require2fa} onChange={update('require2fa')} /> 要求首次登录开启 2FA</label>
            </div>
          )}
          {step === 3 && (
            <div className="space-y-4">
              <SectionTitle icon={<CheckCircle2 className="h-3.5 w-3.5 text-emerald-300" />} title="信息确认" desc="提交后发送邀请邮件，并在账号管理中出现待激活账号。" />
              <Card className="bg-bg-card p-4 text-[12.5px]">
                <div className="text-[10.5px] uppercase tracking-wider text-muted-foreground">账号</div>
                <div className="mt-1 text-foreground">{form.name || '未填写'} · {form.email || '未填写'}</div>
                <div className="mt-1 text-[11.5px] text-muted-foreground">{tenant.shortName} · {form.roleIds.map(roleCode).join(' / ')} · {form.require2fa ? '要求 2FA' : '不强制 2FA'}</div>
              </Card>
            </div>
          )}
        </div>
      </div>
      <div className="flex items-center gap-3 border-t border-border bg-bg-card px-6 py-3.5">
        <div className="flex-1 text-[11.5px] text-muted-foreground">{errors.length > 0 ? <span className="text-rose-400">{errors[0]}</span> : <span>第 {step} / {steps.length} 步 · {activeStep.title}</span>}</div>
        {step > 1 && <Button variant="ghost" size="sm" onClick={() => setStep((current) => Math.max(current - 1, 1))} className="gap-1"><ChevronLeft className="h-3.5 w-3.5" />上一步</Button>}
        {step < 3 ? <Button size="sm" disabled={!canNext} onClick={() => setStep((current) => Math.min(current + 1, 3))} className="gap-1 bg-sky-500 text-sky-950 hover:bg-sky-400">下一步<ChevronRight className="h-3.5 w-3.5" /></Button> : <Button size="sm" disabled={!canNext} onClick={submit} className="gap-1 bg-emerald-500 text-emerald-950 hover:bg-emerald-400"><Sparkles className="h-3.5 w-3.5" />发出邀请</Button>}
      </div>
    </div>
  );
}

function validateInviteForm(form: { name: string; email: string; roleIds: string[] }, step: number): string[] {
  const errors: string[] = [];
  if (step >= 1) {
    if (!form.name.trim()) errors.push('账号姓名必填。');
    if (!/^\S+@\S+\.\S+$/.test(form.email.trim())) errors.push('邮箱格式不合法。');
  }
  if (step >= 2 && form.roleIds.length === 0) errors.push('至少分配 1 个角色。');
  return errors;
}

function SectionTitle({ icon, title, desc }: { icon: ReactNode; title: string; desc: string }): JSX.Element {
  return (
    <div>
      <div className="flex items-center gap-2 text-[13px] font-semibold text-foreground">{icon}{title}</div>
      <p className="mt-1 text-[12px] leading-relaxed text-muted-foreground">{desc}</p>
    </div>
  );
}

function Field({ label, value, onChange, placeholder, hint, required, icon }: { label: string; value: string; onChange: (event: ChangeEvent<HTMLInputElement>) => void; placeholder: string; hint?: string; required?: boolean; icon?: ReactNode }): JSX.Element {
  return (
    <label className="block text-[12px] text-muted-foreground">
      {label}{required && <span className="ml-1 text-rose-400">*</span>}
      {hint && <span className="float-right text-[10.5px] text-muted-foreground/75">{hint}</span>}
      <span className="relative mt-1.5 block">
        {icon && <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">{icon}</span>}
        <input value={value} onChange={onChange} placeholder={placeholder} className={`h-9 w-full rounded-lg border border-border bg-bg-tertiary px-3 text-sm text-text-primary placeholder:text-text-muted focus:border-accent-blue focus:outline-none ${icon ? 'pl-9' : ''}`} />
      </span>
    </label>
  );
}

function InfoTile({ label, value }: { label: string; value: string }): JSX.Element {
  return (
    <div className="rounded-lg border border-border bg-bg-tertiary p-3">
      <div className="text-[10.5px] text-muted-foreground">{label}</div>
      <div className="mt-1 text-[12px] text-foreground">{value}</div>
    </div>
  );
}
