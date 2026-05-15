import { useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Building2, Calendar, CheckCircle2, Clock, Inbox, Layers, Megaphone, Search } from 'lucide-react';
import { clsx } from 'clsx';
import { PageHeader } from '@/components/PageHeader';
import { formatNumber } from '@/utils/formatters';
import { getDistributionProjects } from '@/api/endpoints/distribution';
import type { DistributionProject, DistributionProjectPriority, DistributionProjectStatus } from '@/types/distribution';
import { useLogger } from '@/hooks/useLogger';
import { useTenantStore } from '@/stores/useTenantStore';

const STATUS_META: Record<string, { label: string; color: string }> = {
  intake: { label: '受理中', color: 'text-sky-300 bg-sky-500/15 border-sky-500/30' },
  production: { label: '制作中', color: 'text-amber-300 bg-amber-500/15 border-amber-500/30' },
  distribution: { label: '分发中', color: 'text-emerald-300 bg-emerald-500/15 border-emerald-500/30' },
  completed: { label: '已完成', color: 'text-muted-foreground bg-[oklch(22%_.015_260_/.3)] border-border' },
  archived: { label: '已归档', color: 'text-muted-foreground bg-[oklch(22%_.015_260_/.3)] border-border' },
  active: { label: '进行中', color: 'text-sky-300 bg-sky-500/15 border-sky-500/30' },
  paused: { label: '已暂停', color: 'text-amber-300 bg-amber-500/15 border-amber-500/30' },
};

const STATUS_META_FALLBACK = { label: '未知', color: 'text-muted-foreground bg-[oklch(22%_.015_260_/.3)] border-border' };

const STATUS_ORDER: DistributionProjectStatus[] = ['intake', 'production', 'distribution', 'completed', 'archived'];

const PRIORITY_COLOR: Record<DistributionProjectPriority, string> = {
  P0: 'border-rose-500/40 text-rose-300 bg-rose-500/10',
  P1: 'border-amber-500/40 text-amber-200 bg-amber-500/10',
  P2: 'border-slate-500/40 text-muted-foreground bg-slate-500/10',
};

export function DistributionStrategy(): JSX.Element {
  const { log } = useLogger('DistributionStrategy');
  const { currentTenant } = useTenantStore();
  const [statusFilter, setStatusFilter] = useState<'all' | DistributionProjectStatus>('all');
  const [priorityFilter, setPriorityFilter] = useState<'all' | DistributionProjectPriority>('all');
  const [query, setQuery] = useState('');
  const [projects, setProjects] = useState<DistributionProject[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    setLoading(true);
    getDistributionProjects({ pageSize: 100 })
      .then((res) => {
        if (mounted) setProjects(res.data);
      })
      .catch((error) => log.error('Failed to load distribution projects from DB', error))
      .finally(() => {
        if (mounted) setLoading(false);
      });
    return () => { mounted = false; };
  }, [log]);

  const filtered = useMemo(() => {
    return projects.filter((project) => {
      if (statusFilter !== 'all' && project.status !== statusFilter) return false;
      if (priorityFilter !== 'all' && project.priority !== priorityFilter) return false;
      if (query.trim()) {
        const normalized = query.trim().toLowerCase();
        if (!`${project.title}${project.disease}${project.brand}`.toLowerCase().includes(normalized)) return false;
      }
      return true;
    });
  }, [priorityFilter, projects, query, statusFilter]);

  const counters = useMemo(() => {
    return STATUS_ORDER.reduce((acc, status) => {
      acc[status] = projects.filter((project) => project.status === status).length;
      return acc;
    }, {} as Record<DistributionProjectStatus, number>);
  }, [projects]);

  return (
    <div className="container space-y-5 py-6">
      <PageHeader
        eyebrow="DISTRIBUTION"
        title="分发策略"
        subtitle="一条药企诉求即一个项目；进入项目后可查看关联诉求并单独配置分发策略。"
        meta={
          <div className="flex flex-wrap items-center gap-2 text-[12px] text-muted-foreground">
            <span className="rounded border border-border bg-[oklch(22%_.015_260_/.3)] px-2 py-0.5">当前租户 · <span className="text-foreground">{currentTenant.name}</span></span>
            <span className="rounded border border-border bg-[oklch(22%_.015_260_/.3)] px-2 py-0.5">项目总数 · <span className="tabular-nums text-foreground">{projects.length}</span></span>
          </div>
        }
      />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        {STATUS_ORDER.map((status) => {
          const meta = STATUS_META[status] ?? STATUS_META_FALLBACK;
          return (
            <button
              key={status}
              type="button"
              onClick={() => setStatusFilter((current) => (current === status ? 'all' : status))}
              className={clsx(
                'rounded-lg border bg-[oklch(20%_.02_260_/.6)] p-4 text-left transition hover:border-[oklch(70%_.15_200_/.4)]',
                statusFilter === status ? 'border-[oklch(70%_.15_200_/.5)]' : 'border-border',
              )}
            >
              <div className={clsx('inline-flex items-center gap-1.5 rounded border px-2 py-0.5 text-[11px]', meta.color)}>{meta.label}</div>
              <div className="mt-2 tabular-nums text-2xl font-semibold text-foreground">{counters[status] ?? 0}</div>
              <div className="text-[11.5px] text-muted-foreground">项目</div>
            </button>
          );
        })}
      </div>

      <div className="flex flex-wrap items-end gap-3 rounded-lg border border-border bg-[oklch(20%_.02_260_/.4)] px-4 py-3">
        <div className="relative w-72 max-w-full">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="搜索项目名称 / 病种 / 品牌"
            className="h-9 w-full rounded-md border border-border bg-[oklch(18%_.02_260)] pl-8 pr-2 text-[13px] outline-none placeholder:text-muted-foreground/70 focus:border-[oklch(70%_.15_200_/.5)]"
          />
        </div>
        <FilterField label="项目状态">
          <select
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value as 'all' | DistributionProjectStatus)}
            className="h-9 w-36 rounded-md border border-border bg-[oklch(18%_.02_260)] px-2 text-[13px] outline-none focus:border-[oklch(70%_.15_200_/.5)]"
          >
            <option value="all">全部状态</option>
            {STATUS_ORDER.map((status) => <option key={status} value={status}>{(STATUS_META[status] ?? STATUS_META_FALLBACK).label} · {counters[status] ?? 0}</option>)}
          </select>
        </FilterField>
        <FilterField label="优先级">
          <select
            value={priorityFilter}
            onChange={(event) => setPriorityFilter(event.target.value as 'all' | DistributionProjectPriority)}
            className="h-9 w-28 rounded-md border border-border bg-[oklch(18%_.02_260)] px-2 text-[13px] outline-none focus:border-[oklch(70%_.15_200_/.5)]"
          >
            <option value="all">全部</option>
            <option value="P0">P0</option>
            <option value="P1">P1</option>
            <option value="P2">P2</option>
          </select>
        </FilterField>
        <div className="ml-auto text-[12px] text-muted-foreground">共 <span className="tabular-nums text-foreground">{filtered.length}</span> 个项目</div>
      </div>

      <div className="space-y-3">
        {loading && <div className="rounded-lg border border-border bg-[oklch(20%_.02_260_/.4)] p-12 text-center text-sm text-muted-foreground">正在从 SQLite 加载项目...</div>}
        {!loading && filtered.length === 0 && (
          <div className="rounded-lg border border-dashed border-border bg-[oklch(20%_.02_260_/.4)] p-12 text-center text-sm text-muted-foreground">当前筛选条件下没有项目</div>
        )}
        {!loading && filtered.map((project) => <ProjectRow key={project.id} project={project} />)}
      </div>
    </div>
  );
}

function ProjectRow({ project }: { project: DistributionProject }): JSX.Element {
  const themes = (project.topics ?? []).slice(0, 3);
  return (
    <Link to={`/distribute/${project.id}`} className="group block rounded-lg border border-border bg-[oklch(20%_.02_260_/.6)] p-4 transition hover:border-[oklch(70%_.15_200_/.6)] hover:bg-card">
      <div className="flex flex-wrap items-start gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <Megaphone className="size-4 text-primary" />
            <h3 className="text-[15px] font-semibold tracking-tight text-foreground">{project.title}</h3>
            <span className={clsx('rounded border px-1.5 py-0.5 text-[10.5px]', PRIORITY_COLOR[project.priority])}>{project.priority}</span>
            <span className={clsx('rounded border px-1.5 py-0.5 text-[10.5px]', (STATUS_META[project.status] ?? STATUS_META_FALLBACK).color)}>{(STATUS_META[project.status] ?? STATUS_META_FALLBACK).label}</span>
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-muted-foreground">
            <span className="inline-flex items-center gap-1"><Building2 className="size-3.5" />{project.brand || '—'}</span>
            <span>·</span>
            <span>{project.disease}</span>
            <span>·</span>
            <span>负责人 {project.owner}</span>
            <span>·</span>
            <span className="inline-flex items-center gap-1"><Calendar className="size-3.5" />期望上线 {project.expectedDate}</span>
          </div>

          <div className="mt-3 grid grid-cols-1 gap-x-6 gap-y-2 text-[12px] md:grid-cols-3">
            <Snapshot icon={<Layers className="size-3.5 text-primary" />} label="总量">
              <span className="tabular-nums text-foreground">{project.totalPieces} 篇</span>
            </Snapshot>
            <Snapshot icon={<Clock className="size-3.5 text-primary" />} label="主题 × 形式">
              <span className="text-foreground">{project.cadence}</span>
            </Snapshot>
            <Snapshot icon={<Inbox className="size-3.5 text-primary" />} label="诉求">
              <span className="tabular-nums text-foreground">{Math.max(1, project.contentCount)} 条</span>
            </Snapshot>
          </div>

          <div className="mt-2 flex flex-wrap gap-1.5">
            {themes.map((topic) => <span key={topic} className="rounded border border-border bg-[oklch(22%_.015_260_/.3)] px-2 py-0.5 text-[11px] text-muted-foreground">{topic}</span>)}
            {project.formats && (
              <span className="rounded border border-[oklch(70%_.15_200_/.3)] bg-[oklch(70%_.15_200_/.1)] px-2 py-0.5 text-[11px] text-primary">{project.formats}</span>
            )}
          </div>
        </div>

        <div className="flex w-full shrink-0 flex-col items-end gap-2 md:w-72">
          <div className="w-full rounded-md border border-border bg-[oklch(16%_.02_260_/.4)] p-3">
            <div className="flex items-center justify-between text-[11.5px] text-muted-foreground">
              <span className="inline-flex items-center gap-1"><CheckCircle2 className="size-3.5 text-primary" />{project.approvalFlow}</span>
              <span className="tabular-nums">{project.progress}%</span>
            </div>
            <div className="mt-1.5 text-[12.5px] font-medium text-foreground">当前节点：{project.currentNode}</div>
            <div className="mt-2 h-1.5 w-full rounded-full bg-[oklch(22%_.015_260_/.4)]">
              <div className="h-1.5 rounded-full bg-gradient-to-r from-[oklch(70%_.15_200_/.7)] to-primary" style={{ width: `${project.progress}%` }} />
            </div>
            <div className="mt-1.5 flex justify-between text-[10.5px] text-muted-foreground tabular-nums">
              <span>关联内容 {project.contentCount}</span>
              <span>已发布 {project.publishedCount}</span>
            </div>
            <div className="mt-1 text-[10.5px] text-muted-foreground tabular-nums">患者上限 {formatNumber(project.patientCap)} 人</div>
          </div>
          <span className="inline-flex items-center gap-1 text-[12.5px] text-primary transition group-hover:translate-x-0.5">
            进入项目 <ArrowRight className="size-3.5" />
          </span>
        </div>
      </div>
    </Link>
  );
}

function FilterField({ label, children }: { label: string; children: ReactNode }): JSX.Element {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-[10.5px] uppercase tracking-[0.12em] text-muted-foreground">{label}</span>
      {children}
    </div>
  );
}

function Snapshot({ icon, label, children }: { icon: ReactNode; label: string; children: ReactNode }): JSX.Element {
  return (
    <div className="flex items-center gap-1.5">
      {icon}
      <span className="text-muted-foreground">{label}</span>
      <span className="ml-1 text-[12.5px]">{children}</span>
    </div>
  );
}
