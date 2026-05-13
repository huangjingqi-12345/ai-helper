import { useNavigate } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
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
      <Card>
        <Skeleton className="h-[420px]" />
      </Card>
    );
  }

  return (
    <Card className="p-0 overflow-hidden">
      <div className="flex items-center justify-between px-5 py-4 border-b border-border">
        <div>
          <h3 className="text-base font-semibold text-text-primary">项目概览</h3>
          <p className="text-xs text-text-muted mt-1">每个项目独立呈现：已发布内容 / 推送人数 / 阅读人数 / 阅读次数 / 互动数（赞·踩·藏）</p>
        </div>
        <button
          onClick={() => {
            log.nav('Navigate to Behavior Insights from project table');
            navigate('/audience');
          }}
          className="text-xs text-accent-blue hover:text-accent-blue/80 flex items-center gap-1 transition-colors"
        >
          行为洞察 <ArrowRight size={12} />
        </button>
      </div>
      <div className="divide-y divide-border/60">
        {projects.map((project) => (
          <div key={project.id} className="px-5 py-4 hover:bg-bg-tertiary/30 transition-colors">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-[180px]">
                <div className="text-sm text-text-primary font-semibold">{project.name}</div>
                <div className="text-xs text-text-muted mt-1">内容 {project.contentCount}</div>
                <div className="text-xs text-text-muted mt-1">
                  已发布 {project.publishedCount} 条 · 草稿/下架 {project.contentCount - project.publishedCount} 条
                </div>
              </div>
              <div className="grid flex-1 grid-cols-5 gap-3">
                {metricLabels.map((metric) => {
                  const value = metric.key === 'readUsers' ? (project.readUsers ?? 0) : project[metric.key];
                  return (
                    <div key={metric.key} className="rounded-lg bg-bg-secondary/70 border border-border/60 px-3 py-2">
                      <div className="text-[10px] text-text-muted mb-1">{metric.label}</div>
                      <div className="font-mono text-sm font-semibold text-text-primary">{formatNumber(value)}</div>
                      <div className="text-[10px] text-text-muted">{metric.unit}</div>
                    </div>
                  );
                })}
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  log.ui('Enter project clicked', { projectId: project.id, name: project.name });
                  navigate(`/content?domain=${encodeURIComponent(project.disease || project.name)}`);
                }}
              >
                进入项目 <ArrowRight size={12} />
              </Button>
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}
