import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { MousePointerClick, Send, Users, BookOpen } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Spinner } from '@/components/ui/Spinner';
import { ErrorState } from '@/components/ui/ErrorState';
import { useBehaviorStore } from '@/stores/useBehaviorStore';
import { useLogger } from '@/hooks/useLogger';
import { formatNumber } from '@/utils/formatters';

const diseaseChooserOrder = [
  '慢性心力衰竭',
  '2型糖尿病',
  '乳腺癌',
  '肺癌(NSCLC)',
  '类风湿关节炎',
  '多发性骨髓瘤',
  '高血压',
  '慢阻肺(COPD)',
];

export function BehaviorInsights(): JSX.Element {
  const { summary, loading, error, fetchSummary } = useBehaviorStore();
  const { log } = useLogger('BehaviorInsights');
  const [sortBy, setSortBy] = useState<'reads' | 'interactions'>('reads');
  const [projectChooserOpen, setProjectChooserOpen] = useState(false);
  const [selectedDisease, setSelectedDisease] = useState<string | null>(null);

  useEffect(() => {
    log.nav('Behavior Insights page loaded');
    fetchSummary();
  }, [fetchSummary, log]);

  const sortedContent = useMemo(() => {
    const rows = [...(summary?.topContent ?? [])].filter((item) => !selectedDisease || item.disease === selectedDisease);
    rows.sort((a, b) => sortBy === 'reads' ? b.reads - a.reads : b.interactions - a.interactions);
    return rows;
  }, [selectedDisease, sortBy, summary?.topContent]);

  const diseaseOptions = useMemo(() => [...(summary?.byDisease ?? [])].sort((a, b) => {
    const aIndex = diseaseChooserOrder.indexOf(a.disease);
    const bIndex = diseaseChooserOrder.indexOf(b.disease);
    return (aIndex === -1 ? Number.MAX_SAFE_INTEGER : aIndex) - (bIndex === -1 ? Number.MAX_SAFE_INTEGER : bIndex);
  }), [summary?.byDisease]);

  if (error && !loading) return <ErrorState message={error} onRetry={fetchSummary} />;
  if (loading || !summary) return <div className="flex justify-center py-24"><Spinner size="lg" /></div>;

  const selectedDiseaseMetric = selectedDisease ? summary.byDisease.find((disease) => disease.disease === selectedDisease) : null;
  const selectedReadUsers = selectedDiseaseMetric
    ? sortedContent.reduce((sum, item) => sum + (item.readUsers ?? 0), 0)
    : summary.readUsers ?? 32998;
  const cards = [
    { label: '推送人数', desc: '推送的总计患者数', value: selectedDiseaseMetric?.pushCount ?? summary.pushCount ?? 56322, unit: '人', icon: <Send className="w-4 h-4" />, trend: '6.4%' },
    { label: '阅读人数', desc: '患教内容的阅读人数', value: selectedReadUsers, unit: '人', icon: <Users className="w-4 h-4" />, trend: '4.2%' },
    { label: '阅读次数', desc: '患教内容累计阅读人次', value: selectedDiseaseMetric?.reads ?? summary.totalReads, unit: '次', icon: <BookOpen className="w-4 h-4" />, trend: '7.1%' },
    { label: '互动数', desc: '点赞 + 点踩 + 保存', value: selectedDiseaseMetric?.interactions ?? summary.totalInteractions, unit: '次', icon: <MousePointerClick className="w-4 h-4" />, trend: '1.2%' },
  ];

  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <Badge color="blue" className="text-[10px] uppercase tracking-wider">Audience</Badge>
        <h1 className="text-2xl font-bold text-text-primary">患者行为洞察</h1>
        <p className="text-sm text-text-secondary max-w-3xl">本看板仅基于患者侧的推送 / 阅读 / 互动数据进行行为聚类，不展示任何临床、依从性或归因信息。</p>
      </div>

      <div className="flex items-center gap-3 rounded-card border border-border bg-bg-card p-4">
        <span className="text-xs text-text-muted">项目筛选</span>
        <Button variant="secondary" size="sm" onClick={() => setProjectChooserOpen((open) => !open)}>
          {projectChooserOpen ? '收起选项' : '+ 选择项目'}
        </Button>
        {selectedDisease ? (
          <>
            <Badge color="blue">{selectedDisease}</Badge>
            <button className="text-xs text-accent-blue hover:underline" onClick={() => setSelectedDisease(null)}>清空</button>
          </>
        ) : (
          <span className="text-xs text-text-muted">未选择 = 全部项目</span>
        )}
      </div>
      {projectChooserOpen && (
        <div className="flex flex-wrap gap-2 rounded-card border border-border bg-bg-card p-4">
          {diseaseOptions.map((project) => (
            <Button
              key={project.disease}
              size="sm"
              variant={selectedDisease === project.disease ? 'primary' : 'secondary'}
              onClick={() => setSelectedDisease(project.disease)}
            >
              {project.disease}
            </Button>
          ))}
        </div>
      )}

      <div className="grid grid-cols-4 gap-4">
        {cards.map((card) => (
          <Card key={card.label}>
            <div className="flex items-start justify-between text-xs text-text-muted"><div><div>{card.label}</div><div className="mt-1">{card.desc}</div></div>{card.icon}</div>
            <div className="mt-4 flex items-end gap-2"><span className="font-mono text-3xl font-bold text-text-primary">{formatNumber(card.value)}</span><span className="text-xs text-text-muted">{card.unit}</span></div>
            <div className="mt-2 text-xs text-accent-green">{card.trend} 较上周</div>
          </Card>
        ))}
      </div>

      <Card>
        <div className="mb-4 flex items-center justify-between">
          <div><h2 className="text-base font-semibold text-text-primary">内容 TopN</h2><p className="mt-1 text-xs text-text-muted">按所选维度排序 · 当前命中 {selectedDisease ? sortedContent.length : (summary.contentCount ?? sortedContent.length)} 条内容</p></div>
          <div className="flex gap-2">
            <Button size="sm" variant={sortBy === 'reads' ? 'primary' : 'secondary'} onClick={() => setSortBy('reads')}>按阅读次数</Button>
            <Button size="sm" variant={sortBy === 'interactions' ? 'primary' : 'secondary'} onClick={() => setSortBy('interactions')}>按互动数</Button>
          </div>
        </div>
        <div className="space-y-3">
          {sortedContent.map((item, index) => (
            <Link to={`/content/${item.contentId}`} key={item.contentId} className="grid grid-cols-[40px_1fr_repeat(4,120px)] items-center gap-3 rounded-lg border border-border/60 bg-bg-secondary/50 px-4 py-3 hover:border-accent-blue/50">
              <div className="font-mono text-lg font-bold text-text-muted">{index + 1}</div>
              <div><div className="text-sm font-medium text-text-primary">{item.title}</div><div className="mt-1 text-xs text-text-muted">{item.contentId} · {item.disease}</div></div>
              <Metric label="推送人数" value={item.pushCount ?? 0} />
              <Metric label="阅读人数" value={item.readUsers ?? 0} />
              <Metric label="阅读次数" value={item.reads} />
              <Metric label="互动数" value={item.interactions} />
            </Link>
          ))}
        </div>
      </Card>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: number }): JSX.Element {
  return <div className="text-right"><div className="font-mono text-sm font-semibold text-text-primary">{formatNumber(value)}</div><div className="text-[10px] text-text-muted">{label}</div></div>;
}
