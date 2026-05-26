import { prefetchDataQaContext, prefetchMetrics } from '../../../../src/ai-helper/metrics.ts';

const context = await prefetchDataQaContext();
const metrics = await prefetchMetrics();
console.log(JSON.stringify({ ok: true, kind: 'px_data_qa_context', context, metrics_summary: {
  range: metrics.range,
  coreKpi: metrics.coreKpi,
  latestMonth: metrics.latestMonth,
  insights: metrics.insights,
} }));
