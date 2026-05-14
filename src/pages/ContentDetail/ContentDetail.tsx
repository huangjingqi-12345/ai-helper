import { useEffect, useMemo } from 'react';
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
import { useContentStore } from '@/stores/useContentStore';
import { CONTENT_TYPE_LABELS } from '@/utils/constants';
import { formatDateOnly, formatNumber } from '@/utils/formatters';

export function ContentDetail(): JSX.Element {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const { selectedItem, loading, error, fetchById, clearSelected } = useContentStore();

  useEffect(() => {
    fetchById(id);
    return () => clearSelected();
  }, [clearSelected, fetchById, id]);

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
  const interactions = item.likeCount + (item.dislikeCount ?? 0) + item.bookmarkCount;

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

function Tag({ children }: { children: React.ReactNode }): JSX.Element {
  return (
    <span className="rounded border border-border/70 bg-secondary/50 px-2 py-0.5 text-[11px] text-muted-foreground">
      {children}
    </span>
  );
}
