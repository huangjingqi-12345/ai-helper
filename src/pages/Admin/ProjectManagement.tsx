import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Briefcase, CalendarClock, ChevronRight, Layers, Palette, Plus, Search, Send, TrendingUp, Users, X } from 'lucide-react';
import { PageHeader } from '@/components/PageHeader';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { SideSheet } from '@/components/ui/SideSheet';
import { Select } from '@/components/ui/Select';
import { showToast } from '@/components/ui/Toast';
import { getDistributionProjects } from '@/api/endpoints/distribution';
import type { DistributionProject, DistributionProjectStatus } from '@/types/distribution';
import { formatNumber } from '@/utils/formatters';

const STATUS_OPTIONS = [
  { value: '', label: '全部状态' },
  { value: 'intake', label: '受理中' },
  { value: 'production', label: '制作中' },
  { value: 'distribution', label: '分发中' },
  { value: 'completed', label: '已完成' },
  { value: 'archived', label: '已归档' },
];

const TENANT_OPTIONS = [
  { value: '', label: '全部租户' },
  { value: 'T-NV', label: '诺华' },
  { value: 'T-AZ', label: '阿斯利康' },
  { value: 'T-MSD', label: '默沙东' },
  { value: 'T-RC', label: '罗氏' },
  { value: 'T-LL', label: '礼来' },
];

const tenantLabel: Record<string, string> = {
  'T-PX': 'Px Ops',
  'T-NV': '诺华',
  'T-AZ': '阿斯利康',
  'T-MSD': '默沙东',
  'T-RC': '罗氏',
  'T-LL': '礼来',
};

const requirementCountByProject: Record<string, number> = {
  'PRJ-1000': 3,
  'PRJ-1001': 2,
  'PRJ-1002': 1,
  'PRJ-1003': 1,
  'PRJ-1004': 2,
  'PRJ-1005': 1,
  'PRJ-1006': 1,
  'PRJ-1007': 1,
  'PRJ-1008': 1,
  'PRJ-1009': 1,
  'PRJ-1010': 1,
  'PRJ-1011': 1,
  'PRJ-1012': 1,
  'PRJ-1013': 1,
};

function formatProjectTimestamp(value?: string): string {
  return value ? value.slice(0, 16).replace('T', ' ') : '2026-05-07 09:42';
}

const statusLabel: Record<DistributionProjectStatus, string> = {
  intake: '受理中',
  production: '制作中',
  distribution: '分发中',
  completed: '已完成',
  archived: '已归档',
};

function statusClassName(status: DistributionProjectStatus): string {
  if (status === 'intake') return 'border-amber-500/40 bg-amber-500/10 text-amber-200';
  if (status === 'production') return 'border-sky-500/40 bg-sky-500/10 text-sky-200';
  if (status === 'distribution') return 'border-violet-500/40 bg-violet-500/10 text-violet-200';
  if (status === 'completed') return 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300';
  return 'border-zinc-500/40 bg-zinc-500/10 text-zinc-300';
}

export function ProjectManagement(): JSX.Element {
  const [projects, setProjects] = useState<DistributionProject[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [tenant, setTenant] = useState('');
  const [status, setStatus] = useState('');
  const [createOpen, setCreateOpen] = useState(false);

  useEffect(() => {
    let mounted = true;
    setLoading(true);
    getDistributionProjects({ pageSize: 100 })
      .then((res) => {
        if (mounted) setProjects(res.data);
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });
    return () => { mounted = false; };
  }, []);

  const filtered = useMemo(() => projects.filter((project) => {
    const haystack = `${project.title}${project.brand}${project.disease}${project.owner}`.toLowerCase();
    if (search && !haystack.includes(search.toLowerCase())) return false;
    if (tenant && project.tenantId !== tenant) return false;
    if (status && project.status !== status) return false;
    return true;
  }), [projects, search, status, tenant]);

  const inProgress = projects.filter((project) => project.status === 'production' || project.status === 'distribution').length;
  const completed = projects.filter((project) => project.status === 'completed').length;
  const totalPieces = projects.reduce((sum, project) => sum + project.totalPieces, 0);

  const addProject = (draft: ProjectDraft): void => {
    const expectedDate = todayPlus(60);
    const newProject: DistributionProject = {
      id: `PRJ-${Date.now().toString().slice(-4)}`,
      title: draft.name.trim(),
      priority: 'P1',
      status: 'intake',
      brand: draft.brand || '—',
      disease: draft.disease,
      owner: draft.owner.trim(),
      tenantId: draft.tenantId,
      expectedDate,
      totalPieces: 0,
      cadence: '0 主题 · 0 形式',
      patientCap: 5000,
      topics: [],
      formats: '待配置形式',
      approvalFlow: 'PX 默认审批流',
      progress: 0,
      currentNode: '未提交',
      contentCount: 0,
      publishedCount: 0,
      createdAt: new Date().toISOString(),
    };
    setProjects((current) => [newProject, ...current]);
    setCreateOpen(false);
    showToast(`项目「${newProject.title}」已创建`, 'success');
  };

  return (
    <div className="flex h-full flex-col">
      <PageHeader
        eyebrow="Admin · Projects"
        title="项目管理"
        subtitle="按租户与病种组织的患教项目；新建项目独立完成基础登记，诉求在内容工坊侧逐条挂载。"
        actions={<Button className="bg-[oklch(58%_.16_195)] text-background hover:bg-[oklch(63%_.17_195)]" onClick={() => setCreateOpen(true)}><Plus className="mr-1 h-4 w-4" />新建项目</Button>}
      />

      <div className="grid grid-cols-4 gap-3 px-6 pb-4">
        <MiniKpi icon={<Briefcase className="h-4 w-4 text-primary" />} label="项目总数" value={projects.length} />
        <MiniKpi icon={<TrendingUp className="h-4 w-4 text-primary" />} label="进行中" value={inProgress} />
        <MiniKpi icon={<Layers className="h-4 w-4 text-primary" />} label="累计篇数" value={`${formatNumber(totalPieces)}篇`} />
        <MiniKpi icon={<CalendarClock className="h-4 w-4 text-primary" />} label="已完成" value={completed} />
      </div>

      <div className="flex flex-wrap items-center gap-2 border-y border-border bg-card/30 px-6 py-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted" />
          <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="搜索项目名 / 病种 / 品牌 / 负责人" className="h-8 w-[260px] rounded-lg border border-border bg-bg-tertiary pl-9 pr-3 text-[12.5px] text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-1 focus:ring-accent-blue" />
        </div>
        <Select options={TENANT_OPTIONS} value={tenant} onChange={setTenant} className="h-8 w-[160px] py-1 text-[12.5px]" />
        <Select options={STATUS_OPTIONS} value={status} onChange={setStatus} className="h-8 w-[140px] py-1 text-[12.5px]" />
        <span className="ml-auto text-[11.5px] text-text-muted">共 <span className="text-text-primary">{filtered.length}</span> 个项目</span>
      </div>

      <div className="flex-1 overflow-y-auto px-6 py-4">
        {loading ? (
          <div className="py-10 text-center text-sm text-text-muted">正在加载项目...</div>
        ) : filtered.length === 0 ? (
          <div className="flex h-[280px] flex-col items-center justify-center rounded-lg border border-dashed border-border text-[12.5px] text-muted-foreground">
            <Briefcase className="mb-2 h-6 w-6 opacity-50" />
            暂无项目，点击右上「新建项目」开始
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
            {filtered.map((project) => <ProjectRow key={project.id} project={project} />)}
          </div>
        )}
      </div>

      <CreateProjectSheet open={createOpen} onClose={() => setCreateOpen(false)} onCreate={addProject} />
    </div>
  );
}

function MiniKpi({ icon, label, value }: { icon: React.ReactNode; label: string; value: React.ReactNode }): JSX.Element {
  return (
    <Card className="flex min-h-[98px] flex-col justify-between bg-card/60 p-3">
      <div className="flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground">
        {icon} {label}
      </div>
      <div className="mt-1 text-[18px] font-semibold tabular text-foreground">{value}</div>
    </Card>
  );
}

function ProjectRow({ project }: { project: DistributionProject }): JSX.Element {
  return (
    <Card className="group relative overflow-hidden p-4 transition-colors hover:border-primary/40">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <Briefcase className="h-4 w-4 shrink-0 text-primary" />
            <h3 className="truncate text-[14px] font-semibold text-foreground">{project.title}</h3>
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11.5px] text-muted-foreground">
            <span>租户 · {tenantLabel[project.tenantId] ?? project.tenantId}</span>
            <span>·</span>
            <span>{project.disease}</span>
            {project.brand && (
              <>
                <span>·</span>
                <span>{project.brand}</span>
              </>
            )}
            <span>·</span>
            <span>负责人 {project.owner}</span>
          </div>
        </div>
        <Badge color="gray" className={`h-[22px] shrink-0 ${statusClassName(project.status)}`}>{statusLabel[project.status]}</Badge>
      </div>

      <div className="mt-3 grid grid-cols-4 gap-2 text-[11.5px]">
        <Metric icon={<Layers className="h-3.5 w-3.5 text-primary" />} label="累计篇数" value={String(project.totalPieces)} />
        <Metric icon={<Palette className="h-3.5 w-3.5 text-primary" />} label="主题×形式" value={(project.cadence ?? '').replace(' 主题 · ', ' · ').replace(' 形式', '')} />
        <Metric icon={<Users className="h-3.5 w-3.5 text-primary" />} label="关联诉求" value={String(requirementCountByProject[project.id] ?? project.topics.length)} />
        <Metric icon={<CalendarClock className="h-3.5 w-3.5 text-primary" />} label="期望上线" value={project.expectedDate} />
      </div>

      <div className="mt-3 flex items-center justify-between border-t border-border pt-2">
        <span className="text-[11px] text-muted-foreground">创建 {formatProjectTimestamp(project.createdAt)}</span>
        <Link to={`/distribute/${project.id}`} className="inline-flex items-center gap-0.5 text-[12px] font-medium text-primary hover:underline">
          查看详情 <ChevronRight className="h-3 w-3" />
        </Link>
      </div>
    </Card>
  );
}

function Metric({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }): JSX.Element {
  return (
    <div className="rounded-md border border-border bg-background/40 px-2 py-1.5">
      <div className="flex items-center gap-1 text-[10.5px] text-muted-foreground">
        {icon} {label}
      </div>
      <div className="mt-0.5 text-[12px] font-medium text-foreground">{value}</div>
    </div>
  );
}

type ProjectDraft = {
  tenantId: string;
  name: string;
  brand: string;
  disease: string;
  owner: string;
  note: string;
};

const DISEASE_OPTIONS = ['乳腺癌', '肺癌（NSCLC）', '2型糖尿病', '慢性心力衰竭', '银屑病', '阿尔茨海默病'];

const BRAND_OPTIONS: Record<string, Array<{ name: string; cls: string }>> = {
  乳腺癌: [
    { name: '优赫得', cls: 'HER2 ADC' },
    { name: '赫赛汀', cls: 'HER2 靶向' },
    { name: '他莫昔芬', cls: '内分泌治疗' },
  ],
  '肺癌（NSCLC）': [
    { name: '奥希替尼', cls: 'EGFR-TKI' },
    { name: '可瑞达', cls: 'PD-1' },
  ],
  '2型糖尿病': [
    { name: '司美格鲁肽', cls: 'GLP-1' },
    { name: '达格列净', cls: 'SGLT2' },
  ],
  慢性心力衰竭: [{ name: '诺欣妥', cls: 'ARNI' }],
  银屑病: [{ name: '拓咨', cls: 'IL-17A' }],
  阿尔茨海默病: [{ name: '仑卡奈单抗', cls: 'Aβ 单抗' }],
};

function todayPlus(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function CreateProjectSheet({ open, onClose, onCreate }: { open: boolean; onClose: () => void; onCreate: (draft: ProjectDraft) => void }): JSX.Element {
  const [draft, setDraft] = useState<ProjectDraft>({
    tenantId: 'T-NV',
    name: '',
    brand: '',
    disease: '乳腺癌',
    owner: 'PX 运营组',
    note: '',
  });

  useEffect(() => {
    if (open) {
      setDraft({ tenantId: 'T-NV', name: '', brand: '', disease: '乳腺癌', owner: 'PX 运营组', note: '' });
    }
  }, [open]);

  const update = (patch: Partial<ProjectDraft>): void => setDraft((current) => ({ ...current, ...patch }));
  const drugOptions = BRAND_OPTIONS[draft.disease] ?? [];
  const tenant = TENANT_OPTIONS.find((item) => item.value === draft.tenantId);

  const submit = (): void => {
    if (!draft.name.trim()) {
      showToast('请填写项目名称', 'error');
      return;
    }
    if (!draft.disease || !draft.owner.trim()) {
      showToast('请补充病种与项目负责人', 'error');
      return;
    }
    onCreate(draft);
  };

  return (
    <SideSheet open={open} onClose={onClose} widthClass="w-full max-w-[640px]" className="border-l border-border/70 bg-background p-0" showClose={false}>
      <div className="shrink-0 space-y-1.5 border-b border-border/60 bg-card/40 px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="space-y-1">
            <div className="text-[10.5px] font-semibold uppercase tracking-[0.18em] text-[oklch(70%_.16_195)]">Admin · Create Project</div>
            <h2 className="flex items-center gap-2 text-[16px] font-semibold text-foreground"><Briefcase className="h-4 w-4" />新建患教项目</h2>
            <p className="text-[12px] text-muted-foreground">项目是承载多条选题诉求的容器，仅登记基础信息；具体内容篇数与主题×形式矩阵在后续每次「发起诉求」时累加。</p>
          </div>
          <button onClick={onClose} className="flex h-8 w-8 items-center justify-center rounded-md border border-border/60 text-muted-foreground hover:bg-secondary/40 hover:text-foreground" aria-label="关闭">
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-6 py-5 text-[13px]">
        <ProjectField label="项目名称" required>
          <input value={draft.name} onChange={(event) => update({ name: event.target.value })} placeholder="例如：赫赛汀 · HER2+ 术后辅助随访计划 2026 Q3" className="h-9 w-full rounded-md border border-border bg-input/40 px-2.5 text-[12.5px] outline-none focus:border-[oklch(60%_.16_195)]/70" />
          <p className="mt-1 text-[11px] text-muted-foreground">建议命名格式：品牌 / 药品 · 业务主题 · 周期。提交诉求时会自动带出。</p>
        </ProjectField>

        <div className="grid grid-cols-2 gap-3">
          <ProjectField label="所属租户" required>
            <select value={draft.tenantId} onChange={(event) => update({ tenantId: event.target.value })} className="h-9 w-full rounded-md border border-border bg-input/40 px-2.5 text-[12.5px] outline-none focus:border-[oklch(60%_.16_195)]/70">
              {TENANT_OPTIONS.filter((item) => item.value).map((item) => <option key={item.value} value={item.value}>{item.label} · {item.value}</option>)}
            </select>
            <p className="mt-1 text-[11px] text-muted-foreground">灰度上限 100% · k-匿名 ≥ {draft.tenantId === 'T-PX' ? '0' : '20'} · {tenant?.label ?? '—'}</p>
          </ProjectField>
          <ProjectField label="项目负责人" required>
            <input value={draft.owner} onChange={(event) => update({ owner: event.target.value })} placeholder="如：运营 · 王雪" className="h-9 w-full rounded-md border border-border bg-input/40 px-2.5 text-[12.5px] outline-none focus:border-[oklch(60%_.16_195)]/70" />
          </ProjectField>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <ProjectField label="病种" required>
            <select value={draft.disease} onChange={(event) => update({ disease: event.target.value, brand: '' })} className="h-9 w-full rounded-md border border-border bg-input/40 px-2.5 text-[12.5px] outline-none focus:border-[oklch(60%_.16_195)]/70">
              {DISEASE_OPTIONS.map((item) => <option key={item} value={item}>{item}</option>)}
            </select>
          </ProjectField>
          <ProjectField label="品牌 / 药品（可选）">
            <select value={draft.brand} onChange={(event) => update({ brand: event.target.value })} className="h-9 w-full rounded-md border border-border bg-input/40 px-2.5 text-[12.5px] outline-none focus:border-[oklch(60%_.16_195)]/70">
              <option value="">—</option>
              {drugOptions.map((item) => <option key={item.name} value={item.name}>{item.name} · {item.cls}</option>)}
            </select>
          </ProjectField>
        </div>

        <ProjectField label="项目备注（可选）">
          <textarea value={draft.note} onChange={(event) => update({ note: event.target.value })} rows={3} placeholder="如：本项目侧重出院后 30 天过渡期教育，需配合区域 KOL ……" className="w-full rounded-md border border-border bg-input/40 px-2.5 py-2 text-[12.5px] outline-none focus:border-[oklch(60%_.16_195)]/70" />
        </ProjectField>
      </div>

      <div className="shrink-0 border-t border-border/60 bg-card/30 px-6 py-3">
        <div className="flex items-center justify-between gap-4">
          <div className="text-[11.5px] text-muted-foreground">提交后项目立即可见，并可在「患教内容工坊」内被诉求关联</div>
          <div className="flex items-center gap-2">
            <button onClick={onClose} className="rounded-md border border-border bg-secondary/40 px-4 py-2 text-[12.5px] text-muted-foreground hover:bg-secondary/60 hover:text-foreground">取消</button>
            <button onClick={submit} className="inline-flex items-center gap-1.5 rounded-md bg-[oklch(58%_.16_195)] px-4 py-2 text-[12.5px] font-medium text-background hover:bg-[oklch(63%_.17_195)]">
              <Send className="h-3.5 w-3.5" />创建项目
            </button>
          </div>
        </div>
      </div>
    </SideSheet>
  );
}

function ProjectField({ label, required, children }: { label: React.ReactNode; required?: boolean; children: React.ReactNode }): JSX.Element {
  return (
    <div className="space-y-1.5">
      <label className="text-[11.5px] font-medium text-muted-foreground">{label}{required && <span className="ml-0.5 text-destructive">*</span>}</label>
      {children}
    </div>
  );
}
