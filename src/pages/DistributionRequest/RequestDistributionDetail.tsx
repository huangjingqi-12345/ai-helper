import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  Building2,
  Calendar,
  History,
  Inbox,
  Layers,
  Minus,
  PackagePlus,
  Plus,
  Save,
  Send,
  ShieldCheck,
  Sparkles,
  Stethoscope,
} from 'lucide-react';
import { PageHeader } from '@/components/PageHeader';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { ErrorState } from '@/components/ui/ErrorState';
import { Modal } from '@/components/ui/Modal';
import { Spinner } from '@/components/ui/Spinner';
import { showToast } from '@/components/ui/Toast';
import {
  acceptDistributionRequest,
  getDistributionRequestWorkbench,
  saveRequestDistributionConfig,
  submitRequestDistributionBatch,
} from '@/api/endpoints/distribution';
import type {
  DistributionRequestStatus,
  DistributionRequestWorkbench,
  DoctorCandidate,
  RequestDistributionConfig,
  RequestDistributionMatrix,
} from '@/types/distribution';

const THEME_LABELS: Record<string, string> = {
  awareness: '疾病认知',
  screening: '早筛与诊断',
  treatment: '规范治疗',
  adverse: '不良反应应对',
  followup: '康复与随访',
  lifestyle: '生活方式',
  psychology: '心理与家属',
  timely: '节点与热点',
};

const FORMAT_OPTIONS = [
  { key: 'article', label: '长图文' },
  { key: 'poster', label: '海报' },
  { key: 'checklist', label: '手册' },
] as const;

type FormatKey = (typeof FORMAT_OPTIONS)[number]['key'];
type ActiveModal = 'accept' | 'doctor' | 'patient' | null;

const STATUS_LABELS: Record<DistributionRequestStatus, { label: string; color: 'yellow' | 'blue' | 'red' | 'green' }> = {
  pending: { label: '待受理', color: 'yellow' },
  accepted: { label: '已受理', color: 'blue' },
  rejected: { label: '已驳回', color: 'red' },
  converted: { label: '已转生产', color: 'green' },
};

const DEPARTMENT_OPTIONS = ['乳腺外科', '肿瘤内科', '放射治疗科', '中医康复科', '临床心理科'];
const TITLE_OPTIONS = ['主任医师', '副主任医师', '主治医师'];
const REGION_OPTIONS = ['全国', '华东', '华南', '华北', '西南', '华中'];
const TAG_OPTIONS = ['KOL', '患教经验丰富', 'HER2 靶向', '术后管理', 'CDK4/6 专家', '科普达人'];
const PATIENT_CHANNEL_OPTIONS = ['微信公众号', '短信', 'App Push', '企微随访', 'H5 落地页'];
const PATIENT_TAG_OPTIONS = ['术后随访', 'HER2 靶向', '服药依从', '高互动', '新诊断', '复诊提醒'];
const EMPTY_DOCTORS: DoctorCandidate[] = [];
const EMPTY_BATCHES: DistributionRequestWorkbench['batches'] = [];

const REQUEST_PROJECT_OVERRIDES: Record<string, { projectName: string; disease: string; brand: string; pharma: string }> = {
  'REQ-2030': {
    projectName: '优赫得 · HER2 ADC 重点随访',
    disease: '乳腺癌',
    brand: '优赫得',
    pharma: '阿斯利康',
  },
  'REQ-2031': {
    projectName: '优赫得 · HER2 ADC 重点随访',
    disease: '乳腺癌',
    brand: '优赫得',
    pharma: '阿斯利康',
  },
};

function cloneMatrix(matrix: RequestDistributionMatrix | undefined): RequestDistributionMatrix {
  return JSON.parse(JSON.stringify(matrix ?? {})) as RequestDistributionMatrix;
}

function matrixTotal(matrix: RequestDistributionMatrix | undefined): number {
  return Object.values(matrix ?? {}).reduce(
    (sum, row) => sum + Object.values(row ?? {}).reduce((rowSum, value) => rowSum + (Number(value) || 0), 0),
    0
  );
}

function matrixCells(matrix: RequestDistributionMatrix | undefined): string[] {
  const cells: string[] = [];
  Object.entries(matrix ?? {}).forEach(([theme, row]) => {
    Object.entries(row ?? {}).forEach(([format, count]) => {
      if (!count) return;
      const formatLabel = FORMAT_OPTIONS.find((item) => item.key === format)?.label ?? format;
      cells.push(`${THEME_LABELS[theme] ?? theme} · ${formatLabel} × ${count}`);
    });
  });
  return cells;
}

function unique(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean)));
}

export function RequestDistributionDetail(): JSX.Element {
  const { ticketId = '' } = useParams();
  const navigate = useNavigate();
  const [workbench, setWorkbench] = useState<DistributionRequestWorkbench | null>(null);
  const [config, setConfig] = useState<RequestDistributionConfig | null>(null);
  const [batchMatrix, setBatchMatrix] = useState<RequestDistributionMatrix>({});
  const [acceptNote, setAcceptNote] = useState('运营已完成合规预审，进入医生派单。');
  const [activeModal, setActiveModal] = useState<ActiveModal>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const load = async () => {
    if (!ticketId) return;
    setLoading(true);
    setError('');
    try {
      const res = await getDistributionRequestWorkbench(ticketId);
      setWorkbench(res.data);
      setConfig(res.data.config);
      setBatchMatrix(cloneMatrix(res.data.request.themeFormatMatrix));
    } catch {
      setError('诉求分发详情加载失败，请检查后端服务或工单编号。');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ticketId]);

  const request = workbench?.request;
  const doctors = workbench?.doctors ?? EMPTY_DOCTORS;
  const batches = workbench?.batches ?? EMPTY_BATCHES;
  const batchTotal = useMemo(() => matrixTotal(batchMatrix), [batchMatrix]);
  const whitelistQuotaTotal = useMemo(() => {
    if (!config?.whitelistEnabled) return 0;
    return Object.entries(config.whitelistDoctorQuota ?? {})
      .filter(([doctorId]) => config.whitelistDoctorIds.includes(doctorId))
      .reduce((sum, [, value]) => sum + Math.max(0, Number(value) || 0), 0);
  }, [config]);
  const whitelistTotal = Math.min(batchTotal, whitelistQuotaTotal);
  const strategyTotal = config?.strategyEnabled ? Math.max(0, batchTotal - whitelistTotal) : 0;
  const unassignedTotal = Math.max(0, batchTotal - whitelistTotal - strategyTotal);

  const filteredDoctors = useMemo(() => {
    if (!config) return doctors;
    return doctors.filter((doctor) => {
      const deptOk = config.departmentFilters.length === 0 || config.departmentFilters.includes(doctor.dept);
      const titleOk = config.titleFilters.length === 0 || config.titleFilters.includes(doctor.title);
      const regionOk = config.regionFilters.length === 0 || config.regionFilters.includes(doctor.region) || config.regionFilters.includes('全国');
      const tagOk = config.tagFilters.length === 0 || doctor.tags.some((tag) => config.tagFilters.includes(tag));
      return deptOk && titleOk && regionOk && tagOk;
    });
  }, [config, doctors]);

  const saveConfig = async (nextConfig = config) => {
    if (!nextConfig || !ticketId) return;
    setSaving(true);
    try {
      const res = await saveRequestDistributionConfig(ticketId, nextConfig);
      setConfig(res.data);
      setWorkbench((current) => current ? { ...current, config: res.data } : current);
      showToast('诉求级分发策略已保存', 'success');
    } catch {
      showToast('保存策略失败，请检查后端服务', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleAccept = async () => {
    if (!request) return;
    setSaving(true);
    try {
      const res = await acceptDistributionRequest(request.id, acceptNote.trim());
      setWorkbench((current) => current ? { ...current, request: res.data } : current);
      showToast(`已受理拆单：${request.id}`, 'success');
      setActiveModal(null);
    } catch {
      showToast('受理拆单失败，请检查权限或后端服务', 'error');
    } finally {
      setSaving(false);
    }
  };

  const updateCell = (theme: string, format: FormatKey, nextValue: number) => {
    const cap = Number(request?.themeFormatMatrix?.[theme]?.[format] ?? 0);
    const value = Math.max(0, Math.min(cap, Math.floor(nextValue || 0)));
    setBatchMatrix((current) => {
      const next = cloneMatrix(current);
      next[theme] = { ...(next[theme] ?? {}) };
      if (value <= 0) delete next[theme]![format];
      else next[theme]![format] = value;
      if (Object.keys(next[theme] ?? {}).length === 0) delete next[theme];
      return next;
    });
  };

  const submitBatch = async () => {
    if (!request) return;
    if (batchTotal <= 0) return showToast('请先填写本次分发的主题 × 形式篇数', 'error');
    if (unassignedTotal > 0) return showToast(`还有 ${unassignedTotal} 篇未分配，请启用策略分发或提高医生指定篇数`, 'error');
    setSaving(true);
    try {
      const res = await submitRequestDistributionBatch(request.id, {
        batchMatrix,
        whitelistTotal,
        strategyTotal,
      });
      setWorkbench((current) => current ? {
        ...current,
        request: { ...current.request, status: current.request.status === 'pending' ? 'accepted' : current.request.status },
        batches: [res.data, ...current.batches],
      } : current);
      setBatchMatrix({});
      showToast(`已提交本批分发 ${res.data.totalCount} 篇`, 'success');
    } catch {
      showToast('提交分发批次失败，请检查后端服务', 'error');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="flex justify-center py-16"><Spinner size="lg" /></div>;
  }

  if (error) return <ErrorState message={error} onRetry={load} />;

  if (!request || !config) {
    return (
      <div className="space-y-4">
        <button onClick={() => navigate('/distribute')} className="inline-flex items-center gap-1 text-xs text-text-muted hover:text-text-primary"><ArrowLeft className="h-3.5 w-3.5" /> 返回分发策略</button>
        <Card className="py-10 text-center text-sm text-text-muted">诉求 {ticketId || '未指定'} 不存在或已删除。</Card>
      </div>
    );
  }

  const status = STATUS_LABELS[request.status] ?? STATUS_LABELS.pending;
  const projectOverride = REQUEST_PROJECT_OVERRIDES[request.id];
  const displayProjectName = projectOverride?.projectName || request.project?.name || request.project?.title || request.projectId;
  const displayDisease = projectOverride?.disease || request.project?.disease || '—';
  const displayBrand = projectOverride?.brand || request.project?.brand || '—';
  const displayPharma = projectOverride?.pharma || request.project?.brand || request.project?.name || request.tenantId;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2 text-xs text-text-muted">
        <Link to="/distribute" className="inline-flex items-center gap-1 hover:text-text-primary"><ArrowLeft className="h-3.5 w-3.5" /> 返回分发策略</Link>
        {displayProjectName && <><span>/</span><span>项目 · {displayProjectName}</span></>}
      </div>

      <PageHeader
        eyebrow="REQUEST DISTRIBUTION"
        title={`诉求 · ${request.requestName || request.title}`}
        subtitle={`所属项目 · ${displayProjectName}（${displayDisease}${displayBrand !== '—' ? ` · ${displayBrand}` : ''}）`}
        meta={
          <div className="flex flex-wrap items-center gap-2 text-[12px] text-muted-foreground">
            <Tag>{request.id}</Tag>
            <Badge color={request.priority === 'P0' ? 'red' : request.priority === 'P1' ? 'yellow' : 'gray'}>{request.priority}</Badge>
            <Badge color={status.color}>{status.label}</Badge>
            <Tag><Calendar className="mr-1 inline h-3.5 w-3.5" />期望 {request.expectedDate || '—'}</Tag>
            <Tag><Building2 className="mr-1 inline h-3.5 w-3.5" />{displayPharma}</Tag>
            <Tag>合计 <span className="tabular text-foreground">{request.totalCount}</span> 篇</Tag>
          </div>
        }
      />

      <RequestMatrixSummary matrix={request.themeFormatMatrix} />

      <div className="flex items-start gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-[12px] text-amber-200">
        <Inbox className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        <div>
          当前显示<strong className="mx-0.5">项目默认医生分发策略</strong>。任何修改将作为本诉求专属策略保存，不再随项目变化。
        </div>
      </div>

      <BatchMatrixCard
        sourceMatrix={request.themeFormatMatrix}
        batchMatrix={batchMatrix}
        batchTotal={batchTotal}
        whitelistTotal={whitelistTotal}
        strategyTotal={strategyTotal}
        unassignedTotal={unassignedTotal}
        onFill={() => setBatchMatrix(cloneMatrix(request.themeFormatMatrix))}
        onClear={() => setBatchMatrix({})}
        onUpdateCell={updateCell}
        onSubmit={submitBatch}
        saving={saving}
      />

      <Card className="space-y-4 bg-card/60">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-[14px] font-semibold text-foreground">分发方式（可同时启用）</div>
            <p className="mt-1 text-[12px] text-muted-foreground">指定分发与策略分发均会写入诉求级分发配置；策略分发按医生互动数 desc 自动派发剩余额度。</p>
          </div>
          <Button size="sm" onClick={() => void saveConfig()} disabled={saving}><Save className="h-4 w-4" />保存策略</Button>
        </div>
        <DoctorPolicyPanel config={config} doctors={doctors} filteredDoctors={filteredDoctors} onChange={setConfig} />
      </Card>

      <HistoryCard batches={batches} />

      <Modal
        open={activeModal === 'accept'}
        onClose={() => setActiveModal(null)}
        title="受理拆单"
        footer={<><Button variant="secondary" onClick={() => setActiveModal(null)}>取消</Button><Button onClick={handleAccept} disabled={saving}>确认受理</Button></>}
      >
        <div className="space-y-4">
          <div className="rounded-lg border border-border bg-bg-tertiary p-3 text-sm text-text-secondary">
            受理后，工单会进入医生派单与内容制作流程，并在审计日志中留痕。当前状态：<span className="text-text-primary">{status.label}</span>
          </div>
          <label className="block text-sm text-text-secondary">
            受理备注
            <textarea value={acceptNote} onChange={(event) => setAcceptNote(event.target.value)} className="mt-1 h-24 w-full rounded-lg border border-border bg-bg-tertiary px-3 py-2 text-sm text-text-primary outline-none focus:border-accent-blue" />
          </label>
        </div>
      </Modal>

      <Modal
        open={activeModal === 'doctor'}
        onClose={() => setActiveModal(null)}
        title="医生分发策略"
        maxWidth="max-w-5xl"
        footer={<><Button variant="secondary" onClick={() => setActiveModal(null)}>关闭</Button><Button onClick={() => { void saveConfig(); setActiveModal(null); }} disabled={saving}>保存医生策略</Button></>}
      >
        <DoctorPolicyPanel config={config} doctors={doctors} filteredDoctors={filteredDoctors} onChange={setConfig} />
      </Modal>

      <Modal
        open={activeModal === 'patient'}
        onClose={() => setActiveModal(null)}
        title="患者分发策略"
        maxWidth="max-w-3xl"
        footer={<><Button variant="secondary" onClick={() => setActiveModal(null)}>关闭</Button><Button onClick={() => { void saveConfig(); setActiveModal(null); }} disabled={saving}>保存患者策略</Button></>}
      >
        <PatientPolicyPanel config={config} onChange={setConfig} />
      </Modal>
    </div>
  );
}

function RequestMatrixSummary({ matrix }: { matrix: RequestDistributionMatrix }): JSX.Element | null {
  const themes = Object.keys(matrix ?? {});
  if (themes.length === 0) return null;
  const formatTotals = FORMAT_OPTIONS.map((format) => ({
    ...format,
    count: themes.reduce((sum, theme) => sum + Number(matrix[theme]?.[format.key] ?? 0), 0),
  })).filter((format) => format.count > 0);

  return (
    <div className="grid gap-3 rounded-lg border border-border bg-card/40 p-4 md:grid-cols-2">
      <div className="flex items-start gap-2">
        <Layers className="mt-0.5 h-4 w-4 text-primary" />
        <div className="flex-1">
          <div className="text-[11.5px] text-muted-foreground">主题（{themes.length}）</div>
          <div className="mt-1 flex flex-wrap gap-1.5">
            {themes.map((theme) => (
              <Badge key={theme} color="gray" className="border-border/60 px-1.5 py-0 text-[11px]">
                {THEME_LABELS[theme] ?? theme}
              </Badge>
            ))}
          </div>
        </div>
      </div>
      <div className="flex items-start gap-2">
        <Send className="mt-0.5 h-4 w-4 text-primary" />
        <div className="flex-1">
          <div className="text-[11.5px] text-muted-foreground">形式合计</div>
          <div className="mt-1 flex flex-wrap gap-1.5">
            {formatTotals.map((format) => (
              <Badge key={format.key} color="gray" className="border-border/60 px-1.5 py-0 text-[11px]">
                {format.label} × {format.count}
              </Badge>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function Tag({ children }: { children: React.ReactNode }): JSX.Element {
  return <span className="rounded border border-border bg-muted/30 px-2 py-0.5">{children}</span>;
}

function BatchMatrixCard({
  sourceMatrix,
  batchMatrix,
  batchTotal,
  whitelistTotal,
  strategyTotal,
  unassignedTotal,
  onFill,
  onClear,
  onUpdateCell,
  onSubmit,
  saving,
}: {
  sourceMatrix: RequestDistributionMatrix;
  batchMatrix: RequestDistributionMatrix;
  batchTotal: number;
  whitelistTotal: number;
  strategyTotal: number;
  unassignedTotal: number;
  onFill: () => void;
  onClear: () => void;
  onUpdateCell: (theme: string, format: FormatKey, value: number) => void;
  onSubmit: () => void;
  saving: boolean;
}): JSX.Element {
  const themes = Object.keys(sourceMatrix ?? {});
  return (
    <Card>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2"><PackagePlus className="h-4 w-4 text-accent-blue" /><h2 className="text-base font-semibold text-text-primary">本次分发批次 · 主题 × 形式篇数</h2></div>
          <p className="mt-1 text-xs text-text-muted">每次提交批次都写入数据库，历史批次可用于核对每次消化的诉求额度。</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge color="blue">本批 {batchTotal} 篇</Badge>
          <Button variant="secondary" size="sm" onClick={onFill}><Sparkles className="h-3.5 w-3.5" />按诉求额度回填</Button>
          <Button variant="secondary" size="sm" onClick={onClear}>清空</Button>
        </div>
      </div>

      {themes.length === 0 ? (
        <div className="mt-4 rounded-lg border border-dashed border-border bg-bg-secondary p-8 text-center text-sm text-text-muted">诉求未设置主题 × 形式矩阵。</div>
      ) : (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm">
            <thead className="text-xs text-text-muted">
              <tr className="border-b border-border">
                <th className="px-2 py-2 text-left font-medium">主题</th>
                {FORMAT_OPTIONS.map((format) => <th key={format.key} className="px-2 py-2 text-left font-medium">{format.label}</th>)}
                <th className="px-2 py-2 text-right font-medium">行合计</th>
              </tr>
            </thead>
            <tbody>
              {themes.map((theme) => {
                const row = batchMatrix[theme] ?? {};
                const rowTotal = Object.values(row).reduce((sum, value) => sum + (Number(value) || 0), 0);
                return (
                  <tr key={theme} className="border-b border-border/60">
                    <td className="px-2 py-3 text-text-primary">{THEME_LABELS[theme] ?? theme}</td>
                    {FORMAT_OPTIONS.map((format) => {
                      const cap = Number(sourceMatrix[theme]?.[format.key] ?? 0);
                      const value = Number(row[format.key] ?? 0);
                      if (cap <= 0) return <td key={format.key} className="px-2 py-3 text-text-muted/50">—</td>;
                      return (
                        <td key={format.key} className="px-2 py-3">
                          <div className="inline-flex items-center gap-1">
                            <Button variant="secondary" size="sm" onClick={() => onUpdateCell(theme, format.key, value - 1)} aria-label={`减少${THEME_LABELS[theme] ?? theme}${format.label}`}><Minus className="h-3 w-3" /></Button>
                            <input value={value} type="number" min={0} max={cap} onChange={(event) => onUpdateCell(theme, format.key, Number(event.target.value))} className="h-8 w-14 rounded border border-border bg-bg-tertiary px-2 text-center text-text-primary" />
                            <Button variant="secondary" size="sm" onClick={() => onUpdateCell(theme, format.key, value + 1)} aria-label={`增加${THEME_LABELS[theme] ?? theme}${format.label}`}><Plus className="h-3 w-3" /></Button>
                            <span className="ml-1 text-[10px] text-text-muted">/ {cap}</span>
                          </div>
                        </td>
                      );
                    })}
                    <td className="px-2 py-3 text-right font-mono text-text-primary">{rowTotal}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <div className="mt-4 flex flex-wrap items-center justify-end gap-3 border-t border-border pt-4 text-xs text-text-muted">
        <span>指定医生 {whitelistTotal} 篇</span>
        <span>策略自动 {strategyTotal} 篇</span>
        {unassignedTotal > 0 && <span className="text-accent-red">未分配 {unassignedTotal} 篇</span>}
        <Button onClick={onSubmit} disabled={saving || batchTotal <= 0}><Send className="h-4 w-4" />提交本批分发</Button>
      </div>
    </Card>
  );
}

function DoctorPolicyPanel({
  config,
  doctors,
  filteredDoctors,
  onChange,
}: {
  config: RequestDistributionConfig;
  doctors: DoctorCandidate[];
  filteredDoctors: DoctorCandidate[];
  onChange: (config: RequestDistributionConfig) => void;
}): JSX.Element {
  const patch = (partial: Partial<RequestDistributionConfig>) => onChange({ ...config, ...partial });
  const toggleDoctor = (doctorId: string) => {
    const selected = config.whitelistDoctorIds.includes(doctorId);
    const nextIds = selected ? config.whitelistDoctorIds.filter((id) => id !== doctorId) : [...config.whitelistDoctorIds, doctorId];
    const nextQuota = { ...config.whitelistDoctorQuota };
    if (selected) delete nextQuota[doctorId];
    else nextQuota[doctorId] = nextQuota[doctorId] ?? 1;
    patch({ whitelistDoctorIds: nextIds, whitelistDoctorQuota: nextQuota });
  };

  return (
    <div className="grid gap-5 lg:grid-cols-[320px_1fr]">
      <section className="space-y-4 rounded-xl border border-border bg-bg-primary/40 p-4">
        <div className="flex items-center gap-2 text-sm font-semibold text-text-primary"><ShieldCheck className="h-4 w-4 text-accent-blue" />分发方式</div>
        <label className="flex items-center justify-between rounded-lg border border-border bg-bg-tertiary p-3 text-sm text-text-secondary">
          指定分发
          <input type="checkbox" checked={config.whitelistEnabled} onChange={(event) => patch({ whitelistEnabled: event.target.checked })} />
        </label>
        <label className="flex items-center justify-between rounded-lg border border-border bg-bg-tertiary p-3 text-sm text-text-secondary">
          策略分发（互动数 desc）
          <input type="checkbox" checked={config.strategyEnabled} onChange={(event) => patch({ strategyEnabled: event.target.checked })} />
        </label>
        <div>
          <div className="mb-2 text-xs text-text-muted">科室</div>
          <Chips values={config.departmentFilters} options={unique([...DEPARTMENT_OPTIONS, ...doctors.map((doctor) => doctor.dept)])} onChange={(departmentFilters) => patch({ departmentFilters })} />
        </div>
        <div>
          <div className="mb-2 text-xs text-text-muted">职称</div>
          <Chips values={config.titleFilters} options={unique([...TITLE_OPTIONS, ...doctors.map((doctor) => doctor.title)])} onChange={(titleFilters) => patch({ titleFilters })} />
        </div>
        <div>
          <div className="mb-2 text-xs text-text-muted">区域</div>
          <Chips values={config.regionFilters} options={unique([...REGION_OPTIONS, ...doctors.map((doctor) => doctor.region)])} onChange={(regionFilters) => patch({ regionFilters })} />
        </div>
        <div>
          <div className="mb-2 text-xs text-text-muted">标签</div>
          <Chips values={config.tagFilters} options={unique([...TAG_OPTIONS, ...doctors.flatMap((doctor) => doctor.tags)])} onChange={(tagFilters) => patch({ tagFilters })} />
        </div>
      </section>

      <section className="space-y-3 rounded-xl border border-border bg-bg-primary/40 p-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 text-sm font-semibold text-text-primary"><Stethoscope className="h-4 w-4 text-accent-blue" />候选医生池</div>
            <div className="mt-1 text-xs text-text-muted">命中 {filteredDoctors.length} / {doctors.length} 位，可勾选医生并填写指定篇数。</div>
          </div>
          <Button variant="secondary" size="sm" onClick={() => {
            const ids = filteredDoctors.map((doctor) => doctor.id);
            const quota = { ...config.whitelistDoctorQuota };
            ids.forEach((id) => { quota[id] = quota[id] ?? 1; });
            patch({ whitelistDoctorIds: ids, whitelistDoctorQuota: quota });
          }}>全选命中</Button>
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          {filteredDoctors.map((doctor) => {
            const selected = config.whitelistDoctorIds.includes(doctor.id);
            return (
              <div key={doctor.id} className={`rounded-lg border p-3 ${selected ? 'border-accent-blue bg-accent-blue/10' : 'border-border bg-bg-secondary/60'}`}>
                <div className="flex items-start justify-between gap-3">
                  <button type="button" onClick={() => toggleDoctor(doctor.id)} className="text-left">
                    <div className="text-sm font-semibold text-text-primary">{doctor.name} · {doctor.title}</div>
                    <div className="mt-1 text-xs text-text-muted">{doctor.dept} · {doctor.region} · {doctor.hospital || '—'}</div>
                    <div className="mt-2 flex flex-wrap gap-1">{doctor.tags.map((tag) => <Badge key={tag} color="gray">{tag}</Badge>)}</div>
                  </button>
                  <input type="checkbox" checked={selected} onChange={() => toggleDoctor(doctor.id)} />
                </div>
                {selected && (
                  <label className="mt-3 block text-xs text-text-muted">
                    指定篇数
                    <input type="number" min={0} value={config.whitelistDoctorQuota[doctor.id] ?? 1} onChange={(event) => patch({ whitelistDoctorQuota: { ...config.whitelistDoctorQuota, [doctor.id]: Math.max(0, Number(event.target.value) || 0) } })} className="mt-1 w-full rounded-lg border border-border bg-bg-tertiary px-3 py-2 text-sm text-text-primary" />
                  </label>
                )}
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}

function PatientPolicyPanel({ config, onChange }: { config: RequestDistributionConfig; onChange: (config: RequestDistributionConfig) => void }): JSX.Element {
  const patch = (partial: Partial<RequestDistributionConfig>) => onChange({ ...config, ...partial });
  return (
    <div className="space-y-5">
      <div className="grid gap-4 md:grid-cols-2">
        <section className="rounded-xl border border-border bg-bg-primary/40 p-4">
          <div className="mb-2 text-sm font-semibold text-text-primary">触达渠道</div>
          <Chips values={config.patientChannels} options={PATIENT_CHANNEL_OPTIONS} onChange={(patientChannels) => patch({ patientChannels })} />
        </section>
        <section className="rounded-xl border border-border bg-bg-primary/40 p-4">
          <div className="mb-2 text-sm font-semibold text-text-primary">患者标签</div>
          <Chips values={config.patientTags} options={PATIENT_TAG_OPTIONS} onChange={(patientTags) => patch({ patientTags })} />
        </section>
        <section className="rounded-xl border border-border bg-bg-primary/40 p-4">
          <div className="mb-2 text-sm font-semibold text-text-primary">区域</div>
          <Chips values={config.patientRegions} options={REGION_OPTIONS} onChange={(patientRegions) => patch({ patientRegions })} />
        </section>
        <section className="rounded-xl border border-border bg-bg-primary/40 p-4">
          <div className="grid gap-3 md:grid-cols-2">
            <label className="text-xs text-text-muted">灰度比例（%）<input type="number" min={0} max={100} value={config.patientGrayPercent} onChange={(event) => patch({ patientGrayPercent: Math.max(0, Math.min(100, Number(event.target.value) || 0)) })} className="mt-1 w-full rounded-lg border border-border bg-bg-tertiary px-3 py-2 text-sm text-text-primary" /></label>
            <label className="text-xs text-text-muted">患者上限<input type="number" min={0} value={config.patientCap} onChange={(event) => patch({ patientCap: Math.max(0, Number(event.target.value) || 0) })} className="mt-1 w-full rounded-lg border border-border bg-bg-tertiary px-3 py-2 text-sm text-text-primary" /></label>
          </div>
        </section>
      </div>
      <label className="block text-sm text-text-secondary">
        策略备注
        <textarea value={config.note ?? ''} onChange={(event) => patch({ note: event.target.value })} className="mt-1 h-24 w-full rounded-lg border border-border bg-bg-tertiary px-3 py-2 text-sm text-text-primary outline-none focus:border-accent-blue" />
      </label>
    </div>
  );
}

function HistoryCard({ batches }: { batches: DistributionRequestWorkbench['batches'] }): JSX.Element {
  return (
    <Card>
      <div className="flex items-center gap-2"><History className="h-4 w-4 text-accent-blue" /><h2 className="text-base font-semibold text-text-primary">历史分发批次</h2><Badge color="gray">{batches.length} 次</Badge></div>
      {batches.length === 0 ? (
        <div className="mt-4 rounded-lg border border-dashed border-border bg-bg-secondary p-8 text-center text-sm text-text-muted">暂无历史分发批次。</div>
      ) : (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-xs text-text-muted"><tr className="border-b border-border"><th className="px-2 py-2 text-left font-medium">批次</th><th className="px-2 py-2 text-left font-medium">时间</th><th className="px-2 py-2 text-left font-medium">操作人</th><th className="px-2 py-2 text-left font-medium">主题×形式</th><th className="px-2 py-2 text-right font-medium">指定 / 策略 / 合计</th></tr></thead>
            <tbody>{batches.map((batch) => <tr key={batch.id} className="border-b border-border/60"><td className="px-2 py-3 font-mono text-xs text-text-muted">{batch.id}</td><td className="px-2 py-3 text-xs text-text-secondary">{batch.submittedAt}</td><td className="px-2 py-3 text-xs text-text-secondary">{batch.operator || 'PX 运营组'}</td><td className="px-2 py-3"><div className="flex flex-wrap gap-1">{matrixCells(batch.batchMatrix).map((cell) => <Badge key={cell} color="gray">{cell}</Badge>)}</div></td><td className="px-2 py-3 text-right font-mono text-xs text-text-primary">{batch.whitelistTotal} / {batch.strategyTotal} / {batch.totalCount}</td></tr>)}</tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

function Chips({ values, options, onChange }: { values: string[]; options: string[]; onChange: (values: string[]) => void }): JSX.Element {
  const valueSet = new Set(values);
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((option) => {
        const active = valueSet.has(option);
        return <button key={option} type="button" onClick={() => onChange(active ? values.filter((item) => item !== option) : [...values, option])} className={`rounded border px-2 py-1 text-xs transition-colors ${active ? 'border-accent-blue bg-accent-blue/15 text-accent-blue' : 'border-border bg-bg-tertiary text-text-muted hover:text-text-primary'}`}>{option}</button>;
      })}
    </div>
  );
}
