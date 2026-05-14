import { useNavigate } from 'react-router-dom';
import { ArrowRight, FolderKanban } from 'lucide-react';
import { Skeleton } from '@/components/ui/Skeleton';
import { formatNumber } from '@/utils/formatters';
import { useLogger } from '@/hooks/useLogger';
import type { Project } from '@/types';

interface ProjectTableProps {
  projects: Project[];
  loading: boolean;
}

const metricLabels = [
  { key: 'publishedCount', label: '已发布内容', unit: '条' },
  { key: 'pushCount', label: '推送人数', unit: '人' },
  { key: 'readUsers', label: '阅读人数', unit: '人' },
  { key: 'readCount', label: '阅读次数', unit: '次' },
  { key: 'interactionCount', label: '互动数', unit: '次' },
] as const;

export function ProjectTable({ projects, loading }: ProjectTableProps): JSX.Element {
  const navigate = useNavigate();
  const { log } = useLogger('ProjectTable');

  if (loading) {
    return (
      <div className="rounded-xl border border-border bg-card p-5">
        <Skeleton className="h-[420px]" />
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card">
      <div className="flex items-center justify-between border-b border-border px-5 py-4">
        <div>
          <h3 className="text-[15px] font-semibold text-foreground">项目概览</h3>
          <p className="mt-0.5 text-[12px] text-muted-foreground">每个项目独立呈现：已发布内容 / 推送人数 / 阅读人数 / 阅读次数 / 互动数（赞·踩·藏）</p>
        </div>
        <button
          onClick={() => {
            log.nav('Navigate to Behavior Insights from project table');
            navigate('/audience');
          }}
          className="inline-flex items-center gap-1 text-[12px] text-primary transition-colors hover:underline"
        >
          行为洞察 <ArrowRight size={12} />
        </button>
      </div>
      <div className="divide-y divide-border">
        {projects.map((project) => (
          <div key={project.id} className="flex flex-col gap-4 px-5 py-4 transition-colors hover:bg-secondary/30 md:flex-row md:items-center">
            <div className="flex min-w-0 flex-1 items-center gap-3">
              <div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-[oklch(22%_.06_200_/.6)] text-primary">
                <FolderKanban className="h-4 w-4" />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="truncate text-[14px] font-semibold text-foreground">{project.name}</span>
                  <span className="rounded border border-border bg-secondary/50 px-1.5 py-0.5 text-[10.5px] text-muted-foreground">
                    内容 {project.contentCount}
                  </span>
                </div>
                <div className="mt-0.5 text-[11.5px] text-muted-foreground">
                  已发布 {project.publishedCount} 条 · 草稿/下架 {project.contentCount - project.publishedCount} 条
                </div>
              </div>
            </div>
            <div className="grid w-full grid-cols-2 gap-3 md:w-auto md:grid-cols-5 md:gap-5">
                {metricLabels.map((metric) => {
                  const value = metric.key === 'readUsers' ? (project.readUsers ?? 0) : project[metric.key];
                  const color = metric.key === 'publishedCount'
                    ? 'oklch(78% .15 70)'
                    : metric.key === 'pushCount'
                      ? 'oklch(70% .15 200)'
                      : metric.key === 'readUsers'
                        ? 'oklch(82% .15 165)'
                        : metric.key === 'readCount'
                          ? 'oklch(82% .16 300)'
                          : 'oklch(78% .15 30)';
                  return (
                    <div key={metric.key} className="min-w-0">
                      <div className="text-[10.5px] text-muted-foreground">{metric.label}</div>
                      <div className="mt-0.5 flex items-baseline gap-1">
                        <span className="tabular text-[16px] font-semibold leading-none" style={{ color }}>{formatNumber(value)}</span>
                        <span className="text-[10.5px] text-muted-foreground">{metric.unit}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
              <button
                type="button"
                className="hidden shrink-0 rounded-md border border-border bg-secondary/40 px-3 py-1.5 text-[12px] text-muted-foreground transition-colors hover:border-primary/40 hover:text-primary md:inline-flex md:items-center md:gap-1"
                onClick={() => {
                  log.ui('Enter project clicked', { projectId: project.id, name: project.name });
                  navigate(`/content?domain=${encodeURIComponent(project.disease || project.name)}`);
                }}
              >
                进入项目 <ArrowRight size={12} />
              </button>
          </div>
        ))}
      </div>
    </div>
  );
}
