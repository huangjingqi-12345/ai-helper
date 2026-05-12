import { useEffect, useState } from 'react';
import { Plus, Search, Filter } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Table } from '@/components/ui/Table';
import { Select } from '@/components/ui/Select';
import { Input } from '@/components/ui/Input';
import { Spinner } from '@/components/ui/Spinner';
import { ErrorState } from '@/components/ui/ErrorState';
import { EmptyState } from '@/components/ui/EmptyState';
import { useContentStore } from '@/stores/useContentStore';
import { useLogger } from '@/hooks/useLogger';
import { CONTENT_STATUS_MAP } from '@/utils/constants';
import { formatDate, formatNumber } from '@/utils/formatters';
import type { Content, ContentStatus, ContentType } from '@/types';

const TYPE_LABELS: Record<ContentType, string> = {
  article: '文章',
  video: '视频',
  infographic: '图文',
  quiz: '测验',
};

const TYPE_OPTIONS = [
  { value: '', label: '全部类型' },
  { value: 'article', label: '文章' },
  { value: 'video', label: '视频' },
  { value: 'infographic', label: '图文' },
  { value: 'quiz', label: '测验' },
];

const STATUS_OPTIONS = [
  { value: '', label: '全部状态' },
  { value: 'draft', label: '草稿' },
  { value: 'under_review', label: '审核中' },
  { value: 'approved', label: '已通过' },
  { value: 'published', label: '已发布' },
  { value: 'archived', label: '已归档' },
];

export function ContentWorkshop(): JSX.Element {
  const { items, total, loading, error, filter, setFilter, fetchList } = useContentStore();
  const { log } = useLogger('ContentWorkshop');
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    log.nav('Content Workshop page loaded');
    fetchList();
  }, [fetchList, log]);

  const handleStatusFilter = (value: string) => {
    log.action('Content filter changed', { status: value });
    setFilter({ status: (value || undefined) as ContentStatus | undefined });
  };

  const handleTypeFilter = (value: string) => {
    log.action('Content type filter changed', { type: value });
    setFilter({ type: (value || undefined) as ContentType | undefined });
  };

  const filteredItems = searchTerm
    ? items.filter((item) => item.title.includes(searchTerm) || item.author.includes(searchTerm))
    : items;

  if (error && !loading) {
    return <ErrorState message={error} onRetry={fetchList} />;
  }

  const columns = [
    {
      key: 'title' as const,
      header: '标题',
      render: (item: Content) => (
        <div>
          <div className="font-medium text-text-primary">{item.title}</div>
          <div className="text-xs text-text-muted mt-0.5">{item.author}</div>
        </div>
      ),
    },
    {
      key: 'type' as const,
      header: '类型',
      render: (item: Content) => (
        <Badge color="purple">{TYPE_LABELS[item.type]}</Badge>
      ),
    },
    {
      key: 'status' as const,
      header: '状态',
      render: (item: Content) => {
        const statusInfo = CONTENT_STATUS_MAP[item.status as keyof typeof CONTENT_STATUS_MAP] ?? { label: item.status, color: 'gray' };
        return <Badge color={statusInfo.color as 'gray' | 'yellow' | 'blue' | 'green'}>{statusInfo.label}</Badge>;
      },
    },
    {
      key: 'tags' as const,
      header: '标签',
      render: (item: Content) => (
        <div className="flex flex-wrap gap-1">
          {item.tags.slice(0, 2).map((tag) => (
            <span key={tag} className="text-xs px-1.5 py-0.5 bg-bg-tertiary rounded text-text-muted">{tag}</span>
          ))}
          {item.tags.length > 2 && <span className="text-xs text-text-muted">+{item.tags.length - 2}</span>}
        </div>
      ),
    },
    {
      key: 'readCount' as const,
      header: '阅读',
      render: (item: Content) => <span className="text-text-secondary">{formatNumber(item.readCount)}</span>,
    },
    {
      key: 'likeCount' as const,
      header: '点赞',
      render: (item: Content) => <span className="text-text-secondary">{formatNumber(item.likeCount)}</span>,
    },
    {
      key: 'updatedAt' as const,
      header: '更新时间',
      render: (item: Content) => <span className="text-text-muted text-xs">{formatDate(item.updatedAt)}</span>,
    },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="space-y-3">
        <Badge color="blue" className="text-[10px] uppercase tracking-wider">Content Workshop</Badge>
        <h1 className="text-2xl font-bold text-text-primary">患教内容工坊</h1>
        <p className="text-sm text-text-secondary">管理患者教育内容，支持内容创建、编辑、审核和发布全生命周期管理。</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-5 gap-4">
        <Card className="text-center">
          <div className="text-2xl font-bold text-text-primary">{total}</div>
          <div className="text-xs text-text-muted mt-1">总内容数</div>
        </Card>
        <Card className="text-center">
          <div className="text-2xl font-bold text-accent-green">{items.filter(i => i.status === 'published').length}</div>
          <div className="text-xs text-text-muted mt-1">已发布</div>
        </Card>
        <Card className="text-center">
          <div className="text-2xl font-bold text-accent-yellow">{items.filter(i => i.status === 'under_review').length}</div>
          <div className="text-xs text-text-muted mt-1">审核中</div>
        </Card>
        <Card className="text-center">
          <div className="text-2xl font-bold text-text-secondary">{items.filter(i => i.status === 'draft').length}</div>
          <div className="text-xs text-text-muted mt-1">草稿</div>
        </Card>
        <Card className="text-center">
          <div className="text-2xl font-bold text-accent-blue">{items.filter(i => i.status === 'approved').length}</div>
          <div className="text-xs text-text-muted mt-1">已通过</div>
        </Card>
      </div>

      {/* Filters & Actions */}
      <Card>
        <div className="flex items-center justify-between gap-4 mb-4">
          <div className="flex items-center gap-3 flex-1">
            <div className="relative flex-1 max-w-xs">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
              <input
                type="text"
                placeholder="搜索内容标题或作者..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-9 pr-4 py-2 bg-bg-tertiary border border-border rounded-lg text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-1 focus:ring-accent-blue"
              />
            </div>
            <Select
              options={STATUS_OPTIONS}
              value={filter.status || ''}
              onChange={handleStatusFilter}
            />
            <Select
              options={TYPE_OPTIONS}
              value={filter.type || ''}
              onChange={handleTypeFilter}
            />
          </div>
          <Button size="sm" onClick={() => log.action('Create content clicked')}>
            <Plus className="w-4 h-4" />
            新建内容
          </Button>
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
          <Table
            columns={columns}
            data={filteredItems}
            rowKey="id"
          />
        )}
      </Card>
    </div>
  );
}
