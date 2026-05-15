import { useEffect, useMemo, useState } from 'react';
import {
  Building2,
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Filter,
  Mail,
  MailCheck,
  Search,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  UserRoundCog,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { PageHeader } from '@/components/PageHeader';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { SideSheet } from '@/components/ui/SideSheet';
import { showToast } from '@/components/ui/Toast';
import { useLogger } from '@/hooks/useLogger';
import { createAccount as createAccountApi, getAccounts, getTenantOptions, updateAccountStatus } from '@/api/endpoints/platform';
import type { AccountRow, AccountStatus } from '@/types/platform';
import { TENANTS as FALLBACK_TENANTS, type TenantOption } from '@/stores/useTenantStore';

const STATUS_OPTIONS = [
  { value: 'all', label: '全部状态' },
  { value: 'active', label: '已激活' },
  { value: 'frozen', label: '已冻结' },
  { value: 'invited', label: '已邀请' },
];

const VIEW_OPTIONS = [
  { value: 'all', label: '全部视图' },
  { value: 'ops', label: '运营视图' },
  { value: 'pharma', label: '药企视图' },
];

const STATUS_LABEL: Record<AccountStatus, { text: string; cls: string; icon: LucideIcon }> = {
  active: { text: '已激活', cls: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300', icon: ShieldCheck },
  frozen: { text: '已冻结', cls: 'border-rose-500/40 bg-rose-500/10 text-rose-300', icon: ShieldAlert },
  invited: { text: '已邀请', cls: 'border-amber-500/40 bg-amber-500/10 text-amber-300', icon: MailCheck },
};

const VIEW_LABEL = {
  运营视图: { text: '运营视图', cls: 'border-sky-500/40 bg-sky-500/10 text-sky-300' },
  药企视图: { text: '药企视图', cls: 'border-amber-500/40 bg-amber-500/10 text-amber-300' },
} satisfies Record<AccountRow['view'], { text: string; cls: string }>;

const ROLE_CATALOG = {
  运营视图: [
    { name: '运营 · 平台管理员', desc: '租户、审批流、账号管理与全局数据导出。' },
    { name: '运营 · 内容审核员', desc: '查看内容队列、处理医学与运营审核节点。' },
    { name: '运营 · 分发执行员', desc: '维护项目分发策略、医生池与批次执行。' },
    { name: '运营 · 数据分析师', desc: '查看聚合指标、业财报表与导出审计。' },
  ],
  药企视图: [
    { name: '药企 · 合规', desc: '审批患教内容、查看合规可见范围内聚合数据。' },
    { name: '药企 · BD', desc: '查看项目进度、合同与账单状态。' },
    { name: '药企 · 市场', desc: '提交选题诉求、查看内容表现与项目摘要。' },
    { name: '药企 · 医学', desc: '处理医学审核节点、维护反馈备注。' },
  ],
} satisfies Record<AccountRow['view'], Array<{ name: string; desc: string }>>;

const STEPS = [
  { id: 1, title: '选择租户', desc: '决定可分配的视图', icon: Building2 },
  { id: 2, title: '账号信息', desc: '姓名 / 邮箱', icon: Mail },
  { id: 3, title: '视图与角色', desc: '可多选 · 取最宽松合并', icon: UserRoundCog },
  { id: 4, title: '信息确认', desc: '提交后发送邀请邮件', icon: CheckCircle2 },
] as const;

const EMAIL_RE = /^[\w.+-]+@[\w-]+(\.[\w-]+)+$/;

export function AccountManagement(): JSX.Element {
  const { log } = useLogger('AccountManagement');
  const [accounts, setAccounts] = useState<AccountRow[]>([]);
  const [tenants, setTenants] = useState<TenantOption[]>(FALLBACK_TENANTS);
  const [loading, setLoading] = useState(true);
  const [keyword, setKeyword] = useState('');
  const [tenantFilter, setTenantFilter] = useState('all');
  const [viewFilter, setViewFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [inviteOpen, setInviteOpen] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(null);

  const loadData = async (): Promise<void> => {
    setLoading(true);
    try {
      const [accountsRes, tenantsRes] = await Promise.all([getAccounts(), getTenantOptions()]);
      setAccounts(accountsRes.data);
      setTenants(tenantsRes.data.length > 0 ? tenantsRes.data : FALLBACK_TENANTS);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadData();
  }, []);

  const active = accounts.find((account) => account.id === activeId) ?? null;

  const filtered = useMemo(() => accounts.filter((account) => {
    if (tenantFilter !== 'all' && account.tenantId !== tenantFilter) return false;
    if (statusFilter !== 'all' && account.status !== statusFilter) return false;
    if (viewFilter === 'ops' && account.view !== '运营视图') return false;
    if (viewFilter === 'pharma' && account.view !== '药企视图') return false;
    if (!keyword.trim()) return true;
    const k = keyword.trim().toLowerCase();
    return account.name.toLowerCase().includes(k)
      || account.email.toLowerCase().includes(k)
      || account.id.toLowerCase().includes(k)
      || account.tenant.toLowerCase().includes(k);
  }), [accounts, keyword, statusFilter, tenantFilter, viewFilter]);

  const kpi = useMemo(() => ({
    total: accounts.length,
    ops: accounts.filter((account) => account.view === '运营视图').length,
    pharma: accounts.filter((account) => account.view === '药企视图').length,
    frozen: accounts.filter((account) => account.status === 'frozen').length,
  }), [accounts]);

  const updateAccountLocally = (next: AccountRow): void => {
    setAccounts((list) => list.map((account) => (account.id === next.id ? next : account)));
  };

  const toggleAccount = async (id: string): Promise<void> => {
    const current = accounts.find((account) => account.id === id);
    if (!current || current.status === 'invited') return;
    const nextStatus: AccountStatus = current.status === 'active' ? 'frozen' : 'active';
    try {
      const res = await updateAccountStatus(id, nextStatus);
      updateAccountLocally(res.data);
      log.action('Toggle account', { id, status: nextStatus });
      showToast(`已${nextStatus === 'active' ? '解冻' : '冻结'} ${current.name}`, 'success');
    } catch (error) {
      log.error('Toggle account failed', error);
      showToast('账号状态更新失败，请检查后端服务', 'error');
    }
  };

  const addAccount = async (account: AccountRow): Promise<void> => {
    try {
      const res = await createAccountApi(account);
      setAccounts((current) => [res.data, ...current.filter((item) => item.id !== res.data.id)]);
      setInviteOpen(false);
      setActiveId(res.data.id);
      showToast(`已邀请 ${res.data.name}`, 'success');
    } catch (error) {
      log.error('Invite account failed', error);
      showToast('邀请账号失败，请检查后端服务', 'error');
    }
  };

  return (
    <>
      <PageHeader
        eyebrow="平台管理 · 账号管理"
        title="账号 · 角色 · 字段级权限"
        subtitle="按租户与视图分配账号角色；多角色组合自动合并为字段级权限矩阵，越权访问触发告警与冻结。"
        actions={
          <Button className="gap-1.5 bg-primary text-primary-foreground hover:bg-primary/90" onClick={() => { log.action('Invite account clicked'); setInviteOpen(true); }}>
            <UserRoundCog className="h-4 w-4" />邀请账号
          </Button>
        }
      />

      <div className="mt-6 grid grid-cols-4 gap-3">
        {[
          { label: '全部账号', value: kpi.total, tone: 'text-foreground' },
          { label: '运营视图', value: kpi.ops, tone: 'text-sky-300' },
          { label: '药企视图', value: kpi.pharma, tone: 'text-amber-300' },
          { label: '已冻结', value: kpi.frozen, tone: 'text-rose-300' },
        ].map((item) => (
          <Card key={item.label} className="bg-card/60 p-4">
            <div className="text-[11px] uppercase tracking-wider text-muted-foreground">{item.label}</div>
            <div className={`mt-2 text-2xl font-semibold tabular ${item.tone}`}>{item.value}</div>
          </Card>
        ))}
      </div>

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <div className="relative max-w-md flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            value={keyword}
            onChange={(event) => setKeyword(event.target.value)}
            placeholder="搜索姓名 / 邮箱 / 账号 ID"
            className="h-9 w-full rounded-md border border-border bg-background px-3 pl-9 text-[13px] text-foreground placeholder:text-muted-foreground outline-none focus:border-primary/60 focus:ring-2 focus:ring-ring/30"
          />
        </div>

        <FilterChip icon={<Filter className="h-3 w-3 text-muted-foreground" />}>
          <select value={tenantFilter} onChange={(event) => setTenantFilter(event.target.value)} className="h-7 w-[160px] border-0 bg-transparent text-[12px] text-foreground outline-none">
            <option value="all">全部租户</option>
            {tenants.map((tenant) => <option key={tenant.id} value={tenant.id}>{tenant.shortName}</option>)}
          </select>
        </FilterChip>
        <FilterChip>
          <select value={viewFilter} onChange={(event) => setViewFilter(event.target.value)} className="h-7 w-[120px] border-0 bg-transparent text-[12px] text-foreground outline-none">
            {VIEW_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
        </FilterChip>
        <FilterChip>
          <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} className="h-7 w-[110px] border-0 bg-transparent text-[12px] text-foreground outline-none">
            {STATUS_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
        </FilterChip>
        <span className="ml-auto text-[12px] text-muted-foreground">{filtered.length} / {accounts.length} 条</span>
      </div>

      <Card className="mt-3 overflow-hidden border-border bg-card/40 p-0">
        <table className="w-full text-[13px]">
          <thead className="bg-card/70 text-[11px] uppercase tracking-wider text-muted-foreground">
            <tr className="text-left">
              <th className="px-4 py-3 font-medium">账号</th>
              <th className="px-3 py-3 font-medium">归属租户</th>
              <th className="px-3 py-3 font-medium">视图 / 角色</th>
              <th className="px-3 py-3 font-medium">状态</th>
              <th className="px-3 py-3 font-medium">最近登录</th>
              <th className="px-3 py-3 text-right font-medium">操作</th>
            </tr>
          </thead>
          <tbody>
            {loading && <tr><td colSpan={6} className="px-4 py-10 text-center text-sm text-muted-foreground">正在从 SQLite 加载账号...</td></tr>}
            {!loading && filtered.map((account) => {
              const status = STATUS_LABEL[account.status];
              const StatusIcon = status.icon;
              const view = VIEW_LABEL[account.view];
              return (
                <tr
                  key={account.id}
                  className="cursor-pointer border-t border-border/60 transition-colors hover:bg-secondary/40"
                  onClick={() => setActiveId(account.id)}
                >
                  <td className="px-4 py-3">
                    <div className="leading-tight">
                      <div className="font-medium text-foreground">{account.name}</div>
                      <div className="text-[11px] text-muted-foreground">{account.email}</div>
                    </div>
                  </td>
                  <td className="px-3 py-3 text-[12px]">
                    <div className="text-foreground">{account.tenant}</div>
                    <div className="text-[11px] text-muted-foreground">{account.tenantId}</div>
                  </td>
                  <td className="px-3 py-3 text-[12px]">
                    <span className={`mb-1 inline-block rounded border px-1.5 py-px text-[10px] tracking-wider ${view.cls}`}>{view.text}</span>
                    <div className="flex flex-wrap gap-1">
                      {account.roles.map((role) => (
                        <span key={role} className="rounded border border-border bg-secondary/40 px-1.5 py-px text-[10.5px] text-muted-foreground">{role}</span>
                      ))}
                    </div>
                  </td>
                  <td className="px-3 py-3">
                    <span className={`inline-flex items-center gap-1 rounded border px-1.5 py-px text-[10.5px] tracking-wider ${status.cls}`}>
                      <StatusIcon className="h-3 w-3" />{status.text}
                    </span>
                  </td>
                  <td className="px-3 py-3 text-[12px] tabular text-muted-foreground">{account.lastLogin || '—'}</td>
                  <td className="px-3 py-3 text-right">
                    <div className="inline-flex items-center gap-1.5" onClick={(event) => event.stopPropagation()}>
                      <ToggleSwitch checked={account.status === 'active'} disabled={account.status === 'invited'} onChange={() => { void toggleAccount(account.id); }} label={`切换 ${account.name}`} />
                      <span className="ml-1 text-[11px] text-muted-foreground">启用</span>
                      <Button size="sm" variant="ghost" className="ml-2 h-7 gap-1 text-[11px]" onClick={() => setActiveId(account.id)}>
                        详情<ChevronRight className="h-3 w-3" />
                      </Button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Card>

      <InviteAccountSheet open={inviteOpen} onClose={() => setInviteOpen(false)} tenants={tenants} accounts={accounts} onInvite={addAccount} />
      <AccountDetailSheet
        account={active}
        onClose={() => setActiveId(null)}
        onChange={(next) => {
          updateAccountLocally(next);
          setActiveId(next.id);
        }}
      />
    </>
  );
}

function FilterChip({ icon, children }: { icon?: React.ReactNode; children: React.ReactNode }): JSX.Element {
  return (
    <div className="flex items-center gap-2 rounded-md border border-border bg-card/40 px-2 py-1 text-[12px]">
      {icon}
      {children}
    </div>
  );
}

function ToggleSwitch({ checked, disabled, onChange, label }: { checked: boolean; disabled?: boolean; onChange: () => void; label: string }): JSX.Element {
  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={onChange}
      className={`relative h-5 w-8 shrink-0 rounded-full border transition-colors ${checked ? 'border-cyan-400/30 bg-cyan-400/90' : 'border-border bg-secondary'} ${disabled ? 'cursor-not-allowed opacity-55' : 'hover:ring-2 hover:ring-cyan-400/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400'}`}
    >
      <span className={`absolute left-0.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 rounded-full transition-transform ${checked ? 'translate-x-3 bg-slate-950' : 'translate-x-0 bg-slate-300'}`} />
    </button>
  );
}

function AccountDetailSheet({ account, onClose, onChange }: { account: AccountRow | null; onClose: () => void; onChange: (account: AccountRow) => void }): JSX.Element {
  const tenant = account ? FALLBACK_TENANTS.find((item) => item.id === account.tenantId) : undefined;
  const status = account ? STATUS_LABEL[account.status] : null;
  const view = account ? VIEW_LABEL[account.view] : null;
  const assignableRoles = account ? ROLE_CATALOG[account.view] : [];

  const toggleRole = (role: string): void => {
    if (!account) return;
    const nextRoles = account.roles.includes(role) ? account.roles.filter((item) => item !== role) : [...account.roles, role];
    if (nextRoles.length === 0) {
      showToast('至少保留一个角色', 'error');
      return;
    }
    onChange({ ...account, roles: nextRoles });
  };

  return (
    <SideSheet open={!!account} onClose={onClose} widthClass="w-[560px]" className="overflow-y-auto p-6">
      {account && status && view && (
        <div className="space-y-5 pr-8">
          <div className="flex items-start gap-3">
            <div className="grid h-12 w-12 place-items-center rounded-lg bg-secondary/60 text-[14px] font-semibold text-foreground">{account.name.slice(0, 1)}</div>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-[17px] font-semibold text-foreground">{account.name}</h3>
                <span className={`inline-flex items-center gap-1 rounded border px-1.5 py-px text-[10px] tracking-wider ${status.cls}`}>
                  <status.icon className="h-3 w-3" />{status.text}
                </span>
                <span className={`rounded border px-1.5 py-px text-[10px] tracking-wider ${view.cls}`}>{view.text}</span>
              </div>
              <div className="mt-0.5 text-[12px] text-muted-foreground">{account.email} · {account.id}</div>
              <div className="mt-1 text-[12px] text-muted-foreground">归属租户：{tenant?.name ?? account.tenant}（{tenant?.shortName ?? account.tenant}）</div>
            </div>
          </div>

          {account.note && <div className="rounded-md border border-border bg-secondary/30 p-3 text-[12px] leading-relaxed text-muted-foreground">{account.note}</div>}

          <Card className="bg-card/60 p-4">
            <div className="grid grid-cols-2 gap-3 text-[12px]">
              <Info label="最近登录" value={account.lastLogin || '—'} />
              <Info label="账号创建" value="2025-09-01 09:00" />
              <Info label="状态" value={status.text} />
            </div>
          </Card>

          <Card className="bg-card/60 p-4">
            <div className="mb-2 flex items-center gap-2 text-[12px] font-semibold tracking-wide text-foreground">
              <UserRoundCog className="h-3.5 w-3.5 text-primary" />
              角色分配（按租户视图）
            </div>
            <div className="mb-3 h-px bg-border" />
            <div className="space-y-2">
              {assignableRoles.map((role) => {
                const checked = account.roles.includes(role.name);
                return (
                  <label key={role.name} className={`flex cursor-pointer items-start justify-between gap-3 rounded-md border px-3 py-2 text-[12px] transition-colors ${checked ? 'border-primary/50 bg-primary/10' : 'border-border bg-secondary/20 hover:bg-secondary/40'}`}>
                    <div className="leading-tight">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-foreground">{role.name}</span>
                        <span className={`rounded border px-1 py-px text-[10px] tracking-wider ${view.cls}`}>{view.text}</span>
                      </div>
                      <div className="mt-0.5 text-[11px] text-muted-foreground">{role.desc}</div>
                    </div>
                    <ToggleSwitch checked={checked} onChange={() => toggleRole(role.name)} label={`切换角色 ${role.name}`} />
                  </label>
                );
              })}
            </div>
          </Card>
        </div>
      )}
    </SideSheet>
  );
}

function Info({ label, value }: { label: string; value: string }): JSX.Element {
  return (
    <div className="rounded-md border border-border bg-secondary/20 px-3 py-2">
      <div className="text-[11px] text-muted-foreground">{label}</div>
      <div className="mt-0.5 text-foreground">{value}</div>
    </div>
  );
}

type InviteForm = {
  tenantId: string;
  name: string;
  email: string;
  notes: string;
  roles: string[];
};

const EMPTY_INVITE: InviteForm = { tenantId: '', name: '', email: '', notes: '', roles: [] };

function InviteAccountSheet({
  open,
  onClose,
  tenants,
  accounts,
  onInvite,
}: {
  open: boolean;
  onClose: () => void;
  tenants: TenantOption[];
  accounts: AccountRow[];
  onInvite: (account: AccountRow) => void | Promise<void>;
}): JSX.Element {
  const [step, setStep] = useState(1);
  const [tenantSearch, setTenantSearch] = useState('');
  const [form, setForm] = useState<InviteForm>(EMPTY_INVITE);

  useEffect(() => {
    if (open) {
      setStep(1);
      setTenantSearch('');
      setForm(EMPTY_INVITE);
    }
  }, [open]);

  const tenant = tenants.find((item) => item.id === form.tenantId);
  const view: AccountRow['view'] = tenant?.type === 'ops' ? '运营视图' : '药企视图';
  const assignableRoles = tenant ? ROLE_CATALOG[view] : [];
  const visibleTenants = tenants.filter((item) => {
    const k = tenantSearch.trim().toLowerCase();
    if (!k) return true;
    return item.name.toLowerCase().includes(k) || item.shortName.toLowerCase().includes(k);
  });

  const errors = validateInvite(form, step, accounts);
  const canNext = errors.length === 0;
  const currentStep = STEPS[step - 1] ?? STEPS[0];

  const update = <K extends keyof InviteForm>(key: K, value: InviteForm[K]): void => setForm((current) => ({ ...current, [key]: value }));

  const toggleRole = (role: string): void => {
    setForm((current) => ({
      ...current,
      roles: current.roles.includes(role) ? current.roles.filter((item) => item !== role) : [...current.roles, role],
    }));
  };

  const submit = (): void => {
    if (!tenant || !canNext) return;
    void onInvite({
      id: `A-${Date.now().toString().slice(-6)}`,
      name: form.name.trim(),
      email: form.email.trim(),
      tenant: tenant.shortName,
      tenantId: tenant.id,
      view,
      roles: form.roles,
      status: 'invited',
      has2fa: false,
      lastLogin: '—',
      note: form.notes.trim() || '通过账号邀请向导创建。',
    });
  };

  return (
    <SideSheet open={open} onClose={onClose} widthClass="w-[760px]" className="bg-background p-0" showClose={false}>
      <div className="flex items-start gap-3 border-b border-border px-6 pb-5 pt-6">
        <div className="grid h-10 w-10 place-items-center rounded-lg bg-gradient-to-br from-sky-400/30 to-sky-600/20 text-sky-300">
          <UserRoundCog className="h-5 w-5" />
        </div>
        <div className="flex-1">
          <div className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">平台管理 · 邀请账号</div>
          <h2 className="mt-0.5 text-[18px] font-semibold text-foreground">为指定租户邀请新账号</h2>
          <p className="mt-1 text-[12.5px] leading-relaxed text-muted-foreground">管理员设置归属租户后，候选角色将自动收窄到该租户允许的视图范围。</p>
        </div>
        <button aria-label="Close" onClick={onClose} className="grid h-8 w-8 place-items-center rounded-md text-muted-foreground hover:bg-secondary/50 hover:text-foreground">×</button>
      </div>

      <div className="flex min-h-0 flex-1 overflow-hidden">
        <aside className="w-[200px] shrink-0 border-r border-border bg-card/30 p-4">
          <ol className="space-y-1">
            {STEPS.map((stepItem) => {
              const Icon = stepItem.icon;
              const isActive = stepItem.id === step;
              const isDone = stepItem.id < step;
              return (
                <li key={stepItem.id}>
                  <button
                    onClick={() => isDone && setStep(stepItem.id)}
                    disabled={!isDone && !isActive}
                    className={`flex w-full items-start gap-2.5 rounded-md px-2.5 py-2 text-left text-[12.5px] transition-colors ${isActive ? 'bg-sky-500/10 text-sky-200' : ''} ${!isActive && isDone ? 'text-muted-foreground hover:bg-secondary/50 hover:text-foreground' : ''} ${!isActive && !isDone ? 'text-muted-foreground/60' : ''}`}
                  >
                    <span className={`mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full text-[10px] font-semibold ${isActive ? 'bg-sky-400 text-sky-950' : ''} ${!isActive && isDone ? 'bg-emerald-500/20 text-emerald-300' : ''} ${!isActive && !isDone ? 'border border-border bg-card text-muted-foreground' : ''}`}>
                      {isDone ? <Check className="h-3 w-3" /> : <Icon className="h-3 w-3" />}
                    </span>
                    <span className="leading-tight">
                      <div className="font-medium">{stepItem.title}</div>
                      <div className="mt-0.5 text-[10.5px] text-muted-foreground/80">{stepItem.desc}</div>
                    </span>
                  </button>
                </li>
              );
            })}
          </ol>
        </aside>

        <div className="flex-1 overflow-y-auto px-6 py-5">
          {step === 1 && (
            <div className="space-y-4">
              <SectionTitle icon={<Building2 className="h-3.5 w-3.5" />} title="选择归属租户" desc="账号将继承该租户的合规可见范围；草稿状态的租户不可邀请账号。" />
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <input value={tenantSearch} onChange={(event) => setTenantSearch(event.target.value)} placeholder="搜索租户名 / 简称" className="h-9 w-full rounded-md border border-input bg-background px-3 pl-9 text-[13px] text-foreground outline-none focus:ring-2 focus:ring-ring" />
              </div>
              <ul className="grid grid-cols-2 gap-2">
                {visibleTenants.map((item) => {
                  const selected = form.tenantId === item.id;
                  return (
                    <li key={item.id}>
                      <button
                        type="button"
                        onClick={() => setForm((current) => ({ ...current, tenantId: item.id, roles: [] }))}
                        className={`flex w-full items-start gap-3 rounded-md border px-3 py-2.5 text-left transition-colors ${selected ? 'border-sky-500/60 bg-sky-500/10' : 'border-border bg-card/40 hover:bg-secondary/40'}`}
                      >
                        <div className={`grid h-9 w-9 shrink-0 place-items-center rounded-md text-[12px] font-semibold ${item.type === 'ops' ? 'bg-sky-500/15 text-sky-300' : 'bg-amber-500/15 text-amber-300'}`}>{item.shortName.slice(0, 2)}</div>
                        <div className="min-w-0 flex-1 leading-tight">
                          <div className="truncate text-[13px] font-medium text-foreground">{item.name}</div>
                          <div className="mt-0.5 truncate text-[10.5px] text-muted-foreground">{item.type === 'ops' ? 'Px 自营 · 运营视图' : '药企租户 · 药企视图'} · {item.shortName}</div>
                          <div className="mt-1 text-[10.5px] text-muted-foreground">可见病种 {item.type === 'ops' ? '全部' : '按租户范围'} · 灰度 ≤ 100% · k=20</div>
                        </div>
                        {selected && <Check className="mt-1 h-4 w-4 text-sky-300" />}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-5">
              <SectionTitle icon={<Mail className="h-3.5 w-3.5" />} title="账号信息" desc={`新账号将归属租户「${tenant?.shortName ?? '—'}」，激活邮件将发送至填写的邮箱。`} />
              <div className="grid grid-cols-2 gap-4">
                <FormField label="姓名" required>
                  <input value={form.name} onChange={(event) => update('name', event.target.value)} placeholder="例：宋知节" className="h-9 w-full rounded-md border border-input bg-background px-3 text-[13px] text-foreground outline-none focus:ring-2 focus:ring-ring" />
                </FormField>
                <FormField label="邮箱" required hint="同租户内唯一">
                  <div className="relative">
                    <Mail className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                    <input className="h-9 w-full rounded-md border border-input bg-background px-3 pl-8 text-[13px] text-foreground outline-none focus:ring-2 focus:ring-ring" value={form.email} onChange={(event) => update('email', event.target.value)} placeholder="例：songzj@novartis.cn" />
                  </div>
                </FormField>
              </div>
              <FormField label="备注（可选）" hint="用于运营备忘，不会发送给被邀请人">
                <textarea value={form.notes} onChange={(event) => update('notes', event.target.value)} placeholder="例：诺华华东 KOL 触达对接人" className="h-20 w-full resize-none rounded-md border border-input bg-background px-3 py-2 text-[13px] text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring" />
              </FormField>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-4">
              <SectionTitle icon={<UserRoundCog className="h-3.5 w-3.5" />} title={`视图：${view === '运营视图' ? '运营视图（Ops）' : '药企视图（Pharma）'}`} desc="可多选角色；多角色取最宽松字段权限合并，并在下一步预览。" />
              <div className="space-y-2">
                {assignableRoles.map((role) => {
                  const checked = form.roles.includes(role.name);
                  return (
                    <label key={role.name} className={`flex cursor-pointer items-start justify-between gap-3 rounded-md border px-3 py-2.5 text-[12.5px] transition-colors ${checked ? 'border-sky-500/60 bg-sky-500/10' : 'border-border bg-secondary/20 hover:bg-secondary/40'}`}>
                      <div className="min-w-0 leading-tight">
                        <div className="font-medium text-foreground">{role.name}</div>
                        <div className="mt-0.5 text-[11px] text-muted-foreground">{role.desc}</div>
                      </div>
                      <ToggleSwitch checked={checked} onChange={() => toggleRole(role.name)} label={`选择角色 ${role.name}`} />
                    </label>
                  );
                })}
              </div>
            </div>
          )}

          {step === 4 && (
            <div className="space-y-4">
              <SectionTitle icon={<CheckCircle2 className="h-3.5 w-3.5 text-emerald-300" />} title="提交前确认" desc="提交后系统将向对方邮箱发送激活链接，账号状态为 invited。" />
              <Card className="bg-card/60 p-4 text-[12.5px]">
                <div className="text-[10.5px] uppercase tracking-wider text-muted-foreground">账号摘要</div>
                <div className="mt-1 text-[14px] font-semibold text-foreground">{form.name}</div>
                <div className="text-[11.5px] text-muted-foreground">{form.email}</div>
                <div className="my-2 h-px bg-border" />
                <div className="text-[11.5px] text-muted-foreground">归属租户：{tenant?.name}（{tenant?.shortName}）</div>
                <div className="mt-0.5 text-[11.5px] text-muted-foreground">视图：{view === '运营视图' ? '运营台（PX 自营）' : '药企台'}</div>
                <div className="mt-0.5 text-[11.5px] text-muted-foreground">角色组合：{form.roles.join(' + ') || '—'}</div>
                {form.notes && <div className="mt-0.5 text-[11.5px] text-muted-foreground">备注：{form.notes}</div>}
              </Card>
              <Card className="border-emerald-500/20 bg-emerald-500/5 p-3.5 text-[12px] leading-relaxed text-emerald-200/90">角色已内置页面与数据可见范围，不需额外配置。提交后可在「账号、角色管理」列表中随时追加或移除角色。</Card>
            </div>
          )}
        </div>
      </div>

      <div className="flex items-center gap-3 border-t border-border bg-card/40 px-6 py-3.5">
        <div className="flex-1 text-[11.5px] text-muted-foreground">
          {errors.length > 0 ? <span className="text-rose-400">{errors[0]}</span> : <span>第 {step} / {STEPS.length} 步 · {currentStep.title}</span>}
        </div>
        {step > 1 && <Button variant="ghost" size="sm" onClick={() => setStep((current) => current - 1)} className="gap-1"><ChevronLeft className="h-3.5 w-3.5" />上一步</Button>}
        {step < STEPS.length && <Button size="sm" disabled={!canNext} onClick={() => setStep((current) => current + 1)} className="gap-1 bg-sky-500 text-sky-950 hover:bg-sky-400">下一步<ChevronRight className="h-3.5 w-3.5" /></Button>}
        {step === STEPS.length && <Button size="sm" disabled={!canNext} onClick={submit} className="gap-1 bg-emerald-500 text-emerald-950 hover:bg-emerald-400"><Sparkles className="h-3.5 w-3.5" />发出邀请</Button>}
      </div>
    </SideSheet>
  );
}

function validateInvite(form: InviteForm, step: number, existing: AccountRow[]): string[] {
  const errors: string[] = [];
  if (step >= 1 && !form.tenantId) errors.push('请选择归属租户。');
  if (step >= 2) {
    if (!form.name.trim()) errors.push('账号姓名必填。');
    if (!EMAIL_RE.test(form.email.trim())) errors.push('邮箱格式不合法。');
    const dup = existing.find((account) => account.tenantId === form.tenantId && account.email.toLowerCase() === form.email.trim().toLowerCase());
    if (dup) errors.push(`同租户内邮箱「${form.email.trim()}」已存在（${dup.name}）。`);
  }
  if (step >= 3 && form.roles.length === 0) errors.push('至少分配 1 个角色。');
  return errors;
}

function SectionTitle({ icon, title, desc }: { icon: React.ReactNode; title: string; desc: string }): JSX.Element {
  return (
    <div>
      <div className="flex items-center gap-1.5 text-[12.5px] font-semibold text-foreground">{icon}{title}</div>
      <p className="mt-1 text-[11.5px] leading-relaxed text-muted-foreground">{desc}</p>
    </div>
  );
}

function FormField({ label, required, hint, children }: { label: string; required?: boolean; hint?: string; children: React.ReactNode }): JSX.Element {
  return (
    <div>
      <label className="mb-1.5 flex items-center gap-1 text-[12px] text-foreground">
        {label}
        {required && <span className="text-rose-400">*</span>}
        {hint && <span className="ml-auto text-[10.5px] font-normal text-muted-foreground">{hint}</span>}
      </label>
      {children}
    </div>
  );
}
