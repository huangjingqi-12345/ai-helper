import { useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { ChevronRight, Search, Send } from 'lucide-react';
import { clsx } from 'clsx';
import { PageHeader } from '@/components/PageHeader';
import { Spinner } from '@/components/ui/Spinner';
import { ErrorState } from '@/components/ui/ErrorState';
import { SubmitRequestModal } from './SubmitRequestModal';
import { useContentStore } from '@/stores/useContentStore';
import { useTenantStore } from '@/stores/useTenantStore';
import { useLogger } from '@/hooks/useLogger';
import { CONTENT_TYPE_LABELS, PIPELINE_STAGE_MAP } from '@/utils/constants';
import { formatDateOnly, formatNumber } from '@/utils/formatters';
import type { Content, ContentStatus, PipelineStage } from '@/types';

/** PM 确认的 6 态内容状态（2026-05-15 产品确定） */
const STATUS_OPTIONS: Array<{ value: 'all' | ContentStatus; label: string }> = [
  { value: 'all', label: '全部状态' },
  { value: 'requirement_submitted', label: '需求已提交' },
  { value: 'doctor_distributing', label: '医生分发中' },
  { value: 'doctor_producing', label: '医生制作中' },
  { value: 'third_party_review', label: '三方审核中' },
  { value: 'internal_review', label: '内部审核中' },
  { value: 'published', label: '已发布' },
];

const PIPELINE_STAGE_OPTIONS: PipelineStage[] = [
  'requirement_submitted',
  'doctor_distributing',
  'doctor_producing',
  'third_party_review',
  'internal_review',
  'published',
];

// DEMO FALLBACK: 生产应从 API content.projectBrief 获取，此处仅为 seed 数据补充展示
const CONTENT_PROJECT_BRIEFS: Record<string, string> = {
  'CNT-101': '项目 · 赫赛汀 · HER2+ 术后辅助随访计划 · 诉求 · 12 周随访节点提醒',
  'CNT-102': '项目 · 爱博新 · CDK4/6 口服依从性 · 诉求 · 启药 6 周依从性提醒',
};

/** PM 确认的 6 态状态样式映射 */
const statusMeta: Record<string, { label: string; cls: string; dot: string }> = {
  requirement_submitted: {
    label: '需求已提交',
    cls: 'border-[oklch(40%_.04_70_/.5)] bg-[oklch(28%_.06_70_/.35)] text-[oklch(82%_.13_75)]',
    dot: 'bg-[oklch(78%_.15_70)]',
  },
  doctor_distributing: {
    label: '医生分发中',
    cls: 'border-[oklch(70%_.15_200_/.3)] bg-[oklch(70%_.15_200_/.1)] text-primary',
    dot: 'bg-primary',
  },
  doctor_producing: {
    label: '医生制作中',
    cls: 'border-[oklch(40%_.06_280_/.5)] bg-[oklch(26%_.06_280_/.35)] text-[oklch(82%_.15_280)]',
    dot: 'bg-[oklch(72%_.17_280)]',
  },
  third_party_review: {
    label: '三方审核中',
    cls: 'border-[oklch(45%_.14_70_/.5)] bg-[oklch(28%_.1_70_/.35)] text-[oklch(82%_.15_70)]',
    dot: 'bg-[oklch(78%_.15_70)]',
  },
  internal_review: {
    label: '内部审核中',
    cls: 'border-[oklch(45%_.14_40_/.5)] bg-[oklch(28%_.1_40_/.35)] text-[oklch(82%_.15_40)]',
    dot: 'bg-[oklch(78%_.15_40)]',
  },
  published: {
    label: '已发布',
    cls: 'border-[oklch(40%_.06_165_/.5)] bg-[oklch(26%_.06_165_/.35)] text-[oklch(82%_.15_165)]',
    dot: 'bg-[oklch(72%_.17_165)]',
  },
};

const flowStatusCls: Record<PipelineStage, string> = {
  requirement_submitted: 'text-[oklch(78%_.15_70)]',
  doctor_distributing: 'text-[oklch(82%_.16_300)]',
  doctor_producing: 'text-[oklch(72%_.17_195)]',
  third_party_review: 'text-[oklch(80%_.15_260)]',
  internal_review: 'text-[oklch(82%_.16_195)]',
  published: 'text-[oklch(82%_.15_165)]',
};

const priorityCls: Record<string, string> = {
  P0: 'border-[oklch(45%_.18_30_/.5)] bg-[oklch(28%_.12_30_/.4)] text-[oklch(82%_.18_30)]',
  P1: 'border-[oklch(45%_.14_70_/.5)] bg-[oklch(28%_.1_70_/.35)] text-[oklch(82%_.15_70)]',
  P2: 'border-[oklch(40%_.06_200_/.5)] bg-[oklch(26%_.06_200_/.35)] text-[oklch(80%_.13_200)]',
};

export function ContentWorkshop(): JSX.Element {
  const { items, total, loading, error, fetchList } = useContentStore();
  const { currentTenant, isOps } = useTenantStore();
  const { log } = useLogger('ContentWorkshop');
  const location = useLocation();
  const [statusFilter, setStatusFilter] = useState<'all' | ContentStatus>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [projectFilter, setProjectFilter] = useState('all');
  const [flowFilter, setFlowFilter] = useState<'all' | PipelineStage>('all');
  const [pageSize, setPageSize] = useState<20 | 50 | 100>(20);
  const [page, setPage] = useState(1);
  const [submitRequestOpen, setSubmitRequestOpen] = useState(false);
  const isPharma = !isOps;

  useEffect(() => {
    log.nav('Content Workshop page loaded');
    fetchList();
  }, [fetchList, log]);

  const domainFilter = new URLSearchParams(location.search).get('domain');

  const projectOptions = useMemo(() => {
    const values = items.map((item) => item.projectName || item.tags[0]).filter(Boolean) as string[];
    return Array.from(new Set(values)).sort();
  }, [items]);

  const flowCounts = useMemo(() => {
    const counts = Object.fromEntries(PIPELINE_STAGE_OPTIONS.map((stage) => [stage, 0])) as Record<PipelineStage, number>;
    items.forEach((item) => {
      if (item.pipelineStage && counts[item.pipelineStage] !== undefined) counts[item.pipelineStage] += 1;
    });
    return counts;
  }, [items]);

  const filteredItems = useMemo(() => {
    return items.filter((item) => {
      if (statusFilter !== 'all' && item.status !== statusFilter) return false;
      if (projectFilter !== 'all' && (item.projectName || item.tags[0]) !== projectFilter) return false;
      if (domainFilter && projectFilter === 'all' && !(item.projectName?.includes(domainFilter) || item.tags.some((tag) => tag.includes(domainFilter)))) return false;
      if (flowFilter !== 'all' && item.pipelineStage !== flowFilter) return false;
      if (searchTerm.trim()) {
        const query = searchTerm.trim().toLowerCase();
        if (!item.title.toLowerCase().includes(query) && !item.id.toLowerCase().includes(query)) return false;
      }
      return true;
    });
  }, [domainFilter, flowFilter, items, projectFilter, searchTerm, statusFilter]);

  const totalPages = Math.max(1, Math.ceil(filteredItems.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const pageItems = filteredItems.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  if (error && !loading) return <ErrorState message={error} onRetry={fetchList} />;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="CONTENT"
        title="患教内容工坊"
        subtitle={
          isPharma
            ? '药企视图作为诉求方：可发起选题需求、设定优先级与期望上线日；不参与生产、审核与上下架，只可查看已上架内容与抽查样片。'
            : '运营视图作为合规枢纽：承接药企需求、调度 DX 生产、完成医学审核与上下架；指标仅来自患者侧触达 / 阅读 / 互动。'
        }
      />

      {isPharma && (
        <button
          type="button"
          onClick={() => setSubmitRequestOpen(true)}
          className="group relative w-full overflow-hidden rounded-xl border border-amber-500/40 bg-gradient-to-br from-[oklch(28%_.1_70)] via-[oklch(24%_.08_55)] to-[oklch(22%_.05_45)] p-5 text-left transition-all hover:border-amber-400/60"
        >
          <div className="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full opacity-60 blur-3xl [background:radial-gradient(circle,oklch(70%_.18_70_/.5),transparent_70%)]" />
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="grid h-10 w-10 place-items-center rounded-md bg-gradient-to-br from-[oklch(60%_.18_300)] to-[oklch(58%_.16_280)] shadow-[0_0_18px_oklch(60%_.18_300_/.5)]">
                <Send className="h-5 w-5 text-white" />
              </div>
              <div>
                <div className="text-[15px] font-semibold tracking-wide">发起选题需求</div>
                <div className="text-[12.5px] text-muted-foreground">
                  {currentTenant.shortName} 作为诉求方提交主题、优先级与期望上线日，运营接单后排期生产
                </div>
              </div>
            </div>
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          </div>
        </button>
      )}

      <div className="rounded-xl border border-border bg-card">
        <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
          <div className="inline-flex items-center gap-2 text-[12.5px] font-medium">
            <span>内容管理</span>
            <span className="rounded bg-[oklch(28%_.08_260)] px-1.5 py-0.5 text-[10.5px] text-muted-foreground">{total}</span>
          </div>
          <div className="hidden text-[11px] text-muted-foreground md:block">行为数据口径：推送 / 阅读 / 互动</div>
        </div>

        <div className="space-y-4 p-4">
          <div className="grid grid-cols-2 gap-2.5 md:grid-cols-3 lg:grid-cols-6">
            {PIPELINE_STAGE_OPTIONS.map((stage) => (
              <StatBucket
                key={stage}
                label={PIPELINE_STAGE_MAP[stage].label}
                value={flowCounts[stage]}
                accent={stageAccent(stage)}
                active={flowFilter === stage}
                onClick={() => {
                  setFlowFilter((current) => (current === stage ? 'all' : stage));
                  setPage(1);
                }}
              />
            ))}
          </div>

          <div className="rounded-lg border border-border bg-[oklch(14%_.02_260)]">
            <div className="flex flex-col gap-3 border-b border-border px-4 py-3 md:flex-row md:flex-wrap md:items-center">
              <FilterField label="状态">
                <select
                  value={statusFilter}
                  onChange={(event) => {
                    setStatusFilter(event.target.value as 'all' | ContentStatus);
                    setPage(1);
                  }}
                  className="h-8 rounded-md border border-border bg-[oklch(18%_.02_260)] px-2 text-[12px] outline-none focus:border-[oklch(70%_.15_200_/.5)]"
                >
                  {STATUS_OPTIONS.map((option) => (
                    <option key={`${option.value}-${option.label}`} value={option.value}>{option.label}</option>
                  ))}
                </select>
              </FilterField>
              <FilterField label="项目">
                <select
                  value={projectFilter}
                  onChange={(event) => {
                    setProjectFilter(event.target.value);
                    setPage(1);
                  }}
                  className="h-8 rounded-md border border-border bg-[oklch(18%_.02_260)] px-2 text-[12px] outline-none focus:border-[oklch(70%_.15_200_/.5)]"
                >
                  <option value="all">全部项目</option>
                  {projectOptions.map((project) => (
                    <option key={project} value={project}>{project}</option>
                  ))}
                </select>
              </FilterField>
              <FilterField label="项目流程">
                <select
                  value={flowFilter}
                  onChange={(event) => {
                    setFlowFilter(event.target.value as 'all' | PipelineStage);
                    setPage(1);
                  }}
                  className="h-8 rounded-md border border-border bg-[oklch(18%_.02_260)] px-2 text-[12px] outline-none focus:border-[oklch(70%_.15_200_/.5)]"
                >
                  <option value="all">全部流程</option>
                  {PIPELINE_STAGE_OPTIONS.map((stage) => (
                    <option key={stage} value={stage}>{PIPELINE_STAGE_MAP[stage].label}（{flowCounts[stage]}）</option>
                  ))}
                </select>
              </FilterField>
              <div className="relative w-full md:ml-auto md:w-60">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                <input
                  value={searchTerm}
                  onChange={(event) => {
                    setSearchTerm(event.target.value);
                    setPage(1);
                  }}
                  placeholder="搜索标题或内容编号"
                  className="h-8 w-full rounded-md border border-border bg-[oklch(18%_.02_260)] pl-8 pr-2 text-[12.5px] outline-none placeholder:text-muted-foreground/70 focus:border-[oklch(70%_.15_200_/.5)]"
                />
              </div>
              {(statusFilter !== 'all' || projectFilter !== 'all' || flowFilter !== 'all' || searchTerm || domainFilter) && (
                <button
                  onClick={() => {
                    setStatusFilter('all');
                    setProjectFilter('all');
                    setFlowFilter('all');
                    setSearchTerm('');
                    setPage(1);
                  }}
                  className="h-8 rounded-md border border-border bg-[oklch(24%_.02_260_/.4)] px-2 text-[11.5px] text-muted-foreground hover:text-foreground"
                >
                  清除筛选
                </button>
              )}
            </div>

            {loading ? (
              <div className="flex justify-center py-12"><Spinner size="lg" /></div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-[13px]">
                  <thead>
                    <tr className="border-b border-border bg-[oklch(18%_.02_260)] text-[11px] uppercase tracking-[0.1em] text-muted-foreground">
                      <Th className="pl-4">内容</Th>
                      <Th>类型 / 形式</Th>
                      <Th>项目</Th>
                      <Th>项目流程</Th>
                      <Th>状态</Th>
                      <Th align="right">阅读</Th>
                      <Th align="right">互动</Th>
                      <Th align="right" className="pr-4" />
                    </tr>
                  </thead>
                  <tbody>
                    {pageItems.map((item) => <ContentRow key={item.id} item={item} />)}
                    {pageItems.length === 0 && (
                      <tr>
                        <td colSpan={8} className="px-4 py-8 text-center text-muted-foreground">暂无匹配的内容</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}

            {filteredItems.length > 0 && (
              <div className="flex flex-col gap-2 border-t border-border px-4 py-3 text-[12px] text-muted-foreground md:flex-row md:items-center md:justify-between">
                <div>
                  共 <span className="tabular text-foreground">{filteredItems.length}</span> 条 · 第{' '}
                  <span className="tabular text-foreground">{currentPage}</span> / <span className="tabular">{totalPages}</span> 页
                </div>
                <div className="flex items-center gap-3">
                  <label className="inline-flex items-center gap-1.5">
                    <span>每页</span>
                    <select
                      value={pageSize}
                      onChange={(event) => {
                        setPageSize(Number(event.target.value) as 20 | 50 | 100);
                        setPage(1);
                      }}
                      className="h-7 rounded-md border border-border bg-[oklch(18%_.02_260)] px-2 text-[12px] outline-none focus:border-[oklch(70%_.15_200_/.5)]"
                    >
                      <option value={20}>20 条</option>
                      <option value={50}>50 条</option>
                      <option value={100}>100 条</option>
                    </select>
                  </label>
                  <button onClick={() => setPage((value) => Math.max(1, value - 1))} disabled={currentPage <= 1} className="h-7 rounded-md border border-border bg-[oklch(24%_.02_260_/.4)] px-2.5 disabled:cursor-not-allowed disabled:opacity-40 hover:text-foreground">上一页</button>
                  <button onClick={() => setPage((value) => Math.min(totalPages, value + 1))} disabled={currentPage >= totalPages} className="h-7 rounded-md border border-border bg-[oklch(24%_.02_260_/.4)] px-2.5 disabled:cursor-not-allowed disabled:opacity-40 hover:text-foreground">下一页</button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      <SubmitRequestModal open={submitRequestOpen} onClose={() => setSubmitRequestOpen(false)} />
    </div>
  );
}

function stageAccent(stage: PipelineStage): string {
  return {
    requirement_submitted: 'oklch(78% .15 70)',
    doctor_distributing: 'oklch(82% .16 300)',
    doctor_producing: 'oklch(72% .17 195)',
    third_party_review: 'oklch(80% .15 260)',
    internal_review: 'oklch(82% .16 195)',
    published: 'oklch(82% .15 165)',
  }[stage];
}

function StatBucket({ label, value, accent, active, onClick }: { label: string; value: number; accent: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={clsx(
        'relative overflow-hidden rounded-lg border bg-[oklch(14%_.02_260)] px-4 py-3 text-left transition-colors hover:border-[oklch(70%_.15_200_/.4)]',
        active ? 'border-[oklch(70%_.15_200_/.5)]' : 'border-border',
      )}
    >
      <div className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground">{label}</div>
      <div className="mt-1.5 flex items-end gap-2">
        <span className="tabular text-[22px] font-semibold leading-none" style={{ color: accent }}>{value}</span>
        <span className="pb-0.5 text-[11px] text-muted-foreground">条</span>
      </div>
      <span className="absolute inset-x-0 bottom-0 h-[2px]" style={{ background: accent, boxShadow: `0 0 12px ${accent}80` }} />
    </button>
  );
}

function Th({ children, align = 'left', className }: { children?: ReactNode; align?: 'left' | 'right'; className?: string }) {
  return <th className={clsx('px-3 py-2.5 font-medium', align === 'right' ? 'text-right' : 'text-left', className)}>{children}</th>;
}

function ContentRow({ item }: { item: Content }): JSX.Element {
  const meta = statusMeta[item.status] ?? statusMeta.requirement_submitted!;
  // PM 确认：互动数（正向）= 点赞 + 收藏，不含 dislikes/shares
  const interactions = (item.likeCount ?? 0) + (item.bookmarkCount ?? 0);
  const flowLabel = PIPELINE_STAGE_MAP[item.pipelineStage]?.label ?? '—';
  const isPrePublish = item.status !== 'published';

  return (
    <tr className="row-hover group border-b border-[oklch(30%_.02_260_/.45)] transition-colors hover:bg-[oklch(24%_.02_260_/.2)]">
      <td className="py-3.5 pl-4 pr-3">
        <Link to={`/content/${item.id}`} className="block">
          <div className="text-[13.5px] font-medium text-foreground group-hover:text-primary">{item.title}</div>
          {(item.projectBrief || CONTENT_PROJECT_BRIEFS[item.id]) && (
            <div className="mt-0.5 max-w-[440px] truncate text-[11px] text-muted-foreground/80">
              {item.projectBrief || CONTENT_PROJECT_BRIEFS[item.id]}
            </div>
          )}
          <div className="mt-0.5 flex items-center gap-2 text-[11px] text-muted-foreground">
            <span className="tabular">{item.id}</span>
            <span>·</span>
            <span>{formatDateOnly(item.createdAt)}</span>
            <span>·</span>
            <span>{item.author}</span>
          </div>
        </Link>
      </td>
      <td className="px-3">
        <span className="rounded border border-[oklch(30%_.02_260_/.7)] bg-[oklch(24%_.02_260_/.5)] px-2 py-0.5 text-[11px] text-muted-foreground">
          {CONTENT_TYPE_LABELS[item.type] || item.type}
        </span>
      </td>
      <td className="px-3 text-[12.5px] text-muted-foreground">{item.projectName || '—'}</td>
      <td className="px-3">
        <div className="flex flex-col gap-1">
          <span className={clsx('text-[12px] font-medium', flowStatusCls[item.pipelineStage] ?? 'text-muted-foreground')}>{flowLabel}</span>
          <div className="flex items-center gap-1">
            {item.priority && <span className={clsx('inline-flex items-center rounded border px-1 py-0 text-[10px] font-medium', priorityCls[item.priority])}>{item.priority}</span>}
            {item.expectedDate && <span className="text-[10.5px] text-muted-foreground">期望 {formatDateOnly(item.expectedDate)}</span>}
          </div>
          {item.rejectionNote && (
            <div title={item.rejectionNote} className="max-w-[180px] truncate text-[10.5px] text-[oklch(72%_.18_30)]">
              驳回：{item.rejectionNote}
            </div>
          )}
        </div>
      </td>
      <td className="px-3">
        <span className={clsx('inline-flex items-center gap-1.5 rounded border px-1.5 py-0.5 text-[11px] font-medium', meta.cls)}>
          <span className={clsx('h-1.5 w-1.5 rounded-full', meta.dot)} /> {meta.label}
        </span>
      </td>
      <td className="px-3 text-right tabular text-muted-foreground">{isPrePublish ? '—' : formatNumber(item.readCount)}</td>
      <td className="px-3 text-right tabular text-muted-foreground">{isPrePublish ? '—' : formatNumber(interactions)}</td>
      <td className="py-3.5 pl-3 pr-4 text-right">
        <Link to={`/content/${item.id}`} className="inline-flex items-center gap-0.5 text-[12px] text-primary opacity-0 transition-opacity group-hover:opacity-100">
          详情 <ChevronRight className="h-3.5 w-3.5" />
        </Link>
      </td>
    </tr>
  );
}

function FilterField({ label, children }: { label: string; children: ReactNode }): JSX.Element {
  return (
    <label className="inline-flex items-center gap-1.5 text-[11.5px] text-muted-foreground">
      <span className="shrink-0">{label}</span>
      {children}
    </label>
  );
}
