import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  Activity,
  ArrowLeft,
  Building2,
  Calendar,
  CheckSquare,
  History,
  Layers,
  Minus,
  PackagePlus,
  Plus,
  Save,
  Send,
  ShieldCheck,
  Sparkles,
  Square,
  Users,
} from 'lucide-react';
import { PageHeader } from '@/components/PageHeader';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { ErrorState } from '@/components/ui/ErrorState';
import { Spinner } from '@/components/ui/Spinner';
import { showToast } from '@/components/ui/Toast';
import {
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

const TITLE_OPTIONS = ['主任医师', '副主任医师', '主治医师', '住院医师'];

type FormatKey = (typeof FORMAT_OPTIONS)[number]['key'];
type DoctorAssignment = { doctorId: string; count: number };

const STATUS_LABELS: Record<DistributionRequestStatus, { label: string; color: 'yellow' | 'blue' | 'red' | 'green' }> = {
  pending: { label: '待受理', color: 'yellow' },
  accepted: { label: '已受理', color: 'blue' },
  rejected: { label: '已驳回', color: 'red' },
  converted: { label: '已转生产', color: 'green' },
};

const EMPTY_DOCTORS: DoctorCandidate[] = [];
const EMPTY_BATCHES: DistributionRequestWorkbench['batches'] = [];

const REQUEST_PROJECT_OVERRIDES: Record<string, { projectId: string; projectName: string; disease: string; brand: string; pharma: string }> = {
  'REQ-2030': {
    projectId: 'PRJ-1001',
    projectName: '优赫得 · HER2 ADC 重点随访',
    disease: '乳腺癌',
    brand: '优赫得',
    pharma: '阿斯利康',
  },
  'REQ-2031': {
    projectId: 'PRJ-1000',
    projectName: '赫赛汀 · HER2+ 术后辅助随访计划',
    disease: '乳腺癌',
    brand: '赫赛汀',
    pharma: '罗氏',
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
      cells.push(`${THEME_LABELS[theme] ?? theme}·${formatLabel}×${count}`);
    });
  });
  return cells;
}

function titleMatches(doctorTitle: string, selectedTitles: string[]): boolean {
  if (selectedTitles.length === 0) return true;
  const title = doctorTitle.trim();
  if (!title || title === '未填写职称') return false;
  return selectedTitles.some((selected) => title.includes(selected) || selected.includes(title));
}

function doctorExperience(doctor: DoctorCandidate): number {
  return doctor.publishedCount;
}

function doctorWorkload(doctor: DoctorCandidate): number {
  return doctor.inProgressCount;
}

function sortByWorkloadAsc(doctors: DoctorCandidate[]): DoctorCandidate[] {
  return [...doctors].sort((a, b) => {
    const workloadDelta = doctorWorkload(a) - doctorWorkload(b);
    if (workloadDelta !== 0) return workloadDelta;
    return doctorExperience(b) - doctorExperience(a);
  });
}

function allocateStrategy(candidates: DoctorCandidate[], contentCount: number): DoctorAssignment[] {
  if (contentCount <= 0 || candidates.length === 0) return [];
  if (contentCount > candidates.length) {
    const base = Math.floor(contentCount / candidates.length);
    let remainder = contentCount - base * candidates.length;
    return candidates.map((doctor) => {
      const extra = remainder > 0 ? 1 : 0;
      if (extra) remainder -= 1;
      return { doctorId: doctor.id, count: base + extra };
    });
  }
  return candidates.slice(0, contentCount).map((doctor) => ({ doctorId: doctor.id, count: 1 }));
}

function defaultDoctorDistributionConfig(config: RequestDistributionConfig): RequestDistributionConfig {
  return {
    ...config,
    assignmentMode: 'strategy',
    whitelistEnabled: false,
    strategyEnabled: true,
    departmentFilters: [],
    titleFilters: [],
    regionFilters: [],
    tagFilters: [],
    whitelistDoctorIds: [],
    whitelistDoctorQuota: {},
  };
}

function normalizeDoctorConfig(config: RequestDistributionConfig, doctors: DoctorCandidate[]): RequestDistributionConfig {
  const validDoctorIds = new Set(doctors.map((doctor) => doctor.id));
  const hasRemoteDoctors = doctors.some((doctor) => doctor.phone || doctor.doctorId > 0);
  const hasLegacyDemoDoctorIds = config.whitelistDoctorIds.some((id) => id.startsWith('doc_'));
  const legacyDemoTitleDefaults = config.titleFilters.length === 2
    && config.titleFilters.includes('主任医师')
    && config.titleFilters.includes('副主任医师');
  const whitelistDoctorIds = config.whitelistDoctorIds.filter((id) => validDoctorIds.has(id));
  const whitelistDoctorQuota = Object.fromEntries(
    Object.entries(config.whitelistDoctorQuota).filter(([id]) => whitelistDoctorIds.includes(id))
  );
  const clearLegacyDefaults = hasRemoteDoctors && hasLegacyDemoDoctorIds && legacyDemoTitleDefaults;
  const whitelistEnabled = clearLegacyDefaults ? false : config.whitelistEnabled && whitelistDoctorIds.length > 0;
  return {
    ...config,
    assignmentMode: whitelistEnabled && config.strategyEnabled ? 'mixed' : whitelistEnabled ? 'whitelist' : 'strategy',
    whitelistEnabled,
    titleFilters: clearLegacyDefaults ? [] : config.titleFilters,
    whitelistDoctorIds,
    whitelistDoctorQuota,
  };
}

export function RequestDistributionDetail(): JSX.Element {
  const { ticketId = '' } = useParams();
  const navigate = useNavigate();
  const [workbench, setWorkbench] = useState<DistributionRequestWorkbench | null>(null);
  const [config, setConfig] = useState<RequestDistributionConfig | null>(null);
  const [batchMatrix, setBatchMatrix] = useState<RequestDistributionMatrix>({});
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
      setConfig(normalizeDoctorConfig(res.data.config, res.data.doctors));
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
  const defaultConfig = useMemo(() => config ? defaultDoctorDistributionConfig(config) : null, [config]);
  const whitelistQuotaTotal = useMemo(() => {
    if (!config?.whitelistEnabled) return 0;
    return Object.entries(config.whitelistDoctorQuota ?? {})
      .filter(([doctorId]) => config.whitelistDoctorIds.includes(doctorId))
      .reduce((sum, [, value]) => sum + Math.max(0, Number(value) || 0), 0);
  }, [config]);
  const whitelistTotal = Math.min(batchTotal, whitelistQuotaTotal);
  const strategyTotal = config?.strategyEnabled ? Math.max(0, batchTotal - whitelistTotal) : 0;
  const unassignedTotal = Math.max(0, batchTotal - whitelistTotal - strategyTotal);

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

  if (!request || !config || !defaultConfig) {
    return (
      <div className="space-y-4">
        <button onClick={() => navigate('/distribute')} className="inline-flex items-center gap-1 text-xs text-text-muted hover:text-text-primary"><ArrowLeft className="h-3.5 w-3.5" /> 返回分发策略</button>
        <Card className="py-10 text-center text-sm text-text-muted">诉求 {ticketId || '未指定'} 不存在或已删除。</Card>
      </div>
    );
  }

  const status = STATUS_LABELS[request.status] ?? STATUS_LABELS.pending;
  const projectOverride = REQUEST_PROJECT_OVERRIDES[request.id];
  const displayProjectId = projectOverride?.projectId || request.project?.id || request.projectId;
  const displayProjectName = projectOverride?.projectName || request.project?.name || request.project?.title || request.projectId;
  const displayDisease = projectOverride?.disease || request.project?.disease || '—';
  const displayBrand = projectOverride?.brand || request.project?.brand || '—';
  const displayPharma = projectOverride?.pharma || request.project?.brand || request.project?.name || request.tenantId;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2 text-xs text-text-muted">
        <Link to="/distribute" className="inline-flex items-center gap-1 hover:text-text-primary"><ArrowLeft className="h-3.5 w-3.5" /> 返回分发策略</Link>
        {displayProjectName && <><span>/</span><Link to={`/distribute/${displayProjectId}`} className="hover:text-text-primary">项目 · {displayProjectName}</Link></>}
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
        <Users className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        <div>
          当前显示<strong className="mx-0.5">项目默认医生分发策略</strong>。任何修改将作为本诉求专属策略保存，不再随项目变化。
        </div>
      </div>

      <BatchMatrixCard
        sourceMatrix={request.themeFormatMatrix}
        batchMatrix={batchMatrix}
        batchTotal={batchTotal}
        unassignedTotal={unassignedTotal}
        onFill={() => setBatchMatrix(cloneMatrix(request.themeFormatMatrix))}
        onClear={() => setBatchMatrix({})}
        onUpdateCell={updateCell}
        onSubmit={submitBatch}
        saving={saving}
      />

      <DoctorPolicyEditor
        config={config}
        defaultConfig={defaultConfig}
        doctors={doctors}
        contentCount={batchTotal}
        saving={saving}
        onChange={setConfig}
        onSave={saveConfig}
      />

      <HistoryCard batches={batches} />
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

function Tag({ children }: { children: ReactNode }): JSX.Element {
  return <span className="rounded border border-border bg-muted/30 px-2 py-0.5">{children}</span>;
}

function BatchMatrixCard({
  sourceMatrix,
  batchMatrix,
  batchTotal,
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
          <div className="flex items-center gap-2"><PackagePlus className="h-4 w-4 text-accent-blue" /><h2 className="text-base font-semibold text-text-primary">本次分发批次 · 主题 × 形式 篇数</h2></div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1 rounded border border-accent-blue/35 bg-accent-blue/15 px-2 py-1 text-[11px] text-accent-blue">
            <span>本批合计</span>
            <span className="tabular-nums text-sm font-semibold text-foreground">{batchTotal}</span>
            <span>篇</span>
          </div>
          <Button variant="secondary" size="sm" onClick={onFill}><Sparkles className="h-3.5 w-3.5" />按诉求额度回填</Button>
          <Button variant="secondary" size="sm" onClick={onClear}>清空</Button>
        </div>
      </div>
      <p className="mt-3 max-w-3xl text-xs leading-relaxed text-text-muted">每次分发需明确诉求中的主题 + 形式篇数； 合计将作为本次分发的总篇数，下方医生分发策略据此分配。</p>

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
        {unassignedTotal > 0 && <span className="text-accent-red">未分配 {unassignedTotal} 篇</span>}
        <Button onClick={onSubmit} disabled={saving || batchTotal <= 0}><Send className="h-4 w-4" />提交本批分发</Button>
      </div>
    </Card>
  );
}

function DoctorPolicyEditor({
  config,
  defaultConfig,
  doctors,
  contentCount,
  saving,
  onChange,
  onSave,
}: {
  config: RequestDistributionConfig;
  defaultConfig: RequestDistributionConfig;
  doctors: DoctorCandidate[];
  contentCount: number;
  saving: boolean;
  onChange: (config: RequestDistributionConfig) => void;
  onSave: (config: RequestDistributionConfig) => void | Promise<void>;
}): JSX.Element {
  const wlEnabled = config.whitelistEnabled;
  const stEnabled = config.strategyEnabled;
  const wlIds = config.whitelistDoctorIds;
  const wlQuota = config.whitelistDoctorQuota;
  const selectedTitles = config.titleFilters;

  const whitelistCandidates = useMemo(
    () => sortByWorkloadAsc(doctors.filter((doctor) => doctor.available && titleMatches(doctor.title, selectedTitles))),
    [doctors, selectedTitles]
  );
  const strategyCandidates = useMemo(
    () => sortByWorkloadAsc(doctors.filter((doctor) => doctor.available && titleMatches(doctor.title, selectedTitles) && !wlIds.includes(doctor.id))),
    [doctors, selectedTitles, wlIds]
  );
  const selectedDoctors = useMemo(() => wlIds.map((id) => doctors.find((doctor) => doctor.id === id)).filter(Boolean) as DoctorCandidate[], [doctors, wlIds]);
  const wlAssignedTotal = selectedDoctors.reduce((sum, doctor) => sum + Math.max(0, wlQuota[doctor.id] ?? 0), 0);
  const strategyRemaining = Math.max(0, contentCount - wlAssignedTotal);
  const strategyAssignments = stEnabled ? allocateStrategy(strategyCandidates, strategyRemaining) : [];
  const strategyAssignedTotal = strategyAssignments.reduce((sum, assignment) => sum + assignment.count, 0);

  const patch = (partial: Partial<RequestDistributionConfig>) => onChange({ ...config, ...partial });

  const toggleTitle = (title: string) => {
    const nextTitles = config.titleFilters.includes(title)
      ? config.titleFilters.filter((item) => item !== title)
      : [...config.titleFilters, title];
    patch({ titleFilters: nextTitles });
  };

  const toggleMode = (mode: 'whitelist' | 'strategy') => {
    if (mode === 'whitelist') {
      const nextEnabled = !wlEnabled;
      patch({
        whitelistEnabled: nextEnabled,
        assignmentMode: nextEnabled && !stEnabled ? 'whitelist' : stEnabled ? 'mixed' : 'strategy',
      });
      return;
    }
    const nextEnabled = !stEnabled;
    patch({
      strategyEnabled: nextEnabled,
      assignmentMode: nextEnabled && !wlEnabled ? 'strategy' : wlEnabled ? 'mixed' : 'whitelist',
    });
  };

  const toggleWhitelistDoctor = (doctorId: string) => {
    const selected = wlIds.includes(doctorId);
    const nextIds = selected ? wlIds.filter((id) => id !== doctorId) : [...wlIds, doctorId];
    const nextQuota = { ...wlQuota };
    if (selected) delete nextQuota[doctorId];
    else nextQuota[doctorId] = nextQuota[doctorId] ?? 1;
    patch({ whitelistDoctorIds: nextIds, whitelistDoctorQuota: nextQuota });
  };

  const updateQuota = (doctorId: string, nextValue: number) => {
    patch({ whitelistDoctorQuota: { ...wlQuota, [doctorId]: Math.max(0, Math.floor(nextValue || 0)) } });
  };

  const toggleSelectAll = () => {
    const candidateIds = whitelistCandidates.map((doctor) => doctor.id);
    const allSelected = candidateIds.length > 0 && candidateIds.every((id) => wlIds.includes(id));
    const nextIdSet = new Set(wlIds);
    const nextQuota = { ...wlQuota };
    if (allSelected) {
      candidateIds.forEach((id) => {
        nextIdSet.delete(id);
        delete nextQuota[id];
      });
    } else {
      candidateIds.forEach((id) => {
        nextIdSet.add(id);
        nextQuota[id] = nextQuota[id] ?? 1;
      });
    }
    patch({ whitelistDoctorIds: Array.from(nextIdSet), whitelistDoctorQuota: nextQuota });
  };

  const distributeEvenly = () => {
    if (selectedDoctors.length === 0 || contentCount <= 0) return;
    const base = Math.floor(contentCount / selectedDoctors.length);
    let remainder = contentCount - base * selectedDoctors.length;
    const nextQuota: Record<string, number> = {};
    selectedDoctors.forEach((doctor) => {
      const extra = remainder > 0 ? 1 : 0;
      if (extra) remainder -= 1;
      nextQuota[doctor.id] = base + extra;
    });
    patch({ whitelistDoctorQuota: nextQuota });
    showToast('已按本批总数平均分配', 'success');
  };

  const handleSave = () => {
    if (!wlEnabled && !stEnabled) return showToast('请至少启用一种分发方式', 'error');
    if (wlEnabled && selectedDoctors.length === 0) return showToast('已开启指定分发，请勾选医生并填写本人篇数', 'error');
    if (wlEnabled && wlAssignedTotal === 0) return showToast('指定分发已勾选医生但篇数仍为 0，请填写各医生承担篇数', 'error');
    if (contentCount > 0 && wlAssignedTotal > contentCount) return showToast(`指定分发合计 ${wlAssignedTotal} 篇 已超过本次分发总篇数 ${contentCount}`, 'error');
    void onSave(config);
  };

  const selectedCandidateIds = whitelistCandidates.map((doctor) => doctor.id);
  const allSelectedInCandidates = selectedCandidateIds.length > 0 && selectedCandidateIds.every((id) => wlIds.includes(id));
  const strategyAssignmentByDoctor = new Map(strategyAssignments.map((assignment) => [assignment.doctorId, assignment.count]));

  return (
    <div className="grid gap-4 lg:grid-cols-[1.2fr_1fr]">
      <div className="rounded-lg border border-border bg-card/60 p-5 shadow-[0_18px_50px_rgba(0,0,0,0.14)]">
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-4 w-4 text-primary" />
          <h3 className="text-[14px] font-semibold text-foreground">分发方式（可同时启用）</h3>
        </div>
        <p className="mt-1 text-[12px] leading-relaxed text-muted-foreground">
          产品规则：先用<strong className="mx-0.5 text-foreground">指定分发</strong>给勾选医生派指定篇数；
          剩余 <span className="tabular-nums text-foreground">{strategyRemaining}</span> 篇由
          <strong className="mx-0.5 text-foreground">策略分发</strong>按医生<strong className="text-foreground"> 当前工作负载 </strong>
          升序自动派发，工作负载相同时优先给历史已发布数更高的医生。
        </p>

        <div className="mt-3 grid grid-cols-2 gap-2">
          <ModeCard
            active={wlEnabled}
            onClick={() => toggleMode('whitelist')}
            title="指定分发"
            desc="在职称命中的候选池中勾选医生，并为每位医生填写本人篇数"
            icon={<Users className="h-4 w-4" />}
          />
          <ModeCard
            active={stEnabled}
            onClick={() => toggleMode('strategy')}
            title="策略分发"
            desc="按进行中任务 asc、历史已发布 desc 排序，自动平均派发剩余篇数"
            icon={<Activity className="h-4 w-4" />}
          />
        </div>

        {stEnabled && (
          <div className="mt-3 rounded-md border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-[11.5px] leading-relaxed text-emerald-200">
            <div className="mb-0.5 font-semibold text-emerald-100">策略分发 · 负载均衡逻辑</div>
            <div>
              系统对候选池按<strong className="mx-0.5">进行中任务数 asc</strong>排序，工作负载相同时按
              <strong className="mx-0.5">历史已发布数 desc</strong>排序，将剩余篇数<strong className="mx-0.5">平均派发</strong>给前 N 位医生；
              当出现余数时优先补给当前负载更低、历史经验更高的医生。已被指定分发选中的医生<strong className="mx-0.5">不再参与</strong>策略分发，避免重复。
            </div>
          </div>
        )}

        <h3 className="mb-3 mt-6 text-[14px] font-semibold text-foreground">Step 1 · 候选筛选范围</h3>
        <div>
          <div className="mb-1.5 text-[11.5px] text-muted-foreground">职称（必选）</div>
          <div className="flex flex-wrap gap-1.5">
            <button
              type="button"
              onClick={() => patch({ titleFilters: [] })}
              className={`rounded border px-2 py-0.5 text-[11.5px] transition ${
                config.titleFilters.length === 0
                  ? 'border-primary/50 bg-primary/15 text-primary'
                  : 'border-border bg-muted/30 text-muted-foreground hover:text-foreground'
              }`}
            >
              全部职称
            </button>
            {TITLE_OPTIONS.map((title) => {
              const active = config.titleFilters.includes(title);
              return (
                <button
                  key={title}
                  type="button"
                  onClick={() => toggleTitle(title)}
                  className={`rounded border px-2 py-0.5 text-[11.5px] transition ${
                    active
                      ? 'border-primary/50 bg-primary/15 text-primary'
                      : 'border-border bg-muted/30 text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {title}
                </button>
              );
            })}
          </div>
        </div>

        {wlEnabled && (
          <>
            <div className="mb-3 mt-6 flex items-center justify-between gap-3">
              <h3 className="text-[14px] font-semibold text-foreground">Step 2 · 勾选指定医生并填写篇数</h3>
              <div className="flex items-center gap-2">
                <Badge color="gray" className="text-[11px]">候选 {whitelistCandidates.length} · 已选 {selectedDoctors.length}</Badge>
                {whitelistCandidates.length > 0 && (
                  <Button variant="secondary" size="sm" className="h-7 px-2 text-[11.5px]" onClick={toggleSelectAll}>
                    {allSelectedInCandidates ? <><Square className="h-3 w-3" />取消全选</> : <><CheckSquare className="h-3 w-3" />全选候选</>}
                  </Button>
                )}
              </div>
            </div>

            {whitelistCandidates.length === 0 ? (
              <div className="rounded border border-dashed border-border bg-muted/20 p-6 text-center text-[12px] text-muted-foreground">请先在 Step 1 选择 <span className="font-semibold text-foreground">职称</span> 以命中候选医生。</div>
            ) : (
              <div className="max-h-[320px] space-y-1.5 overflow-y-auto rounded border border-border bg-background/40 p-2">
                {whitelistCandidates.map((doctor) => {
                  const selected = wlIds.includes(doctor.id);
                  const quota = wlQuota[doctor.id] ?? 0;
                  return (
                    <div key={doctor.id} className={`flex items-center gap-2 rounded border px-2.5 py-2 transition ${selected ? 'border-primary/60 bg-primary/10' : 'border-border bg-background/40 hover:border-primary/40'}`}>
                      <button type="button" onClick={() => toggleWhitelistDoctor(doctor.id)} className={`grid h-5 w-5 place-items-center rounded border text-[11px] ${selected ? 'border-primary bg-primary text-primary-foreground' : 'border-muted-foreground/40 bg-background text-muted-foreground'}`}>{selected ? '✓' : ''}</button>
                      <button type="button" onClick={() => toggleWhitelistDoctor(doctor.id)} className="flex flex-1 items-center gap-2 text-left">
                        <span className="text-[12.5px] font-medium text-foreground">{doctor.name}</span>
                        <span className="text-[11px] text-muted-foreground">· {doctor.department} · {doctor.title} · {doctor.hospital}</span>
                        <span className="ml-auto flex items-center gap-1.5 text-[11px] text-muted-foreground">
                          <span>已发布 {doctorExperience(doctor)}</span>
                          <span className={doctorWorkload(doctor) === 0 ? 'text-emerald-400' : 'text-amber-400'}>· 进行中 {doctorWorkload(doctor)}</span>
                          {doctor.phone && <span>· {doctor.phone}</span>}
                        </span>
                      </button>
                      <div className={`flex items-center gap-1 transition ${selected ? 'opacity-100' : 'pointer-events-none opacity-30'}`}>
                        <button type="button" onClick={() => updateQuota(doctor.id, quota - 1)} className="grid h-6 w-6 place-items-center rounded border border-border bg-background hover:border-primary/50"><Minus className="h-3 w-3" /></button>
                        <input type="number" min={0} value={quota} onChange={(event) => updateQuota(doctor.id, Number(event.target.value))} className="h-6 w-10 rounded border border-border bg-background text-center text-[12px] tabular-nums outline-none focus:border-primary/50" />
                        <button type="button" onClick={() => updateQuota(doctor.id, quota + 1)} className="grid h-6 w-6 place-items-center rounded border border-border bg-background hover:border-primary/50"><Plus className="h-3 w-3" /></button>
                        <span className="ml-0.5 text-[10.5px] text-muted-foreground">篇</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {selectedDoctors.length > 0 && contentCount > 0 && (
              <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-md border border-border bg-secondary/40 px-3 py-2 text-[12px]">
                <div className="text-muted-foreground">
                  指定分发已分 <span className="tabular-nums font-semibold text-foreground">{wlAssignedTotal}</span> / 本批 <span className="tabular-nums font-semibold text-foreground">{contentCount}</span> 篇
                  {wlAssignedTotal > contentCount && <span className="ml-2 text-rose-300">已超出 {wlAssignedTotal - contentCount} 篇</span>}
                </div>
                <Button variant="secondary" size="sm" className="h-7 px-2 text-[11.5px]" onClick={distributeEvenly}><Sparkles className="h-3 w-3" />按本批总数平均分配</Button>
              </div>
            )}
          </>
        )}

        <div className="mt-5 flex items-center justify-end gap-2">
          <Button variant="secondary" size="sm" onClick={() => onChange(defaultConfig)}>恢复默认</Button>
          <Button size="sm" onClick={handleSave} disabled={saving}><Save className="h-3.5 w-3.5" />保存策略</Button>
        </div>
      </div>

      <div className="rounded-lg border border-border bg-card/60 p-5 shadow-[0_18px_50px_rgba(0,0,0,0.14)]">
        <div className="flex items-center justify-between">
          <h3 className="text-[14px] font-semibold text-foreground">本次分发预览</h3>
          <Badge color="gray" className="text-[11px]">合计 {contentCount} 篇</Badge>
        </div>
        <p className="mt-1 text-[12px] text-muted-foreground">
          {wlEnabled && stEnabled
            ? '上半区为指定医生及其篇数；下半区为剩余篇数按工作负载升序的策略分发预估。'
            : wlEnabled
              ? '仅启用指定分发：仅按已勾选医生派发对应篇数。'
              : '仅启用策略分发：按候选医生工作负载 asc、历史已发布 desc 平均派发。'}
        </p>

        {wlEnabled && (
          <div className="mt-4">
            <div className="mb-2 flex items-center justify-between">
              <div className="text-[12.5px] font-semibold text-foreground">指定分发 · {selectedDoctors.length} 位医生</div>
              <Badge color="gray" className="text-[11px]">{wlAssignedTotal} 篇</Badge>
            </div>
            <div className="max-h-[200px] space-y-1.5 overflow-y-auto pr-1">
              {selectedDoctors.length === 0 && <div className="rounded border border-dashed border-border bg-muted/20 p-4 text-center text-[12px] text-muted-foreground">尚未勾选指定医生。</div>}
              {selectedDoctors.map((doctor, index) => <DoctorRow key={doctor.id} doctor={doctor} rank={index + 1} assigned={wlQuota[doctor.id] ?? 0} />)}
            </div>
          </div>
        )}

        {stEnabled && (
          <div className="mt-5">
            <div className="mb-2 flex items-center justify-between">
              <div className="text-[12.5px] font-semibold text-foreground">策略分发 · 候选 {strategyCandidates.length} 位</div>
              <Badge color="gray" className="text-[11px]">{strategyAssignedTotal} 篇</Badge>
            </div>
            {strategyCandidates.length === 0 ? (
              <div className="rounded border border-dashed border-border bg-muted/20 p-4 text-center text-[12px] text-muted-foreground">当前筛选条件下没有命中的候选医生。</div>
            ) : strategyRemaining === 0 ? (
              <div className="rounded border border-dashed border-border bg-muted/20 p-4 text-center text-[12px] text-muted-foreground">指定分发已覆盖全部 {contentCount} 篇，无需走策略分发。</div>
            ) : (
              <div className="max-h-[260px] space-y-1.5 overflow-y-auto pr-1">
                {strategyAssignments.map((assignment, index) => {
                  const doctor = strategyCandidates.find((item) => item.id === assignment.doctorId);
                  if (!doctor) return null;
                  return <DoctorRow key={doctor.id} doctor={doctor} rank={index + 1} assigned={strategyAssignmentByDoctor.get(doctor.id) ?? assignment.count} />;
                })}
                {strategyAssignments.length === 0 && <div className="rounded border border-dashed border-border bg-muted/20 p-4 text-center text-[12px] text-muted-foreground">尚未指定本批总篇数（contentCount=0），暂无可分配预估。</div>}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function ModeCard({ active, onClick, title, desc, icon }: { active: boolean; onClick: () => void; title: string; desc: string; icon: ReactNode }): JSX.Element {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex flex-col gap-1 rounded border px-3 py-2.5 text-left transition ${
        active
          ? 'border-primary/60 bg-primary/10'
          : 'border-border bg-background/40 hover:border-primary/40'
      }`}
    >
      <div className="flex items-center gap-1.5">
        <span className={active ? 'text-primary' : 'text-muted-foreground'}>{icon}</span>
        <span className={`text-[13px] font-semibold ${active ? 'text-primary' : 'text-foreground'}`}>{title}</span>
        {active && <span className="ml-auto rounded bg-primary px-1.5 py-0.5 text-[10px] font-medium text-primary-foreground">已启用</span>}
      </div>
      <div className="text-[11.5px] leading-snug text-muted-foreground">{desc}</div>
    </button>
  );
}

function DoctorRow({ doctor, rank, assigned }: { doctor: DoctorCandidate; rank: number; assigned: number }): JSX.Element {
  return (
    <div className="flex items-center gap-3 rounded border border-border bg-background/40 px-3 py-2">
      <div className="grid h-7 w-7 place-items-center rounded-full bg-primary/15 text-[11.5px] font-semibold text-primary">{doctor.name.slice(0, 1)}</div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5 text-[12.5px] font-medium text-foreground">
          <span className="tabular-nums text-[11px] text-muted-foreground">#{rank}</span>
          {doctor.name}
          <span className="text-[11px] text-muted-foreground">· {doctor.title}</span>
        </div>
        <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
          <span>{doctor.department}</span>
          <span>·</span>
          <span className="inline-flex items-center gap-0.5 rounded bg-emerald-500/15 px-1.5 py-0.5 font-medium text-emerald-300">已发布 {doctorExperience(doctor)}</span>
          <span className={doctorWorkload(doctor) === 0 ? 'text-emerald-400' : 'text-amber-400'}>· 进行中 {doctorWorkload(doctor)}</span>
          <span>· {doctor.doctorLevel}</span>
        </div>
      </div>
      {assigned > 0 && <span className="rounded bg-primary/15 px-1.5 py-0.5 text-[10.5px] font-semibold text-primary">{assigned} 篇</span>}
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
