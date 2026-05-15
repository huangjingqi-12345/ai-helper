import { useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Activity, Filter, Heart, Users, X, Zap } from 'lucide-react';
import { clsx } from 'clsx';
import { PageHeader } from '@/components/PageHeader';
import { KpiCard } from '@/components/KpiCard';
import { Spinner } from '@/components/ui/Spinner';
import { ErrorState } from '@/components/ui/ErrorState';
import { useBehaviorStore } from '@/stores/useBehaviorStore';
import { useTenantStore } from '@/stores/useTenantStore';
import { useLogger } from '@/hooks/useLogger';
import { formatNumber } from '@/utils/formatters';

type SortBy = 'reads' | 'interactions';

export function BehaviorInsights(): JSX.Element {
  const { summary, loading, error, fetchSummary } = useBehaviorStore();
  const { isOps } = useTenantStore();
  const { log } = useLogger('BehaviorInsights');
  const [sortBy, setSortBy] = useState<SortBy>('reads');
  const [projects, setProjects] = useState<string[]>([]);

  useEffect(() => {
    log.nav('Behavior Insights page loaded');
    fetchSummary();
  }, [fetchSummary, log]);

  const projectOptions = useMemo(() => {
    const source = summary?.byDisease?.map((item) => item.disease) ?? [];
    const fromContent = summary?.topContent?.map((item) => item.disease).filter(Boolean) as string[] | undefined;
    return Array.from(new Set([...(source ?? []), ...(fromContent ?? [])])).sort();
  }, [summary?.byDisease, summary?.topContent]);

  const filteredContent = useMemo(() => {
    const rows = [...(summary?.topContent ?? [])];
    const selected = new Set(projects);
    const filtered = selected.size === 0 ? rows : rows.filter((item) => selected.has(item.disease ?? ''));
    return filtered.sort((a, b) => (sortBy === 'reads' ? b.reads - a.reads : b.interactions - a.interactions));
  }, [projects, sortBy, summary?.topContent]);

  const kpis = useMemo(() => {
    if (!summary) return null;
    if (projects.length === 0) {
      return {
        pushPeople: summary.pushCount ?? 0,
        readPeople: summary.readUsers ?? 0,
        readTimes: summary.totalReads ?? 0,
        interactions: summary.totalInteractions ?? 0,
      };
    }
    return filteredContent.reduce(
      (acc, item) => ({
        pushPeople: acc.pushPeople + (item.pushCount ?? 0),
        readPeople: acc.readPeople + (item.readUsers ?? 0),
        readTimes: acc.readTimes + item.reads,
        interactions: acc.interactions + item.interactions,
      }),
      { pushPeople: 0, readPeople: 0, readTimes: 0, interactions: 0 },
    );
  }, [filteredContent, projects.length, summary]);

  const toggleProject = (key: string): void => {
    setProjects((current) => (current.includes(key) ? current.filter((item) => item !== key) : [...current, key]));
  };

  if (error && !loading) return <ErrorState message={error} onRetry={fetchSummary} />;
  if (loading || !summary || !kpis) return <div className="flex justify-center py-24"><Spinner size="lg" /></div>;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="AUDIENCE"
        title="患者行为洞察"
        subtitle={
          isOps
            ? '本看板仅基于患者侧的推送 / 阅读 / 互动数据进行行为聚类，不展示任何临床、依从性或归因信息。'
            : '药企视图下仅呈现整体趋势与脱敏聚合（k-匿名），不可下钻到个体。'
        }
        actions={
          !isOps ? (
            <span className="inline-flex items-center gap-1.5 rounded-md border border-amber-500/30 bg-amber-500/10 px-2.5 py-1 text-[11.5px] font-medium text-amber-200">
              k-匿名 · 仅聚合
            </span>
          ) : null
        }
      />

      <ProjectFilter options={projectOptions} selected={projects} onToggle={toggleProject} onClear={() => setProjects([])} />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {/* DEMO: delta 值为硬编码占位，生产应从 API 获取环比/同比趋势 */}
        <KpiCard label="推送人数" value={formatNumber(kpis.pushPeople)} unit="人" icon={Users} delta={{ value: 6.4 }} hint="推送的总计患者数" />
        <KpiCard label="阅读人数" value={formatNumber(kpis.readPeople)} unit="人" icon={Activity} delta={{ value: 4.2 }} hint="患教内容的阅读人数" />
        <KpiCard label="阅读次数" value={formatNumber(kpis.readTimes)} unit="次" icon={Zap} delta={{ value: 7.1 }} hint="患教内容累计阅读人次" />
        <KpiCard label="互动数" value={formatNumber(kpis.interactions)} unit="次" icon={Heart} delta={{ value: -1.2 }} hint="正向互动数 = 点赞 + 收藏" />
      </div>

      <div className="rounded-xl border border-border bg-card">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-3">
          <div>
            <div className="text-[14px] font-semibold">内容 TopN</div>
            <div className="mt-0.5 text-[11.5px] text-muted-foreground">
              按所选维度排序 · 当前命中 {projects.length === 0 ? (summary.contentCount ?? filteredContent.length) : filteredContent.length} 条内容
            </div>
          </div>
          <div className="flex items-center gap-1 rounded-md border border-border bg-secondary/40 p-1 text-[12px]">
            <SegmentButton active={sortBy === 'reads'} onClick={() => setSortBy('reads')}>按阅读次数</SegmentButton>
            <SegmentButton active={sortBy === 'interactions'} onClick={() => setSortBy('interactions')}>按互动数</SegmentButton>
          </div>
        </div>
        <ul className="divide-y divide-border">
          {filteredContent.slice(0, 10).map((item, index) => (
            <li key={item.contentId} className="flex items-center gap-4 px-5 py-3.5">
              <div className="grid h-7 w-7 shrink-0 place-items-center rounded-md bg-[oklch(24%_.04_200_/.6)] text-[12px] font-semibold tabular text-primary">
                {index + 1}
              </div>
              <Link to={`/content/${item.contentId}`} className="min-w-0 flex-1 hover:text-primary">
                <div className="truncate text-[13.5px] font-medium">{item.title}</div>
                <div className="mt-0.5 text-[11px] text-muted-foreground">{item.contentId} · {item.disease}</div>
              </Link>
              <Metric label="推送人数" value={formatNumber(item.pushCount ?? 0)} />
              <Metric label="阅读人数" value={formatNumber(item.readUsers ?? 0)} />
              <Metric label="阅读次数" value={formatNumber(item.reads)} highlight={sortBy === 'reads'} />
              <Metric label="互动数" value={formatNumber(item.interactions)} highlight={sortBy === 'interactions'} />
            </li>
          ))}
          {filteredContent.length === 0 && (
            <li className="px-5 py-10 text-center text-[12.5px] text-muted-foreground">当前项目筛选下暂无内容</li>
          )}
        </ul>
      </div>
    </div>
  );
}

function SegmentButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }): JSX.Element {
  return (
    <button
      onClick={onClick}
      className={clsx(
        'rounded px-3 py-1 transition-colors',
        active ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground',
      )}
    >
      {children}
    </button>
  );
}

function ProjectFilter({ options, selected, onToggle, onClear }: { options: string[]; selected: string[]; onToggle: (key: string) => void; onClear: () => void }): JSX.Element {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-xl border border-border bg-card px-4 py-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="inline-flex items-center gap-1.5 text-[12px] font-medium text-muted-foreground">
          <Filter className="h-3.5 w-3.5" /> 项目筛选
        </div>
        <button
          onClick={() => setOpen((value) => !value)}
          className="inline-flex items-center gap-1 rounded-md border border-border bg-secondary/50 px-2.5 py-1 text-[12px] hover:border-primary/40 hover:bg-primary/10 hover:text-primary"
        >
          {open ? '收起选项' : '+ 选择项目'}
        </button>
        {selected.length > 0 ? (
          <>
            {selected.map((item) => (
              <span key={item} className="inline-flex items-center gap-1 rounded-md border border-primary/40 bg-primary/10 px-2 py-1 text-[11.5px] text-primary">
                {item}
                <button onClick={() => onToggle(item)} className="grid h-3.5 w-3.5 place-items-center rounded-sm hover:bg-primary/20">
                  <X className="h-3 w-3" />
                </button>
              </span>
            ))}
            <button onClick={onClear} className="ml-1 text-[11.5px] text-muted-foreground underline-offset-2 hover:text-foreground hover:underline">清空</button>
          </>
        ) : (
          <span className="text-[11.5px] text-muted-foreground">未选择 = 全部项目</span>
        )}
      </div>
      {open && (
        <div className="mt-3 flex flex-wrap gap-1.5 border-t border-border pt-3">
          {options.map((option) => {
            const active = selected.includes(option);
            return (
              <button
                key={option}
                onClick={() => onToggle(option)}
                className={clsx(
                  'rounded-md border px-2.5 py-1 text-[11.5px] transition-all',
                  active
                    ? 'border-primary/40 bg-primary/10 text-primary'
                    : 'border-border bg-secondary/40 text-muted-foreground hover:text-foreground',
                )}
              >
                {option}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function Metric({ label, value, highlight }: { label: string; value: string; highlight?: boolean }): JSX.Element {
  return (
    <div className={clsx('hidden w-16 shrink-0 text-right md:block', !highlight && 'opacity-60')}>
      <div className="tabular text-[13px] font-semibold">{value}</div>
      <div className="text-[10.5px] text-muted-foreground">{label}</div>
    </div>
  );
}
