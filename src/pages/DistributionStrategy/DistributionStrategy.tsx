import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, FileText, Search, SlidersHorizontal, Users } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { Card } from '@/components/ui/Card';
import { Select } from '@/components/ui/Select';
import { formatNumber } from '@/utils/formatters';
import { distributionProjects, distributionStatusLabels, type DistributionProjectPriority, type DistributionProjectStatus } from '@/data/demoDistributionProjects';
import { useLogger } from '@/hooks/useLogger';

const statusOptions = [
  { value: '', label: '全部状态' },
  { value: 'intake', label: '受理中' },
  { value: 'production', label: '制作中' },
  { value: 'distribution', label: '分发中' },
  { value: 'completed', label: '已完成' },
  { value: 'archived', label: '已归档' },
];

const priorityOptions = [
  { value: '', label: '全部' },
  { value: 'P0', label: 'P0' },
  { value: 'P1', label: 'P1' },
  { value: 'P2', label: 'P2' },
];

function priorityColor(priority: DistributionProjectPriority): 'red' | 'yellow' | 'gray' {
  if (priority === 'P0') return 'red';
  if (priority === 'P1') return 'yellow';
  return 'gray';
}

function statusColor(status: DistributionProjectStatus): 'blue' | 'green' | 'yellow' | 'gray' {
  if (status === 'intake') return 'blue';
  if (status === 'production') return 'yellow';
  if (status === 'distribution') return 'green';
  return 'gray';
}

export function DistributionStrategy(): JSX.Element {
  const { log } = useLogger('DistributionStrategy');
  const navigate = useNavigate();
  const [status, setStatus] = useState('');
  const [priority, setPriority] = useState('');
  const [search, setSearch] = useState('');

  const filtered = useMemo(() => distributionProjects.filter((project) => {
    if (search && !`${project.title}${project.disease}${project.brand}`.toLowerCase().includes(search.toLowerCase())) return false;
    if (status && project.status !== status) return false;
    if (priority && project.priority !== priority) return false;
    return true;
  }), [priority, search, status]);

  const counts = {
    intake: distributionProjects.filter((p) => p.status === 'intake').length,
    production: distributionProjects.filter((p) => p.status === 'production').length,
    distribution: distributionProjects.filter((p) => p.status === 'distribution').length,
    completed: distributionProjects.filter((p) => p.status === 'completed').length,
    archived: distributionProjects.filter((p) => p.status === 'archived').length,
  };

  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <Badge color="blue" className="text-[10px] uppercase tracking-wider">Distribution</Badge>
        <h1 className="text-2xl font-bold text-text-primary">分发策略</h1>
        <p className="text-sm text-text-secondary max-w-3xl">一条药企诉求即一个项目；进入项目后可分别配置医生分发策略 / 患者分发策略，并实时跟踪审批节点。</p>
        <div className="text-xs text-text-muted">当前租户 · Px 自营运营组 <span className="mx-2">·</span> 项目总数 · {distributionProjects.length}</div>
      </div>

      <div className="grid grid-cols-5 gap-4">
        {Object.entries(counts).map(([key, value]) => (
          <Card key={key} className="text-center">
            <div className="font-mono text-2xl font-bold text-text-primary">{value}</div>
            <div className="mt-1 text-xs text-text-muted">{distributionStatusLabels[key as DistributionProjectStatus]}</div>
            <div className="text-[10px] text-text-muted">项目</div>
          </Card>
        ))}
      </div>

      <Card className="space-y-4">
        <div className="flex items-center gap-3">
          <SlidersHorizontal className="w-4 h-4 text-text-muted" />
          <span className="text-xs text-text-muted">项目状态</span>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted" />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="搜索项目名称 / 病种 / 品牌"
              className="h-9 w-72 rounded-lg border border-border bg-bg-tertiary pl-9 pr-3 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-1 focus:ring-accent-blue"
            />
          </div>
          <Select options={statusOptions} value={status} onChange={setStatus} />
          <span className="text-xs text-text-muted">优先级</span>
          <Select options={priorityOptions} value={priority} onChange={setPriority} />
          <span className="ml-auto text-xs text-text-muted">共 {filtered.length} 个项目</span>
        </div>

        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          {filtered.map((project) => (
            <button
              key={project.id}
              onClick={() => {
                log.nav('Open distribution project', { id: project.id });
                navigate(`/distribute/${project.id}`);
              }}
              className="rounded-card border border-border bg-bg-secondary/40 p-4 text-left transition-colors hover:border-accent-blue/50 hover:bg-bg-tertiary/40"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-sm font-semibold text-text-primary">{project.title}</h3>
                    <Badge color={priorityColor(project.priority)}>{project.priority}</Badge>
                    <Badge color={statusColor(project.status)}>{distributionStatusLabels[project.status]}</Badge>
                  </div>
                  <div className="mt-2 text-xs text-text-muted">
                    {project.brand} · {project.disease} · 负责人 {project.owner} · 期望上线 {project.expectedDate}
                  </div>
                </div>
                <ArrowRight className="w-4 h-4 shrink-0 text-text-muted" />
              </div>

              <div className="mt-4 grid grid-cols-3 gap-3">
                <div className="rounded-lg bg-bg-card p-3"><div className="text-[10px] text-text-muted">总量</div><div className="font-mono text-sm text-text-primary">{project.totalPieces} 篇</div></div>
                <div className="rounded-lg bg-bg-card p-3"><div className="text-[10px] text-text-muted">节奏</div><div className="font-mono text-sm text-text-primary">{project.cadence}</div></div>
                <div className="rounded-lg bg-bg-card p-3"><div className="text-[10px] text-text-muted">患者上限</div><div className="font-mono text-sm text-text-primary">{formatNumber(project.patientCap)} 人</div></div>
              </div>

              <div className="mt-3 flex flex-wrap gap-2">
                {project.topics.map((topic) => <span key={topic} className="rounded bg-bg-card px-2 py-1 text-[10px] text-text-muted">{topic}</span>)}
                <span className="rounded bg-bg-card px-2 py-1 text-[10px] text-text-muted">{project.formats}</span>
              </div>

              <div className="mt-4 flex items-center justify-between gap-3 border-t border-border/60 pt-3 text-xs text-text-muted">
                <span>{project.approvalFlow}</span>
                <span className="font-mono text-text-primary">{project.progress}%</span>
                <span>当前节点：{project.currentNode}</span>
                <span className="inline-flex items-center gap-1"><FileText className="w-3 h-3" />关联内容 {project.contentCount}</span>
                <span className="inline-flex items-center gap-1"><Users className="w-3 h-3" />已发布 {project.publishedCount}</span>
                <span className="text-accent-blue">进入项目</span>
              </div>
            </button>
          ))}
        </div>
      </Card>
    </div>
  );
}
