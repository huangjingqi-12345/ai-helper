import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { ErrorState } from '@/components/ui/ErrorState';
import { PageHeader } from '@/components/PageHeader';
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
      <PageHeader
        eyebrow="OVERVIEW"
        title="患者教育内容运营总览"
        subtitle={
          isOps
            ? '按项目维度展示各项目下的内容触达、阅读与互动效果。当前为极简版，不含 AE 管理与归因模块。'
            : '药企视图：按项目维度展示该租户名下各项目的脱敏聚合数据（k-匿名），不可下钻。'
        }
        meta={
          <>
            <span className="inline-flex items-center gap-1.5 rounded border border-border bg-[oklch(24%_.02_260_/.4)] px-2 py-0.5 text-[11px] text-muted-foreground">
              数据更新：{stats?.lastUpdated ? formatDate(stats.lastUpdated) : '—'}
            </span>
            <span className="inline-flex items-center gap-1.5 rounded border border-sky-500/30 bg-sky-500/10 px-2 py-0.5 text-[11px] text-sky-200">
              · 运营视图
            </span>
          </>
        }
        actions={
          <button
            type="button"
            className="inline-flex items-center gap-1.5 rounded-md border border-[oklch(70%_.15_200_/.4)] bg-[oklch(70%_.15_200_/.1)] px-3 py-1.5 text-[12.5px] font-medium text-primary transition-colors hover:bg-[oklch(70%_.15_200_/.2)]"
            onClick={() => {
              log.ui('Enter Content Workshop button clicked');
              navigate('/content');
            }}
          >
            {isOps ? '进入内容工坊' : '提交选题需求'} <ArrowRight size={14} />
          </button>
        }
      />

      {/* KPI Cards */}
      <KpiCards stats={stats} loading={loading} />

      {/* Project Table */}
      <ProjectTable projects={projects} loading={loading} />
    </div>
  );
}
