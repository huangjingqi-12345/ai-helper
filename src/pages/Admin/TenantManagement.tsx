import { useEffect, useMemo, useState } from 'react';
import { Building2, ChevronRight, Search, ToggleLeft, ToggleRight } from 'lucide-react';
import { PageHeader } from '@/components/PageHeader';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Modal } from '@/components/ui/Modal';
import { Select } from '@/components/ui/Select';
import { showToast } from '@/components/ui/Toast';
import { useLogger } from '@/hooks/useLogger';
import { createTenant as createTenantApi, getTenants, updateTenantStatus } from '@/api/endpoints/platform';
import type { TenantRow, TenantStatus } from '@/types/platform';

const STATUS_OPTIONS = [
  { value: '', label: '全部状态' },
  { value: 'active', label: '已启用' },
  { value: 'inactive', label: '已停用' },
  { value: 'draft', label: '草稿' },
];

function statusLabel(status: TenantStatus): string {
  if (status === 'active') return '已启用';
  if (status === 'inactive') return '已停用';
  return '草稿';
}

function statusColor(status: TenantStatus): 'green' | 'gray' | 'yellow' {
  if (status === 'active') return 'green';
  if (status === 'inactive') return 'gray';
  return 'yellow';
}

export function TenantManagement(): JSX.Element {
  const { log } = useLogger('TenantManagement');
  const [tenants, setTenants] = useState<TenantRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [selectedTenant, setSelectedTenant] = useState<TenantRow | null>(null);

  const loadTenants = async (): Promise<void> => {
    setLoading(true);
    try {
      const res = await getTenants();
      setTenants(res.data);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadTenants();
  }, []);

  const filtered = useMemo(() => tenants.filter((t) => {
    if (statusFilter && t.status !== statusFilter) return false;
    const haystack = `${t.name}${t.shortName}${t.contract}${t.contact}`.toLowerCase();
    if (search && !haystack.includes(search.toLowerCase())) return false;
    return true;
  }), [search, statusFilter, tenants]);

  const activeTenants = tenants.filter((t) => t.status === 'active').length;
  const pharma = tenants.filter((t) => t.type === '药企租户').length;
  const totalAccounts = tenants.reduce((sum, t) => sum + t.accounts, 0);

  const toggleTenantStatus = async (id: string): Promise<void> => {
    const currentTenant = tenants.find((tenant) => tenant.id === id);
    if (!currentTenant) return;
    const nextStatus: TenantStatus = currentTenant.status === 'active' ? 'inactive' : 'active';
    try {
      const res = await updateTenantStatus(id, nextStatus);
      setTenants((current) => current.map((tenant) => tenant.id === id ? res.data : tenant));
      setSelectedTenant((current) => current?.id === id ? res.data : current);
      log.action('Toggle tenant', { id, status: nextStatus });
      showToast('租户状态已更新并写入 SQLite', 'success');
    } catch (error) {
      log.error('Toggle tenant failed', error);
      showToast('租户状态更新失败，请检查后端服务', 'error');
    }
  };

  const addTenant = async (tenant: TenantRow): Promise<void> => {
    try {
      const res = await createTenantApi(tenant);
      setTenants((current) => [res.data, ...current.filter((item) => item.id !== res.data.id)]);
      setCreateOpen(false);
      showToast('租户已创建并写入 SQLite，首位管理员邀请已发送', 'success');
    } catch (error) {
      log.error('Create tenant failed', error);
      showToast('租户创建失败，请检查后端服务', 'error');
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="平台管理 · 租户管理"
        title="租户与可见范围"
        subtitle="按租户维度配置药企可见的脱敏聚合范围（病种 / 品牌 / 区域）与账号隔离，确保合规墙不被穿透。"
        actions={
          <Button onClick={() => { log.action('Add tenant clicked'); setCreateOpen(true); }}>
            <Building2 className="h-4 w-4" />
            新增租户
          </Button>
        }
      />

      <div className="grid grid-cols-5 gap-3">
        <Card className="bg-card/60 p-4"><div className="text-[11px] uppercase tracking-wider text-muted-foreground">全部租户</div><div className="mt-2 text-2xl font-semibold tabular text-foreground">{tenants.length}</div></Card>
        <Card className="bg-card/60 p-4"><div className="text-[11px] uppercase tracking-wider text-muted-foreground">药企租户</div><div className="mt-2 text-2xl font-semibold tabular text-amber-300">{pharma}</div></Card>
        <Card className="bg-card/60 p-4"><div className="text-[11px] uppercase tracking-wider text-muted-foreground">已启用</div><div className="mt-2 text-2xl font-semibold tabular text-emerald-300">{activeTenants}</div></Card>
        <Card className="bg-card/60 p-4"><div className="text-[11px] uppercase tracking-wider text-muted-foreground">已停用</div><div className="mt-2 text-2xl font-semibold tabular text-rose-300">{tenants.length - activeTenants}</div></Card>
        <Card className="bg-card/60 p-4"><div className="text-[11px] uppercase tracking-wider text-muted-foreground">账号合计</div><div className="mt-2 text-2xl font-semibold tabular text-sky-300">{totalAccounts}</div></Card>
      </div>

      <Card className="overflow-hidden border-border bg-card/40 p-0">
        <div className="flex items-center gap-4 border-b border-border/60 px-4 py-3">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
            <input type="text" placeholder="搜索租户名 / 简称 / 合同号 / 联系人" value={search} onChange={(e) => setSearch(e.target.value)} className="w-full pl-9 pr-4 py-2 bg-bg-tertiary border border-border rounded-lg text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-1 focus:ring-accent-blue" />
          </div>
          <Select options={STATUS_OPTIONS} value={statusFilter} onChange={setStatusFilter} />
          <span className="text-xs text-text-muted ml-auto">{filtered.length} / {tenants.length} 条</span>
        </div>

        <table className="w-full">
          <thead>
            <tr className="border-b border-border bg-card/70">
              <th className="px-4 py-3 text-left text-xs font-medium text-text-muted">租户</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-text-muted">类型 / 状态</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-text-muted">合同 / 联系人</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-text-muted">可见范围</th>
              <th className="px-4 py-3 text-center text-xs font-medium text-text-muted">账号</th>
              <th className="px-4 py-3 text-center text-xs font-medium text-text-muted">操作</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr><td colSpan={6} className="px-4 py-10 text-center text-sm text-text-muted">正在从 SQLite 加载租户...</td></tr>
            )}
            {!loading && filtered.map((t) => (
              <tr key={t.id} className="cursor-pointer border-b border-border/50 transition-colors hover:bg-secondary/40">
                <td className="px-4 py-3">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-accent-blue/20 flex items-center justify-center text-accent-blue text-xs font-bold">{t.shortName.slice(0, 2)}</div>
                    <div>
                      <div className="text-sm font-medium text-text-primary">{t.name}</div>
                      <div className="text-xs text-text-muted">{t.id} · {t.shortName}</div>
                    </div>
                  </div>
                </td>
                <td className="px-4 py-3">
                  <Badge color={t.type === '自营' ? 'purple' : 'blue'}>{t.type}</Badge>
                  <Badge color={statusColor(t.status)} className="ml-1">{statusLabel(t.status)}</Badge>
                </td>
                <td className="px-4 py-3">
                  <div className="text-xs text-text-secondary">{t.contract}</div>
                  <div className="text-xs text-text-muted">{t.contact}</div>
                </td>
                <td className="px-4 py-3">
                  <div className="flex flex-wrap gap-1">
                    <span className="text-[10px] px-1.5 py-0.5 bg-bg-tertiary rounded text-text-muted">{t.diseaseScope}</span>
                    <span className="text-[10px] px-1.5 py-0.5 bg-bg-tertiary rounded text-text-muted">{t.gray}</span>
                    <span className="text-[10px] px-1.5 py-0.5 bg-bg-tertiary rounded text-text-muted">{t.kAnon}</span>
                  </div>
                  <span className={`text-[10px] mt-0.5 block ${t.canExport ? 'text-accent-blue' : 'text-text-muted'}`}>{t.canExport ? '可导出' : '禁导出'}</span>
                </td>
                <td className="px-4 py-3 text-center text-sm font-mono text-text-secondary">{t.accounts} / {t.accounts}</td>
                <td className="px-4 py-3">
                  <div className="flex items-center justify-center gap-2">
                    <button aria-label={`${statusLabel(t.status)} ${t.shortName}`} onClick={() => toggleTenantStatus(t.id)} className="text-xl">
                      {t.status === 'active' ? <ToggleRight className="w-6 h-6 text-accent-green" /> : <ToggleLeft className="w-6 h-6 text-text-muted" />}
                    </button>
                    <button onClick={() => { log.action('View tenant details', { id: t.id }); setSelectedTenant(t); }} className="text-xs text-accent-blue flex items-center gap-0.5 hover:underline">
                      详情 <ChevronRight size={12} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      <Modal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title="新建租户"
        maxWidth="max-w-4xl"
        footer={<Button variant="secondary" onClick={() => setCreateOpen(false)}>Close</Button>}
      >
        <AddTenantWizard onCreate={addTenant} />
      </Modal>

      <Modal open={!!selectedTenant} onClose={() => setSelectedTenant(null)} title="租户详情" maxWidth="max-w-3xl" footer={<Button variant="secondary" onClick={() => setSelectedTenant(null)}>Close</Button>}>
        {selectedTenant && <TenantDetail tenant={selectedTenant} onToggle={() => toggleTenantStatus(selectedTenant.id)} />}
      </Modal>
    </div>
  );
}

function TenantDetail({ tenant, onToggle }: { tenant: TenantRow; onToggle: () => void }): JSX.Element {
  const accountNames = tenant.id === 'T-PX'
    ? ['齐晓川 · qixc@px.health', '陆玟昕 · luwx@px.health', '祝景琰 · zhujy@px.health', '顾翊辰 · guyc@px.health', '邵书珩 · shaosh@px.health', '钟锦盛 · zhongjs@px.health']
    : ['合规管理员 · compliance@example.cn', 'BD 负责人 · bd@example.cn', '市场负责人 · marketing@example.cn'].slice(0, Math.max(tenant.accounts, 1));

  return (
    <div className="space-y-5">
      <p className="text-sm text-text-secondary">查看与配置租户可见范围、账号列表与合规口径。</p>
      <div className="flex items-start gap-3 rounded-lg border border-border bg-bg-tertiary p-4">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-accent-blue/20 text-sm font-bold text-accent-blue">{tenant.shortName.slice(0, 2)}</div>
        <div className="flex-1">
          <div className="flex items-center gap-2"><span className="text-base font-semibold text-text-primary">{tenant.name}</span><Badge color={statusColor(tenant.status)}>{statusLabel(tenant.status)}</Badge></div>
          <div className="mt-1 text-xs text-text-muted">{tenant.id} · {tenant.type} · 合同 {tenant.contract}</div>
          <div className="mt-1 text-xs text-text-muted">联系人：{tenant.contact}</div>
          <p className="mt-2 text-xs text-text-secondary">{tenant.description}</p>
        </div>
      </div>
      <div>
        <h3 className="mb-3 text-sm font-medium text-text-primary">可见范围配置（按租户的合规口径）</h3>
        <div className="grid grid-cols-2 gap-3 text-xs">
          <InfoBox label="病种范围" value={tenant.diseaseScope} />
          <InfoBox label="品牌范围" value={tenant.brandScope} />
          <InfoBox label="区域范围" value={tenant.regionScope} />
          <InfoBox label="灰度比例上限" value={tenant.gray.replace('灰度 ≤ ', '')} />
          <InfoBox label="k-匿名阈值（k=）" value={tenant.kAnon.replace('k-匿 ', '')} />
          <div className="rounded-lg border border-border bg-bg-tertiary p-3">
            <div className="text-text-muted">允许租户导出脱敏聚合 CSV</div>
            <button onClick={onToggle} className="mt-2 inline-flex items-center gap-2 text-text-secondary">{tenant.canExport ? <ToggleRight className="h-5 w-5 text-accent-green" /> : <ToggleLeft className="h-5 w-5 text-text-muted" />} {tenant.canExport ? '已允许' : '未允许'}</button>
          </div>
        </div>
      </div>
      <div>
        <div className="mb-3 flex items-center justify-between"><h3 className="text-sm font-medium text-text-primary">关联账号 · {tenant.accounts} 人</h3><Button size="sm" variant="secondary" onClick={() => showToast('请前往账号管理完成邀请', 'info')}>邀请账号</Button></div>
        <div className="grid grid-cols-2 gap-2">
          {accountNames.map((account) => <div key={account} className="rounded-lg border border-border bg-bg-tertiary px-3 py-2 text-xs text-text-secondary">{account}<span className="float-right text-accent-green">已激活</span></div>)}
        </div>
      </div>
      <div className="text-xs text-text-muted">创建于 2025-09-01 09:00 · 最后变更 2026-04-28 09:00</div>
    </div>
  );
}

function InfoBox({ label, value }: { label: string; value: string }): JSX.Element {
  return <div className="rounded-lg border border-border bg-bg-tertiary p-3"><div className="text-text-muted">{label}</div><div className="mt-1 text-text-primary">{value}</div></div>;
}

function AddTenantWizard({ onCreate }: { onCreate: (tenant: TenantRow) => void | Promise<void> }): JSX.Element {
  const steps = [
    ['基础信息', '租户身份与主联系人'],
    ['合规可见范围', '病种 / 品牌 / 灰度 / k-匿'],
    ['邀请管理员', '首位药企方管理员'],
    ['摘要确认', '提交后生成租户与账号'],
  ] as const;
  const [step, setStep] = useState(0);
  const [error, setError] = useState('租户名称必填。');
  const [form, setForm] = useState({ name: '', shortName: '', contract: '', phone: '', contactName: '', contactEmail: '', note: '', diseaseScope: '慢性心力衰竭 / 乳腺癌', gray: '50', kAnon: '50', adminName: '', adminEmail: '' });

  const update = (key: keyof typeof form) => (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setForm((current) => ({ ...current, [key]: event.target.value }));
  const next = (): void => {
    if (step === 0 && (!form.name.trim() || !form.shortName.trim() || !form.contactName.trim() || !form.contactEmail.trim())) {
      setError('租户名称、简称、主联系人与邮箱必填。');
      return;
    }
    if (step === 2 && (!form.adminName.trim() || !form.adminEmail.trim())) {
      setError('首位管理员姓名和邮箱必填。');
      return;
    }
    setError('');
    setStep((current) => Math.min(current + 1, 3));
  };

  const create = (): void => {
    onCreate({
      id: `T-NEW-${Date.now().toString().slice(-4)}`,
      name: form.name || '新药企租户',
      shortName: form.shortName || '新租户',
      type: '药企租户',
      status: 'active',
      contract: form.contract || '未签约',
      contact: `${form.contactName || form.adminName} · ${form.contactEmail || form.adminEmail}`,
      description: form.note || '通过新建租户向导创建。',
      diseaseScope: form.diseaseScope,
      brandScope: '待配置品牌',
      regionScope: '全国',
      gray: `灰度 ≤ ${form.gray}%`,
      kAnon: `k-匿 ${form.kAnon}`,
      accounts: 1,
      canExport: true,
    });
  };

  return (
    <div className="space-y-5">
      <p className="text-sm text-text-secondary">4 步完成药企租户创建：基础信息、合规可见范围、首位管理员、摘要确认。</p>
      <div className="rounded-lg border border-border bg-bg-tertiary p-4">
        <div className="text-xs text-text-muted">平台管理 · 新建租户</div>
        <div className="mt-1 text-lg font-semibold text-text-primary">创建一家药企租户</div>
        <p className="mt-1 text-xs text-text-muted">通过 4 步完成租户登记、合规口径设置与首位管理员邀请；提交后系统将立即生效，新管理员将收到激活邮件。</p>
      </div>
      <div className="grid grid-cols-4 gap-2">
        {steps.map(([title, desc], index) => (
          <button key={title} onClick={() => setStep(index)} className={`rounded-lg border px-3 py-2 text-left ${step === index ? 'border-accent-blue bg-accent-blue/15' : 'border-border bg-bg-tertiary'}`}>
            <div className="text-sm text-text-primary">{title}</div><div className="text-[10px] text-text-muted">{desc}</div>
          </button>
        ))}
      </div>
      {step === 0 && (
        <div className="space-y-4">
          <h3 className="text-sm font-medium text-text-primary">租户身份</h3>
          <p className="text-xs text-text-muted">此处信息将作为租户的法人主体登记，用于合同与对外披露。</p>
          <div className="grid grid-cols-2 gap-3">
            <Field label="租户名称（法人主体）*" value={form.name} onChange={update('name')} placeholder="例：诺华制药（中国）有限公司" />
            <Field label="租户简称（≤12 字）*" value={form.shortName} onChange={update('shortName')} placeholder="例：诺华" />
            <Field label="合同号" value={form.contract} onChange={update('contract')} placeholder="例：PXC-2026-A006" />
            <Field label="主联系电话" value={form.phone} onChange={update('phone')} placeholder="+86 138-0000-0000" />
            <Field label="主联系人姓名*" value={form.contactName} onChange={update('contactName')} placeholder="例：林筱" />
            <Field label="主联系人邮箱*" value={form.contactEmail} onChange={update('contactEmail')} placeholder="compliance@novartis.cn" />
          </div>
          <label className="block text-xs text-text-muted">备注<textarea value={form.note} onChange={update('note')} placeholder="例：心血管 + 肿瘤双线，仅限相关药品的脱敏聚合。" className="mt-1 h-20 w-full rounded-lg border border-border bg-bg-tertiary px-3 py-2 text-sm text-text-primary placeholder:text-text-muted" /></label>
        </div>
      )}
      {step === 1 && (
        <div className="grid grid-cols-3 gap-3">
          <Field label="病种范围" value={form.diseaseScope} onChange={update('diseaseScope')} placeholder="例：慢性心力衰竭 / 乳腺癌" />
          <Field label="灰度比例上限（%）" value={form.gray} onChange={update('gray')} placeholder="50" />
          <Field label="k-匿名阈值" value={form.kAnon} onChange={update('kAnon')} placeholder="50" />
          <div className="col-span-3 rounded-lg border border-border bg-bg-tertiary p-3 text-xs text-text-muted">所有聚合指标低于 k 阈值时将被屏蔽；导出范围默认仅包含脱敏聚合 CSV。</div>
        </div>
      )}
      {step === 2 && (
        <div className="grid grid-cols-2 gap-3">
          <Field label="管理员姓名*" value={form.adminName} onChange={update('adminName')} placeholder="例：宋知节" />
          <Field label="管理员邮箱*" value={form.adminEmail} onChange={update('adminEmail')} placeholder="admin@example.cn" />
          <div className="col-span-2 rounded-lg border border-border bg-bg-tertiary p-3 text-xs text-text-muted">首位管理员默认拥有药企视图、合规审核与脱敏聚合导出权限，可后续在账号管理中调整。</div>
        </div>
      )}
      {step === 3 && (
        <div className="space-y-2 rounded-lg border border-border bg-bg-tertiary p-4 text-sm text-text-secondary">
          <div>租户：{form.name || '未填写'}（{form.shortName || '未填写'}）</div>
          <div>联系人：{form.contactName || form.adminName || '未填写'} · {form.contactEmail || form.adminEmail || '未填写'}</div>
          <div>范围：{form.diseaseScope} · 灰度 ≤ {form.gray}% · k={form.kAnon}</div>
          <div>提交后生成租户与首位管理员账号。</div>
        </div>
      )}
      {error && <div className="text-xs text-accent-red">{error}</div>}
      <div className="flex justify-end gap-2">
        <Button variant="secondary" disabled={step === 0} onClick={() => setStep((current) => Math.max(current - 1, 0))}>上一步</Button>
        {step < 3 ? <Button onClick={next}>下一步</Button> : <Button onClick={create}>创建租户</Button>}
      </div>
    </div>
  );
}

function Field({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (event: React.ChangeEvent<HTMLInputElement>) => void; placeholder: string }): JSX.Element {
  return (
    <label className="block text-xs text-text-muted">
      {label}
      <input value={value} onChange={onChange} placeholder={placeholder} className="mt-1 w-full rounded-lg border border-border bg-bg-tertiary px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-1 focus:ring-accent-blue" />
    </label>
  );
}
