import { prefetchDataQaContext, prefetchMetrics } from '../../../../src/ai-helper/metrics.ts';
import type { PrefetchMetricsParams } from '../../../../src/ai-helper/types.ts';

function parseParams(): PrefetchMetricsParams {
  const raw = process.argv[2] || '{}';
  try { return JSON.parse(raw) as PrefetchMetricsParams; } catch { return {}; }
}

const params = parseParams();
const context = await prefetchDataQaContext(params);
const metrics = await prefetchMetrics(params);
console.log(JSON.stringify({ ok: true, kind: 'px_data_qa_context', context, metrics_summary: {
  range: metrics.range,
  coreKpi: metrics.coreKpi,
  latestMonth: metrics.latestMonth,
  insights: metrics.insights,
} }));
