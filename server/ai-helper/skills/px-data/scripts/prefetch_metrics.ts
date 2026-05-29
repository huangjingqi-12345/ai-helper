import { prefetchMetrics } from '../../../../src/ai-helper/metrics.ts';
import type { PrefetchMetricsParams } from '../../../../src/ai-helper/types.ts';

function parseParams(): PrefetchMetricsParams {
  const raw = process.argv[2] || '{}';
  try { return JSON.parse(raw) as PrefetchMetricsParams; } catch { return {}; }
}

const params = parseParams();
const metrics = await prefetchMetrics(params);

const dailyLimit = Math.max(0, Math.min(Number(params.limit || 30), 30));
const dailyTrend = dailyLimit ? metrics.dailyTrend.slice(-dailyLimit) : [];
const compactMetrics = {
  range: metrics.range,
  coreKpi: metrics.coreKpi,
  latestMonth: metrics.latestMonth,
  priorMonth: metrics.priorMonth,
  monthDelta: metrics.monthDelta,
  dailyTrend,
  dailyTrend_meta: {
    total_points: metrics.dailyTrend.length,
    included_points: dailyTrend.length,
    included_range: { start: dailyTrend[0]?.date || '', end: dailyTrend.at(-1)?.date || '' },
    note: 'coreKpi/monthlyTrend/topContent/projects are complete metric aggregates for the requested range; dailyTrend is compacted for model context.',
  },
  monthlyTrend: metrics.monthlyTrend.slice(-12),
  topContent: metrics.topContent.slice(0, 8),
  projects: metrics.projects.slice(0, 8),
  diseases: metrics.diseases.slice(0, 8),
  insights: metrics.insights,
  source: metrics.source,
  generatedAt: metrics.generatedAt,
};

console.log(JSON.stringify({
  ok: true,
  kind: 'px_metrics',
  params,
  metrics: compactMetrics,
  note: 'metrics is aggregated KPI payload only; it does not include raw behavior rows.',
}));
