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

export function ProjectTable({ projects, loading }: ProjectTableProps): JSX.Element {
  const navigate = useNavigate();
  const { log } = useLogger('ProjectTable');

  if (loading) {
    return (
      <Card>
        <Skeleton className="h-[300px]" />
      </Card>
    );
  }

  return (
    <Card className="p-0 overflow-hidden">
      <div className="flex items-center justify-between px-5 py-4 border-b border-border">
        <h3 className="text-base font-semibold text-text-primary">项目概览</h3>
        <button
          onClick={() => {
            log.nav('Navigate to Behavior Insights from project table');
            navigate('/behavior-insights');
          }}
          className="text-xs text-accent-blue hover:text-accent-blue/80 flex items-center gap-1 transition-colors"
        >
          行为洞察 <ArrowRight size={12} />
        </button>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-border bg-bg-secondary/50">
              <th className="px-5 py-3 text-left text-xs font-medium text-text-muted">项目</th>
              <th className="px-5 py-3 text-right text-xs font-medium text-text-muted">内容数</th>
              <th className="px-5 py-3 text-right text-xs font-medium text-text-muted">已发布</th>
              <th className="px-5 py-3 text-right text-xs font-medium text-text-muted">推送</th>
              <th className="px-5 py-3 text-right text-xs font-medium text-text-muted">阅读</th>
              <th className="px-5 py-3 text-right text-xs font-medium text-text-muted">互动</th>
              <th className="px-5 py-3 text-right text-xs font-medium text-text-muted">操作</th>
            </tr>
          </thead>
          <tbody>
            {projects.map((project) => (
              <tr key={project.id} className="border-b border-border/50 hover:bg-bg-tertiary/30 transition-colors">
                <td className="px-5 py-3">
                  <div className="text-sm text-text-primary font-medium">{project.name}</div>
                  <div className="text-xs text-text-muted">{project.disease}</div>
                </td>
                <td className="px-5 py-3 text-right text-sm text-text-secondary">{project.contentCount}</td>
                <td className="px-5 py-3 text-right text-sm text-text-secondary">{project.publishedCount}</td>
                <td className="px-5 py-3 text-right text-sm text-text-secondary font-mono">{formatNumber(project.pushCount)}</td>
                <td className="px-5 py-3 text-right text-sm text-text-secondary font-mono">{formatNumber(project.readCount)}</td>
                <td className="px-5 py-3 text-right text-sm text-text-secondary font-mono">{formatNumber(project.interactionCount)}</td>
                <td className="px-5 py-3 text-right">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      log.ui('Enter project clicked', { projectId: project.id, name: project.name });
                    }}
                  >
                    进入项目 <ArrowRight size={12} />
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
