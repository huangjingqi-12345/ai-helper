import { useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Edit3, Send, Users, BookOpen, Heart } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { ErrorState } from '@/components/ui/ErrorState';
import { Spinner } from '@/components/ui/Spinner';
import { showToast } from '@/components/ui/Toast';
import { useContentStore } from '@/stores/useContentStore';
import { CONTENT_TYPE_LABELS } from '@/utils/constants';
import { formatDateOnly, formatNumber } from '@/utils/formatters';

export function ContentDetail(): JSX.Element {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const { selectedItem, loading, error, fetchById, clearSelected, update } = useContentStore();

  useEffect(() => {
    fetchById(id);
    return () => clearSelected();
  }, [clearSelected, fetchById, id]);

  if (error && !loading) return <ErrorState message={error} onRetry={() => fetchById(id)} />;
  if (loading || !selectedItem) {
    return <div className="flex justify-center py-24"><Spinner size="lg" /></div>;
  }

  const item = selectedItem;
  const interactions = item.likeCount + (item.dislikeCount ?? 0) + item.bookmarkCount;
  const sparkData = [240, 320, 410, 360, 500, 450, 580, 610, 540, 590, 640, 520, 480, 430];
  const maxSpark = Math.max(...sparkData);

  return (
    <div className="space-y-6">
      <button onClick={() => navigate('/content')} className="inline-flex items-center gap-1 text-xs text-text-muted hover:text-text-primary">
        <ArrowLeft className="w-3.5 h-3.5" /> 返回内容列表
      </button>

      <div className="flex items-start justify-between gap-4">
        <div className="space-y-3">
          <Badge color="blue" className="text-[10px] uppercase tracking-wider">CONTENT · {item.id}</Badge>
          <h1 className="text-2xl font-bold text-text-primary">{item.title}</h1>
          <p className="max-w-3xl text-sm text-text-secondary">{item.excerpt || item.content.replace(/^#\s*/, '').slice(0, 120)}</p>
          <div className="flex flex-wrap items-center gap-2 text-xs text-text-muted">
            <Badge color="purple">{CONTENT_TYPE_LABELS[item.type] || item.type}</Badge>
            <Badge color="blue">{item.projectName}</Badge>
            <span>发布于 {item.publishedAt ? formatDateOnly(item.publishedAt) : '—'}</span>
            <span>作者 {item.author}</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="secondary" size="sm" onClick={async () => {
            await update(item.id, { content: item.content });
            showToast('已创建/保存新的草稿版本', 'success');
            void fetchById(item.id);
          }}><Edit3 className="w-4 h-4" />编辑</Button>
          <Button size="sm" onClick={async () => {
            await update(item.id, { status: 'published' });
            showToast('内容已发布并写入审计记录', 'success');
            void fetchById(item.id);
          }}><Send className="w-4 h-4" />发布</Button>
        </div>
      </div>

      <div className="grid grid-cols-4 gap-4">
        <Card>
          <div className="flex items-center justify-between text-xs text-text-muted"><span>推送人数</span><Send className="w-4 h-4" /></div>
          <div className="mt-3 font-mono text-2xl font-bold text-text-primary">{formatNumber(item.pushCount ?? 0)}</div>
          <div className="text-xs text-accent-green mt-1">4.5% 较上周</div>
        </Card>
        <Card>
          <div className="flex items-center justify-between text-xs text-text-muted"><span>阅读人数</span><Users className="w-4 h-4" /></div>
          <div className="mt-3 font-mono text-2xl font-bold text-text-primary">{formatNumber(item.readUsers ?? 0)}</div>
          <div className="text-xs text-accent-green mt-1">5% 较上周</div>
        </Card>
        <Card>
          <div className="flex items-center justify-between text-xs text-text-muted"><span>阅读次数</span><BookOpen className="w-4 h-4" /></div>
          <div className="mt-3 font-mono text-2xl font-bold text-text-primary">{formatNumber(item.readCount)}</div>
          <div className="text-xs text-accent-green mt-1">6.1% 较上周</div>
        </Card>
        <Card>
          <div className="flex items-center justify-between text-xs text-text-muted"><span>互动数</span><Heart className="w-4 h-4" /></div>
          <div className="mt-3 font-mono text-2xl font-bold text-text-primary">{formatNumber(interactions)}</div>
          <div className="text-xs text-text-muted mt-1">赞 {item.likeCount} · 踩 {item.dislikeCount ?? 0} · 藏 {item.bookmarkCount}</div>
        </Card>
      </div>

      <Card>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-semibold text-text-primary">发布后 14 天 — 触达 vs 阅读</h2>
          <span className="text-xs text-text-muted">按天聚合</span>
        </div>
        <div className="flex h-56 items-end gap-3 border-b border-l border-border px-4 pb-3">
          {sparkData.map((value, index) => (
            <div key={index} className="flex flex-1 flex-col items-center gap-2">
              <div className="w-full rounded-t bg-accent-blue/70" style={{ height: `${(value / maxSpark) * 180}px` }} />
              <span className="text-[10px] text-text-muted">D{index + 1}</span>
            </div>
          ))}
        </div>
      </Card>

      <Card>
        <div className="mb-4">
          <h2 className="text-base font-semibold text-text-primary">分发记录</h2>
          <p className="text-xs text-text-muted mt-1">医生 / 患者定向分发均仅由运营视图发起，药企视图不可见本区块</p>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div className="rounded-lg border border-border bg-bg-secondary/60 p-4">
            <div className="text-sm font-medium text-text-primary">医生定向分发</div>
            <div className="mt-2 text-xs text-text-secondary">心内科 KOL · 8 位</div>
            <div className="mt-2 text-xs text-text-muted">2026-04-26 14:20 · 微信公众号 · 计划 8 · 实际 8 · 运营 · 王雪</div>
            <p className="mt-3 text-xs text-text-muted">用于本周 KOL 学术再传播</p>
          </div>
          <div className="rounded-lg border border-border bg-bg-secondary/60 p-4">
            <div className="text-sm font-medium text-text-primary">患者定向分发</div>
            <div className="mt-2 text-xs text-text-secondary">{item.projectName} · 复诊 · 一线 · 灰度 30%</div>
            <div className="mt-2 text-xs text-text-muted">2026-04-27 09:35 · 微信公众号 / 短信 · 计划 1,240 · 实际 1,163 · 运营 · 周琳</div>
            <p className="mt-3 text-xs text-text-muted">灰度首发，跑 24h 看完读率</p>
          </div>
        </div>
      </Card>
    </div>
  );
}
