import { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Search, Filter } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Table } from '@/components/ui/Table';
import { Select } from '@/components/ui/Select';
import { Spinner } from '@/components/ui/Spinner';
import { ErrorState } from '@/components/ui/ErrorState';
import { EmptyState } from '@/components/ui/EmptyState';
import { PipelineCards } from './PipelineCards';
import { useContentStore } from '@/stores/useContentStore';
import { useLogger } from '@/hooks/useLogger';
import { CONTENT_STATUS_MAP, PIPELINE_STAGE_MAP, CONTENT_TYPE_LABELS } from '@/utils/constants';
import { formatDateOnly, formatNumber } from '@/utils/formatters';
import type { Content, ContentStatus, PipelineStage } from '@/types';

const STATUS_OPTIONS = [
  { value: '', label: '全部状态' },
  { value: 'draft', label: '草稿' },
  { value: 'published', label: '已发布' },
  { value: 'archived', label: '已下架' },
];

const PROJECT_OPTIONS = [
  { value: '', label: '全部项目' },
  { value: 'proj-diabetes', label: '2型糖尿病' },
  { value: 'proj-breast', label: '乳腺癌' },
  { value: 'proj-mm', label: '多发性骨髓瘤' },
  { value: 'proj-hf', label: '慢性心力衰竭' },
  { value: 'proj-copd', label: '慢阻肺(COPD)' },
  { value: 'proj-ra', label: '类风湿关节炎' },
  { value: 'proj-lung', label: '肺癌(NSCLC)' },
  { value: 'proj-hypertension', label: '高血压' },
];

const PIPELINE_STAGE_OPTIONS: PipelineStage[] = [
  'requirement_submitted',
  'doctor_distributing',
  'doctor_creating',
  'external_review',
  'internal_review',
  'published',
];

const CONTENT_PROJECT_BRIEFS: Record<string, string> = {
  'CNT-101': '项目 · 诺欣妥 · 慢性心衰患教计划 · 诉求 · 利尿剂调整 · 出院 30 天指引',
  'CNT-102': '项目 · 诺欣妥 · 慢性心衰患教计划 · 诉求 · 心衰营养 · 低盐调查表',
  'CNT-103': '项目 · 优泌乐 · 胰岛素手法规范 · 诉求 · 注射部位轮换 · 8 步图示升级',
  'CNT-104': '项目 · 甲氨蝶呤 · RA 用药依从性 · 诉求 · 周服法术语解读手册',
  'CNT-105': '项目 · 赫赛汀 · HER2+ 术后随访教育 · 诉求 · 术后护理 KOL 解读海报',
};

export function ContentWorkshop(): JSX.Element {
  const { items, total, loading, error, filter, setFilter, fetchList } = useContentStore();
  const { log } = useLogger('ContentWorkshop');
  const navigate = useNavigate();
  const location = useLocation();
  const [searchTerm, setSearchTerm] = useState('');
  const [activePipelineStage, setActivePipelineStage] = useState<PipelineStage | undefined>();
  const [pageSize, setPageSize] = useState('20');

  useEffect(() => {
    log.nav('Content Workshop page loaded');
    fetchList();
  }, [fetchList, log]);

  const handleStatusFilter = (value: string) => {
    log.action('Content filter changed', { status: value });
    setFilter({ status: (value || undefined) as ContentStatus | undefined });
  };

  const handleProjectFilter = (value: string) => {
    log.action('Project filter changed', { projectId: value });
    setFilter({ projectId: value || undefined });
  };

  const handlePipelineFilter = (value: string) => {
    log.action('Pipeline filter changed', { pipelineStage: value });
    setActivePipelineStage((value || undefined) as PipelineStage | undefined);
    setFilter({ pipelineStage: (value || undefined) as PipelineStage | undefined });
  };

  const handlePipelineCardClick = (stage: PipelineStage | undefined) => {
    log.action('Pipeline card clicked', { stage });
    setActivePipelineStage(stage);
    setFilter({ pipelineStage: stage });
  };

  const domainFilter = new URLSearchParams(location.search).get('domain');
  let filteredItems = searchTerm
    ? items.filter((item) =>
        item.title.includes(searchTerm) ||
        item.author.includes(searchTerm) ||
        item.id.toLowerCase().includes(searchTerm.toLowerCase())
      )
    : items;

  if (domainFilter && !filter.projectId) {
    filteredItems = filteredItems.filter((item) => item.projectName?.includes(domainFilter) || item.tags.some((tag) => tag.includes(domainFilter)));
  }

  if (activePipelineStage) {
    filteredItems = filteredItems.filter((item) => item.pipelineStage === activePipelineStage);
  }

  const pipelineOptions = useMemo(() => [
    { value: '', label: '全部流程' },
    ...PIPELINE_STAGE_OPTIONS.map((stage) => ({
      value: stage,
      label: `${PIPELINE_STAGE_MAP[stage].label}（${items.filter((item) => item.pipelineStage === stage).length}）`,
    })),
  ], [items]);

  if (error && !loading) {
    return <ErrorState message={error} onRetry={fetchList} />;
  }

  const columns = [
    {
      key: 'title' as const,
      header: '内容',
      render: (item: Content) => (
        <div>
          <div className="font-medium text-text-primary">{item.title}</div>
          {(item.projectBrief || CONTENT_PROJECT_BRIEFS[item.id]) && (
            <div className="mt-0.5 max-w-[440px] truncate text-xs text-text-muted">
              {item.projectBrief || CONTENT_PROJECT_BRIEFS[item.id]}
            </div>
          )}
          <div className="text-xs text-text-muted mt-0.5 flex items-center gap-2">
            <span>{item.id.toUpperCase()}</span>
            <span>·</span>
            <span>{formatDateOnly(item.createdAt)}</span>
            <span>·</span>
            <span>{item.author}</span>
          </div>
        </div>
      ),
    },
    {
      key: 'type' as const,
      header: '类型 / 形式',
      render: (item: Content) => (
        <Badge color="purple">{CONTENT_TYPE_LABELS[item.type] || item.type}</Badge>
      ),
    },
    {
      key: 'projectName' as const,
      header: '项目',
      render: (item: Content) => (
        <span className="text-sm text-text-secondary">{item.projectName || '—'}</span>
      ),
    },
    {
      key: 'pipelineStage' as const,
      header: '项目流程',
      render: (item: Content) => {
        const stageInfo = PIPELINE_STAGE_MAP[item.pipelineStage as keyof typeof PIPELINE_STAGE_MAP];
        if (!stageInfo) return <span className="text-text-muted">—</span>;
        const colorClass =
          stageInfo.color === 'green'
            ? 'text-accent-green'
            : stageInfo.color === 'blue'
              ? 'text-accent-blue'
              : stageInfo.color === 'yellow' || stageInfo.color === 'orange'
                ? 'text-accent-yellow'
                : stageInfo.color === 'purple'
                  ? 'text-accent-purple'
                  : 'text-text-secondary';
        return (
          <div>
            <div className={`text-sm font-medium ${colorClass}`}>{stageInfo.label}</div>
            {item.priority && (
              <span
                className={`inline-block mt-0.5 text-[10px] font-bold px-1.5 py-0.5 rounded ${
                  item.priority === 'P0'
                    ? 'bg-accent-red/20 text-accent-red'
                    : item.priority === 'P1'
                      ? 'bg-accent-yellow/20 text-accent-yellow'
                      : 'bg-bg-tertiary text-text-muted'
                }`}
              >
                {item.priority}
              </span>
            )}
            {item.expectedDate && (
              <div className="text-[10px] text-text-muted mt-0.5">期望 {item.expectedDate}</div>
            )}
            {item.rejectionNote && (
              <div className="text-[10px] text-accent-red mt-0.5 truncate max-w-[180px]">
                {item.rejectionNote}
              </div>
            )}
          </div>
        );
      },
    },
    {
      key: 'status' as const,
      header: '状态',
      render: (item: Content) => {
        const statusInfo = CONTENT_STATUS_MAP[item.status as keyof typeof CONTENT_STATUS_MAP] ?? {
          label: item.status,
          color: 'gray',
        };
        return (
          <div className="flex items-center gap-1.5">
            <span
              className={`w-2 h-2 rounded-full ${
                statusInfo.color === 'green'
                  ? 'bg-accent-green'
                  : statusInfo.color === 'yellow'
                    ? 'bg-accent-yellow'
                    : statusInfo.color === 'blue'
                      ? 'bg-accent-blue'
                      : 'bg-text-muted'
              }`}
            />
            <span className="text-sm text-text-secondary">{statusInfo.label}</span>
          </div>
        );
      },
    },
    {
      key: 'readCount' as const,
      header: '阅读',
      render: (item: Content) => (
        <span className="text-text-secondary font-mono text-sm">
          {item.readCount > 0 ? formatNumber(item.readCount) : '—'}
        </span>
      ),
    },
    {
      key: 'likeCount' as const,
      header: '互动',
      render: (item: Content) => (
        <span className="text-text-secondary font-mono text-sm">
          {item.likeCount > 0 ? formatNumber(item.likeCount + (item.bookmarkCount ?? 0) + (item.dislikeCount ?? 0)) : '—'}
        </span>
      ),
    },
    {
      key: 'id' as const,
      header: '',
      render: (item: Content) => (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            log.ui('Open content detail', { id: item.id });
            navigate(`/content/${item.id}`);
          }}
        >
          详情
        </Button>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="space-y-3">
        <Badge color="blue" className="text-[10px] uppercase tracking-wider">
          Content
        </Badge>
        <h1 className="text-2xl font-bold text-text-primary">患教内容工坊</h1>
        <p className="text-sm text-text-secondary max-w-3xl">
          运营视图作为合规枢纽：承接药企需求、调度 DX 生产、完成医学审核与上下架；指标仅来自患者侧触达 / 阅读 / 互动。
        </p>
      </div>

      {/* Section header with count + metrics label */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h2 className="text-base font-semibold text-text-primary">内容管理</h2>
          <Badge color="blue" className="text-[10px]">
            {total}
          </Badge>
        </div>
        <span className="text-xs text-text-muted">行为数据口径：推送 / 阅读 / 互动</span>
      </div>

      {/* Pipeline Cards */}
      <PipelineCards items={items} activeStage={activePipelineStage} onStageClick={handlePipelineCardClick} />

      {/* Filters & Table */}
      <Card>
        <div className="flex items-center justify-between gap-4 mb-4">
          <div className="flex items-center gap-3 flex-1 flex-wrap">
            <Select label="状态" options={STATUS_OPTIONS} value={filter.status || ''} onChange={handleStatusFilter} />
            <Select label="项目" options={PROJECT_OPTIONS} value={filter.projectId || ''} onChange={handleProjectFilter} />
            <Select label="项目流程" options={pipelineOptions} value={activePipelineStage || ''} onChange={handlePipelineFilter} />
            {domainFilter && (
              <Badge color="blue" className="h-8">
                {domainFilter}
                <button className="ml-2 text-text-primary" onClick={() => navigate('/content')}>×</button>
              </Badge>
            )}
            <div className="relative flex-1 max-w-xs">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
              <input
                type="text"
                placeholder="搜索标题或内容编号"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-9 pr-4 py-2 bg-bg-tertiary border border-border rounded-lg text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-1 focus:ring-accent-blue"
              />
            </div>
          </div>
        </div>

        {loading ? (
          <div className="flex justify-center py-12">
            <Spinner size="lg" />
          </div>
        ) : filteredItems.length === 0 ? (
          <EmptyState
            icon={<Filter className="w-12 h-12" />}
            title="暂无内容"
            description="当前筛选条件下没有找到内容，请尝试更换筛选条件或创建新内容。"
          />
        ) : (
          <>
            <Table columns={columns} data={filteredItems.slice(0, Number(pageSize))} rowKey="id" />
            <div className="mt-4 flex items-center justify-end gap-3 border-t border-border pt-4 text-xs text-text-muted">
              <span>共 {filteredItems.length} 条 · 第 1 / 1 页</span>
              <span>每页</span>
              <Select
                value={pageSize}
                onChange={setPageSize}
                options={[
                  { value: '20', label: '20 条' },
                  { value: '50', label: '50 条' },
                  { value: '100', label: '100 条' },
                ]}
              />
              <Button variant="secondary" size="sm" disabled>上一页</Button>
              <Button variant="secondary" size="sm" disabled>下一页</Button>
            </div>
          </>
        )}
      </Card>
    </div>
  );
}
