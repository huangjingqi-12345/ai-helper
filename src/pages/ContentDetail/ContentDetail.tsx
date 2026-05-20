import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Eye, Heart, MessageSquare, Users } from 'lucide-react';
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { PageHeader } from '@/components/PageHeader';
import { KpiCard } from '@/components/KpiCard';
import { ErrorState } from '@/components/ui/ErrorState';
import { Spinner } from '@/components/ui/Spinner';
import { getContentDxTaskStatus } from '@/api/endpoints/content';
import { useContentStore } from '@/stores/useContentStore';
import { CONTENT_TYPE_LABELS } from '@/utils/constants';
import { formatDateOnly, formatNumber } from '@/utils/formatters';
import type { DxTaskStatusDetail } from '@/types/content';

const DX_STATUS_LABELS: Record<string, string> = {
  assigned: '医生制作中',
  dx_review: 'DX 审核中',
  dx_revising: 'DX 修订中',
  draft_finalized: '稿件已定稿',
  published: '已发布',
};
const DX_TASK_DETAIL_STATUSES = new Set(['third_party_review', 'internal_review', 'published']);

export function ContentDetail(): JSX.Element {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const { selectedItem, loading, error, fetchById, clearSelected } = useContentStore();
  const [dxTask, setDxTask] = useState<DxTaskStatusDetail | null>(null);
  const [dxTaskLoading, setDxTaskLoading] = useState(false);
  const [dxTaskError, setDxTaskError] = useState('');

  useEffect(() => {
    void fetchById(id);
    return () => clearSelected();
  }, [clearSelected, fetchById, id]);

  useEffect(() => {
    let cancelled = false;
    setDxTask(null);
    setDxTaskError('');
    if (!selectedItem || !DX_TASK_DETAIL_STATUSES.has(selectedItem.status)) return;

    setDxTaskLoading(true);
    void getContentDxTaskStatus(selectedItem.id)
      .then((res) => {
        if (!cancelled) setDxTask(res.data);
      })
      .catch(() => {
        if (!cancelled) setDxTaskError('DX 任务详情获取失败');
      })
      .finally(() => {
        if (!cancelled) setDxTaskLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [selectedItem?.id, selectedItem?.status]);

  const trend = useMemo(() => {
    if (!selectedItem) return [];
    return Array.from({ length: 14 }, (_, index) => {
      const seed = (Number(selectedItem.pushCount ?? 0) * (index + 1)) % 233;
      const reach = Math.max(20, Math.floor(Number(selectedItem.pushCount ?? 0) / 14 + (seed - 116)));
      const reads = Math.max(10, Math.floor(reach * (0.5 + ((seed % 50) / 100))));
      return { day: `D${index + 1}`, reach, reads };
    });
  }, [selectedItem]);

  if (error && !loading) return <ErrorState message={error} onRetry={() => fetchById(id)} />;
  if (loading || !selectedItem) {
    return <div className="flex justify-center py-24"><Spinner size="lg" /></div>;
  }

  const item = selectedItem;
  // PM 确认：互动数（正向）= 点赞 + 收藏，不含 dislikes
  const interactions = item.likeCount + item.bookmarkCount;

  return (
    <div className="space-y-6">
      <button
        onClick={() => navigate('/content')}
        className="inline-flex items-center gap-1 text-[12px] text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-3.5 w-3.5" /> 返回内容列表
      </button>

      <PageHeader
        eyebrow={`CONTENT · ${item.id}`}
        title={item.title}
        subtitle={item.excerpt || item.content.replace(/^#\s*/, '').slice(0, 120)}
        meta={
          <>
            <Tag>{CONTENT_TYPE_LABELS[item.type] || item.type}</Tag>
            <Tag>{item.projectName}</Tag>
            <Tag>发布于 {item.publishedAt ? formatDateOnly(item.publishedAt) : '—'}</Tag>
            <Tag>作者 {item.author}</Tag>
          </>
        }
      />

      {DX_TASK_DETAIL_STATUSES.has(item.status) && (
        <DxTaskStatusPanel task={dxTask} loading={dxTaskLoading} error={dxTaskError} />
      )}

      <ContentBody content={item.content} />

      <div className="grid grid-cols-4 gap-4">
        <KpiCard label="推送人数" value={formatNumber(item.pushCount ?? 0)} unit="人" icon={Eye} delta={{ value: 4.5 }} hint="推送的总计患者数" />
        <KpiCard label="阅读人数" value={formatNumber(item.readUsers ?? 0)} unit="人" icon={Users} delta={{ value: 5.0 }} hint="患教内容的阅读人数" />
        <KpiCard label="阅读次数" value={formatNumber(item.readCount)} unit="次" icon={MessageSquare} delta={{ value: 6.1 }} hint="累计阅读人次" />
        <KpiCard
          label="互动数"
          value={formatNumber(interactions)}
          unit="次"
          icon={Heart}
          delta={{ value: -1.2 }}
          hint={`赞 ${item.likeCount} · 踩 ${item.dislikeCount ?? 0} · 藏 ${item.bookmarkCount}`}
        />
      </div>

      <div className="rounded-xl border border-border bg-card">
        <div className="border-b border-border px-5 py-4">
          <div className="text-[14px] font-semibold text-foreground">发布后 14 天 — 触达 vs 阅读</div>
          <div className="mt-0.5 text-[11.5px] text-muted-foreground">按天聚合</div>
        </div>
        <div className="px-2 py-3">
          <ResponsiveContainer width="100%" height={240}>
            <LineChart data={trend}>
              <CartesianGrid stroke="oklch(28% .02 260)" strokeDasharray="3 3" />
              <XAxis dataKey="day" stroke="oklch(50% .02 260)" fontSize={11} tickLine={false} axisLine={{ stroke: 'oklch(28% .02 260)' }} />
              <YAxis stroke="oklch(50% .02 260)" fontSize={11} tickLine={false} axisLine={false} />
              <Tooltip
                contentStyle={{
                  background: 'oklch(20% .02 260)',
                  border: '1px solid oklch(32% .02 260)',
                  borderRadius: 8,
                  fontSize: 12,
                }}
              />
              <Line type="monotone" dataKey="reach" stroke="oklch(70% .15 200)" strokeWidth={2} dot={false} name="触达" />
              <Line type="monotone" dataKey="reads" stroke="oklch(72% .17 165)" strokeWidth={2} dot={false} name="阅读" />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}

function ContentBody({ content }: { content: string }): JSX.Element {
  const blocks = content.split(/\n{2,}/).map((block) => block.trim()).filter(Boolean);

  return (
    <article className="rounded-xl border border-border bg-card px-5 py-4">
      <div className="border-b border-border/70 pb-3">
        <div className="text-[14px] font-semibold text-foreground">内容正文</div>
        <div className="mt-0.5 text-[11.5px] text-muted-foreground">当前内容稿件</div>
      </div>
      <div className="mt-4 space-y-3 text-[13px] leading-6 text-foreground">
        {blocks.length > 0 ? blocks.map((block, index) => {
          if (block.startsWith('# ')) {
            return <h2 key={index} className="text-[17px] font-semibold leading-7">{block.replace(/^#\s*/, '')}</h2>;
          }
          return <p key={index} className="whitespace-pre-wrap text-muted-foreground">{block}</p>;
        }) : <p className="text-muted-foreground">暂无正文内容</p>}
      </div>
    </article>
  );
}

function DxTaskStatusPanel({ task, loading, error }: { task: DxTaskStatusDetail | null; loading: boolean; error: string }): JSX.Element {
  const review = task?.latest_review;
  const submission = task?.latest_submission;

  return (
    <div className="rounded-xl border border-border bg-card px-5 py-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-[14px] font-semibold text-foreground">DX 任务详情</div>
          <div className="mt-0.5 text-[11.5px] text-muted-foreground">
            {task ? `${task.px_task_id} · ${task.dx_task_id || 'DX 未返回任务号'}` : '打开内容时拉取单条任务状态'}
          </div>
        </div>
        {task && <Tag>{DX_STATUS_LABELS[task.status] ?? task.status}</Tag>}
      </div>

      {loading && <div className="mt-4 text-[12px] text-muted-foreground">DX API 拉取中…</div>}
      {!loading && error && <div className="mt-4 text-[12px] text-rose-300">{error}</div>}
      {!loading && !error && task && (
        <>
          <div className="mt-4 grid grid-cols-4 gap-3 text-[12px]">
            <Info label="标题" value={task.title || '—'} />
            <Info label="形式" value={task.content_format || '—'} />
            <Info label="提交时间" value={formatDateTime(task.submitted_at || submission?.submitted_at)} />
            <Info label="更新时间" value={formatDateTime(task.updated_at)} />
          </div>
          {review && Object.keys(review).length > 0 && (
            <div className="mt-4 rounded-lg border border-border/70 bg-secondary/30 px-4 py-3">
              <div className="text-[12px] font-medium text-foreground">
                最近审核意见 · {review.verdict || '—'} · {formatDateTime(review.created_at)}
              </div>
              <div className="mt-1 text-[12px] leading-5 text-muted-foreground">
                {review.suggestion || '暂无审核意见'}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }): JSX.Element {
  return (
    <div className="min-w-0">
      <div className="text-[11px] text-muted-foreground">{label}</div>
      <div className="mt-1 truncate text-foreground" title={value}>{value}</div>
    </div>
  );
}

function formatDateTime(value?: string | null): string {
  if (!value) return '—';
  return value.replace('T', ' ').replace(/\.\d{3}Z$/, '').replace(/\+\d{2}:\d{2}$/, '');
}

function Tag({ children }: { children: React.ReactNode }): JSX.Element {
  return (
    <span className="rounded border border-border/70 bg-secondary/50 px-2 py-0.5 text-[11px] text-muted-foreground">
      {children}
    </span>
  );
}
