import { useMemo, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { clsx } from 'clsx';
import {
  Activity,
  AlertTriangle,
  BadgeCheck,
  BadgeDollarSign,
  Banknote,
  Building2,
  ChevronRight,
  Clock4,
  FileBadge,
  FileSignature,
  FileText,
  Hash,
  Receipt,
  Repeat2,
  Send,
  ShieldCheck,
  Wallet,
  TrendingUp,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { PageHeader } from '@/components/PageHeader';
import { KpiCard } from '@/components/KpiCard';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { showToast } from '@/components/ui/Toast';
import {
  FIN_BILL_STATUS_LABEL,
  FIN_BILL_STATUS_TONE,
  FIN_INVOICE_STATUS_LABEL,
  FIN_PLAN_GROUP_LABEL,
  FIN_RECON_STATUS_LABEL,
  FIN_TIER_META,
  FIN_VALUE_METRIC_LABEL,
  finBills,
  finBudgets,
  finContracts,
  finDunnings,
  finInvoices,
  finKpiSnapshot,
  finReconciliations,
  finSubscriptions,
  finTenants,
  finTrend,
  finValueReports,
  fmtMoney,
  type FinBill,
  type FinBillStatus,
  type FinContract,
  type FinInvoice,
  type FinPlanGroup,
  type FinSubscriptionTier,
  type FinValueMetric,
  type FinValueReport,
} from '@/data/finance';

type Tone = 'default' | 'warn';

export function FinanceOverview(): JSX.Element {
  const k = finKpiSnapshot;
  const overdueCount = finBills.filter((bill) => bill.status === 'overdue').length;
  const pendingInvoiceCount = finBills.filter((bill) => bill.status === 'confirmed').length;
  const pendingReconCount = finReconciliations.filter((recon) => recon.status === 'disputed').length;
  const generatedThisMonth = finBills.filter((bill) => bill.period === '2026-04').length;

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="P2 · Finance"
        title="业财总览"
        subtitle="把客户合同到账单、对账与开票串成一条流水线，确保固定费收入按月自动确认；该模块与患教内容、分发策略、医生池逻辑完全隔离。"
        meta={
          <>
            <span className="rounded-md border border-border bg-secondary/40 px-2 py-1 text-[11.5px] text-muted-foreground">数据周期：2026-01 ~ 2026-05</span>
            <span className="rounded-md border border-border bg-secondary/40 px-2 py-1 text-[11.5px] text-muted-foreground">所有金额以人民币元为单位</span>
          </>
        }
      />

      <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
        <KpiCard icon={Wallet} label="月度经常性收入" value={fmtMoney(k.monthlyRecurring, { unit: 'wan' })} hint={`${k.contractCount} 份生效合同 · ${k.activeTenants} 家活跃客户`} />
        <KpiCard icon={TrendingUp} label="累计签约金额" value={fmtMoney(k.totalSigned, { unit: 'wan' })} hint={`年度预测 ${fmtMoney(k.yearlyForecast, { unit: 'wan' })}`} />
        <KpiCard icon={Receipt} label="已回款金额" value={fmtMoney(k.cashCollected, { unit: 'wan' })} hint={`回款率 ${(k.collectionRate * 100).toFixed(1)}%`} />
        <KpiCard icon={AlertTriangle} label="逾期金额" value={fmtMoney(k.overdueAmount, { unit: 'wan' })} hint={`${overdueCount} 张账单逾期 · 已触发催款`} className="[&_.tabular]:text-[oklch(82%_.18_25)]" />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="rounded-xl border border-border bg-card p-5 lg:col-span-2">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-[13.5px] font-semibold tracking-tight">收入与回款趋势</div>
              <div className="mt-0.5 text-[11.5px] text-muted-foreground">按月汇总：签约新增 / 收入确认 / 实际回款</div>
            </div>
            <span className="rounded-md border border-border bg-secondary/40 px-2 py-1 text-[11px] text-muted-foreground tabular">单位：万元</span>
          </div>
          <div className="mt-4 h-[260px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={finTrend.map((point) => ({
                  month: `${point.month.slice(5)}月`,
                  signed: point.signed / 10000,
                  recognized: point.recognized / 10000,
                  collected: point.collected / 10000,
                }))}
                margin={{ top: 10, right: 8, left: -16, bottom: 0 }}
              >
                <CartesianGrid stroke="oklch(28% .02 260)" strokeDasharray="3 4" vertical={false} />
                <XAxis dataKey="month" stroke="oklch(60% .02 260)" tickLine={false} axisLine={false} />
                <YAxis stroke="oklch(60% .02 260)" tickLine={false} axisLine={false} />
                <Tooltip
                  contentStyle={{ background: 'oklch(20% .02 260)', border: '1px solid oklch(30% .02 260)', borderRadius: 8, fontSize: 12 }}
                  formatter={(value: number) => [`${value.toFixed(0)} 万`, '']}
                />
                <Bar dataKey="signed" name="签约 MRR" fill="oklch(58% .14 240)" radius={[4, 4, 0, 0]} />
                <Bar dataKey="recognized" name="收入确认" fill="oklch(72% .14 195)" radius={[4, 4, 0, 0]} />
                <Bar dataKey="collected" name="实际回款" fill="oklch(72% .15 165)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="rounded-xl border border-border bg-card p-5">
          <div className="text-[13.5px] font-semibold tracking-tight">三组预算占用</div>
          <div className="mt-0.5 text-[11.5px] text-muted-foreground">按 BD 组 · 2026 年度</div>
          <ul className="mt-4 space-y-3">
            {finBudgets.map((budget) => {
              const usage = budget.committed / budget.cap;
              const recognizedPct = budget.recognized / budget.cap;
              return (
                <li key={budget.id} className="rounded-md border border-border bg-secondary/30 p-3">
                  <div className="flex items-center justify-between text-[12.5px]">
                    <span className="font-medium text-foreground">{FIN_PLAN_GROUP_LABEL[budget.group]}</span>
                    <span className="text-muted-foreground tabular">{fmtMoney(budget.committed, { unit: 'wan' })} / {fmtMoney(budget.cap, { unit: 'wan' })}</span>
                  </div>
                  <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[oklch(20%_.02_260)]">
                    <div className="h-full rounded-full bg-[oklch(70%_.14_220)]" style={{ width: `${Math.min(100, usage * 100)}%` }} />
                  </div>
                  <div className="mt-1 flex items-center justify-between text-[11px] text-muted-foreground">
                    <span>占用 {(usage * 100).toFixed(1)}%</span>
                    <span>已确认收入 {(recognizedPct * 100).toFixed(1)}%</span>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
        <ModuleCard
          to="/finance/contracts"
          icon={FileSignature}
          title="合同与订阅"
          desc="租户主数据 · P2 智能体合同 · 订阅版本"
          stats={[{ label: '活跃合同', value: `${finContracts.filter((contract) => contract.status === 'active').length} 份` }, { label: '待签订单', value: `${finContracts.filter((contract) => contract.status === 'pending_sign').length} 份` }]}
        />
        <ModuleCard
          to="/finance/billing"
          icon={Receipt}
          title="账单引擎"
          desc="月度自动排期 · 对账 · 催款联动"
          stats={[{ label: '本月生成', value: `${generatedThisMonth} 张` }, { label: '对账异议', value: `${pendingReconCount} 单` }]}
          tone={pendingReconCount > 0 ? 'warn' : 'default'}
        />
        <ModuleCard
          to="/finance/invoicing"
          icon={BadgeDollarSign}
          title="价值交付与开票"
          desc="月度价值报告 · 一键转开票指令"
          stats={[{ label: '已生成报告', value: `${finValueReports.length} 份` }, { label: '待开票', value: `${pendingInvoiceCount} 张` }, { label: '已开发票', value: `${finInvoices.length} 张` }]}
        />
        <ModuleCard
          to="/finance/data"
          icon={Building2}
          title="业财数据基座"
          desc="客户主数据 · 收入 / 回款 / 预算 · KPI"
          stats={[{ label: '活跃客户', value: `${k.activeTenants} 家` }, { label: '回款率', value: `${(k.collectionRate * 100).toFixed(1)}%` }]}
        />
      </div>

      <div className="rounded-xl border border-border bg-card p-5">
        <div className="text-[13.5px] font-semibold tracking-tight">业财待办速览</div>
        <div className="mt-0.5 text-[11.5px] text-muted-foreground">按优先级排序 · 仅展示当前需 CSM 或财务介入的事项</div>
        <ul className="mt-4 grid grid-cols-1 gap-2 md:grid-cols-3">
          <TodoItem icon={AlertTriangle} tone="danger" label={`${overdueCount} 张账单已逾期`} sub={`合计 ${fmtMoney(k.overdueAmount, { unit: 'wan' })} · 已触发 ${finDunnings.length} 条催款`} link="/finance/billing" />
          <TodoItem icon={Receipt} tone="warn" label={`${pendingReconCount} 单对账异议待处理`} sub="客户主张服务量不足，需 CSM 联合 BD 复核" link="/finance/billing" />
          <TodoItem icon={BadgeDollarSign} tone="info" label={`${pendingInvoiceCount} 张账单待转开票`} sub="客户已对账确认，等待财务一键申请发票" link="/finance/invoicing" />
        </ul>
      </div>
    </div>
  );
}

export function FinanceContracts(): JSX.Element {
  const [keyword, setKeyword] = useState('');
  const [groupFilter, setGroupFilter] = useState<FinPlanGroup | 'all'>('all');
  const [tierFilter, setTierFilter] = useState<FinSubscriptionTier | 'all'>('all');
  const [openId, setOpenId] = useState<string | null>(null);

  const rows = useMemo(() => finContracts
    .map((contract) => ({
      contract,
      tenant: finTenants.find((tenant) => tenant.id === contract.tenantId)!,
      sub: finSubscriptions.find((sub) => sub.contractId === contract.id),
    }))
    .filter((row) => {
      if (groupFilter !== 'all' && row.tenant.group !== groupFilter) return false;
      if (tierFilter !== 'all' && row.contract.tier !== tierFilter) return false;
      if (keyword.trim()) {
        const k = keyword.trim().toLowerCase();
        return row.tenant.legalName.toLowerCase().includes(k) || row.contract.no.toLowerCase().includes(k);
      }
      return true;
    }), [groupFilter, keyword, tierFilter]);

  const open = openId ? rows.find((row) => row.contract.id === openId) ?? null : null;
  const totalMrr = finSubscriptions.reduce((sum, item) => sum + item.monthlyFee, 0);

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="P2 · Module 1"
        title="客户合同与订阅"
        subtitle="P2 业财链路的总开关：客户主数据 + 合同条款 + 订阅版本三位一体；账单引擎从这里拉取月费规则。"
        actions={
          <>
            <Button variant="secondary" size="sm" onClick={() => showToast('演示版：已下载合同导入模板', 'info')}>导入模板</Button>
            <Button size="sm" className="border-primary bg-primary text-primary-foreground hover:bg-primary/90" onClick={() => showToast('已创建草拟合同，等待补充条款', 'success')}><FileText className="h-3.5 w-3.5" /> 新建合同</Button>
          </>
        }
      />

      <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
        <KpiCard icon={FileSignature} label="生效合同" value={`${finContracts.filter((contract) => contract.status === 'active').length}`} unit="份" />
        <KpiCard icon={Repeat2} label="活跃订阅" value={`${finSubscriptions.length}`} unit="条" hint="月费随订阅版本自动派生" />
        <KpiCard icon={Wallet} label="月度经常性收入" value={fmtMoney(totalMrr, { unit: 'wan' })} unit="/ 月" />
        <KpiCard icon={Clock4} label="待签订单" value={`${finContracts.filter((contract) => contract.status === 'pending_sign').length}`} unit="份" />
      </div>

      <div className="rounded-xl border border-border bg-card">
        <div className="flex flex-wrap items-center gap-2 border-b border-border px-5 py-3">
          <input value={keyword} onChange={(event) => setKeyword(event.target.value)} placeholder="搜索客户法定全称 / 合同编号" className="h-8 max-w-xs rounded-md border border-border bg-bg-tertiary px-3 text-[12.5px] text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary" />
          <ChipGroup label="承接小组" value={groupFilter} options={[{ v: 'all', t: '全部' }, { v: 'px1', t: 'Px1 大禹' }, { v: 'px2', t: 'Px2 盘古' }, { v: 'px3', t: 'Px3 星火' }]} onChange={(value) => setGroupFilter(value as FinPlanGroup | 'all')} />
          <ChipGroup label="版本" value={tierFilter} options={[{ v: 'all', t: '全部' }, { v: 'L1', t: 'L1 探索' }, { v: 'L2', t: 'L2 专业' }, { v: 'L3', t: 'L3 旗舰' }]} onChange={(value) => setTierFilter(value as FinSubscriptionTier | 'all')} />
          <span className="ml-auto text-[11.5px] text-muted-foreground">共 {rows.length} 条</span>
        </div>

        <div className="grid grid-cols-[1.4fr_.6fr_.7fr_.7fr_.6fr_.4fr] items-center gap-3 border-b border-border px-5 py-2 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
          <div>客户 / 合同编号</div><div>承接小组</div><div>订阅版本</div><div>合同期</div><div className="text-right">合同金额</div><div className="text-right">状态</div>
        </div>
        <ul className="divide-y divide-border">
          {rows.map((row) => <ContractRow key={row.contract.id} contract={row.contract} tenant={row.tenant} onOpen={() => setOpenId(row.contract.id)} />)}
        </ul>
      </div>

      <Modal open={!!open} onClose={() => setOpenId(null)} title={open ? `${open.tenant.legalName} · 合同详情` : '合同详情'} maxWidth="max-w-3xl" footer={<Button variant="secondary" onClick={() => setOpenId(null)}>Close</Button>}>
        {open && <ContractDetail contract={open.contract} />}
      </Modal>
    </div>
  );
}

export function FinanceBilling(): JSX.Element {
  const [month, setMonth] = useState('2026-04');
  const [tab, setTab] = useState('bill');
  const [status, setStatus] = useState<FinBillStatus | 'all'>('all');

  const monthBills = useMemo(() => finBills.filter((bill) => (month === 'all' || bill.period === month) && (status === 'all' || bill.status === status)), [month, status]);
  const aprilBills = finBills.filter((bill) => bill.period === '2026-04');
  const aprilReceivable = aprilBills.reduce((sum, bill) => sum + bill.amount, 0);
  const aprilPaid = aprilBills.filter((bill) => bill.status === 'paid').reduce((sum, bill) => sum + bill.amount, 0);
  const overdue = finBills.filter((bill) => bill.status === 'overdue');
  const disputed = finReconciliations.filter((item) => item.status === 'disputed');

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="P2 · Module 2"
        title="自动化固定费账单引擎"
        subtitle="按客户合同与订阅版本，自动排期生成月度账单；联动对账与催款，覆盖应收 → 已收的全链路。"
        actions={<><Button variant="secondary" size="sm" onClick={() => showToast('账单排期已按合同重排', 'success')}>手动重排</Button><Button size="sm" className="border-primary bg-primary text-primary-foreground hover:bg-primary/90" onClick={() => showToast(`已批量发送 ${aprilBills.length} 张账单`, 'success')}><Send className="h-3.5 w-3.5" />批量发送</Button></>}
      />

      <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
        <KpiCard icon={Receipt} label="2026-04 应收" value={fmtMoney(aprilReceivable, { unit: 'wan' })} hint={`${aprilBills.length} 张账单 · 已生成 ${aprilBills.length}`} />
        <KpiCard icon={Wallet} label="2026-04 已收" value={fmtMoney(aprilPaid, { unit: 'wan' })} hint="实际入账金额" />
        <KpiCard icon={AlertTriangle} label="累计逾期金额" value={fmtMoney(overdue.reduce((sum, bill) => sum + bill.amount, 0), { unit: 'wan' })} hint={`${overdue.length} 张账单 · 已触发 ${finDunnings.length} 条催款`} />
        <KpiCard icon={ShieldCheck} label="对账异议" value={`${disputed.length}`} unit="单" hint="客户主张服务量不足，需 CSM 复核" />
      </div>

      <div className="rounded-xl border border-border bg-card">
        <div className="space-y-3 border-b border-border px-5 py-3">
          <ChipGroup label="账期" value={month} options={[{ v: '2026-01', t: '2026-01' }, { v: '2026-02', t: '2026-02' }, { v: '2026-03', t: '2026-03' }, { v: '2026-04', t: '2026-04' }, { v: '2026-05', t: '2026-05' }, { v: 'all', t: '全部' }]} onChange={setMonth} />
          <div className="text-[11.5px] text-muted-foreground">排期日次月 1 日 00:00 · 引擎运行正常</div>
          <ChipGroup label="" value={tab} options={[{ v: 'bill', t: `账单 · ${finBills.length}` }, { v: 'recon', t: `对账 · ${finReconciliations.length}` }, { v: 'dunning', t: `催款 · ${finDunnings.length}` }]} onChange={setTab} />
          <ChipGroup label="" value={status} options={[{ v: 'all', t: '全部' }, ...Object.entries(FIN_BILL_STATUS_LABEL).map(([v, t]) => ({ v, t }))]} onChange={(value) => setStatus(value as FinBillStatus | 'all')} />
          <div className="text-[11.5px] text-muted-foreground">共 {monthBills.length} 张</div>
        </div>
        <div className="grid grid-cols-[1.4fr_.45fr_.45fr_1fr_.9fr_.45fr] items-center gap-3 border-b border-border px-5 py-2 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
          <div>客户 / 账单号</div><div>账期</div><div className="text-right">应收</div><div>排期 → 发送 → 确认</div><div>开票 → 回款 / 应回</div><div className="text-right">状态</div>
        </div>
        <ul className="divide-y divide-border">
          {monthBills.map((bill) => <BillRow key={bill.id} bill={bill} />)}
        </ul>
      </div>
    </div>
  );
}

export function FinanceInvoicing(): JSX.Element {
  const [openId, setOpenId] = useState<string | null>(null);
  const totalReports = finValueReports.length;
  const converted = finValueReports.filter((report) => report.convertedToInvoice).length;
  const pending = totalReports - converted;
  const totalInvoiceAmount = finInvoices.reduce((sum, invoice) => sum + invoice.amount, 0);
  const reports = useMemo(() => [...finValueReports].sort((a, b) => (b.period > a.period ? 1 : -1)), []);
  const open = openId ? finValueReports.find((report) => report.id === openId) ?? null : null;

  return (
    <div className="space-y-5">
      <PageHeader eyebrow="P2 · Module 3" title="价值交付报告 × 开票联动" subtitle="月底以脱敏形式向客户出具价值交付报告，并直接转化为开票指令；客户开票信息自动取自合同档案，杜绝手工录入。" />
      <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
        <KpiCard icon={FileBadge} label="累计交付报告" value={`${totalReports}`} unit="份" />
        <KpiCard icon={Send} label="待转开票" value={`${pending}`} unit="份" hint="客户已确认对账，可一键转开票" />
        <KpiCard icon={Receipt} label="已开发票" value={`${finInvoices.length}`} unit="张" hint={`累计 ${fmtMoney(totalInvoiceAmount, { unit: 'wan' })}`} />
        <KpiCard icon={Hash} label="转化率" value={`${Math.round((converted / Math.max(1, totalReports)) * 100)}%`} hint="价值报告 → 开票" />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1.4fr_1fr]">
        <div className="rounded-xl border border-border bg-card">
          <header className="flex items-center justify-between border-b border-border px-5 py-3">
            <div><div className="text-[13.5px] font-semibold tracking-tight">价值交付报告</div><div className="text-[11.5px] text-muted-foreground">基于交付内容、审核通过、医生触达、患者触达自动汇总（已脱敏）</div></div>
          </header>
          <ul className="divide-y divide-border">
            {reports.map((report) => <ReportRow key={report.id} report={report} onOpen={() => setOpenId(report.id)} />)}
          </ul>
        </div>
        <div className="rounded-xl border border-border bg-card">
          <header className="flex items-center justify-between border-b border-border px-5 py-3">
            <div><div className="text-[13.5px] font-semibold tracking-tight">开票申请池</div><div className="text-[11.5px] text-muted-foreground">已开发票 · 自动套用合同档案抬头 / 税号 / 银行</div></div>
          </header>
          <ul className="divide-y divide-border">
            {finInvoices.map((invoice) => <InvoiceRow key={invoice.id} invoice={invoice} />)}
          </ul>
        </div>
      </div>

      <Modal open={!!open} onClose={() => setOpenId(null)} title="价值交付报告" maxWidth="max-w-3xl" footer={<><Button variant="secondary" onClick={() => showToast('演示版：导出 PDF 报告', 'info')}>导出报告</Button><Button onClick={() => { showToast('已生成开票指令并下发财务', 'success'); setOpenId(null); }}><Receipt className="h-4 w-4" />转开票指令</Button></>}>
        {open && <ReportDetail report={open} />}
      </Modal>
    </div>
  );
}

export function FinanceDataPlatform(): JSX.Element {
  const k = finKpiSnapshot;
  const tenantRanks = useMemo(() => finTenants
    .map((tenant) => {
      const bills = finBills.filter((bill) => bill.tenantId === tenant.id);
      const receivable = bills.reduce((sum, bill) => sum + bill.amount, 0);
      const collected = bills.filter((bill) => bill.status === 'paid').reduce((sum, bill) => sum + bill.amount, 0);
      const outstanding = bills.filter((bill) => ['sent', 'confirmed', 'invoiced', 'overdue'].includes(bill.status)).reduce((sum, bill) => sum + bill.amount, 0);
      const overdue = bills.filter((bill) => bill.status === 'overdue').reduce((sum, bill) => sum + bill.amount, 0);
      return { tenant, receivable, collected, outstanding, overdue };
    })
    .sort((a, b) => b.receivable - a.receivable), []);

  const groupRevenue = useMemo(() => {
    const byGroup: Record<string, { signed: number; recognized: number; collected: number }> = {};
    finContracts.forEach((contract) => {
      const tenant = finTenants.find((item) => item.id === contract.tenantId)!;
      byGroup[tenant.group] = byGroup[tenant.group] ?? { signed: 0, recognized: 0, collected: 0 };
      byGroup[tenant.group]!.signed += contract.totalAmount;
    });
    finBills.forEach((bill) => {
      const tenant = finTenants.find((item) => item.id === bill.tenantId)!;
      byGroup[tenant.group] = byGroup[tenant.group] ?? { signed: 0, recognized: 0, collected: 0 };
      if (['invoiced', 'paid'].includes(bill.status)) byGroup[tenant.group]!.recognized += bill.amount;
      if (bill.status === 'paid') byGroup[tenant.group]!.collected += bill.amount;
    });
    return byGroup;
  }, []);
  const trendMax = Math.max(...finTrend.map((point) => point.signed));

  return (
    <div className="space-y-5">
      <PageHeader eyebrow="P2 · Module 4" title="业财数据基座" subtitle="把订阅与账单数据沉淀为统一的业财指标，支持运营、财务、CSM、销售四类视图复用，作为业绩与回款的真源。" />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
        <KpiCard icon={FileSignature} label="累计签约" value={fmtMoney(k.totalSigned, { unit: 'wan' })} hint={`${k.contractCount} 份合同 · ${k.activeTenants} 家租户`} />
        <KpiCard icon={Repeat2} label="MRR" value={fmtMoney(k.monthlyRecurring, { unit: 'wan' })} hint="月度经常性收入" />
        <KpiCard icon={Activity} label="年度预测" value={fmtMoney(k.yearlyForecast, { unit: 'wan' })} hint="MRR × 12" />
        <KpiCard icon={Banknote} label="已回款" value={fmtMoney(k.cashCollected, { unit: 'wan' })} />
        <KpiCard icon={Wallet} label="未回款" value={fmtMoney(k.cashOutstanding, { unit: 'wan' })} hint={`其中逾期 ${fmtMoney(k.overdueAmount, { unit: 'wan' })}`} />
        <KpiCard icon={BadgeCheck} label="回款率" value={`${Math.round(k.collectionRate * 100)}%`} />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1.4fr_1fr]">
        <div className="rounded-xl border border-border bg-card">
          <header className="flex items-end justify-between border-b border-border px-5 py-3">
            <div><div className="text-[13.5px] font-semibold tracking-tight">月度收入趋势</div><div className="text-[11.5px] text-muted-foreground">蓝：签约 · 紫：确认收入 · 绿：实际回款</div></div>
            <div className="text-[11.5px] text-muted-foreground tabular">单位：万</div>
          </header>
          <div className="px-5 py-5">
            <div className="grid grid-cols-5 items-end gap-3" style={{ height: 240 }}>
              {finTrend.map((point) => {
                const pct = (value: number) => (value / Math.max(1, trendMax)) * 220;
                return (
                  <div key={point.month} className="flex flex-col items-center gap-2">
                    <div className="flex h-[220px] w-full items-end justify-center gap-1">
                      <MiniBar h={pct(point.signed)} color="oklch(60% .14 240)" tip={`签约 ${fmtMoney(point.signed, { unit: 'wan' })}`} />
                      <MiniBar h={pct(point.recognized)} color="oklch(60% .14 300)" tip={`确认 ${fmtMoney(point.recognized, { unit: 'wan' })}`} />
                      <MiniBar h={pct(point.collected)} color="oklch(60% .14 165)" tip={`实收 ${fmtMoney(point.collected, { unit: 'wan' })}`} />
                    </div>
                    <div className="text-[11px] text-muted-foreground tabular">{point.month}</div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-border bg-card">
          <header className="border-b border-border px-5 py-3"><div className="text-[13.5px] font-semibold tracking-tight">小组维度收入</div><div className="text-[11.5px] text-muted-foreground">销售小组 → 签约 / 确认 / 实收</div></header>
          <ul className="divide-y divide-border">
            {Object.entries(groupRevenue).map(([group, value]) => (
              <li key={group} className="px-5 py-3.5 text-[12.5px]">
                <div className="flex items-center justify-between"><span className="font-medium text-foreground">{FIN_PLAN_GROUP_LABEL[group as FinPlanGroup]}</span><span className="tabular text-muted-foreground">签约 {fmtMoney(value.signed, { unit: 'wan' })}</span></div>
                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[oklch(20%_.02_260)]"><div className="h-full bg-[oklch(60%_.14_300)]" style={{ width: `${(value.recognized / Math.max(1, value.signed)) * 100}%` }} /></div>
                <div className="mt-1 flex justify-between text-[11px] text-muted-foreground tabular"><span>确认 {fmtMoney(value.recognized, { unit: 'wan' })}</span><span>实收 {fmtMoney(value.collected, { unit: 'wan' })}</span></div>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div className="rounded-xl border border-border bg-card">
        <header className="flex items-center justify-between border-b border-border px-5 py-3"><div><div className="text-[13.5px] font-semibold tracking-tight">客户榜单</div><div className="text-[11.5px] text-muted-foreground">按近 5 个月应收金额排名</div></div></header>
        <div className="grid grid-cols-[40px_1.4fr_.6fr_.6fr_.6fr_.6fr_1fr] items-center gap-3 border-b border-border px-5 py-2 text-[11px] font-medium uppercase tracking-wider text-muted-foreground"><div>#</div><div>客户</div><div className="text-right">应收</div><div className="text-right">已收</div><div className="text-right">未收</div><div className="text-right">逾期</div><div>回款率</div></div>
        <ul className="divide-y divide-border">
          {tenantRanks.slice(0, 8).map((rank, index) => {
            const rate = rank.collected / Math.max(1, rank.collected + rank.outstanding);
            return (
              <li key={rank.tenant.id} className="grid grid-cols-[40px_1.4fr_.6fr_.6fr_.6fr_.6fr_1fr] items-center gap-3 px-5 py-3 text-[12.5px]">
                <div className="text-muted-foreground tabular">#{index + 1}</div>
                <div className="min-w-0"><div className="truncate font-medium text-foreground">{rank.tenant.legalName}</div><div className="truncate text-[11px] text-muted-foreground">{FIN_PLAN_GROUP_LABEL[rank.tenant.group]} · CSM {rank.tenant.csm}</div></div>
                <div className="text-right tabular text-foreground">{fmtMoney(rank.receivable, { unit: 'wan' })}</div>
                <div className="text-right tabular text-[oklch(85%_.16_165)]">{fmtMoney(rank.collected, { unit: 'wan' })}</div>
                <div className="text-right tabular text-muted-foreground">{fmtMoney(rank.outstanding, { unit: 'wan' })}</div>
                <div className="text-right tabular text-[oklch(82%_.18_25)]">{rank.overdue > 0 ? fmtMoney(rank.overdue, { unit: 'wan' }) : '—'}</div>
                <div><div className="h-1.5 overflow-hidden rounded-full bg-[oklch(20%_.02_260)]"><div className="h-full bg-[oklch(60%_.14_165)]" style={{ width: `${rate * 100}%` }} /></div><div className="mt-1 text-[11px] text-muted-foreground tabular">{Math.round(rate * 100)}%</div></div>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}

function ModuleCard({ to, icon: Icon, title, desc, stats, tone = 'default' }: { to: string; icon: LucideIcon; title: string; desc: string; stats: { label: string; value: string }[]; tone?: Tone }): JSX.Element {
  return (
    <Link to={to} className={clsx('group block rounded-xl border bg-card p-5 transition-all hover:-translate-y-0.5', tone === 'warn' ? 'border-[oklch(40%_.14_45_/.6)] hover:border-[oklch(60%_.16_45)] hover:shadow-[0_0_18px_oklch(60%_.16_45_/.18)]' : 'border-border hover:border-primary/50 hover:shadow-[0_0_18px_oklch(70%_.15_200_/.18)]')}>
      <div className="flex items-start justify-between"><div className={clsx('grid h-9 w-9 place-items-center rounded-md', tone === 'warn' ? 'bg-[oklch(28%_.10_45_/.5)] text-[oklch(86%_.16_45)]' : 'bg-[oklch(28%_.04_200_/.45)] text-primary')}><Icon className="h-4 w-4" /></div><ChevronRight className="h-4 w-4 text-muted-foreground transition-colors group-hover:text-foreground" /></div>
      <div className="mt-3 text-[14px] font-semibold tracking-tight">{title}</div><div className="mt-1 text-[11.5px] text-muted-foreground">{desc}</div>
      <ul className="mt-3 space-y-1.5">{stats.map((stat) => <li key={stat.label} className="flex items-center justify-between text-[12px]"><span className="text-muted-foreground">{stat.label}</span><span className="font-medium tabular text-foreground">{stat.value}</span></li>)}</ul>
    </Link>
  );
}

function TodoItem({ icon: Icon, tone, label, sub, link }: { icon: LucideIcon; tone: 'danger' | 'warn' | 'info'; label: string; sub: string; link: string }): JSX.Element {
  const tones = {
    danger: 'border-[oklch(40%_.16_25_/.55)] bg-[oklch(28%_.14_25_/.4)] text-[oklch(82%_.18_25)]',
    warn: 'border-[oklch(40%_.14_60_/.55)] bg-[oklch(28%_.10_60_/.4)] text-[oklch(86%_.16_60)]',
    info: 'border-[oklch(40%_.12_240_/.55)] bg-[oklch(26%_.12_240_/.4)] text-[oklch(82%_.16_240)]',
  };
  return <li><Link to={link} className="block rounded-lg border border-border bg-secondary/30 p-3 transition-colors hover:border-primary/40"><div className="flex items-start gap-2.5"><span className={clsx('grid h-7 w-7 flex-shrink-0 place-items-center rounded-md border', tones[tone])}><Icon className="h-3.5 w-3.5" /></span><div className="min-w-0 flex-1"><div className="text-[12.5px] font-medium text-foreground">{label}</div><div className="mt-0.5 text-[11px] text-muted-foreground">{sub}</div></div></div></Link></li>;
}

function ChipGroup<T extends string>({ label, value, options, onChange }: { label: string; value: T; options: { v: T; t: string }[]; onChange: (value: T) => void }): JSX.Element {
  return (
    <div className="flex flex-wrap items-center gap-1.5 text-[12px]">
      {label && <span className="mr-1 text-muted-foreground">{label}</span>}
      {options.map((option) => <button key={option.v} onClick={() => onChange(option.v)} className={clsx('rounded-md border px-2.5 py-1 transition-colors', value === option.v ? 'border-primary/60 bg-primary/15 text-primary' : 'border-border bg-secondary/30 text-muted-foreground hover:text-foreground')}>{option.t}</button>)}
    </div>
  );
}

const CONTRACT_STATUS_META: Record<FinContract['status'], { label: string; className: string }> = {
  draft: { label: '草拟', className: 'border-border bg-secondary/40 text-muted-foreground' },
  pending_sign: { label: '待签署', className: 'border-[oklch(40%_.14_70_/.55)] bg-[oklch(28%_.10_70_/.4)] text-[oklch(86%_.16_70)]' },
  active: { label: '生效中', className: 'border-[oklch(40%_.12_165_/.55)] bg-[oklch(26%_.12_165_/.4)] text-[oklch(85%_.16_165)]' },
  expired: { label: '已到期', className: 'border-border bg-secondary/40 text-muted-foreground' },
  terminated: { label: '已终止', className: 'border-[oklch(48%_.16_25_/.55)] bg-[oklch(28%_.14_25_/.4)] text-[oklch(82%_.18_25)]' },
};

function ContractRow({ contract, tenant, onOpen }: { contract: FinContract; tenant: (typeof finTenants)[number]; onOpen: () => void }): JSX.Element {
  const meta = CONTRACT_STATUS_META[contract.status];
  return (
    <li onClick={onOpen} className="grid cursor-pointer grid-cols-[1.4fr_.6fr_.7fr_.7fr_.6fr_.4fr] items-center gap-3 px-5 py-3.5 text-[12.5px] transition-colors hover:bg-secondary/40">
      <div className="min-w-0"><div className="truncate font-medium text-foreground">{tenant.legalName}</div><div className="truncate text-[11.5px] text-muted-foreground">{contract.no} · 签约 {contract.signedAt} · BD {tenant.bd} · CSM {tenant.csm}</div></div>
      <div className="text-muted-foreground">{FIN_PLAN_GROUP_LABEL[tenant.group]}</div>
      <div><div className="font-medium text-foreground">{FIN_TIER_META[contract.tier].label}</div><div className="text-[11px] text-muted-foreground">{fmtMoney(contract.monthlyFee, { unit: 'wan' })} / 月</div></div>
      <div className="text-muted-foreground tabular">{contract.startDate} ~ {contract.endDate}</div>
      <div className="text-right font-medium tabular text-foreground">{fmtMoney(contract.totalAmount, { unit: 'wan' })}</div>
      <div className="text-right"><Badge color="gray" className={meta.className}>{meta.label}</Badge></div>
    </li>
  );
}

function ContractDetail({ contract }: { contract: FinContract }): JSX.Element {
  const tenant = finTenants.find((item) => item.id === contract.tenantId)!;
  return <div className="space-y-4 text-sm text-text-secondary"><InfoGrid items={[['客户法定全称', tenant.legalName], ['合同编号', contract.no], ['订阅版本', FIN_TIER_META[contract.tier].label], ['合同金额', fmtMoney(contract.totalAmount, { unit: 'wan' })], ['付款账期', tenant.paymentTerms], ['附件', contract.attachment]]} /><div className="rounded-lg border border-border bg-secondary/30 p-4"><div className="mb-2 text-sm font-semibold text-foreground">开票信息</div><InfoGrid items={[['抬头', tenant.invoice.legalName], ['税号', tenant.invoice.taxId], ['开户地址', tenant.invoice.address], ['开户行', tenant.invoice.bankName], ['账号', tenant.invoice.bankAccount]]} /></div></div>;
}

function BillRow({ bill }: { bill: FinBill }): JSX.Element {
  const tenant = finTenants.find((item) => item.id === bill.tenantId)!;
  const recon = finReconciliations.find((item) => item.billId === bill.id);
  const invoiceTimeline = bill.invoiceRequestedAt || bill.paidAt || bill.dueDate
    ? (
      <>
        {bill.invoiceRequestedAt ?? '—'} → {bill.paidAt ?? '—'}
        <div className="text-[11px]">应回：{bill.dueDate ?? '—'}</div>
      </>
    )
    : '—';
  return (
    <li className="grid grid-cols-[1.4fr_.45fr_.45fr_1fr_.9fr_.45fr] items-center gap-3 px-5 py-3.5 text-[12.5px]">
      <div className="min-w-0"><div className="truncate font-medium text-foreground">{tenant.legalName}</div><div className="truncate text-[11.5px] text-muted-foreground">{bill.no} · CSM {tenant.csm}</div></div>
      <div className="tabular text-muted-foreground">{bill.period}</div>
      <div className="text-right font-medium tabular text-foreground">{fmtMoney(bill.amount, { unit: 'wan' })}</div>
      <div className="text-muted-foreground tabular">{bill.scheduledAt} → {bill.sentAt ?? '—'}<div className="text-[11px]">对账：{recon ? FIN_RECON_STATUS_LABEL[recon.status] : '—'}</div></div>
      <div className="text-muted-foreground tabular">{invoiceTimeline}</div>
      <div className="text-right"><Badge color="gray" className={FIN_BILL_STATUS_TONE[bill.status]}>{FIN_BILL_STATUS_LABEL[bill.status]}</Badge></div>
    </li>
  );
}

const METRIC_ICON: Record<FinValueMetric, LucideIcon> = {
  deliverableContents: FileText,
  approvedFlows: ShieldCheck,
  doctorReach: Building2,
  patientReach: Activity,
};

function ReportRow({ report, onOpen }: { report: FinValueReport; onOpen: () => void }): JSX.Element {
  const tenant = finTenants.find((item) => item.id === report.tenantId)!;
  const bill = finBills.find((item) => item.id === report.billId)!;
  return (
    <li onClick={onOpen} className="cursor-pointer px-5 py-4 transition-colors hover:bg-secondary/40">
      <div className="flex items-center justify-between gap-3"><div className="min-w-0"><div className="truncate text-[13px] font-semibold tracking-tight text-foreground">{tenant.legalName}</div><div className="truncate text-[11.5px] text-muted-foreground">账期 {report.period} · 关联账单 {bill.no} · 生成于 {report.generatedAt}</div></div><Badge color="gray" className={report.convertedToInvoice ? 'border-[oklch(40%_.12_165_/.55)] bg-[oklch(26%_.12_165_/.4)] text-[oklch(85%_.16_165)]' : 'border-[oklch(40%_.10_70_/.55)] bg-[oklch(28%_.10_70_/.4)] text-[oklch(86%_.16_70)]'}>{report.convertedToInvoice ? '已转开票' : '待转开票'}</Badge></div>
      <div className="mt-3 grid grid-cols-4 gap-2">{(Object.keys(report.metrics) as FinValueMetric[]).map((key) => { const Icon = METRIC_ICON[key]; return <div key={key} className="rounded-md border border-border bg-secondary/30 px-3 py-2"><div className="flex items-center gap-1.5 text-[11px] text-muted-foreground"><Icon className="h-3 w-3" /> {FIN_VALUE_METRIC_LABEL[key]}</div><div className="mt-0.5 text-[14px] font-semibold tabular text-foreground">{report.metrics[key].toLocaleString('zh-CN')}</div></div>; })}</div>
    </li>
  );
}

function InvoiceRow({ invoice }: { invoice: FinInvoice }): JSX.Element {
  const tenant = finTenants.find((item) => item.id === invoice.tenantId)!;
  const bill = finBills.find((item) => item.id === invoice.billId)!;
  return <li className="px-5 py-3.5 text-[12.5px]"><div className="flex items-center justify-between gap-2"><div className="min-w-0"><div className="truncate font-medium text-foreground">{tenant.legalName}</div><div className="truncate text-[11.5px] text-muted-foreground">发票号 {invoice.no} · 关联 {bill.no}</div></div><Badge color="gray" className={invoice.type === 'vat_special' ? 'border-[oklch(40%_.14_300_/.55)] bg-[oklch(26%_.14_300_/.4)] text-[oklch(86%_.16_300)]' : 'border-border bg-secondary/40 text-muted-foreground'}>{invoice.type === 'vat_special' ? '增值税专票' : '增值税普票'}</Badge></div><div className="mt-1 flex items-center justify-between text-[11.5px] text-muted-foreground"><span>申请 {invoice.requestedAt}{invoice.issuedAt ? ` · 开具 ${invoice.issuedAt}` : ''}</span><span className="tabular text-foreground">{fmtMoney(invoice.amount, { unit: 'wan' })}</span></div><div className="mt-1.5 text-[11px] text-muted-foreground">状态：<span className="text-foreground">{FIN_INVOICE_STATUS_LABEL[invoice.status]}</span></div></li>;
}

function ReportDetail({ report }: { report: FinValueReport }): JSX.Element {
  const tenant = finTenants.find((item) => item.id === report.tenantId)!;
  const bill = finBills.find((item) => item.id === report.billId)!;
  return <div className="space-y-4"><p className="text-sm text-text-secondary">{tenant.legalName} · {report.period} 脱敏汇总 · 关联账单 {bill.no} · 应收 {fmtMoney(bill.amount)} 元</p><div className="grid grid-cols-2 gap-3">{(Object.keys(report.metrics) as FinValueMetric[]).map((key) => { const Icon = METRIC_ICON[key]; return <div key={key} className="rounded-lg border border-border bg-secondary/30 p-3"><div className="flex items-center gap-1.5 text-[11.5px] text-muted-foreground"><Icon className="h-3.5 w-3.5" /> {FIN_VALUE_METRIC_LABEL[key]}</div><div className="mt-1 text-[18px] font-semibold tabular tracking-tight text-foreground">{report.metrics[key].toLocaleString('zh-CN')}</div></div>; })}</div><div className="rounded-lg border border-border bg-secondary/30 p-4"><div className="text-[12.5px] font-semibold tracking-tight text-foreground">开票档案（自动取自合同）</div><InfoGrid items={[['抬头', tenant.invoice.legalName], ['税号', tenant.invoice.taxId], ['地址 / 电话', `${tenant.invoice.address} · ${tenant.invoice.phone}`], ['开户行 / 账号', `${tenant.invoice.bankName} · ${tenant.invoice.bankAccount}`]]} /></div></div>;
}

function InfoGrid({ items }: { items: Array<[string, ReactNode]> }): JSX.Element {
  return <dl className="grid grid-cols-1 gap-2 text-[12px]">{items.map(([label, value]) => <div key={label} className="grid grid-cols-[110px_1fr] gap-2"><dt className="text-muted-foreground">{label}</dt><dd className="text-foreground">{value}</dd></div>)}</dl>;
}

function MiniBar({ h, color, tip }: { h: number; color: string; tip: string }): JSX.Element {
  return <div title={tip} className="w-3 rounded-t-sm transition-all hover:brightness-125" style={{ height: Math.max(2, h), backgroundColor: color }} />;
}
