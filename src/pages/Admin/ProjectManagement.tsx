import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Briefcase, CalendarClock, FolderPlus, Layers, Search, TrendingUp } from 'lucide-react';
import { PageHeader } from '@/components/PageHeader';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Modal } from '@/components/ui/Modal';
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
  { value: 'T-PX', label: 'Px Ops' },
  { value: 'T-NV', label: '诺华' },
  { value: 'T-AZ', label: '阿斯利康' },
  { value: 'T-RC', label: '罗氏' },
];

const tenantLabel: Record<string, string> = {
  'T-PX': 'Px Ops',
  'T-NV': '诺华',
  'T-AZ': '阿斯利康',
  'T-RC': 'T-RO',
  'T-PF': 'T-PF',
};

const projectTenantLabel: Record<string, string> = {
  'PRJ-1002': 'T-RO',
  'PRJ-1004': 'T-PF',
};

const requirementCountByProject: Record<string, number> = {
  'PRJ-1001': 2,
  'PRJ-1002': 2,
  'PRJ-1003': 2,
  'PRJ-1006': 1,
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

function statusColor(status: DistributionProjectStatus): 'blue' | 'yellow' | 'green' | 'gray' {
  if (status === 'intake') return 'blue';
  if (status === 'production') return 'yellow';
  if (status === 'distribution') return 'green';
  return 'gray';
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

  const inProgress = projects.filter((project) => project.status === 'production').length;
  const completed = projects.filter((project) => project.status === 'completed').length;
  const totalPieces = projects.reduce((sum, project) => sum + project.totalPieces, 0);

  const addProject = (draft: ProjectDraft): void => {
    const newProject: DistributionProject = {
      id: `PRJ-${Date.now().toString().slice(-4)}`,
      title: `${draft.brand || '新品牌'} · ${draft.name || '新患教项目'}`,
      priority: draft.priority,
      status: 'intake',
      brand: draft.brand || '待配置品牌',
      disease: draft.disease || '待配置病种',
      owner: draft.owner || 'PX 运营组',
      tenantId: draft.tenantId,
      expectedDate: draft.expectedDate || '待定',
      totalPieces: Number(draft.totalPieces) || 0,
      cadence: `${draft.topicCount || 1} 主题 · ${draft.formatCount || 1} 形式`,
      patientCap: 5000,
      topics: ['待拆解主题'],
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
    showToast('项目已在当前会话中创建，可进入分发策略继续配置。', 'success');
  };

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Admin · Projects"
        title="项目管理"
        subtitle="按租户与病种组织的患教项目；新建项目独立完成基础登记，诉求在内容工坊侧逐条挂载。"
        actions={<Button onClick={() => setCreateOpen(true)}><FolderPlus className="h-4 w-4" />新建项目</Button>}
      />

      <div className="grid grid-cols-4 gap-3">
        <MiniKpi icon={<Briefcase className="h-4 w-4 text-primary" />} label="项目总数" value={projects.length} />
        <MiniKpi icon={<TrendingUp className="h-4 w-4 text-primary" />} label="进行中" value={inProgress} />
        <MiniKpi icon={<Layers className="h-4 w-4 text-primary" />} label="累计篇数" value={`${formatNumber(totalPieces)}篇`} />
        <MiniKpi icon={<CalendarClock className="h-4 w-4 text-primary" />} label="已完成" value={completed} />
      </div>

      <Card className="overflow-hidden border-border bg-card/40 p-0">
        <div className="flex flex-wrap items-center gap-3 border-b border-border/60 px-4 py-3">
          <div className="relative flex-1 min-w-[260px] max-w-md">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted" />
            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="搜索项目 / 品牌 / 病种 / 负责人" className="h-9 w-full rounded-lg border border-border bg-bg-tertiary pl-9 pr-3 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-1 focus:ring-accent-blue" />
          </div>
          <Select options={TENANT_OPTIONS} value={tenant} onChange={setTenant} />
          <Select options={STATUS_OPTIONS} value={status} onChange={setStatus} />
          <span className="ml-auto text-xs text-text-muted">共 {filtered.length} 个项目</span>
        </div>

        {loading ? (
          <div className="py-10 text-center text-sm text-text-muted">正在加载项目...</div>
        ) : (
          <div className="grid grid-cols-1 gap-3 p-4 xl:grid-cols-2">
            {filtered.map((project) => (
              <div key={project.id} className="rounded-xl border border-border bg-card/60 p-4 transition-colors hover:border-primary/40">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="text-sm font-semibold text-text-primary">{project.title}</h3>
                    <div className="mt-2 text-xs text-text-muted">租户 · {projectTenantLabel[project.id] || tenantLabel[project.tenantId] || project.tenantId} · {project.disease} · {project.brand} · 负责人 {project.owner}</div>
                  </div>
                  <Badge color={statusColor(project.status)}>{statusLabel[project.status]}</Badge>
                </div>
                <div className="mt-4 grid grid-cols-4 gap-3">
                  <Metric label="累计篇数" value={String(project.totalPieces)} />
                  <Metric label="主题×形式" value={project.cadence.replace(' 主题 · ', ' · ').replace(' 形式', '')} />
                  <Metric label="关联诉求" value={String(requirementCountByProject[project.id] ?? project.topics.length)} />
                  <Metric label="期望上线" value={project.expectedDate} />
                </div>
                <div className="mt-3 text-xs text-text-muted">创建 {formatProjectTimestamp(project.createdAt)}</div>
                <div className="mt-4 text-right">
                  <Link to={`/distribute/${project.id}`} className="text-xs text-primary hover:underline">查看详情</Link>
                </div>
              </div>
            ))}
            {filtered.length === 0 && <div className="col-span-full py-10 text-center text-sm text-text-muted">当前筛选下暂无项目。</div>}
          </div>
        )}
      </Card>

      <Modal open={createOpen} onClose={() => setCreateOpen(false)} title="新建项目" maxWidth="max-w-3xl" footer={<Button variant="secondary" onClick={() => setCreateOpen(false)}>Close</Button>}>
        <ProjectWizard onCreate={addProject} />
      </Modal>
    </div>
  );
}

function MiniKpi({ icon, label, value }: { icon: React.ReactNode; label: string; value: React.ReactNode }): JSX.Element {
  return (
    <Card className="bg-card/60 p-3">
      <div className="flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground">
        {icon} {label}
      </div>
      <div className="mt-1 text-[18px] font-semibold tabular text-foreground">{value}</div>
    </Card>
  );
}

function Metric({ label, value }: { label: string; value: string }): JSX.Element {
  return <div className="rounded-lg border border-border bg-bg-card p-3"><div className="text-[10px] text-text-muted">{label}</div><div className="mt-1 truncate text-sm text-text-primary">{value}</div></div>;
}

type ProjectDraft = {
  tenantId: string;
  name: string;
  brand: string;
  disease: string;
  owner: string;
  expectedDate: string;
  totalPieces: string;
  topicCount: string;
  formatCount: string;
  priority: 'P0' | 'P1' | 'P2';
};

function ProjectWizard({ onCreate }: { onCreate: (draft: ProjectDraft) => void }): JSX.Element {
  const [draft, setDraft] = useState<ProjectDraft>({
    tenantId: 'T-PX',
    name: '',
    brand: '',
    disease: '',
    owner: 'PX 运营组',
    expectedDate: '2026-06-01',
    totalPieces: '6',
    topicCount: '3',
    formatCount: '2',
    priority: 'P1',
  });
  const update = (key: keyof ProjectDraft) => (event: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setDraft((current) => ({ ...current, [key]: event.target.value }));

  return (
    <div className="space-y-4">
      <p className="text-sm text-text-secondary">完成基础登记后，项目会进入「受理中」，后续可在项目详情中挂载诉求并配置分发策略。</p>
      <div className="grid grid-cols-2 gap-3">
        <label className="text-xs text-text-muted">归属租户<select value={draft.tenantId} onChange={update('tenantId')} className="mt-1 w-full rounded-lg border border-border bg-bg-tertiary px-3 py-2 text-sm text-text-primary"><option value="T-PX">Px Ops</option><option value="T-NV">诺华</option><option value="T-AZ">阿斯利康</option><option value="T-RC">罗氏</option></select></label>
        <Field label="项目名称" value={draft.name} onChange={update('name')} placeholder="例：慢性心衰患教计划" />
        <Field label="品牌" value={draft.brand} onChange={update('brand')} placeholder="例：诺欣妥" />
        <Field label="病种" value={draft.disease} onChange={update('disease')} placeholder="例：慢性心力衰竭" />
        <Field label="负责人" value={draft.owner} onChange={update('owner')} placeholder="PX 运营组" />
        <Field label="期望上线" value={draft.expectedDate} onChange={update('expectedDate')} placeholder="2026-06-01" />
        <Field label="累计篇数" value={draft.totalPieces} onChange={update('totalPieces')} placeholder="6" />
        <div className="grid grid-cols-3 gap-2">
          <Field label="主题数" value={draft.topicCount} onChange={update('topicCount')} placeholder="3" />
          <Field label="形式数" value={draft.formatCount} onChange={update('formatCount')} placeholder="2" />
          <label className="text-xs text-text-muted">优先级<select value={draft.priority} onChange={update('priority')} className="mt-1 w-full rounded-lg border border-border bg-bg-tertiary px-3 py-2 text-sm text-text-primary"><option>P0</option><option>P1</option><option>P2</option></select></label>
        </div>
      </div>
      <div className="flex justify-end gap-2"><Button variant="secondary" onClick={() => showToast('已保存为项目草稿', 'info')}>保存草稿</Button><Button onClick={() => onCreate(draft)}>创建项目</Button></div>
    </div>
  );
}

function Field({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (event: React.ChangeEvent<HTMLInputElement>) => void; placeholder: string }): JSX.Element {
  return <label className="text-xs text-text-muted">{label}<input value={value} onChange={onChange} placeholder={placeholder} className="mt-1 w-full rounded-lg border border-border bg-bg-tertiary px-3 py-2 text-sm text-text-primary placeholder:text-text-muted" /></label>;
}
