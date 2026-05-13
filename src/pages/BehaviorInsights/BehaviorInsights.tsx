import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Download, MousePointerClick, Send, Users, BookOpen } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Spinner } from '@/components/ui/Spinner';
import { ErrorState } from '@/components/ui/ErrorState';
import { showToast } from '@/components/ui/Toast';
import { useBehaviorStore } from '@/stores/useBehaviorStore';
import { useLogger } from '@/hooks/useLogger';
import { formatNumber } from '@/utils/formatters';

export function BehaviorInsights(): JSX.Element {
  const { summary, loading, error, fetchSummary } = useBehaviorStore();
  const { log } = useLogger('BehaviorInsights');
  const [sortBy, setSortBy] = useState<'reads' | 'interactions'>('reads');
  const [exportScope, setExportScope] = useState('all');
  const [exportRange, setExportRange] = useState('14');
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
          {summary.byDisease.map((project) => (
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
          <div><h2 className="text-base font-semibold text-text-primary">内容 TopN</h2><p className="mt-1 text-xs text-text-muted">按所选维度排序 · 当前命中 {sortedContent.length} 条内容</p></div>
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

      <Card>
        <div className="grid grid-cols-[1fr_220px_220px_auto] gap-4">
          <div>
            <h2 className="text-base font-semibold text-text-primary">行为数据导出</h2>
            <p className="mt-1 text-xs text-text-muted">仅导出脱敏后的行为数据（推送 / 阅读 / 互动：赞·踩·藏）。不包含任何临床与身份字段。</p>
            <p className="mt-3 text-xs text-text-muted">患者姓名、手机、身份证、就诊识别等均不导出；仅以脱敏代号 P-XXXX 表示。合规记录会追加一条“导出”日志。</p>
            <p className="mt-2 text-xs text-accent-blue">预估记录量：~ 235 条。</p>
          </div>
          <div>
            <label className="mb-1 block text-xs text-text-muted">导出范围</label>
            <div className="grid grid-cols-2 gap-2">
              {([
                ['all', '全部行为'],
                ['push', '仅推送'],
                ['read', '仅阅读'],
                ['interaction', '仅互动'],
              ] as const).map(([value, label]) => (
                <Button key={value} size="sm" variant={exportScope === value ? 'primary' : 'secondary'} onClick={() => setExportScope(value)}>{label}</Button>
              ))}
            </div>
          </div>
          <div>
            <label className="mb-1 block text-xs text-text-muted">时间范围</label>
            <div className="flex flex-wrap gap-2">
              {([
                ['7', '近 7 天'],
                ['14', '近 14 天'],
                ['30', '近 30 天'],
                ['90', '近 90 天'],
              ] as const).map(([value, label]) => (
                <Button key={value} size="sm" variant={exportRange === value ? 'primary' : 'secondary'} onClick={() => setExportRange(value)}>{label}</Button>
              ))}
            </div>
            <div className="mt-1 text-[10px] text-text-muted">可选近 7 / 14 / 30 / 90 天；默认近 14 天。</div>
          </div>
          <div className="flex items-end"><Button onClick={() => { log.action('Export behavior CSV', { exportScope, exportRange }); showToast('导出任务已创建（演示模式）', 'success'); }}><Download className="w-4 h-4" />导出 CSV</Button></div>
        </div>
      </Card>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: number }): JSX.Element {
  return <div className="text-right"><div className="font-mono text-sm font-semibold text-text-primary">{formatNumber(value)}</div><div className="text-[10px] text-text-muted">{label}</div></div>;
}
