import { useState } from 'react';
import { Link } from 'react-router-dom';
import { FilePlus2, Send, Upload } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Modal } from '@/components/ui/Modal';
import { showToast } from '@/components/ui/Toast';

const contracts = [
  { customer: '诺欣华制药（中国）有限公司', no: 'PXC-2025-0918-NX', signed: '2025-08-25', bd: '周明轩', csm: '李雨晴', group: 'Px2 组 · 盘古计划', plan: 'L2 专业版', monthly: '100 万 / 月', period: '2025-09-01 ~ 2026-08-31', amount: '1,200 万', status: '生效中' },
  { customer: '阿斯利康（无锡）贸易有限公司', no: 'PXC-2025-1009-AZ', signed: '2025-09-25', bd: '韩雪', csm: '李雨晴', group: 'Px2 组 · 盘古计划', plan: 'L2 专业版', monthly: '100 万 / 月', period: '2025-10-01 ~ 2026-09-30', amount: '1,200 万', status: '生效中' },
  { customer: '默沙东（中国）投资有限公司', no: 'PXC-2025-1108-MSD', signed: '2025-10-28', bd: '陆斯远', csm: '王健', group: 'Px3 组 · 星火计划', plan: 'L3 旗舰版', monthly: '200 万 / 月', period: '2025-11-01 ~ 2026-10-31', amount: '2,400 万', status: '生效中' },
  { customer: '罗氏制药（上海）有限公司', no: 'PXC-2025-1215-RC', signed: '2025-11-30', bd: '陆斯远', csm: '王健', group: 'Px3 组 · 星火计划', plan: 'L3 旗舰版', monthly: '200 万 / 月', period: '2025-12-01 ~ 2026-11-30', amount: '2,400 万', status: '生效中' },
  { customer: '礼来贸易有限公司', no: 'PXC-2026-0105-LL', signed: '2025-12-22', bd: 'Vivian Yang', csm: '陈思雨', group: 'Px1 组 · 大禹计划', plan: 'L1 探索版', monthly: '50 万 / 月', period: '2026-01-01 ~ 2026-12-31', amount: '600 万', status: '生效中' },
  { customer: '辉瑞投资有限公司', no: 'PXC-2026-0220-PF', signed: '2026-02-08', bd: '高琪', csm: '陈思雨', group: 'Px3 组 · 星火计划', plan: 'L3 旗舰版', monthly: '200 万 / 月', period: '2026-02-15 ~ 2027-02-14', amount: '2,600 万', status: '生效中' },
  { customer: '礼来贸易有限公司', no: 'PXC-2026-0501-LL2', signed: '2026-04-15', bd: 'Vivian Yang', csm: '陈思雨', group: 'Px1 组 · 大禹计划', plan: 'L2 专业版', monthly: '100 万 / 月', period: '2026-05-01 ~ 2027-04-30', amount: '1,200 万', status: '待签署' },
];

const bills = [
  ['诺欣华制药（中国）有限公司', 'BILL-202604-0004', '李雨晴', '2026-04', '100 万', '已发送'],
  ['阿斯利康（无锡）贸易有限公司', 'BILL-202604-0009', '李雨晴', '2026-04', '100 万', '已发送'],
  ['默沙东（中国）投资有限公司', 'BILL-202604-0014', '王健', '2026-04', '200 万', '已发送'],
  ['罗氏制药（上海）有限公司', 'BILL-202604-0019', '王健', '2026-04', '200 万', '已发送'],
  ['礼来贸易有限公司', 'BILL-202604-0024', '陈思雨', '2026-04', '50 万', '已发送'],
  ['辉瑞投资有限公司', 'BILL-202604-0028', '陈思雨', '2026-04', '200 万', '已发送'],
];

const reports = [
  ['辉瑞投资有限公司', '2026-04', 'BILL-202604-0028', '2026-05-02', '待转开票', 12, 13, 1814, 39802],
  ['礼来贸易有限公司', '2026-04', 'BILL-202604-0024', '2026-05-02', '待转开票', 14, 12, 1403, 36829],
  ['罗氏制药（上海）有限公司', '2026-04', 'BILL-202604-0019', '2026-05-02', '待转开票', 13, 13, 1655, 32865],
  ['默沙东（中国）投资有限公司', '2026-04', 'BILL-202604-0014', '2026-05-02', '待转开票', 12, 14, 1907, 28901],
  ['阿斯利康（无锡）贸易有限公司', '2026-04', 'BILL-202604-0009', '2026-05-02', '待转开票', 22, 8, 1359, 24937],
  ['诺欣华制药（中国）有限公司', '2026-04', 'BILL-202604-0004', '2026-05-02', '待转开票', 21, 9, 1611, 20973],
  ['辉瑞投资有限公司', '2026-03', 'BILL-202603-0027', '2026-04-05', '待转开票', 20, 8, 1677, 38811],
  ['礼来贸易有限公司', '2026-03', 'BILL-202603-0023', '2026-04-05', '待转开票', 22, 14, 1266, 35838],
  ['罗氏制药（上海）有限公司', '2026-03', 'BILL-202603-0018', '2026-04-05', '待转开票', 21, 8, 1518, 31874],
  ['默沙东（中国）投资有限公司', '2026-03', 'BILL-202603-0013', '2026-04-05', '待转开票', 20, 9, 1770, 27910],
  ['阿斯利康（无锡）贸易有限公司', '2026-03', 'BILL-202603-0008', '2026-04-05', '待转开票', 19, 10, 1222, 23946],
  ['诺欣华制药（中国）有限公司', '2026-03', 'BILL-202603-0003', '2026-04-05', '待转开票', 18, 11, 1474, 19982],
  ['辉瑞投资有限公司', '2026-02', 'BILL-202602-0026', '2026-03-05', '已转开票', 17, 10, 1540, 37820],
  ['礼来贸易有限公司', '2026-02', 'BILL-202602-0022', '2026-03-05', '已转开票', 19, 9, 1929, 34847],
  ['罗氏制药（上海）有限公司', '2026-02', 'BILL-202602-0017', '2026-03-05', '待转开票', 18, 10, 1381, 30883],
  ['默沙东（中国）投资有限公司', '2026-02', 'BILL-202602-0012', '2026-03-05', '已转开票', 17, 11, 1633, 26919],
  ['阿斯利康（无锡）贸易有限公司', '2026-02', 'BILL-202602-0007', '2026-03-05', '已转开票', 16, 12, 1885, 22955],
  ['诺欣华制药（中国）有限公司', '2026-02', 'BILL-202602-0002', '2026-03-05', '已转开票', 15, 13, 1337, 18991],
  ['礼来贸易有限公司', '2026-01', 'BILL-202601-0021', '2026-02-05', '已转开票', 16, 11, 1792, 33856],
  ['罗氏制药（上海）有限公司', '2026-01', 'BILL-202601-0016', '2026-02-05', '已转开票', 15, 12, 1244, 29892],
  ['默沙东（中国）投资有限公司', '2026-01', 'BILL-202601-0011', '2026-02-05', '已转开票', 14, 13, 1496, 25928],
  ['阿斯利康（无锡）贸易有限公司', '2026-01', 'BILL-202601-0006', '2026-02-05', '已转开票', 13, 14, 1748, 21964],
  ['诺欣华制药（中国）有限公司', '2026-01', 'BILL-202601-0001', '2026-02-05', '已转开票', 12, 8, 1200, 18000],
];

const invoices = [
  ['诺欣华制药（中国）有限公司', '32011260000', 'BILL-202601-0001', '增值税普票', '2026-02-07', '100 万'],
  ['诺欣华制药（中国）有限公司', '32021260001', 'BILL-202602-0002', '增值税专票', '2026-03-07', '100 万'],
  ['阿斯利康（无锡）贸易有限公司', '32031260002', 'BILL-202601-0006', '增值税专票', '2026-02-07', '100 万'],
  ['阿斯利康（无锡）贸易有限公司', '32011260003', 'BILL-202602-0007', '增值税普票', '2026-03-07', '100 万'],
  ['默沙东（中国）投资有限公司', '32021260004', 'BILL-202601-0011', '增值税专票', '2026-02-07', '200 万'],
  ['默沙东（中国）投资有限公司', '32031260005', 'BILL-202602-0012', '增值税专票', '2026-03-07', '200 万'],
  ['罗氏制药（上海）有限公司', '32011260006', 'BILL-202601-0016', '增值税普票', '2026-02-07', '200 万'],
  ['礼来贸易有限公司', '32021260007', 'BILL-202601-0021', '增值税专票', '2026-02-07', '50 万'],
  ['礼来贸易有限公司', '32031260008', 'BILL-202602-0022', '增值税专票', '2026-03-07', '50 万'],
  ['辉瑞投资有限公司', '32011260009', 'BILL-202602-0026', '增值税普票', '2026-03-07', '200 万'],
];

export function FinanceOverview(): JSX.Element {
  return (
    <FinanceShell badge="P2 · Finance" title="业财总览" desc="把客户合同到账单、对账与开票串成一条流水线，确保固定费收入按月自动确认；该模块与患教内容、分发策略、医生池逻辑完全隔离。">
      <div className="text-xs text-text-muted">数据周期：2026-01 ~ 2026-05 <span className="mx-2">·</span> 所有金额以人民币元为单位</div>
      <div className="grid grid-cols-4 gap-4">
        <Kpi title="月度经常性收入" desc="6 份生效合同 · 6 家活跃客户" value="850 万" />
        <Kpi title="累计签约金额" desc="年度预测 10,200 万" value="10,400 万" />
        <Kpi title="已回款金额" desc="回款率 20.3%" value="650 万" />
        <Kpi title="逾期金额" desc="2 张账单逾期 · 已触发催款" value="400 万" tone="red" />
      </div>
      <div className="grid grid-cols-[1.1fr_0.9fr] gap-4">
        <Card>
          <h2 className="text-base font-semibold text-text-primary">收入与回款趋势</h2>
          <p className="mt-1 text-xs text-text-muted">按月汇总：签约新增 / 收入确认 / 实际回款 · 单位：万元</p>
          <div className="mt-5 flex h-56 items-end gap-6 border-b border-l border-border px-6 pb-4">
            {[180, 360, 520, 850, 850].map((value, index) => <div key={index} className="flex flex-1 flex-col items-center gap-2"><div className="w-full rounded-t bg-accent-blue/70" style={{ height: `${value / 5}px` }} /><span className="text-[10px] text-text-muted">0{index + 1}月</span></div>)}
          </div>
        </Card>
        <Card>
          <h2 className="text-base font-semibold text-text-primary">三组预算占用</h2>
          <p className="mt-1 text-xs text-text-muted">按 BD 组 · 2026 年度</p>
          {[['Px1 组 · 大禹计划', '600 万 / 10,000 万', 6, 2], ['Px2 组 · 盘古计划', '2,400 万 / 22,000 万', 10.9, 5.5], ['Px3 组 · 星火计划', '7,200 万 / 30,000 万', 24, 12]].map(([name, amount, budget, revenue]) => <div key={String(name)} className="mt-4"><div className="flex justify-between text-xs"><span className="text-text-primary">{name}</span><span className="text-text-muted">{amount}</span></div><div className="mt-2 h-2 rounded bg-bg-tertiary"><div className="h-2 rounded bg-accent-blue" style={{ width: `${budget}%` }} /></div><div className="mt-1 text-[10px] text-text-muted">占用 {budget}% · 已确认收入 {revenue}%</div></div>)}
        </Card>
      </div>
      <div className="grid grid-cols-4 gap-4">
        <FinanceLink href="/finance/contracts" title="合同与订阅" desc="租户主数据 · P2 智能体合同 · 订阅版本" metrics="活跃合同 6 份 待签订单 1 份" />
        <FinanceLink href="/finance/billing" title="账单引擎" desc="月度自动排期 · 对账 · 催款联动" metrics="本月生成 6 张 对账异议 2 单" />
        <FinanceLink href="/finance/invoicing" title="价值交付与开票" desc="月度价值报告 · 一键转开票指令" metrics="已生成报告 23 份 待开票 5 张 已开发票 10 张" />
        <FinanceLink href="/finance" title="业财数据基座" desc="客户主数据 · 收入 / 回款 / 预算 · KPI" metrics="活跃客户 6 家 回款率 20.3%" />
      </div>
      <Card>
        <h2 className="text-base font-semibold text-text-primary">业财待办速览</h2>
        <div className="mt-4 grid gap-3">
          <Todo href="/finance/billing" title="2 张账单已逾期" desc="合计 400 万 · 已触发 4 条催款" />
          <Todo href="/finance/billing" title="2 单对账异议待处理" desc="客户主张服务量不足，需 CSM 联合 BD 复核" />
          <Todo href="/finance/invoicing" title="5 张账单待转开票" desc="客户已对账确认，等待财务一键申请发票" />
        </div>
      </Card>
    </FinanceShell>
  );
}

export function FinanceContracts(): JSX.Element {
  const [group, setGroup] = useState('全部');
  const [plan, setPlan] = useState('全部');
  const [open, setOpen] = useState(false);
  const planPrefix = plan.split(' ')[0] ?? plan;
  const groupPrefix = group.replace(' 大禹', '').replace(' 盘古', '').replace(' 星火', '');
  const filtered = contracts.filter((contract) => (group === '全部' || contract.group.includes(groupPrefix)) && (plan === '全部' || contract.plan.includes(planPrefix)));
  return (
    <FinanceShell badge="P2 · Module 1" title="客户合同与订阅" desc="P2 业财链路的总开关：客户主数据 + 合同条款 + 订阅版本三位一体；账单引擎从这里拉取月费规则。">
      <div className="flex justify-end gap-2"><Button variant="secondary" onClick={() => showToast('已下载合同导入模板', 'success')}><Upload className="h-4 w-4" />导入模板</Button><Button onClick={() => setOpen(true)}><FilePlus2 className="h-4 w-4" />新建合同</Button></div>
      <div className="grid grid-cols-4 gap-4"><Kpi title="生效合同" value="6" desc="份" /><Kpi title="活跃订阅" value="6" desc="条 · 月费随订阅版本自动派生" /><Kpi title="月度经常性收入" value="850 万" desc="/ 月" /><Kpi title="待签订单" value="1" desc="份" tone="yellow" /></div>
      <Card className="space-y-4">
        <Segment label="承接小组" value={group} values={['全部', 'Px1 大禹', 'Px2 盘古', 'Px3 星火']} onChange={setGroup} />
        <Segment label="版本" value={plan} values={['全部', 'L1 探索', 'L2 专业', 'L3 旗舰']} onChange={setPlan} />
        <div className="text-xs text-text-muted">共 {filtered.length} 条</div>
        <table className="w-full"><thead><tr className="border-b border-border bg-bg-secondary/50"><Th>客户 / 合同编号</Th><Th>承接小组</Th><Th>订阅版本</Th><Th>合同期</Th><Th>合同金额</Th><Th>状态</Th></tr></thead><tbody>{filtered.map((contract) => <tr key={contract.no} className="border-b border-border/50"><td className="px-3 py-3"><div className="text-sm font-medium text-text-primary">{contract.customer}</div><div className="text-xs text-text-muted">{contract.no} · 签约 {contract.signed} · BD {contract.bd} · CSM {contract.csm}</div></td><Td>{contract.group}</Td><Td>{contract.plan}<div className="text-[10px] text-text-muted">{contract.monthly}</div></Td><Td>{contract.period}</Td><Td>{contract.amount}</Td><td className="px-3 py-3"><Badge color={contract.status === '生效中' ? 'green' : 'yellow'}>{contract.status}</Badge></td></tr>)}</tbody></table>
      </Card>
      <Modal open={open} onClose={() => setOpen(false)} title="新建合同" footer={<><Button variant="secondary" onClick={() => setOpen(false)}>Close</Button><Button onClick={() => { setOpen(false); showToast('合同草稿已创建', 'success'); }}>保存合同</Button></>}><div className="grid grid-cols-2 gap-3"><Input label="客户名称" placeholder="例：新客户制药有限公司" /><Input label="合同编号" placeholder="PXC-2026-0001" /><Input label="订阅版本" placeholder="L2 专业版" /><Input label="月费" placeholder="100 万 / 月" /></div></Modal>
    </FinanceShell>
  );
}

export function FinanceBilling(): JSX.Element {
  const [month, setMonth] = useState('2026-04');
  const [tab, setTab] = useState('账单 · 29');
  const [status, setStatus] = useState('全部');
  return (
    <FinanceShell badge="P2 · Module 2" title="自动化固定费账单引擎" desc="按客户合同与订阅版本，自动排期生成月度账单；联动对账与催款，覆盖应收 → 已收的全链路。">
      <div className="flex justify-end gap-2"><Button variant="secondary" onClick={() => showToast('账单排期已按合同重排', 'success')}>手动重排</Button><Button onClick={() => showToast('已批量发送 6 张账单', 'success')}><Send className="h-4 w-4" />批量发送</Button></div>
      <div className="grid grid-cols-4 gap-4"><Kpi title="2026-04 应收" desc="6 张账单 · 已生成 6" value="850 万" /><Kpi title="2026-04 已收" desc="实际入账金额" value="0 万" /><Kpi title="累计逾期金额" desc="2 张账单 · 已触发 4 条催款" value="400 万" tone="red" /><Kpi title="对账异议" desc="客户主张服务量不足，需 CSM 复核" value="2 单" tone="yellow" /></div>
      <Card className="space-y-4"><Segment label="账期" value={month} values={['2026-01', '2026-02', '2026-03', '2026-04', '2026-05', '全部']} onChange={setMonth} /><div className="text-xs text-text-muted">排期日次月 1 日 00:00 · 引擎运行正常</div><Segment label="" value={tab} values={['账单 · 29', '对账 · 17', '催款 · 4']} onChange={setTab} /><Segment label="" value={status} values={['全部', '已排期', '已生成', '已发送', '已确认', '已开票', '已回款', '逾期']} onChange={setStatus} /><div className="text-xs text-text-muted">共 {bills.length} 张</div><table className="w-full"><thead><tr className="border-b border-border bg-bg-secondary/50"><Th>客户 / 账单号</Th><Th>账期</Th><Th>应收</Th><Th>排期 → 发送 → 确认</Th><Th>开票 → 回款 / 应回</Th><Th>状态</Th></tr></thead><tbody>{bills.map(([customer, no, csm, billMonth, amount, rowStatus]) => <tr key={no} className="border-b border-border/50"><td className="px-3 py-3"><div className="text-sm font-medium text-text-primary">{customer}</div><div className="text-xs text-text-muted">{no} · CSM {csm}</div></td><Td>{billMonth}</Td><Td>{amount}</Td><Td>2026-05-01 → 2026-05-02<div className="text-[10px] text-text-muted">对账：—</div></Td><Td>—</Td><td className="px-3 py-3"><Badge color="blue">{rowStatus}</Badge></td></tr>)}</tbody></table></Card>
    </FinanceShell>
  );
}

export function FinanceInvoicing(): JSX.Element {
  return (
    <FinanceShell badge="P2 · Module 3" title="价值交付报告 × 开票联动" desc="月底以脱敏形式向客户出具价值交付报告，并直接转化为开票指令；客户开票信息自动取自合同档案，杜绝手工录入。">
      <div className="grid grid-cols-4 gap-4"><Kpi title="累计交付报告" value="23" desc="份" /><Kpi title="待转开票" value="13" desc="客户已确认对账，可一键转开票" tone="yellow" /><Kpi title="已开发票" value="10" desc="张 · 累计 1,300 万" /><Kpi title="转化率" value="43%" desc="价值报告 → 开票" /></div>
      <Card><h2 className="text-base font-semibold text-text-primary">价值交付报告</h2><p className="mt-1 text-xs text-text-muted">基于交付内容、审核通过、医生触达、患者触达自动汇总（已脱敏）</p><div className="mt-4 grid grid-cols-1 gap-3 xl:grid-cols-2">{reports.map(([customer, month, bill, generated, status, content, flows, doctors, patients]) => <div key={`${bill}`} className="rounded-lg border border-border bg-bg-secondary/50 p-4"><div className="flex items-start justify-between"><div><div className="text-sm font-medium text-text-primary">{customer}</div><div className="mt-1 text-xs text-text-muted">账期 {month} · 关联账单 {bill} · 生成于 {generated}</div></div><Badge color={status === '待转开票' ? 'yellow' : 'green'}>{status}</Badge></div><div className="mt-4 grid grid-cols-4 gap-2 text-center"><Mini label="已交付内容" value={content} /><Mini label="已审核流程" value={flows} /><Mini label="触达医生（脱敏）" value={doctors} /><Mini label="触达患者（脱敏）" value={patients} /></div></div>)}</div></Card>
      <Card><h2 className="text-base font-semibold text-text-primary">开票申请池</h2><p className="mt-1 text-xs text-text-muted">已开发票 · 自动套用合同档案抬头 / 税号 / 银行</p><div className="mt-4 grid grid-cols-1 gap-3 xl:grid-cols-2">{invoices.map(([customer, no, bill, type, date, amount]) => <div key={no} className="rounded-lg border border-border bg-bg-secondary/50 p-4"><div className="text-sm font-medium text-text-primary">{customer}</div><div className="mt-1 text-xs text-text-muted">发票号 {no} · 关联 {bill}</div><div className="mt-2 flex justify-between text-xs text-text-secondary"><span>{type}</span><span>申请 {date} · 开具 {date}</span><span className="font-mono text-text-primary">{amount}</span></div><div className="mt-2 text-xs text-accent-green">状态：已开票</div></div>)}</div></Card>
    </FinanceShell>
  );
}

function FinanceShell({ badge, title, desc, children }: { badge: string; title: string; desc: string; children: React.ReactNode }): JSX.Element {
  return <div className="space-y-6"><div className="space-y-3"><Badge color="blue" className="text-[10px] uppercase tracking-wider">{badge}</Badge><h1 className="text-2xl font-bold text-text-primary">{title}</h1><p className="max-w-3xl text-sm text-text-secondary">{desc}</p></div>{children}</div>;
}

function Kpi({ title, desc, value, tone = 'blue' }: { title: string; desc: string; value: string; tone?: 'blue' | 'red' | 'yellow' }): JSX.Element {
  const color = tone === 'red' ? 'text-accent-red' : tone === 'yellow' ? 'text-accent-yellow' : 'text-text-primary';
  return <Card><div className="text-xs text-text-muted">{title}</div><div className="mt-1 text-[10px] text-text-muted">{desc}</div><div className={`mt-4 font-mono text-2xl font-bold ${color}`}>{value}</div></Card>;
}

function FinanceLink({ href, title, desc, metrics }: { href: string; title: string; desc: string; metrics: string }): JSX.Element {
  return <Link to={href} className="rounded-card border border-border bg-bg-card p-4 transition-colors hover:border-accent-blue/50"><div className="text-sm font-semibold text-text-primary">{title}</div><div className="mt-2 text-xs text-text-muted">{desc}</div><div className="mt-4 text-xs text-accent-blue">{metrics}</div></Link>;
}

function Todo({ href, title, desc }: { href: string; title: string; desc: string }): JSX.Element {
  return <Link to={href} className="rounded-lg border border-border bg-bg-secondary/50 p-3 hover:border-accent-blue/50"><div className="text-sm font-medium text-text-primary">{title}</div><div className="mt-1 text-xs text-text-muted">{desc}</div></Link>;
}

function Segment({ label, value, values, onChange }: { label: string; value: string; values: string[]; onChange: (value: string) => void }): JSX.Element {
  return <div className="flex flex-wrap items-center gap-2">{label && <span className="mr-1 text-xs text-text-muted">{label}</span>}{values.map((item) => <Button key={item} size="sm" variant={value === item ? 'primary' : 'secondary'} onClick={() => onChange(item)}>{item}</Button>)}</div>;
}

function Th({ children }: { children: React.ReactNode }): JSX.Element { return <th className="px-3 py-3 text-left text-xs text-text-muted">{children}</th>; }
function Td({ children }: { children: React.ReactNode }): JSX.Element { return <td className="px-3 py-3 text-xs text-text-secondary">{children}</td>; }
function Input({ label, placeholder }: { label: string; placeholder: string }): JSX.Element { return <label className="text-xs text-text-muted">{label}<input placeholder={placeholder} className="mt-1 w-full rounded-lg border border-border bg-bg-tertiary px-3 py-2 text-sm text-text-primary placeholder:text-text-muted" /></label>; }
function Mini({ label, value }: { label: React.ReactNode; value: React.ReactNode }): JSX.Element { return <div className="rounded bg-bg-card p-2"><div className="font-mono text-sm text-text-primary">{value}</div><div className="mt-1 text-[10px] text-text-muted">{label}</div></div>; }
