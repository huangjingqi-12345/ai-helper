import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { ErrorState } from '@/components/ui/ErrorState';
import { KpiCards } from './KpiCards';
import { ProjectTable } from './ProjectTable';
import { useOverviewStore } from '@/stores/useOverviewStore';
import { useLogger } from '@/hooks/useLogger';
import { formatDateOnly } from '@/utils/formatters';

export function Overview(): JSX.Element {
  const { stats, projects, loading, error, fetchAll } = useOverviewStore();
  const navigate = useNavigate();
  const { log } = useLogger('Overview');

  useEffect(() => {
    log.nav('Overview page loaded');
    log.perf('Overview page mount', { timestamp: Date.now() });
    fetchAll();
  }, [fetchAll, log]);

  if (error && !loading) {
    return <ErrorState message={error} onRetry={fetchAll} />;
  }

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="space-y-3">
        <Badge color="blue" className="text-[10px] uppercase tracking-wider">Overview</Badge>
        <h1 className="text-2xl font-bold text-text-primary">患者教育内容运营总览</h1>
        <p className="text-sm text-text-secondary max-w-2xl">
          查看所有患教项目的内容发布情况、患者触达数据和行为互动概览。通过数据驱动，优化内容策略，提升患者教育效果。
        </p>
        <div className="flex items-center gap-3 text-xs text-text-muted">
          <span>数据更新至 {stats?.lastUpdated ? formatDateOnly(stats.lastUpdated) : '—'}</span>
          <span>•</span>
          <Badge color="purple" className="text-[10px]">患者教育</Badge>
          <Badge color="green" className="text-[10px]">行为数据</Badge>
          <Badge color="yellow" className="text-[10px]">内容运营</Badge>
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="text-accent-blue"
          onClick={() => {
            log.ui('Enter Content Workshop button clicked');
            navigate('/content-workshop');
          }}
        >
          进入内容工坊 <ArrowRight size={14} />
        </Button>
      </div>

      {/* KPI Cards */}
      <KpiCards stats={stats} loading={loading} />

      {/* Project Table */}
      <ProjectTable projects={projects} loading={loading} />
    </div>
  );
}
