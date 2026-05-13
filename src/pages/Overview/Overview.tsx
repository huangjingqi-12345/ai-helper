import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { ErrorState } from '@/components/ui/ErrorState';
import { KpiCards } from './KpiCards';
import { ProjectTable } from './ProjectTable';
import { useOverviewStore } from '@/stores/useOverviewStore';
import { useTenantStore } from '@/stores/useTenantStore';
import { useLogger } from '@/hooks/useLogger';
import { formatDate } from '@/utils/formatters';

export function Overview(): JSX.Element {
  const { stats, projects, loading, error, fetchAll } = useOverviewStore();
  const navigate = useNavigate();
  const { log } = useLogger('Overview');
  const { isOps } = useTenantStore();

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
          {isOps
            ? '按项目维度展示各项目下的内容触达、阅读与互动效果；不含 AE 管理、归因模块或临床决策支持。'
            : '药企视图：按项目维度展示该租户名下各项目的脱敏聚合数据（k-匿名），不可下钻。'}
          </p>
        <div className="flex items-center gap-3 text-xs text-text-muted">
          <span>数据更新：{stats?.lastUpdated ? formatDate(stats.lastUpdated) : '—'}</span>
          <span>•</span>
          <Badge color="blue" className="text-[10px]">运营视图</Badge>
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="text-accent-blue"
          onClick={() => {
            log.ui('Enter Content Workshop button clicked');
            navigate('/content');
          }}
        >
          {isOps ? '进入内容工坊' : '提交选题需求'} <ArrowRight size={14} />
        </Button>
      </div>

      {/* KPI Cards */}
      <KpiCards stats={stats} loading={loading} />

      {/* Project Table */}
      <ProjectTable projects={projects} loading={loading} />
    </div>
  );
}
