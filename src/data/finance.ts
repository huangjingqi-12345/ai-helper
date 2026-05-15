/**
 * Finance Mock — Px (P2) 业财数据层
 *
 * 设计原则：
 *   - 完全独立于 mock.ts，不复用任何已有类型，避免对现有功能产生任何耦合或破坏
 *   - 所有类型以 Fin* / Finance* 命名空间区分
 *   - 仅作演示与 UI 渲染用，不做真实计算引擎
 */

// ================== 1. 客户合同与订阅 ==================

export type FinPlanGroup = "px1" | "px2" | "px3";

export const FIN_PLAN_GROUP_LABEL: Record<FinPlanGroup, string> = {
  px1: "Px1 组 · 大禹计划",
  px2: "Px2 组 · 盘古计划",
  px3: "Px3 组 · 星火计划",
};

export type FinSubscriptionTier = "L1" | "L2" | "L3";

export const FIN_TIER_META: Record<FinSubscriptionTier, { label: string; monthlyFee: number; desc: string }> = {
  L1: { label: "L1 探索版", monthlyFee: 500_000, desc: "智能体基础能力 · 月费 50 万" },
  L2: { label: "L2 专业版", monthlyFee: 1_000_000, desc: "智能体专业能力 · 月费 100 万" },
  L3: { label: "L3 旗舰版", monthlyFee: 2_000_000, desc: "智能体旗舰能力 · 月费 200 万" },
};

export interface FinTenantInvoice {
  legalName: string;
  taxId: string;        // 统一社会信用代码 = 纳税人识别号
  address: string;
  phone: string;
  bankName: string;
  bankAccount: string;
}

export interface FinContact {
  name: string;
  title: string;
  phone: string;
  email: string;
}

export interface FinTenant {
  id: string;
  legalName: string;            // 客户法定全称
  taxId: string;                // 统一社会信用代码
  group: FinPlanGroup;          // 承接小组
  bd: string;                   // 销售负责人
  csm: string;                  // 客户成功经理
  invoice: FinTenantInvoice;    // 开票信息
  paymentTerms: string;         // 付款账期
  paymentMethod: string;        // 付款方式
  financeContact: FinContact;   // 财务接口人
  businessContact: FinContact;  // 商务联系人
  status: "active" | "frozen" | "churned";
  createdAt: string;
}

export interface FinContract {
  id: string;
  no: string;                       // 合同编号
  tenantId: string;
  tier: FinSubscriptionTier;        // P2 智能体版本
  monthlyFee: number;               // 冗余，便于前端
  startDate: string;
  endDate: string;
  signedAt: string;
  /** 总金额：月费 × 月数（按自然月）*/
  totalAmount: number;
  /** 合同状态：草稿（草拟） / 待签 / 生效 / 到期 / 终止 */
  status: "draft" | "pending_sign" | "active" | "expired" | "terminated";
  /** 合同附件（演示用） */
  attachment: string;
}

export interface FinSubscription {
  id: string;
  contractId: string;
  tenantId: string;
  tier: FinSubscriptionTier;
  monthlyFee: number;
  /** 订阅有效区间 */
  startDate: string;
  endDate: string;
  /** 自动续费 */
  autoRenew: boolean;
  /** 当前月已生成账单 ID */
  currentBillId?: string;
}

// ================== 2. 自动化固定费账单引擎 ==================

export interface FinBudget {
  id: string;
  group: FinPlanGroup;
  year: number;            // 年度预算
  /** 全年预算上限（元） */
  cap: number;
  /** 已签约占用 */
  committed: number;
  /** 已确认收入（账单已开票） */
  recognized: number;
}

export type FinBillStatus =
  | "scheduled"      // 已排期
  | "generated"      // 已生成（待发药企）
  | "sent"           // 已送达药企
  | "confirmed"      // 客户已对账确认
  | "invoiced"       // 已开票
  | "paid"           // 已回款
  | "overdue";       // 逾期

export const FIN_BILL_STATUS_LABEL: Record<FinBillStatus, string> = {
  scheduled: "已排期",
  generated: "已生成",
  sent: "已发送",
  confirmed: "已确认",
  invoiced: "已开票",
  paid: "已回款",
  overdue: "逾期",
};

export const FIN_BILL_STATUS_TONE: Record<FinBillStatus, string> = {
  scheduled: "border-border bg-secondary/40 text-muted-foreground",
  generated: "border-[oklch(40%_.10_70_/.55)] bg-[oklch(28%_.10_70_/.4)] text-[oklch(86%_.16_70)]",
  sent: "border-[oklch(40%_.12_240_/.55)] bg-[oklch(26%_.12_240_/.4)] text-[oklch(82%_.16_240)]",
  confirmed: "border-[oklch(40%_.12_195_/.55)] bg-[oklch(26%_.12_195_/.4)] text-[oklch(85%_.15_195)]",
  invoiced: "border-[oklch(40%_.14_300_/.55)] bg-[oklch(26%_.14_300_/.4)] text-[oklch(86%_.16_300)]",
  paid: "border-[oklch(40%_.12_165_/.55)] bg-[oklch(26%_.12_165_/.4)] text-[oklch(85%_.16_165)]",
  overdue: "border-[oklch(48%_.16_25_/.6)] bg-[oklch(28%_.14_25_/.45)] text-[oklch(82%_.18_25)]",
};

export interface FinBill {
  id: string;
  no: string;                  // 账单号 BILL-YYYYMM-XXXX
  tenantId: string;
  contractId: string;
  subscriptionId: string;
  /** 账期（YYYY-MM） */
  period: string;
  /** 应收金额 */
  amount: number;
  /** 排期日（次月 1 日自动排期）*/
  scheduledAt: string;
  /** 生成日 */
  generatedAt?: string;
  /** 发送日 */
  sentAt?: string;
  /** 客户对账确认日 */
  confirmedAt?: string;
  /** 开票申请日 */
  invoiceRequestedAt?: string;
  /** 实际回款日 */
  paidAt?: string;
  /** 应回款日（开票后 N 天）*/
  dueDate?: string;
  status: FinBillStatus;
}

export type FinReconStatus = "pending" | "in_review" | "matched" | "disputed";

export const FIN_RECON_STATUS_LABEL: Record<FinReconStatus, string> = {
  pending: "待对账",
  in_review: "对账中",
  matched: "已对平",
  disputed: "有异议",
};

export interface FinReconciliation {
  id: string;
  billId: string;
  tenantId: string;
  period: string;
  /** 系统侧应收 */
  systemAmount: number;
  /** 客户确认金额 */
  clientAmount: number;
  /** 差异金额 */
  diff: number;
  status: FinReconStatus;
  csm: string;
  createdAt: string;
  closedAt?: string;
  remark?: string;
}

export type FinDunningLevel = "soft" | "warn" | "escalate" | "legal";

export const FIN_DUNNING_LEVEL_LABEL: Record<FinDunningLevel, string> = {
  soft: "L1 友好提醒",
  warn: "L2 正式催款",
  escalate: "L3 联合催款",
  legal: "L4 法务介入",
};

export interface FinDunning {
  id: string;
  billId: string;
  tenantId: string;
  level: FinDunningLevel;
  triggeredAt: string;
  channel: "feishu" | "email" | "phone";
  owner: string;             // CSM / 财务
  result: "pending" | "promised" | "paid" | "no_reply";
  remark?: string;
}

// ================== 3. 价值交付与开票联动 ==================

export type FinValueMetric =
  | "deliverableContents"   // 已交付内容
  | "approvedFlows"         // 已审核流程
  | "doctorReach"           // 触达医生
  | "patientReach";         // 触达患者

export const FIN_VALUE_METRIC_LABEL: Record<FinValueMetric, string> = {
  deliverableContents: "已交付内容",
  approvedFlows: "已审核流程",
  doctorReach: "触达医生（脱敏）",
  patientReach: "触达患者（脱敏）",
};

export interface FinValueReport {
  id: string;
  tenantId: string;
  period: string;             // YYYY-MM
  metrics: Record<FinValueMetric, number>;
  /** 关联账单 */
  billId: string;
  generatedAt: string;
  /** 是否已转化为开票指令 */
  convertedToInvoice: boolean;
}

export type FinInvoiceStatus =
  | "draft"          // 草拟
  | "submitted"      // 已申请
  | "approved"       // 财务通过
  | "issued"         // 已开
  | "rejected";      // 退回

export const FIN_INVOICE_STATUS_LABEL: Record<FinInvoiceStatus, string> = {
  draft: "草拟",
  submitted: "已申请",
  approved: "财务通过",
  issued: "已开票",
  rejected: "退回",
};

export interface FinInvoice {
  id: string;
  no: string;
  tenantId: string;
  billId: string;
  amount: number;
  /** 发票类型 */
  type: "vat_special" | "vat_normal";
  /** 抬头与税号自动取自 tenant.invoice */
  status: FinInvoiceStatus;
  requestedAt: string;
  issuedAt?: string;
  remark?: string;
}

// ================== 4. 业财数据基座 ==================

export interface FinKpiSnapshot {
  totalSigned: number;          // 累计签约金额
  monthlyRecurring: number;     // MRR
  yearlyForecast: number;       // 年度预测
  cashCollected: number;        // 已回款
  cashOutstanding: number;      // 未回款
  overdueAmount: number;        // 逾期金额
  contractCount: number;        // 合同数
  activeTenants: number;        // 活跃租户
  collectionRate: number;       // 回款率 0-1
}

export interface FinTrendPoint {
  month: string;                // YYYY-MM
  signed: number;
  recognized: number;
  collected: number;
}

// ================== 数据 Seed ==================

const tenantSeed: Omit<FinTenant, "createdAt">[] = [
  {
    id: "ftn-01",
    legalName: "诺欣华制药（中国）有限公司",
    taxId: "91310000MA1FL8X23P",
    group: "px2",
    bd: "周明轩",
    csm: "李雨晴",
    invoice: {
      legalName: "诺欣华制药（中国）有限公司",
      taxId: "91310000MA1FL8X23P",
      address: "上海市浦东新区张江高科技园区祖冲之路 1199 号",
      phone: "021-58880088",
      bankName: "招商银行上海张江支行",
      bankAccount: "121901090210701",
    },
    paymentTerms: "开票后 30 天",
    paymentMethod: "银行电汇",
    financeContact: { name: "陈璐", title: "财务主管", phone: "13901090123", email: "lu.chen@nuoxinhua.cn" },
    businessContact: { name: "孙骁", title: "数字营销总监", phone: "13701090198", email: "x.sun@nuoxinhua.cn" },
    status: "active",
  },
  {
    id: "ftn-02",
    legalName: "阿斯利康（无锡）贸易有限公司",
    taxId: "91320200MA20H7XYZ8",
    group: "px2",
    bd: "韩雪",
    csm: "李雨晴",
    invoice: {
      legalName: "阿斯利康（无锡）贸易有限公司",
      taxId: "91320200MA20H7XYZ8",
      address: "江苏省无锡市新吴区菱湖大道 200 号",
      phone: "0510-85220088",
      bankName: "中国银行无锡新区支行",
      bankAccount: "488172991028",
    },
    paymentTerms: "开票后 45 天",
    paymentMethod: "银行电汇",
    financeContact: { name: "王琳琳", title: "应付主管", phone: "13851052901", email: "linlin.w@az.cn" },
    businessContact: { name: "周宇", title: "乳腺癌 BU 负责人", phone: "13601850923", email: "yu.zhou@az.cn" },
    status: "active",
  },
  {
    id: "ftn-03",
    legalName: "默沙东（中国）投资有限公司",
    taxId: "9131000071091823XK",
    group: "px3",
    bd: "陆斯远",
    csm: "王健",
    invoice: {
      legalName: "默沙东（中国）投资有限公司",
      taxId: "9131000071091823XK",
      address: "上海市静安区南京西路 1788 号",
      phone: "021-22082088",
      bankName: "汇丰银行（中国）上海分行",
      bankAccount: "021991900110208",
    },
    paymentTerms: "开票后 30 天",
    paymentMethod: "银行电汇",
    financeContact: { name: "梁君", title: "财务总监助理", phone: "13501790198", email: "j.liang@msd.cn" },
    businessContact: { name: "白薇", title: "乳腺癌业务负责人", phone: "13901890172", email: "w.bai@msd.cn" },
    status: "active",
  },
  {
    id: "ftn-04",
    legalName: "罗氏制药（上海）有限公司",
    taxId: "913100007109182388",
    group: "px3",
    bd: "陆斯远",
    csm: "王健",
    invoice: {
      legalName: "罗氏制药（上海）有限公司",
      taxId: "913100007109182388",
      address: "上海市浦东新区中国（上海）自贸区张衡路 1100 号",
      phone: "021-50801688",
      bankName: "德意志银行上海分行",
      bankAccount: "0188210801021",
    },
    paymentTerms: "开票后 60 天",
    paymentMethod: "银行电汇",
    financeContact: { name: "胡蔓", title: "财务经理", phone: "13701990178", email: "m.hu@roche.cn" },
    businessContact: { name: "唐隽", title: "数字健康总监", phone: "13601990192", email: "j.tang@roche.cn" },
    status: "active",
  },
  {
    id: "ftn-05",
    legalName: "礼来贸易有限公司",
    taxId: "91310000MA1FL58XYY",
    group: "px1",
    bd: "Vivian Yang",
    csm: "陈思雨",
    invoice: {
      legalName: "礼来贸易有限公司",
      taxId: "91310000MA1FL58XYY",
      address: "上海市卢湾区淮海中路 333 号瑞安广场",
      phone: "021-23230088",
      bankName: "花旗银行（中国）上海分行",
      bankAccount: "990012109800",
    },
    paymentTerms: "开票后 30 天",
    paymentMethod: "银行电汇",
    financeContact: { name: "吴佩", title: "AP 主管", phone: "13501280128", email: "p.wu@lilly.cn" },
    businessContact: { name: "苏苏", title: "乳腺癌业务总监", phone: "13901820100", email: "su.s@lilly.cn" },
    status: "active",
  },
  {
    id: "ftn-06",
    legalName: "辉瑞投资有限公司",
    taxId: "91110000710918123Y",
    group: "px3",
    bd: "高琪",
    csm: "陈思雨",
    invoice: {
      legalName: "辉瑞投资有限公司",
      taxId: "91110000710918123Y",
      address: "北京市朝阳区光华路 1 号嘉里中心北楼",
      phone: "010-65610088",
      bankName: "渣打银行北京分行",
      bankAccount: "880011207001",
    },
    paymentTerms: "开票后 45 天",
    paymentMethod: "银行电汇",
    financeContact: { name: "顾倩", title: "应付经理", phone: "13601990129", email: "q.gu@pfizer.cn" },
    businessContact: { name: "宋扬", title: "数字商业部 VP", phone: "13501990172", email: "y.song@pfizer.cn" },
    status: "active",
  },
];

export const finTenants: FinTenant[] = tenantSeed.map((t, i) => ({
  ...t,
  createdAt: ["2025-08-15", "2025-09-02", "2025-10-11", "2025-11-18", "2025-12-05", "2026-01-20"][i] ?? "2026-01-20",
}));

const contractSeed: Array<Omit<FinContract, "id" | "monthlyFee" | "totalAmount" | "attachment">> = [
  {
    no: "PXC-2025-0918-NX",
    tenantId: "ftn-01",
    tier: "L2",
    startDate: "2025-09-01",
    endDate: "2026-08-31",
    signedAt: "2025-08-25",
    status: "active",
  },
  {
    no: "PXC-2025-1009-AZ",
    tenantId: "ftn-02",
    tier: "L2",
    startDate: "2025-10-01",
    endDate: "2026-09-30",
    signedAt: "2025-09-25",
    status: "active",
  },
  {
    no: "PXC-2025-1108-MSD",
    tenantId: "ftn-03",
    tier: "L3",
    startDate: "2025-11-01",
    endDate: "2026-10-31",
    signedAt: "2025-10-28",
    status: "active",
  },
  {
    no: "PXC-2025-1215-RC",
    tenantId: "ftn-04",
    tier: "L3",
    startDate: "2025-12-01",
    endDate: "2026-11-30",
    signedAt: "2025-11-30",
    status: "active",
  },
  {
    no: "PXC-2026-0105-LL",
    tenantId: "ftn-05",
    tier: "L1",
    startDate: "2026-01-01",
    endDate: "2026-12-31",
    signedAt: "2025-12-22",
    status: "active",
  },
  {
    no: "PXC-2026-0220-PF",
    tenantId: "ftn-06",
    tier: "L3",
    startDate: "2026-02-15",
    endDate: "2027-02-14",
    signedAt: "2026-02-08",
    status: "active",
  },
  {
    no: "PXC-2026-0501-LL2",
    tenantId: "ftn-05",
    tier: "L2",
    startDate: "2026-05-01",
    endDate: "2027-04-30",
    signedAt: "2026-04-15",
    status: "pending_sign",
  },
];

function monthDiff(start: string, end: string): number {
  const s = new Date(start);
  const e = new Date(end);
  return (e.getFullYear() - s.getFullYear()) * 12 + (e.getMonth() - s.getMonth()) + 1;
}

export const finContracts: FinContract[] = contractSeed.map((c, i) => {
  const fee = FIN_TIER_META[c.tier].monthlyFee;
  return {
    ...c,
    id: `fct-${String(i + 1).padStart(2, "0")}`,
    monthlyFee: fee,
    totalAmount: fee * monthDiff(c.startDate, c.endDate),
    attachment: `${c.no}.pdf`,
  };
});

export const finSubscriptions: FinSubscription[] = finContracts
  .filter((c) => c.status === "active")
  .map((c, i) => ({
    id: `fsb-${String(i + 1).padStart(2, "0")}`,
    contractId: c.id,
    tenantId: c.tenantId,
    tier: c.tier,
    monthlyFee: c.monthlyFee,
    startDate: c.startDate,
    endDate: c.endDate,
    autoRenew: i % 3 !== 0,
  }));

// ---- 预算 ----

export const finBudgets: FinBudget[] = [
  { id: "fbg-px1-2026", group: "px1", year: 2026, cap: 100_000_000, committed: 6_000_000, recognized: 2_000_000 },
  { id: "fbg-px2-2026", group: "px2", year: 2026, cap: 220_000_000, committed: 24_000_000, recognized: 12_000_000 },
  { id: "fbg-px3-2026", group: "px3", year: 2026, cap: 300_000_000, committed: 72_000_000, recognized: 36_000_000 },
];

// ---- 账单 ----

const periodList = ["2026-01", "2026-02", "2026-03", "2026-04", "2026-05"];

interface BillPlan {
  contractId: string;
  period: string;
  status: FinBillStatus;
  paidOffsetDays?: number;
}

const billPlans: BillPlan[] = [];
finSubscriptions.forEach((sub) => {
  periodList.forEach((p) => {
    if (p < sub.startDate.slice(0, 7)) return;
    let status: FinBillStatus;
    if (p === "2026-05") status = "scheduled";
    else if (p === "2026-04") status = "sent";
    else if (p === "2026-03") status = "confirmed";
    else if (p === "2026-02") status = "invoiced";
    else status = "paid";

    // 部分账单逾期演示
    if (sub.tenantId === "ftn-04" && p === "2026-02") status = "overdue";
    if (sub.tenantId === "ftn-06" && p === "2026-03") status = "overdue";
    billPlans.push({ contractId: sub.contractId, period: p, status });
  });
});

export const finBills: FinBill[] = billPlans.map((bp, i) => {
  const sub = finSubscriptions.find((s) => s.contractId === bp.contractId)!;
  const periodEnd = new Date(`${bp.period}-01`);
  periodEnd.setMonth(periodEnd.getMonth() + 1);
  const fmt = (d: Date) => d.toISOString().slice(0, 10);
  const generatedAt = bp.status === "scheduled" ? undefined : fmt(periodEnd);
  const sentAt = ["sent", "confirmed", "invoiced", "paid", "overdue"].includes(bp.status)
    ? fmt(new Date(periodEnd.getTime() + 1 * 86400_000))
    : undefined;
  const confirmedAt = ["confirmed", "invoiced", "paid", "overdue"].includes(bp.status)
    ? fmt(new Date(periodEnd.getTime() + 4 * 86400_000))
    : undefined;
  const invoiceRequestedAt = ["invoiced", "paid", "overdue"].includes(bp.status)
    ? fmt(new Date(periodEnd.getTime() + 6 * 86400_000))
    : undefined;
  const dueDate = invoiceRequestedAt
    ? fmt(new Date(new Date(invoiceRequestedAt).getTime() + 30 * 86400_000))
    : undefined;
  const paidAt = bp.status === "paid"
    ? fmt(new Date(periodEnd.getTime() + 25 * 86400_000))
    : undefined;
  return {
    id: `fbl-${String(i + 1).padStart(3, "0")}`,
    no: `BILL-${bp.period.replace("-", "")}-${String(i + 1).padStart(4, "0")}`,
    tenantId: sub.tenantId,
    contractId: sub.contractId,
    subscriptionId: sub.id,
    period: bp.period,
    amount: sub.monthlyFee,
    scheduledAt: fmt(periodEnd),
    generatedAt,
    sentAt,
    confirmedAt,
    invoiceRequestedAt,
    paidAt,
    dueDate,
    status: bp.status,
  };
});

// ---- 对账记录 ----

export const finReconciliations: FinReconciliation[] = finBills
  .filter((b) => ["confirmed", "invoiced", "paid", "overdue"].includes(b.status))
  .map((b, i) => {
    const tenant = finTenants.find((t) => t.id === b.tenantId)!;
    // 制造一两条有异议
    const disputed = (i + 1) % 7 === 0;
    return {
      id: `frc-${String(i + 1).padStart(3, "0")}`,
      billId: b.id,
      tenantId: b.tenantId,
      period: b.period,
      systemAmount: b.amount,
      clientAmount: disputed ? b.amount - 50_000 : b.amount,
      diff: disputed ? -50_000 : 0,
      status: disputed ? "disputed" : "matched",
      csm: tenant.csm,
      createdAt: b.confirmedAt!,
      closedAt: disputed ? undefined : b.confirmedAt,
      remark: disputed ? "客户主张当期内容数低于约定 SLA，扣 5 万元待复核" : undefined,
    };
  });

// ---- 催款 ----

export const finDunnings: FinDunning[] = finBills
  .filter((b) => b.status === "overdue")
  .flatMap((b, i) => {
    const tenant = finTenants.find((t) => t.id === b.tenantId)!;
    return [
      {
        id: `fdn-${b.id}-1`,
        billId: b.id,
        tenantId: b.tenantId,
        level: "soft" as FinDunningLevel,
        triggeredAt: b.dueDate ?? b.scheduledAt,
        channel: "feishu" as const,
        owner: tenant.csm,
        result: "no_reply" as const,
      },
      {
        id: `fdn-${b.id}-2`,
        billId: b.id,
        tenantId: b.tenantId,
        level: i % 2 === 0 ? ("warn" as FinDunningLevel) : ("escalate" as FinDunningLevel),
        triggeredAt: "2026-04-22",
        channel: "email" as const,
        owner: `${tenant.csm} · 财务联合`,
        result: "promised" as const,
        remark: "客户承诺 5 月 10 日前付清",
      },
    ];
  });

// ---- 价值交付报告 ----

export const finValueReports: FinValueReport[] = finBills
  .filter((b) => ["sent", "confirmed", "invoiced", "paid", "overdue"].includes(b.status))
  .map((b, i) => ({
    id: `fvr-${String(i + 1).padStart(3, "0")}`,
    tenantId: b.tenantId,
    period: b.period,
    metrics: {
      deliverableContents: 12 + ((i * 3) % 11),
      approvedFlows: 8 + ((i * 5) % 7),
      doctorReach: 1200 + ((i * 137) % 800),
      patientReach: 18000 + ((i * 991) % 22000),
    },
    billId: b.id,
    generatedAt: b.confirmedAt ?? b.sentAt ?? b.scheduledAt,
    convertedToInvoice: ["invoiced", "paid"].includes(b.status),
  }));

// ---- 发票 ----

export const finInvoices: FinInvoice[] = finBills
  .filter((b) => ["invoiced", "paid"].includes(b.status))
  .map((b, i) => ({
    id: `fin-${String(i + 1).padStart(3, "0")}`,
    no: `${["32011", "32021", "32031"][i % 3]}${String(20260000 + i).slice(-6)}`,
    tenantId: b.tenantId,
    billId: b.id,
    amount: b.amount,
    type: i % 3 === 0 ? "vat_normal" : "vat_special",
    status: b.status === "paid" ? "issued" : "issued",
    requestedAt: b.invoiceRequestedAt!,
    issuedAt: b.invoiceRequestedAt,
  }));

// ---- 业财基座：KPI 与趋势 ----

export const finKpiSnapshot: FinKpiSnapshot = (() => {
  const totalSigned = finContracts
    .filter((c) => c.status === "active")
    .reduce((s, c) => s + c.totalAmount, 0);
  const monthlyRecurring = finSubscriptions.reduce((s, x) => s + x.monthlyFee, 0);
  const cashCollected = finBills.filter((b) => b.status === "paid").reduce((s, b) => s + b.amount, 0);
  const cashOutstanding = finBills
    .filter((b) => ["sent", "confirmed", "invoiced", "overdue"].includes(b.status))
    .reduce((s, b) => s + b.amount, 0);
  const overdueAmount = finBills.filter((b) => b.status === "overdue").reduce((s, b) => s + b.amount, 0);
  const collectionRate = cashCollected / Math.max(1, cashCollected + cashOutstanding);
  return {
    totalSigned,
    monthlyRecurring,
    yearlyForecast: monthlyRecurring * 12,
    cashCollected,
    cashOutstanding,
    overdueAmount,
    contractCount: finContracts.filter((c) => c.status === "active").length,
    activeTenants: finTenants.filter((t) => t.status === "active").length,
    collectionRate,
  };
})();

export const finTrend: FinTrendPoint[] = periodList.map((p) => {
  const monthBills = finBills.filter((b) => b.period === p);
  const signed = finContracts
    .filter((c) => c.signedAt.slice(0, 7) <= p && c.status === "active")
    .reduce((s, c) => s + c.monthlyFee, 0);
  const recognized = monthBills
    .filter((b) => ["invoiced", "paid"].includes(b.status))
    .reduce((s, b) => s + b.amount, 0);
  const collected = monthBills.filter((b) => b.status === "paid").reduce((s, b) => s + b.amount, 0);
  return { month: p, signed, recognized, collected };
});

// ---- 辅助查询 ----

export function findFinTenant(id: string) {
  return finTenants.find((t) => t.id === id);
}
export function findFinContract(id: string) {
  return finContracts.find((c) => c.id === id);
}
export function findFinBill(id: string) {
  return finBills.find((b) => b.id === id);
}

export function fmtMoney(n: number, opts: { unit?: "yuan" | "wan" } = {}): string {
  const unit = opts.unit ?? "yuan";
  if (unit === "wan") {
    return `${(n / 10_000).toLocaleString("zh-CN", { maximumFractionDigits: 1 })} 万`;
  }
  return n.toLocaleString("zh-CN");
}
