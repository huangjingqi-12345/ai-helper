import { useEffect, useMemo, useState } from 'react';
import { ChevronRight, Key, Search, ToggleLeft, ToggleRight, UserCog } from 'lucide-react';
import { PageHeader } from '@/components/PageHeader';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Modal } from '@/components/ui/Modal';
import { Select } from '@/components/ui/Select';
import { showToast } from '@/components/ui/Toast';
import { useLogger } from '@/hooks/useLogger';
import { createAccount as createAccountApi, getAccounts, getTenantOptions, updateAccount2fa, updateAccountStatus } from '@/api/endpoints/platform';
import type { AccountRow, AccountStatus } from '@/types/platform';
import type { TenantOption } from '@/stores/useTenantStore';

const VIEW_OPTIONS = [
  { value: '', label: '全部视图' },
  { value: 'ops', label: '运营视图' },
  { value: 'pharma', label: '药企视图' },
];

const STATUS_OPTIONS = [
  { value: '', label: '全部状态' },
  { value: 'active', label: '已激活' },
  { value: 'frozen', label: '已冻结' },
  { value: 'invited', label: '已邀请' },
];

function statusLabel(status: AccountStatus): string {
  if (status === 'active') return '已激活';
  if (status === 'frozen') return '已冻结';
  return '已邀请';
}

function statusColor(status: AccountStatus): 'green' | 'gray' | 'yellow' {
  if (status === 'active') return 'green';
  if (status === 'frozen') return 'gray';
  return 'yellow';
}

export function AccountManagement(): JSX.Element {
  const { log } = useLogger('AccountManagement');
  const [accounts, setAccounts] = useState<AccountRow[]>([]);
  const [tenants, setTenants] = useState<TenantOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [tenantFilter, setTenantFilter] = useState('');
  const [viewFilter, setViewFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [inviteOpen, setInviteOpen] = useState(false);
  const [selectedAccount, setSelectedAccount] = useState<AccountRow | null>(null);

  const loadData = async (): Promise<void> => {
    setLoading(true);
    try {
      const [accountsRes, tenantsRes] = await Promise.all([getAccounts(), getTenantOptions()]);
      setAccounts(accountsRes.data);
      setTenants(tenantsRes.data);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadData();
  }, []);

  const tenantOptions = useMemo(() => [
    { value: '', label: '全部租户' },
    ...tenants.map((tenant) => ({ value: tenant.id, label: tenant.shortName })),
  ], [tenants]);

  const filtered = useMemo(() => accounts.filter((a) => {
    if (tenantFilter && a.tenantId !== tenantFilter) return false;
    if (viewFilter === 'ops' && a.view !== '运营视图') return false;
    if (viewFilter === 'pharma' && a.view !== '药企视图') return false;
    if (statusFilter && a.status !== statusFilter) return false;
    const haystack = `${a.name}${a.email}${a.id}${a.tenant}`.toLowerCase();
    if (search && !haystack.includes(search.toLowerCase())) return false;
    return true;
  }), [accounts, search, statusFilter, tenantFilter, viewFilter]);

  const opsCount = accounts.filter((a) => a.view === '运营视图').length;
  const pharmaCount = accounts.filter((a) => a.view === '药企视图').length;
  const frozenCount = accounts.filter((a) => a.status === 'frozen').length;
  const has2faCount = accounts.filter((a) => a.has2fa).length;

  const toggleAccount = async (id: string): Promise<void> => {
    const currentAccount = accounts.find((account) => account.id === id);
    if (!currentAccount) return;
    const nextStatus: AccountStatus = currentAccount.status === 'active' ? 'frozen' : 'active';
    try {
      const res = await updateAccountStatus(id, nextStatus);
      setAccounts((current) => current.map((account) => account.id === id ? res.data : account));
      setSelectedAccount((current) => current?.id === id ? res.data : current);
      log.action('Toggle account', { id, status: nextStatus });
      showToast('账号状态已更新并写入 SQLite', 'success');
    } catch (error) {
      log.error('Toggle account failed', error);
      showToast('账号状态更新失败，请检查后端服务', 'error');
    }
  };

  const activateAccount = async (id: string): Promise<void> => {
    try {
      const res = await updateAccountStatus(id, 'active');
      setAccounts((current) => current.map((account) => account.id === id ? res.data : account));
      showToast('账号已激活并写入 SQLite', 'success');
    } catch (error) {
      log.error('Activate account failed', error);
      showToast('账号激活失败，请检查后端服务', 'error');
    }
  };

  const addAccount = async (account: AccountRow): Promise<void> => {
    try {
      const res = await createAccountApi(account);
      setAccounts((current) => [res.data, ...current.filter((item) => item.id !== res.data.id)]);
      setInviteOpen(false);
      showToast('邀请邮件已发送并写入 SQLite', 'success');
    } catch (error) {
      log.error('Invite account failed', error);
      showToast('邀请账号失败，请检查后端服务', 'error');
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="平台管理 · 账号管理"
        title="账号 · 角色 · 字段级权限"
        subtitle="按租户与视图分配账号角色；多角色组合自动合并为字段级权限矩阵，越权访问触发告警与冻结。"
        actions={
          <Button onClick={() => { log.action('Invite account clicked'); setInviteOpen(true); }}>
            <UserCog className="h-4 w-4" />
            邀请账号
          </Button>
        }
      />

      <div className="grid grid-cols-6 gap-3">
        <Card className="bg-card/60 p-4"><div className="text-[11px] uppercase tracking-wider text-muted-foreground">全部账号</div><div className="mt-2 text-2xl font-semibold tabular text-foreground">{accounts.length}</div></Card>
        <Card className="bg-card/60 p-4"><div className="text-[11px] uppercase tracking-wider text-muted-foreground">运营视图</div><div className="mt-2 text-2xl font-semibold tabular text-sky-300">{opsCount}</div></Card>
        <Card className="bg-card/60 p-4"><div className="text-[11px] uppercase tracking-wider text-muted-foreground">药企视图</div><div className="mt-2 text-2xl font-semibold tabular text-amber-300">{pharmaCount}</div></Card>
        <Card className="bg-card/60 p-4"><div className="text-[11px] uppercase tracking-wider text-muted-foreground">已冻结</div><div className="mt-2 text-2xl font-semibold tabular text-rose-300">{frozenCount}</div></Card>
        <Card className="bg-card/60 p-4"><div className="text-[11px] uppercase tracking-wider text-muted-foreground">已开二步验证</div><div className="mt-2 text-2xl font-semibold tabular text-cyan-300">{has2faCount}</div></Card>
        <Card className="bg-card/60 p-4"><div className="text-[11px] uppercase tracking-wider text-muted-foreground">待激活</div><div className="mt-2 text-2xl font-semibold tabular text-foreground">{accounts.filter((a) => a.status === 'invited').length}</div></Card>
      </div>

      <Card className="overflow-hidden border-border bg-card/40 p-0">
        <div className="flex flex-wrap items-center gap-3 border-b border-border/60 px-4 py-3">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
            <input type="text" placeholder="搜索姓名 / 邮箱 / 账号 ID" value={search} onChange={(e) => setSearch(e.target.value)} className="w-full pl-9 pr-4 py-2 bg-bg-tertiary border border-border rounded-lg text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-1 focus:ring-accent-blue" />
          </div>
          <Select options={tenantOptions} value={tenantFilter} onChange={setTenantFilter} />
          <Select options={VIEW_OPTIONS} value={viewFilter} onChange={setViewFilter} />
          <Select options={STATUS_OPTIONS} value={statusFilter} onChange={setStatusFilter} />
          <span className="text-xs text-text-muted ml-auto">{filtered.length} / {accounts.length} 条</span>
        </div>

        <table className="w-full">
          <thead>
            <tr className="border-b border-border bg-card/70">
              <th className="px-4 py-3 text-left text-xs font-medium text-text-muted">账号</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-text-muted">归属租户</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-text-muted">视图 / 角色</th>
              <th className="px-4 py-3 text-center text-xs font-medium text-text-muted">状态</th>
              <th className="px-4 py-3 text-center text-xs font-medium text-text-muted">2FA</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-text-muted">最近登录</th>
              <th className="px-4 py-3 text-center text-xs font-medium text-text-muted">操作</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr><td colSpan={7} className="px-4 py-10 text-center text-sm text-text-muted">正在从 SQLite 加载账号...</td></tr>
            )}
            {!loading && filtered.map((a) => (
              <tr key={a.id} className="cursor-pointer border-b border-border/50 transition-colors hover:bg-secondary/40">
                <td className="px-4 py-3"><div className="text-sm font-medium text-text-primary">{a.name}</div><div className="text-xs text-text-muted">{a.email}</div></td>
                <td className="px-4 py-3 text-sm text-text-secondary">{a.tenant}<div className="text-xs text-text-muted">{a.tenantId}</div></td>
                <td className="px-4 py-3"><Badge color={a.view === '运营视图' ? 'blue' : 'green'}>{a.view}</Badge><div className="mt-0.5 space-y-0.5">{a.roles.map((role) => <div key={role} className="text-xs text-text-muted">{role}</div>)}</div></td>
                <td className="px-4 py-3 text-center"><Badge color={statusColor(a.status)}>{statusLabel(a.status)}</Badge></td>
                <td className="px-4 py-3 text-center">{a.has2fa ? <Key size={14} className="text-accent-green mx-auto" /> : <span className="text-text-muted text-xs">未开</span>}</td>
                <td className="px-4 py-3 text-xs text-text-muted">{a.lastLogin}</td>
                <td className="px-4 py-3">
                  <div className="flex items-center justify-center gap-2">
                    <button aria-label={`${statusLabel(a.status)} ${a.name}`} onClick={() => toggleAccount(a.id)} className="text-xl">{a.status === 'active' ? <ToggleRight className="w-5 h-5 text-accent-green" /> : <ToggleLeft className="w-5 h-5 text-text-muted" />}</button>
                    <button onClick={() => { void activateAccount(a.id); }} className="text-xs text-text-muted hover:text-text-primary">激活</button>
                    <button onClick={() => { log.action('View account', { id: a.id }); setSelectedAccount(a); }} className="text-xs text-accent-blue flex items-center gap-0.5 hover:underline">详情 <ChevronRight size={12} /></button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      <Modal
        open={inviteOpen}
        onClose={() => setInviteOpen(false)}
        title="邀请账号"
        maxWidth="max-w-4xl"
        footer={<Button variant="secondary" onClick={() => setInviteOpen(false)}>Close</Button>}
      >
        <InviteAccountWizard tenants={tenants} onInvite={addAccount} />
      </Modal>

      <Modal open={!!selectedAccount} onClose={() => setSelectedAccount(null)} title="账号详情" maxWidth="max-w-4xl" footer={<Button variant="secondary" onClick={() => setSelectedAccount(null)}>Close</Button>}>
        {selectedAccount && <AccountDetail account={selectedAccount} onToggle2fa={async () => {
          const res = await updateAccount2fa(selectedAccount.id, !selectedAccount.has2fa);
          setAccounts((current) => current.map((account) => account.id === selectedAccount.id ? res.data : account));
          setSelectedAccount(res.data);
        }} />}
      </Modal>
    </div>
  );
}

function AccountDetail({ account, onToggle2fa }: { account: AccountRow; onToggle2fa: () => void }): JSX.Element {
  const matrix = permissionMatrix(account.view, account.roles);
  return (
    <div className="space-y-5">
      <p className="text-sm text-text-secondary">查看账号归属、视图、角色与字段级权限矩阵。</p>
      <div className="flex items-start gap-3 rounded-lg border border-border bg-bg-tertiary p-4">
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-accent-blue/20 text-sm font-bold text-accent-blue">{account.name[0]}</div>
        <div className="flex-1">
          <div className="flex items-center gap-2"><span className="text-base font-semibold text-text-primary">{account.name}</span><Badge color={statusColor(account.status)}>{statusLabel(account.status)}</Badge><Badge color={account.view === '运营视图' ? 'blue' : 'green'}>{account.view}</Badge></div>
          <div className="mt-1 text-xs text-text-muted">{account.email} · {account.id}</div>
          <div className="mt-1 text-xs text-text-muted">归属租户：{account.tenant}（{account.tenantId}）</div>
          <p className="mt-2 text-xs text-text-secondary">{account.note}</p>
        </div>
      </div>
      <div className="grid grid-cols-4 gap-3 text-xs">
        <InfoBox label="2FA 二步验证" value={account.has2fa ? '已启用' : '未开启'} />
        <InfoBox label="最近登录" value={account.lastLogin} />
        <InfoBox label="账号创建" value="2025-09-01 09:00" />
        <InfoBox label="状态" value={statusLabel(account.status)} />
      </div>
      <button onClick={onToggle2fa} className="inline-flex items-center gap-2 text-xs text-text-secondary hover:text-text-primary">{account.has2fa ? <ToggleRight className="h-5 w-5 text-accent-green" /> : <ToggleLeft className="h-5 w-5 text-text-muted" />} 切换二步验证</button>
      <div>
        <h3 className="mb-2 text-sm font-medium text-text-primary">角色分配（按租户视图）</h3>
        <div className="grid grid-cols-2 gap-2">{account.roles.map((role) => <div key={role} className="rounded-lg border border-border bg-bg-tertiary p-3 text-xs"><div className="text-text-primary">{role}</div><div className="mt-1 text-text-muted">{account.view} · 多角色会合并为最宽松字段权限。</div></div>)}</div>
      </div>
      <div>
        <h3 className="mb-2 text-sm font-medium text-text-primary">字段级权限矩阵（多角色合并 · 取最宽松）</h3>
        <table className="w-full text-xs"><thead><tr className="border-b border-border bg-bg-secondary/50"><th className="px-3 py-2 text-left text-text-muted">分组</th><th className="px-3 py-2 text-left text-text-muted">字段</th><th className="px-3 py-2 text-left text-text-muted">权限</th></tr></thead><tbody>{matrix.map((row) => <tr key={`${row.group}-${row.field}`} className="border-b border-border/50"><td className="px-3 py-2 text-text-secondary">{row.group}</td><td className="px-3 py-2 text-text-secondary">{row.field}</td><td className="px-3 py-2"><Badge color={row.permission === '明文' ? 'green' : row.permission === '脱敏聚合' ? 'blue' : 'gray'}>{row.permission}</Badge></td></tr>)}</tbody></table>
        <p className="mt-3 text-xs text-text-muted">字段级权限不可在此页直接编辑：变更敏感字段需通过角色调整，所有越权尝试会进入操作日志。</p>
      </div>
    </div>
  );
}

function InviteAccountWizard({ tenants, onInvite }: { tenants: TenantOption[]; onInvite: (account: AccountRow) => void | Promise<void> }): JSX.Element {
  const tenantCards = tenants.map((tenant) => ({
    id: tenant.id,
    shortName: tenant.shortName,
    name: tenant.name,
    view: tenant.type === 'ops' ? '运营视图' : '药企视图',
    scope: tenant.type === 'ops' ? '可见病种 全部 · 灰度 ≤ 100% · k=0' : '脱敏聚合视图 · 按租户范围授权',
    tenant: tenant.shortName,
  }));
  const steps = [
    ['选择租户', '决定可分配的视图'],
    ['账号信息', '姓名 / 邮箱 / 2FA'],
    ['视图与角色', '可多选 · 取最宽松合并'],
    ['字段权限预览', '确认后发出邀请'],
  ] as const;
  const [step, setStep] = useState(0);
  const [tenantSearch, setTenantSearch] = useState('');
  const [selectedTenantId, setSelectedTenantId] = useState('');
  const [error, setError] = useState('请选择归属租户。');
  const [form, setForm] = useState({ name: '', email: '', phone: '', roles: ['药企 · 合规'], require2fa: true });
  const selectedTenant = tenantCards.find((tenant) => tenant.id === selectedTenantId);
  const view = selectedTenant?.view === '运营视图' ? '运营视图' : '药企视图';
  const roleOptions = view === '运营视图' ? ['运营 · 平台管理员', '运营 · 内容审核员', '运营 · 分发执行员'] : ['药企 · 合规', '药企 · BD', '药企 · 市场'];
  const visibleTenants = tenantCards.filter((tenant) => `${tenant.name}${tenant.shortName}`.includes(tenantSearch));

  const update = (key: 'name' | 'email' | 'phone') => (event: React.ChangeEvent<HTMLInputElement>) => setForm((current) => ({ ...current, [key]: event.target.value }));
  const next = (): void => {
    if (step === 0 && !selectedTenant) { setError('请选择归属租户。'); return; }
    if (step === 1 && (!form.name.trim() || !form.email.trim())) { setError('姓名和邮箱必填。'); return; }
    if (step === 2 && form.roles.length === 0) { setError('至少选择一个角色。'); return; }
    setError('');
    setStep((current) => Math.min(current + 1, 3));
  };
  const toggleRole = (role: string): void => {
    setForm((current) => ({
      ...current,
      roles: current.roles.includes(role) ? current.roles.filter((item) => item !== role) : [...current.roles, role],
    }));
  };
  const submit = (): void => {
    if (!selectedTenant) return;
    onInvite({
      id: `A-${Date.now().toString().slice(-3)}`,
      name: form.name || '新成员',
      email: form.email || 'new@example.cn',
      tenant: selectedTenant.tenant,
      tenantId: selectedTenant.id,
      view,
      roles: form.roles,
      status: 'invited',
      has2fa: form.require2fa,
      lastLogin: '—',
      note: '通过账号邀请向导创建。',
    });
  };

  return (
    <div className="space-y-5">
      <p className="text-sm text-text-secondary">4 步完成账号邀请：选择租户、填写信息、分配视图与角色、预览字段权限。</p>
      <div className="rounded-lg border border-border bg-bg-tertiary p-4">
        <div className="text-xs text-text-muted">平台管理 · 邀请账号</div>
        <div className="mt-1 text-lg font-semibold text-text-primary">为指定租户邀请新账号</div>
        <p className="mt-1 text-xs text-text-muted">管理员设置归属租户后，候选角色将自动收窄到该租户允许的视图范围；本向导预览字段级权限矩阵，避免越权配置。</p>
      </div>
      <div className="grid grid-cols-4 gap-2">{steps.map(([title, desc], index) => <button key={title} onClick={() => setStep(index)} className={`rounded-lg border px-3 py-2 text-left ${step === index ? 'border-accent-blue bg-accent-blue/15' : 'border-border bg-bg-tertiary'}`}><div className="text-sm text-text-primary">{title}</div><div className="text-[10px] text-text-muted">{desc}</div></button>)}</div>
      {step === 0 && (
        <div className="space-y-3">
          <h3 className="text-sm font-medium text-text-primary">选择归属租户</h3>
          <p className="text-xs text-text-muted">账号将继承该租户的合规可见范围；草稿状态的租户不可邀请账号。</p>
          <input value={tenantSearch} onChange={(e) => setTenantSearch(e.target.value)} placeholder="搜索租户名 / 简称" className="w-full rounded-lg border border-border bg-bg-tertiary px-3 py-2 text-sm text-text-primary placeholder:text-text-muted" />
          <div className="grid grid-cols-2 gap-2">{visibleTenants.map((tenant) => <button key={tenant.id} onClick={() => { setSelectedTenantId(tenant.id); setError(''); }} className={`rounded-lg border p-3 text-left ${selectedTenantId === tenant.id ? 'border-accent-blue bg-accent-blue/15' : 'border-border bg-bg-tertiary'}`}><div className="text-sm text-text-primary">{tenant.shortName}</div><div className="text-xs text-text-secondary">{tenant.name}</div><div className="mt-1 text-[10px] text-text-muted">{tenant.view} · {tenant.tenant}</div><div className="mt-1 text-[10px] text-text-muted">{tenant.scope}</div></button>)}</div>
        </div>
      )}
      {step === 1 && (
        <div className="grid grid-cols-2 gap-3">
          <Field label="姓名*" value={form.name} onChange={update('name')} placeholder="例：宋知节" />
          <Field label="邮箱*" value={form.email} onChange={update('email')} placeholder="songzj@example.cn" />
          <Field label="联系电话" value={form.phone} onChange={update('phone')} placeholder="+86 138-0000-0000" />
          <label className="flex items-center gap-2 rounded-lg border border-border bg-bg-tertiary px-3 py-2 text-xs text-text-secondary"><input type="checkbox" checked={form.require2fa} onChange={(e) => setForm((current) => ({ ...current, require2fa: e.target.checked }))} /> 要求首次登录开启 2FA</label>
        </div>
      )}
      {step === 2 && <div className="grid grid-cols-3 gap-2">{roleOptions.map((role) => <button key={role} onClick={() => toggleRole(role)} className={`rounded-lg border p-3 text-left text-sm ${form.roles.includes(role) ? 'border-accent-blue bg-accent-blue/15 text-accent-blue' : 'border-border bg-bg-tertiary text-text-secondary'}`}>{role}<div className="mt-1 text-[10px] text-text-muted">{view}</div></button>)}</div>}
      {step === 3 && (
        <div className="space-y-3">
          <div className="rounded-lg border border-border bg-bg-tertiary p-3 text-xs text-text-secondary">{form.name || '未填写'} · {form.email || '未填写'} · {selectedTenant?.tenant ?? '未选择租户'} · {form.roles.join(' / ')}</div>
          <table className="w-full text-xs"><thead><tr className="border-b border-border bg-bg-secondary/50"><th className="px-3 py-2 text-left text-text-muted">分组</th><th className="px-3 py-2 text-left text-text-muted">字段</th><th className="px-3 py-2 text-left text-text-muted">权限</th></tr></thead><tbody>{permissionMatrix(view, form.roles).map((row) => <tr key={`${row.group}-${row.field}`} className="border-b border-border/50"><td className="px-3 py-2 text-text-secondary">{row.group}</td><td className="px-3 py-2 text-text-secondary">{row.field}</td><td className="px-3 py-2"><Badge color={row.permission === '明文' ? 'green' : row.permission === '脱敏聚合' ? 'blue' : 'gray'}>{row.permission}</Badge></td></tr>)}</tbody></table>
        </div>
      )}
      {error && <div className="text-xs text-accent-red">{error}</div>}
      <div className="flex justify-end gap-2"><Button variant="secondary" disabled={step === 0} onClick={() => setStep((current) => Math.max(current - 1, 0))}>上一步</Button>{step < 3 ? <Button onClick={next}>下一步</Button> : <Button onClick={submit}>发送邀请</Button>}</div>
    </div>
  );
}

function Field({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (event: React.ChangeEvent<HTMLInputElement>) => void; placeholder: string }): JSX.Element {
  return <label className="block text-xs text-text-muted">{label}<input value={value} onChange={onChange} placeholder={placeholder} className="mt-1 w-full rounded-lg border border-border bg-bg-tertiary px-3 py-2 text-sm text-text-primary placeholder:text-text-muted" /></label>;
}

function InfoBox({ label, value }: { label: string; value: string }): JSX.Element {
  return <div className="rounded-lg border border-border bg-bg-tertiary p-3"><div className="text-text-muted">{label}</div><div className="mt-1 text-text-primary">{value}</div></div>;
}

function permissionMatrix(view: '运营视图' | '药企视图', roles: string[]): Array<{ group: string; field: string; permission: '明文' | '脱敏聚合' | '不可见' }> {
  const isOps = view === '运营视图';
  const canManagePlatform = roles.includes('运营 · 平台管理员');
  const canExport = isOps || roles.includes('药企 · 合规');
  return [
    { group: '身份字段', field: '姓名 / 手机 / 证件 / 就诊识别', permission: '不可见' },
    { group: '行为', field: '项目 / 内容 / 日期聚合指标', permission: '脱敏聚合' },
    { group: '行为', field: '低于 k-匿名阈值的小样本单元', permission: '不可见' },
    { group: '内容', field: '内容草稿', permission: isOps ? '明文' : '脱敏聚合' },
    { group: '内容', field: '审核流转记录', permission: isOps ? '明文' : '脱敏聚合' },
    { group: '内容', field: '分发与触达', permission: isOps ? '明文' : '脱敏聚合' },
    { group: '行为', field: '数据导出敏感', permission: canExport ? (isOps ? '明文' : '脱敏聚合') : '不可见' },
    { group: '选题需求', field: '提交需求', permission: isOps ? '不可见' : '明文' },
    { group: '选题需求', field: '审批/受理', permission: isOps ? '明文' : '脱敏聚合' },
    { group: '平台管理', field: '租户管理敏感', permission: canManagePlatform ? '明文' : '不可见' },
    { group: '平台管理', field: '账号管理敏感', permission: canManagePlatform ? '明文' : '不可见' },
  ];
}
