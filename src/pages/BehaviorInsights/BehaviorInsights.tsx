import { useEffect, useState } from 'react';
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { TrendingUp, Users, Clock, MousePointerClick } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { Card } from '@/components/ui/Card';
import { StatCard } from '@/components/ui/StatCard';
import { Spinner } from '@/components/ui/Spinner';
import { ErrorState } from '@/components/ui/ErrorState';
import { useBehaviorStore } from '@/stores/useBehaviorStore';
import { useLogger } from '@/hooks/useLogger';
import { formatNumber, formatDuration } from '@/utils/formatters';

const CHART_COLORS = ['#6366f1', '#22c55e', '#eab308', '#ef4444', '#a855f7', '#06b6d4'];

export function BehaviorInsights(): JSX.Element {
  const { summary, loading, error, fetchSummary } = useBehaviorStore();
  const { log } = useLogger('BehaviorInsights');
  const [activeTab, setActiveTab] = useState<'reads' | 'interactions'>('reads');

  useEffect(() => {
    log.nav('Behavior Insights page loaded');
    fetchSummary();
  }, [fetchSummary, log]);

  if (error && !loading) {
    return <ErrorState message={error} onRetry={fetchSummary} />;
  }

  if (loading || !summary) {
    return (
      <div className="flex justify-center py-24">
        <Spinner size="lg" />
      </div>
    );
  }

  const trendData = activeTab === 'reads' ? summary.readTrend : summary.interactionTrend;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="space-y-3">
        <Badge color="blue" className="text-[10px] uppercase tracking-wider">Behavior Insights</Badge>
        <h1 className="text-2xl font-bold text-text-primary">患者行为洞察</h1>
        <p className="text-sm text-text-secondary">分析患者阅读、互动行为数据，了解内容触达效果和患者参与度。</p>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-4 gap-4">
        <StatCard label="总阅读量" value={summary.totalReads} icon={<Users className="w-5 h-5" />} />
        <StatCard label="总互动量" value={summary.totalInteractions} icon={<MousePointerClick className="w-5 h-5" />} />
        <StatCard label="平均阅读时长" value={formatDuration(summary.avgReadDuration)} icon={<Clock className="w-5 h-5" />} />
        <StatCard
          label="互动率"
          value={`${((summary.totalInteractions / summary.totalReads) * 100).toFixed(1)}%`}
          icon={<TrendingUp className="w-5 h-5" />}
        />
      </div>

      {/* Trend Chart */}
      <Card>
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-lg font-semibold text-text-primary">趋势分析</h2>
          <div className="flex gap-2">
            <button
              onClick={() => { setActiveTab('reads'); log.action('Tab switched to reads'); }}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                activeTab === 'reads'
                  ? 'bg-accent-blue text-white'
                  : 'bg-bg-tertiary text-text-secondary hover:text-text-primary'
              }`}
            >
              阅读趋势
            </button>
            <button
              onClick={() => { setActiveTab('interactions'); log.action('Tab switched to interactions'); }}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                activeTab === 'interactions'
                  ? 'bg-accent-blue text-white'
                  : 'bg-bg-tertiary text-text-secondary hover:text-text-primary'
              }`}
            >
              互动趋势
            </button>
          </div>
        </div>
        <div className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={trendData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#2a2a3e" />
              <XAxis
                dataKey="date"
                stroke="#6b7280"
                fontSize={11}
                tickFormatter={(d: string) => d.slice(5)}
              />
              <YAxis stroke="#6b7280" fontSize={11} />
              <Tooltip
                contentStyle={{ background: '#1e1e2e', border: '1px solid #2a2a3e', borderRadius: 8, fontSize: 12 }}
                labelStyle={{ color: '#9ca3af' }}
              />
              <Line
                type="monotone"
                dataKey="value"
                stroke={activeTab === 'reads' ? '#6366f1' : '#22c55e'}
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 4 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </Card>

      <div className="grid grid-cols-2 gap-6">
        {/* Top Content */}
        <Card>
          <h2 className="text-lg font-semibold text-text-primary mb-4">热门内容 TOP 5</h2>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={summary.topContent} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="#2a2a3e" />
                <XAxis type="number" stroke="#6b7280" fontSize={11} />
                <YAxis
                  type="category"
                  dataKey="title"
                  stroke="#6b7280"
                  fontSize={11}
                  width={140}
                  tick={{ fill: '#9ca3af' }}
                />
                <Tooltip
                  contentStyle={{ background: '#1e1e2e', border: '1px solid #2a2a3e', borderRadius: 8, fontSize: 12 }}
                />
                <Bar dataKey="reads" fill="#6366f1" name="阅读" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>

        {/* By Disease */}
        <Card>
          <h2 className="text-lg font-semibold text-text-primary mb-4">疾病维度分析</h2>
          <div className="h-64 flex">
            <div className="w-1/2">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={summary.byDisease}
                    dataKey="reads"
                    nameKey="disease"
                    cx="50%"
                    cy="50%"
                    outerRadius={80}
                    innerRadius={40}
                    stroke="none"
                  >
                    {summary.byDisease.map((_, idx) => (
                      <Cell key={idx} fill={CHART_COLORS[idx % CHART_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{ background: '#1e1e2e', border: '1px solid #2a2a3e', borderRadius: 8, fontSize: 12 }}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="w-1/2 flex flex-col justify-center space-y-2">
              {summary.byDisease.map((d, idx) => (
                <div key={d.disease} className="flex items-center gap-2 text-sm">
                  <span
                    className="w-3 h-3 rounded-full flex-shrink-0"
                    style={{ background: CHART_COLORS[idx % CHART_COLORS.length] }}
                  />
                  <span className="text-text-secondary flex-1">{d.disease}</span>
                  <span className="text-text-primary font-mono text-xs">{formatNumber(d.reads)}</span>
                </div>
              ))}
            </div>
          </div>
        </Card>
      </div>

      {/* Disease Detail Table */}
      <Card>
        <h2 className="text-lg font-semibold text-text-primary mb-4">疾病数据明细</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left py-3 px-4 text-text-muted font-medium">疾病</th>
                <th className="text-right py-3 px-4 text-text-muted font-medium">推送</th>
                <th className="text-right py-3 px-4 text-text-muted font-medium">阅读</th>
                <th className="text-right py-3 px-4 text-text-muted font-medium">互动</th>
                <th className="text-right py-3 px-4 text-text-muted font-medium">互动率</th>
              </tr>
            </thead>
            <tbody>
              {summary.byDisease.map((d) => (
                <tr key={d.disease} className="border-b border-border/50 hover:bg-bg-tertiary/50 transition-colors">
                  <td className="py-3 px-4 text-text-primary font-medium">{d.disease}</td>
                  <td className="py-3 px-4 text-text-secondary text-right font-mono">{formatNumber(d.pushCount)}</td>
                  <td className="py-3 px-4 text-text-secondary text-right font-mono">{formatNumber(d.reads)}</td>
                  <td className="py-3 px-4 text-text-secondary text-right font-mono">{formatNumber(d.interactions)}</td>
                  <td className="py-3 px-4 text-accent-blue text-right font-mono">
                    {((d.interactions / d.reads) * 100).toFixed(1)}%
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
