import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { chromium } from 'playwright';
import type { MetricPoint, PrefetchMetrics, PrefetchMetricsParams, ProjectMetric, TopContentMetric } from '../../../../src/ai-helper/types.ts';

type LayoutVariant = 'executive_dashboard' | 'funnel_diagnostic' | 'content_performance' | 'project_contribution';
type Theme = 'medical_blue' | 'executive_dark' | 'clean_green' | 'warm_orange';
type VisualPlan = {
  title?: string;
  subtitle?: string;
  theme?: Theme;
  layout_variant?: LayoutVariant;
  emphasis?: string[];
  insights?: string[];
  conclusions?: string[];
  top_content_count?: number;
  breakdown_count?: number;
  show_delta?: boolean;
  dateRange?: PrefetchMetricsParams['dateRange'];
  projectId?: string;
  contentId?: string;
  diseaseId?: string;
};

type Derived = {
  deliveryRate: number;
  readConversion: number;
  interactionRate: number;
  top1Share: number;
  top3Share: number;
  top5Share: number;
  concentrationLevel: '低' | '中' | '高';
  strongestProject?: ProjectMetric;
  bestContent?: TopContentMetric;
  weakContent?: TopContentMetric;
  weekly: Array<{ label: string; readCount: number; interactionCount: number; pushCount: number }>;
  anomalies: Array<{ date: string; readCount: number; label: string }>;
};

function arg(name: string, fallback = ''): string {
  const idx = process.argv.indexOf(name);
  return idx >= 0 && idx + 1 < process.argv.length ? process.argv[idx + 1] : fallback;
}
function parseJson<T extends Record<string, unknown>>(raw: string): T {
  if (!raw.trim()) return {} as T;
  try { return JSON.parse(raw) as T; } catch { return {} as T; }
}
function cleanFileName(value: string, fallback: string): string {
  const raw = (value || fallback).replace(/\\/g, '/').split('/').pop() || fallback;
  return raw.replace(/[^a-zA-Z0-9_.-]+/g, '_') || fallback;
}
function esc(value: unknown): string {
  return String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
function fmt(value: number): string { return Math.round(value || 0).toLocaleString('zh-CN'); }
function pct(value: number, digits = 1): string { return `${((value || 0) * 100).toFixed(digits)}%`; }
function delta(value: number): string { return `${value >= 0 ? '+' : ''}${(value || 0).toFixed(1)}%`; }
function safeDiv(a: number, b: number): number { return b ? a / b : 0; }
function clamp(n: number, min: number, max: number): number { return Math.max(min, Math.min(max, n)); }
function displayText(text: unknown): string { return String(text ?? '').trim(); }

type PrefetchMetricsFn = (params?: PrefetchMetricsParams) => Promise<PrefetchMetrics>;

async function loadPrefetchMetrics(): Promise<PrefetchMetricsFn> {
  const scriptDir = path.dirname(fileURLToPath(import.meta.url));
  const candidates = [
    // Production Docker image copies compiled backend runtime to /app/dist.
    path.resolve(scriptDir, '../../../../dist/ai-helper/metrics.js'),
    path.resolve(process.cwd(), 'dist/ai-helper/metrics.js'),
    // Local development fallback when running the skill directly from source.
    path.resolve(scriptDir, '../../../../src/ai-helper/metrics.ts'),
    path.resolve(process.cwd(), 'src/ai-helper/metrics.ts'),
  ];

  const checked: string[] = [];
  for (const candidate of candidates) {
    checked.push(candidate);
    try {
      await fs.access(candidate);
      const mod = await import(pathToFileURL(candidate).toString()) as { prefetchMetrics?: PrefetchMetricsFn };
      if (typeof mod.prefetchMetrics === 'function') return mod.prefetchMetrics;
    } catch {
      // Try the next runtime path. The final error below includes all checked paths.
    }
  }
  throw new Error(`无法加载 PX 指标运行时，已检查: ${checked.join(', ')}`);
}

function parseIsoDate(value: string): Date | undefined {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return undefined;
  const [y, m, d] = value.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

function fmtDate(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function addDays(value: Date, days: number): Date {
  const next = new Date(value);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function planParams(plan: VisualPlan): PrefetchMetricsParams {
  return {
    task: 'overview',
    dateRange: plan.dateRange,
    projectId: plan.projectId,
    contentId: plan.contentId,
    diseaseId: plan.diseaseId,
    // `limit` is used by the backend both for top-content cap and dailyTrend cap.
    // Keep it high enough so weekly rhythm/anomaly modules have the full recent window;
    // visual top content count is still controlled by top_content_count below.
    limit: 120,
  };
}

async function overviewMetricsForPlan(plan: VisualPlan, prefetchMetrics: PrefetchMetricsFn): Promise<PrefetchMetrics> {
  if (plan.dateRange?.start || plan.dateRange?.end || plan.projectId || plan.contentId || plan.diseaseId) {
    return prefetchMetrics(planParams(plan));
  }

  // 数据概览快捷入口默认看“最新统计日往前 7 天”。模型有时只传轻量 visual-plan，
  // 不传 dateRange；这里在 renderer 层兜底，保证本地与生产口径一致。
  const defaultMetrics = await prefetchMetrics();
  const latest = parseIsoDate(defaultMetrics.range.end);
  if (!latest) return defaultMetrics;
  return prefetchMetrics({
    ...planParams(plan),
    dateRange: { start: fmtDate(addDays(latest, -6)), end: fmtDate(latest) },
  });
}

function weekKey(date: string): string {
  const d = new Date(`${date}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return date.slice(5);
  const start = new Date(d);
  start.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return start.toISOString().slice(5, 10);
}
function weekly(rows: MetricPoint[]): Derived['weekly'] {
  const map = new Map<string, { label: string; readCount: number; interactionCount: number; pushCount: number }>();
  for (const row of rows) {
    const key = weekKey(row.date);
    const cur = map.get(key) || { label: key, readCount: 0, interactionCount: 0, pushCount: 0 };
    cur.readCount += row.readCount;
    cur.interactionCount += row.interactionCount;
    cur.pushCount += row.pushCount;
    map.set(key, cur);
  }
  return [...map.values()].slice(-10);
}
function anomalies(rows: MetricPoint[]): Derived['anomalies'] {
  if (rows.length < 5) return [];
  const avg = rows.reduce((s, x) => s + x.readCount, 0) / rows.length;
  return rows
    .filter((x) => x.readCount > avg * 1.18 || x.readCount < avg * 0.82)
    .sort((a, b) => Math.abs(b.readCount - avg) - Math.abs(a.readCount - avg))
    .slice(0, 3)
    .map((x) => ({ date: x.date, readCount: x.readCount, label: x.readCount >= avg ? '高峰' : '低谷' }));
}
function derive(metrics: PrefetchMetrics): Derived {
  const k = metrics.coreKpi;
  const reads = k.readCount || 0;
  const top = metrics.topContent;
  const topSum = (n: number) => top.slice(0, n).reduce((s, x) => s + (x.readCount || 0), 0);
  const top3Share = safeDiv(topSum(3), reads);
  return {
    deliveryRate: safeDiv(k.deliveredCount, k.pushCount),
    readConversion: safeDiv(k.readUsers, k.deliveredCount),
    interactionRate: safeDiv(k.interactionCount, reads),
    top1Share: safeDiv(topSum(1), reads),
    top3Share,
    top5Share: safeDiv(topSum(5), reads),
    concentrationLevel: top3Share >= 0.5 ? '高' : top3Share >= 0.32 ? '中' : '低',
    strongestProject: metrics.projects[0],
    bestContent: top[0],
    weakContent: [...top].filter((x) => x.readCount > 0).sort((a, b) => a.finishRate - b.finishRate)[0],
    weekly: weekly(metrics.dailyTrend),
    anomalies: anomalies(metrics.dailyTrend),
  };
}
function insightList(metrics: PrefetchMetrics, plan: VisualPlan, d: Derived): string[] {
  const custom = [...(plan.insights || []), ...(plan.conclusions || [])].filter((x): x is string => typeof x === 'string' && Boolean(x.trim())).map((x) => x.trim());
  const generated = [
    `TOP3 内容贡献 ${pct(d.top3Share)} 阅读量，头部集中度为${d.concentrationLevel}。`,
    d.strongestProject ? `${d.strongestProject.name} 是当前阅读贡献最高项目，贡献 ${fmt(d.strongestProject.readCount)} 次阅读。` : '',
    d.readConversion ? `送达后阅读转化为 ${pct(d.readConversion)}，可继续优化标题与推送首屏。` : '',
    d.bestContent ? `高表现内容「${displayText(d.bestContent.title)}」可沉淀为后续选题模板。` : '',
    ...metrics.insights,
  ].filter(Boolean);
  return [...custom, ...generated].filter((x, i, arr) => arr.indexOf(x) === i).slice(0, 5);
}
function chooseVariant(plan: VisualPlan, d: Derived): LayoutVariant {
  if (plan.layout_variant) return plan.layout_variant;
  const emphasis = (plan.emphasis || []).join('');
  if (/漏斗|转化/.test(emphasis) || d.readConversion < 0.35) return 'funnel_diagnostic';
  if (/内容|TOP|集中/.test(emphasis) || d.top3Share > 0.48) return 'content_performance';
  if (/项目|结构|贡献/.test(emphasis)) return 'project_contribution';
  return 'executive_dashboard';
}
function themeTokens(theme: Theme = 'medical_blue'): string {
  const map: Record<Theme, Record<string, string>> = {
    medical_blue: { bg1: '#eff6ff', bg2: '#ecfeff', ink: '#0f172a', muted: '#64748b', panel: 'rgba(255,255,255,.82)', primary: '#2563eb', accent: '#14b8a6', warn: '#f59e0b', danger: '#ef4444', dark: '#0f172a', c1: '#2563eb', c2: '#06b6d4', c3: '#14b8a6', c4: '#8b5cf6', c5: '#f59e0b', c6: '#f97316', c7: '#ec4899', c8: '#22c55e' },
    executive_dark: { bg1: '#0f172a', bg2: '#1e293b', ink: '#f8fafc', muted: '#cbd5e1', panel: 'rgba(15,23,42,.72)', primary: '#60a5fa', accent: '#2dd4bf', warn: '#fbbf24', danger: '#fb7185', dark: '#020617', c1: '#60a5fa', c2: '#22d3ee', c3: '#2dd4bf', c4: '#a78bfa', c5: '#fbbf24', c6: '#fb923c', c7: '#f472b6', c8: '#4ade80' },
    clean_green: { bg1: '#ecfdf5', bg2: '#f0fdfa', ink: '#10201b', muted: '#64748b', panel: 'rgba(255,255,255,.84)', primary: '#059669', accent: '#2563eb', warn: '#d97706', danger: '#dc2626', dark: '#064e3b', c1: '#059669', c2: '#14b8a6', c3: '#2563eb', c4: '#7c3aed', c5: '#d97706', c6: '#ea580c', c7: '#db2777', c8: '#65a30d' },
    warm_orange: { bg1: '#fff7ed', bg2: '#fffbeb', ink: '#241407', muted: '#78716c', panel: 'rgba(255,255,255,.84)', primary: '#ea580c', accent: '#2563eb', warn: '#f59e0b', danger: '#dc2626', dark: '#431407', c1: '#ea580c', c2: '#f59e0b', c3: '#2563eb', c4: '#7c3aed', c5: '#14b8a6', c6: '#e11d48', c7: '#84cc16', c8: '#06b6d4' },
  };
  return Object.entries(map[theme] || map.medical_blue).map(([k, v]) => `--${k}:${v};`).join('');
}

function chartColor(index: number): string {
  return `var(--c${(index % 8) + 1})`;
}

function bars(items: Array<{ label: string; value: number; hint?: string }>, maxValue?: number): string {
  const max = maxValue || Math.max(1, ...items.map((x) => x.value));
  return items.map((x, i) => `<div class="rank-row" style="--bar:${chartColor(i)}"><div class="rank-index">${i + 1}</div><div class="rank-main"><div class="rank-title">${esc(displayText(x.label))}</div><div class="track"><div class="fill" style="width:${clamp(safeDiv(x.value, max) * 100, 4, 100).toFixed(1)}%"></div></div>${x.hint ? `<div class="hint">${esc(x.hint)}</div>` : ''}</div><div class="rank-num">${fmt(x.value)}</div></div>`).join('');
}
function funnel(metrics: PrefetchMetrics, d: Derived): string {
  const k = metrics.coreKpi;
  const steps = [
    { label: '推送', value: k.pushCount, rate: 1 },
    { label: '送达', value: k.deliveredCount, rate: d.deliveryRate },
    { label: '阅读人数', value: k.readUsers, rate: d.readConversion },
    { label: '互动', value: k.interactionCount, rate: d.interactionRate },
  ];
  const max = Math.max(1, k.pushCount);
  return `<div class="funnel">${steps.map((s, i) => `<div class="funnel-step" style="--bar:${chartColor(i)}"><div class="funnel-head"><b>${esc(s.label)}</b><span>${fmt(s.value)}</span></div><div class="funnel-bar"><i style="width:${clamp(safeDiv(s.value, max) * 100, 8, 100).toFixed(1)}%"></i></div><small>${s.label === '推送' ? '基准' : `阶段率 ${pct(s.rate)}`}</small></div>`).join('')}</div>`;
}
function weeklyBars(d: Derived): string {
  const max = Math.max(1, ...d.weekly.map((x) => x.readCount));
  return `<div class="weekly-bars">${d.weekly.map((x, i) => `<div class="week" style="--bar:${chartColor(i)}"><b style="height:${clamp(safeDiv(x.readCount, max) * 100, 6, 100).toFixed(1)}%"></b><span>${esc(x.label)}</span><em>${fmt(x.readCount)}</em></div>`).join('')}</div>`;
}
function dailyHeatmap(rows: MetricPoint[]): string {
  const items = rows.slice(-28);
  const max = Math.max(1, ...items.map((x) => x.readCount));
  const maxInteraction = Math.max(1, ...items.map((x) => x.interactionCount));
  const total = items.reduce((s, x) => s + x.readCount, 0);
  const avg = safeDiv(total, items.length || 1);
  const peak = [...items].sort((a, b) => b.readCount - a.readCount)[0];
  const interactionPeak = [...items].sort((a, b) => b.interactionCount - a.interactionCount)[0];
  const cells = items.map((x, i) => {
    const intensity = clamp(10 + safeDiv(x.readCount, max) * 58, 10, 68);
    return `<div class="heat-cell" style="--heat:${chartColor(i)};--h:${clamp(safeDiv(x.interactionCount, maxInteraction) * 100, 8, 100).toFixed(1)}%;background:linear-gradient(155deg,color-mix(in srgb,var(--heat) ${intensity.toFixed(0)}%,white),color-mix(in srgb,var(--heat) 12%,white))" title="${esc(x.date)} 阅读 ${fmt(x.readCount)}"><b>${esc(x.date.slice(5))}</b><strong>${fmt(x.readCount)}</strong><span>互动 ${fmt(x.interactionCount)}</span><i></i></div>`;
  }).join('');
  return `<div class="heat-wrap"><div class="heatmap">${cells || '<div class="heat-empty">暂无趋势数据</div>'}</div><div class="heat-summary"><span><b>阅读峰值</b><strong>${peak ? `${esc(peak.date.slice(5))} · ${fmt(peak.readCount)}` : '-'}</strong></span><span><b>日均阅读</b><strong>${fmt(avg)}</strong></span><span><b>互动峰值</b><strong>${interactionPeak ? `${esc(interactionPeak.date.slice(5))} · ${fmt(interactionPeak.interactionCount)}` : '-'}</strong></span></div></div>`;
}
function weeklyLineChart(d: Derived): string {
  const rows = d.weekly.length ? d.weekly : [{ label: '暂无', readCount: 0, interactionCount: 0, pushCount: 0 }];
  const w = 640;
  const h = 210;
  const pad = 26;
  const maxRead = Math.max(1, ...rows.map((x) => x.readCount));
  const maxInteraction = Math.max(1, ...rows.map((x) => x.interactionCount));
  const point = (value: number, i: number, max: number) => {
    const x = rows.length === 1 ? w / 2 : pad + safeDiv(i, rows.length - 1) * (w - pad * 2);
    const y = h - pad - safeDiv(value, max) * (h - pad * 2);
    return { x, y };
  };
  const readPoints = rows.map((x, i) => point(x.readCount, i, maxRead));
  const interactionPoints = rows.map((x, i) => point(x.interactionCount, i, maxInteraction));
  const poly = (pts: Array<{ x: number; y: number }>) => pts.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
  const area = `${pad},${h - pad} ${poly(readPoints)} ${w - pad},${h - pad}`;
  const grid = [0, 1, 2, 3].map((i) => `<line x1="${pad}" x2="${w - pad}" y1="${pad + i * 48}" y2="${pad + i * 48}" class="chart-grid"/>`).join('');
  const dots = readPoints.map((p, i) => `<circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="4.8" class="line-dot"/><text x="${p.x.toFixed(1)}" y="${h - 6}" text-anchor="middle" class="axis-label">${esc(rows[i].label)}</text>`).join('');
  return `<svg class="line-chart" viewBox="0 0 ${w} ${h}" role="img" aria-label="周度阅读与互动趋势">${grid}<polygon points="${area}" class="area-read"/><polyline points="${poly(readPoints)}" class="line-read"/><polyline points="${poly(interactionPoints)}" class="line-interaction"/>${dots}<text x="${pad}" y="18" class="legend-read">阅读</text><text x="${pad + 54}" y="18" class="legend-interaction">互动</text></svg>`;
}
function projectTreemap(items: Array<{ label: string; value: number; hint?: string }>): string {
  const rows = items.slice(0, 8);
  const total = Math.max(1, rows.reduce((s, x) => s + x.value, 0));
  const cells = rows.map((x, i) => {
    const share = safeDiv(x.value, total);
    const basis = clamp(share * 100, 18, 54);
    return `<div class="tree-cell" style="--tree:${chartColor(i)};flex-basis:${basis.toFixed(1)}%"><span>${esc(displayText(x.label))}</span><strong>${fmt(x.value)}</strong><small>${pct(share, 0)}${x.hint ? ` · ${esc(x.hint)}` : ''}</small></div>`;
  }).join('');
  return `<div class="treemap">${cells || '<div class="heat-empty">暂无项目数据</div>'}</div>`;
}
function contentScatter(items: TopContentMetric[]): string {
  const rows = items.slice(0, 8);
  const avgRead = safeDiv(rows.reduce((s, x) => s + x.readCount, 0), rows.length || 1);
  const avgFinish = safeDiv(rows.reduce((s, x) => s + (x.finishRate || 0), 0), rows.length || 1);
  const groups = [
    { key: 'star', title: '高阅读 · 高完读', sub: '优先复用模板', test: (x: TopContentMetric) => x.readCount >= avgRead && (x.finishRate || 0) >= avgFinish },
    { key: 'opt', title: '高阅读 · 待优化', sub: '标题/首屏可改进', test: (x: TopContentMetric) => x.readCount >= avgRead && (x.finishRate || 0) < avgFinish },
    { key: 'seed', title: '低阅读 · 高完读', sub: '适合二次分发', test: (x: TopContentMetric) => x.readCount < avgRead && (x.finishRate || 0) >= avgFinish },
    { key: 'watch', title: '低阅读 · 低完读', sub: '观察或合并', test: (x: TopContentMetric) => x.readCount < avgRead && (x.finishRate || 0) < avgFinish },
  ];
  return `<div class="content-matrix">${groups.map((g, gi) => {
    const matched = rows.filter(g.test).slice(0, 3);
    return `<div class="matrix-cell ${g.key}" style="--m:${chartColor(gi)}"><div class="matrix-head"><b>${esc(g.title)}</b><span>${esc(g.sub)}</span></div><div class="matrix-items">${matched.length ? matched.map((x, i) => `<div class="matrix-item"><i>${i + 1}</i><strong>${esc(displayText(x.title))}</strong><span>${fmt(x.readCount)} 阅读 · 完读 ${pct(x.finishRate, 0)}</span></div>`).join('') : '<em>暂无内容</em>'}</div></div>`;
  }).join('')}</div>`;
}
function donutChart(items: Array<{ label: string; value: number }>, title: string, center: string, sub: string): string {
  const total = Math.max(1, items.reduce((s, x) => s + x.value, 0));
  let cursor = 0;
  const stops = items.slice(0, 5).map((x, i) => {
    const start = safeDiv(cursor, total) * 360;
    cursor += x.value;
    const end = safeDiv(cursor, total) * 360;
    return `${chartColor(i)} ${start.toFixed(1)}deg ${end.toFixed(1)}deg`;
  });
  if (!stops.length) stops.push('var(--muted) 0deg 360deg');
  const legends = items.slice(0, 4).map((x, i) => `<div class="donut-legend"><i style="background:${chartColor(i)}"></i><span>${esc(displayText(x.label))}</span><b>${pct(safeDiv(x.value, total), 0)}</b></div>`).join('');
  return `<div class="donut-wrap"><div class="donut-title">${esc(title)}</div><div class="donut" style="background:conic-gradient(${stops.join(',')})"><div><strong>${esc(center)}</strong><span>${esc(sub)}</span></div></div><div class="donut-legends">${legends}</div></div>`;
}
function stackedShare(items: Array<{ label: string; value: number }>): string {
  const total = Math.max(1, items.reduce((s, x) => s + x.value, 0));
  const segments = items.slice(0, 6).map((x, i) => `<i title="${esc(x.label)} ${pct(safeDiv(x.value, total))}" style="width:${clamp(safeDiv(x.value, total) * 100, 4, 100).toFixed(1)}%;background:${chartColor(i)}"></i>`).join('');
  const legend = items.slice(0, 4).map((x, i) => `<span><i style="background:${chartColor(i)}"></i>${esc(displayText(x.label))}</span>`).join('');
  return `<div class="stacked-card"><div class="section-kicker">COMPOSITION</div><h2>项目结构占比</h2><div class="stacked-bar">${segments}</div><div class="stacked-legend">${legend}</div></div>`;
}
function bubbleChart(items: Array<{ label: string; value: number; hint?: string }>): string {
  const max = Math.max(1, ...items.map((x) => x.value));
  return `<div class="bubble-chart">${items.slice(0, 8).map((x, i) => {
    const size = clamp(42 + safeDiv(x.value, max) * 74, 42, 116);
    return `<div class="bubble-item" style="--bubble:${chartColor(i)}"><div class="bubble" style="width:${size.toFixed(0)}px;height:${size.toFixed(0)}px"><strong>${fmt(x.value)}</strong></div><span>${esc(x.label)}</span></div>`;
  }).join('')}</div>`;
}
function qualityGauges(metrics: PrefetchMetrics, d: Derived): string {
  const items = [
    { label: '送达', value: d.deliveryRate, hint: fmt(metrics.coreKpi.deliveredCount) },
    { label: '阅读转化', value: d.readConversion, hint: fmt(metrics.coreKpi.readUsers) },
    { label: '互动强度', value: d.interactionRate, hint: fmt(metrics.coreKpi.interactionCount) },
    { label: '完读', value: metrics.coreKpi.finishRate || 0, hint: `${(metrics.coreKpi.avgReadSec || 0).toFixed(0)} 秒` },
  ];
  return `<div class="gauge-grid">${items.map((x, i) => `<div class="gauge" style="--g:${chartColor(i)};--p:${clamp(x.value * 100, 0, 100).toFixed(1)}%"><div class="gauge-ring"><strong>${pct(x.value)}</strong></div><span>${esc(x.label)}</span><small>${esc(x.hint)}</small></div>`).join('')}</div>`;
}
function kpiCards(metrics: PrefetchMetrics, d: Derived): string {
  const k = metrics.coreKpi;
  const cards = [
    ['推送量', fmt(k.pushCount), '分发触达规模', 'primary', '↗'],
    ['阅读人数', fmt(k.readUsers), `阅读转化 ${pct(d.readConversion)}`, 'accent', '◎'],
    ['阅读次数', fmt(k.readCount), `活跃 ${fmt(k.activeDays)} 天`, 'violet', '▥'],
    ['互动次数', fmt(k.interactionCount), `互动/阅读 ${pct(d.interactionRate)}`, 'rose', '✦'],
    ['完读率', pct(k.finishRate), `均读 ${(k.avgReadSec || 0).toFixed(0)} 秒`, 'warn', '◔'],
    ['TOP3 集中度', pct(d.top3Share), `${d.concentrationLevel}集中`, d.concentrationLevel === '高' ? 'warn' : 'accent', '◆'],
  ];
  return cards.map(([label, value, hint, tone, icon], i) => `<article class="kpi ${tone}" style="--kpi:${chartColor(i)}"><div class="kpi-icon">${esc(icon)}</div><span>${esc(label)}</span><strong>${esc(value)}</strong><small>${esc(hint)}</small><i style="width:${clamp((i + 3) * 13, 24, 94)}%"></i></article>`).join('');
}

function renderHtml(metrics: PrefetchMetrics, plan: VisualPlan): string {
  const d = derive(metrics);
  const variant = chooseVariant(plan, d);
  const title = plan.title || '患教内容运营数据概览';
  const subtitle = plan.subtitle || `${metrics.range.start} 至 ${metrics.range.end} · 平台全量患教内容与分发运营`;
  const insights = insightList(metrics, plan, d);
  const top = metrics.topContent.slice(0, Math.max(5, Math.min(Number(plan.top_content_count || 8), 12)));
  const projects = metrics.projects.slice(0, Math.max(3, Math.min(Number(plan.breakdown_count || 6), 10)));
  const diseases = metrics.diseases.slice(0, 5);
  const theme = plan.theme || (variant === 'content_performance' ? 'warm_orange' : variant === 'project_contribution' ? 'clean_green' : 'medical_blue');
  const projectItems = projects.map((x) => ({ label: x.name, value: x.readCount, hint: `互动 ${fmt(x.interactionCount)} · 内容 ${fmt(x.contentCount)}` }));
  const diseaseItems = diseases.length
    ? diseases.map((x) => ({ label: x.name, value: x.reads || x.pushCount || x.interactions || 0 }))
    : projectItems;
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width, initial-scale=1"/><title>${esc(title)}</title><style>
:root{${themeTokens(theme)}}
*{box-sizing:border-box}
html{min-height:100%;background:var(--bg1)}
body{min-height:100vh;margin:0;padding:38px;display:grid;place-items:center;background:radial-gradient(circle at 8% 0%,color-mix(in srgb,var(--c1) 14%,transparent),transparent 36%),radial-gradient(circle at 94% 4%,color-mix(in srgb,var(--c4) 12%,transparent),transparent 34%),radial-gradient(circle at 52% 110%,color-mix(in srgb,var(--c5) 12%,transparent),transparent 38%),linear-gradient(135deg,var(--bg1),var(--bg2));font-family:-apple-system,BlinkMacSystemFont,"PingFang SC","Microsoft YaHei",Inter,Arial,sans-serif;color:var(--ink)}
.shell{width:1420px;max-width:100%}
.board{position:relative;border-radius:0!important;overflow:hidden;border:1px solid rgba(148,163,184,.20);background:linear-gradient(135deg,rgba(255,255,255,.94),rgba(255,255,255,.78) 46%,rgba(255,255,255,.88)),radial-gradient(circle at 10% 0%,color-mix(in srgb,var(--c1) 12%,transparent),transparent 30%),radial-gradient(circle at 90% 10%,color-mix(in srgb,var(--c3) 10%,transparent),transparent 28%),radial-gradient(circle at 50% 110%,color-mix(in srgb,var(--c5) 10%,transparent),transparent 34%);box-shadow:0 28px 80px rgba(15,23,42,.10);padding:30px}
.board,.panel,.stacked-card,.summary-card,.kpi,.rank-title,.hint,.tree-cell span,.tree-cell small,.matrix-head b,.matrix-head span,.matrix-item strong,.matrix-item span,.donut-legend span,.stacked-legend span,.bubble-item>span,.insight span{overflow-wrap:anywhere;word-break:break-word}
.board:before{content:"";position:absolute;inset:0;background:conic-gradient(from 120deg,transparent,color-mix(in srgb,var(--c1) 7%,transparent),transparent,color-mix(in srgb,var(--c3) 6%,transparent),transparent),linear-gradient(90deg,rgba(255,255,255,.20) 1px,transparent 1px),linear-gradient(0deg,rgba(255,255,255,.18) 1px,transparent 1px);background-size:auto,48px 48px,48px 48px;mask-image:linear-gradient(180deg,rgba(0,0,0,.28),transparent 64%);pointer-events:none}
.board:after{content:"";position:absolute;right:0;top:0;width:360px;height:150px;background:linear-gradient(120deg,color-mix(in srgb,var(--c1) 10%,transparent),color-mix(in srgb,var(--c3) 12%,transparent),color-mix(in srgb,var(--c5) 8%,transparent));filter:blur(1px);pointer-events:none}
.board>*{position:relative;z-index:1}
.top{display:grid;grid-template-columns:1fr 360px;gap:22px;align-items:stretch}
.hero{--region:var(--c1);--region2:var(--c3);position:relative;padding:28px;border-radius:18px;background:linear-gradient(115deg,color-mix(in srgb,var(--region) 7%,white),color-mix(in srgb,var(--region2) 5%,white) 55%,rgba(255,255,255,.86)),radial-gradient(circle at 10% 0%,color-mix(in srgb,var(--region) 12%,transparent),transparent 32%),radial-gradient(circle at 96% 12%,color-mix(in srgb,var(--c7) 10%,transparent),transparent 30%);overflow:hidden;border:1px solid color-mix(in srgb,var(--region) 14%,transparent);box-shadow:0 12px 32px rgba(15,23,42,.045)}
.hero:after{content:"";position:absolute;right:-68px;top:-76px;width:260px;height:260px;border-radius:44px;background:linear-gradient(135deg,color-mix(in srgb,var(--c1) 20%,transparent),color-mix(in srgb,var(--c3) 16%,transparent),color-mix(in srgb,var(--c5) 12%,transparent));transform:rotate(10deg);opacity:.70}
.hero-metrics{display:flex;gap:10px;flex-wrap:wrap;margin-top:18px}
.hero-chip{padding:8px 12px;border-radius:999px;background:rgba(255,255,255,.70);border:1px solid color-mix(in srgb,var(--chip,var(--primary)) 12%,transparent);font-size:12px;font-weight:850;color:var(--ink);box-shadow:0 8px 18px rgba(15,23,42,.035)}
.hero-chip b{color:var(--chip,var(--primary));margin-left:4px}
.eyebrow{font-size:12px;font-weight:950;letter-spacing:.16em;color:var(--primary)}
h1{position:relative;margin:10px 0 8px;font-size:48px;line-height:1.04;letter-spacing:-.055em}
.sub{position:relative;color:var(--muted);font-size:15px;line-height:1.6}
.summary-card{border-radius:18px;background:linear-gradient(145deg,color-mix(in srgb,var(--dark) 92%,var(--c1)),color-mix(in srgb,var(--dark) 84%,var(--c4)) 58%,color-mix(in srgb,var(--dark) 88%,var(--c5)));color:#fff;padding:24px;display:grid;align-content:space-between;overflow:hidden;position:relative;border:1px solid rgba(255,255,255,.10);box-shadow:0 14px 34px rgba(15,23,42,.12)}
.summary-card:after{content:"";position:absolute;right:-60px;bottom:-64px;width:188px;height:188px;border-radius:42px;background:linear-gradient(135deg,color-mix(in srgb,var(--c1) 36%,transparent),color-mix(in srgb,var(--c3) 30%,transparent),color-mix(in srgb,var(--c5) 24%,transparent));transform:rotate(12deg);opacity:.65}
.summary-card span{color:#cbd5e1;font-size:12px;font-weight:900;letter-spacing:.08em}.summary-card strong{font-size:44px;letter-spacing:-.05em}.summary-card p{margin:8px 0 0;color:#e2e8f0;line-height:1.5}
.kpis{display:grid;grid-template-columns:repeat(6,1fr);gap:12px;margin-top:16px}
.kpi{position:relative;border-radius:16px;background:linear-gradient(160deg,color-mix(in srgb,var(--kpi) 7%,white),rgba(255,255,255,.84) 62%,color-mix(in srgb,var(--kpi) 4%,white));border:1px solid color-mix(in srgb,var(--kpi) 14%,transparent);padding:16px;min-height:126px;overflow:hidden;box-shadow:0 10px 24px rgba(15,23,42,.04)}
.kpi:before{content:"";position:absolute;inset:auto -44px -58px auto;width:132px;height:132px;border-radius:36px;background:linear-gradient(135deg,color-mix(in srgb,var(--kpi) 18%,transparent),rgba(255,255,255,.10));transform:rotate(14deg);opacity:.72}
.kpi-icon{position:absolute;right:14px;top:12px;width:34px;height:34px;border-radius:12px;background:color-mix(in srgb,var(--kpi) 10%,white);color:var(--kpi);display:grid;place-items:center;font-weight:950}
.kpi span{font-size:12px;font-weight:900;color:var(--muted)}.kpi strong{display:block;margin-top:10px;font-size:30px;letter-spacing:-.045em;color:var(--kpi)}.kpi small{display:block;margin-top:6px;color:var(--muted);font-weight:750}.kpi>i{position:absolute;left:16px;right:16px;bottom:12px;height:6px;border-radius:999px;background:linear-gradient(90deg,color-mix(in srgb,var(--kpi) 72%,white),color-mix(in srgb,var(--kpi) 18%,white))}
.chart-strip{display:grid;grid-template-columns:1.05fr .85fr .72fr;gap:16px;margin-top:16px}
.grid{display:grid;grid-template-columns:1.1fr .9fr;gap:16px;margin-top:16px}
.panel,.stacked-card{--region:var(--c1);--region2:var(--c2);position:relative;border-radius:18px;background:linear-gradient(145deg,color-mix(in srgb,var(--region) 7%,white),rgba(255,255,255,.86) 48%,color-mix(in srgb,var(--region2) 5%,white));border:1px solid color-mix(in srgb,var(--region) 13%,transparent);padding:20px;box-shadow:0 12px 30px rgba(15,23,42,.045);overflow:hidden}
.panel:before,.stacked-card:before{content:"";position:absolute;left:18px;right:18px;top:0;height:3px;border-radius:0 0 999px 999px;background:linear-gradient(90deg,color-mix(in srgb,var(--region) 60%,white),color-mix(in srgb,var(--region2) 36%,white),transparent);opacity:.72}
.panel:after,.stacked-card:after{content:"";position:absolute;right:-46px;top:-56px;width:142px;height:142px;border-radius:34px;background:linear-gradient(135deg,color-mix(in srgb,var(--region) 18%,transparent),color-mix(in srgb,var(--region2) 10%,transparent));transform:rotate(12deg);opacity:.68}
.panel>*,.stacked-card>*{position:relative;z-index:1}
.chart-strip>.panel:nth-child(1){--region:var(--c1);--region2:var(--c2)}.chart-strip>.panel:nth-child(2){--region:var(--c3);--region2:var(--c4)}.chart-strip>.stacked-card{--region:var(--c5);--region2:var(--c6)}
.grid>.panel:nth-child(1){--region:var(--c2);--region2:var(--c1)}.grid>.panel:nth-child(2){--region:var(--c5);--region2:var(--c7)}.grid>.panel:nth-child(3){--region:var(--c3);--region2:var(--c8)}.grid>.panel:nth-child(4){--region:var(--c4);--region2:var(--c7)}.grid>.panel:nth-child(5){--region:var(--c6);--region2:var(--c5)}.grid>.panel:nth-child(6){--region:var(--c1);--region2:var(--c4)}
.panel h2,.stacked-card h2{margin:0 0 14px;font-size:21px;letter-spacing:-.02em}.section-kicker{font-size:12px;color:color-mix(in srgb,var(--region) 78%,var(--ink));font-weight:950;letter-spacing:.10em;margin-bottom:12px}
.line-chart{width:100%;height:220px}.chart-grid{stroke:color-mix(in srgb,var(--muted) 16%,transparent);stroke-width:1}.area-read{fill:color-mix(in srgb,var(--c1) 12%,transparent)}.line-read{fill:none;stroke:color-mix(in srgb,var(--c1) 82%,white);stroke-width:5;stroke-linecap:round;stroke-linejoin:round}.line-interaction{fill:none;stroke:color-mix(in srgb,var(--c7) 72%,white);stroke-width:3.2;stroke-linecap:round;stroke-dasharray:7 7}.line-dot{fill:#fff;stroke:color-mix(in srgb,var(--c1) 72%,white);stroke-width:3}.axis-label{font-size:11px;fill:var(--muted);font-weight:700}.legend-read{font-size:13px;fill:color-mix(in srgb,var(--c1) 80%,var(--ink));font-weight:900}.legend-interaction{font-size:13px;fill:color-mix(in srgb,var(--c7) 72%,var(--ink));font-weight:900}
.rank-row{display:grid;grid-template-columns:28px minmax(0,1fr) 88px;gap:12px;align-items:start;margin:12px 0}.rank-index{width:28px;height:28px;border-radius:10px;background:color-mix(in srgb,var(--bar) 10%,white);color:color-mix(in srgb,var(--bar) 78%,var(--ink));font-weight:950;display:grid;place-items:center}.rank-main{min-width:0}.rank-title{font-weight:850;line-height:1.28;white-space:normal;overflow:visible}.rank-num{text-align:right;font-weight:950;color:color-mix(in srgb,var(--bar) 78%,var(--ink))}.track{height:11px;border-radius:999px;background:color-mix(in srgb,var(--muted) 15%,transparent);overflow:hidden;margin-top:7px}.fill{height:100%;border-radius:999px;background:linear-gradient(90deg,color-mix(in srgb,var(--bar) 70%,white),color-mix(in srgb,var(--bar) 25%,white))}.hint{font-size:11px;color:var(--muted);margin-top:4px;line-height:1.35}
.funnel{display:grid;gap:13px}.funnel-head{display:flex;justify-content:space-between;font-weight:900}.funnel-bar{height:24px;border-radius:999px;background:color-mix(in srgb,var(--muted) 14%,transparent);overflow:hidden;margin:8px 0 3px}.funnel-bar i{display:block;height:100%;border-radius:999px;background:linear-gradient(90deg,color-mix(in srgb,var(--bar) 72%,white),color-mix(in srgb,var(--bar) 28%,white))}.funnel small{color:var(--muted);font-weight:750}
.weekly-bars{height:240px;display:flex;align-items:flex-end;gap:9px;border-bottom:1px solid color-mix(in srgb,var(--ink) 10%,transparent);padding:8px 6px 28px}.week{position:relative;flex:1;height:100%;display:flex;align-items:flex-end}.week b{width:100%;border-radius:12px 12px 4px 4px;background:linear-gradient(180deg,color-mix(in srgb,var(--bar) 44%,white),color-mix(in srgb,var(--bar) 82%,white));min-height:8px;box-shadow:0 10px 20px color-mix(in srgb,var(--bar) 12%,transparent)}.week span{position:absolute;bottom:-25px;left:50%;transform:translateX(-50%);font-size:11px;color:var(--muted);white-space:nowrap}.week em{position:absolute;top:-17px;left:50%;transform:translateX(-50%);font-size:11px;font-style:normal;font-weight:850}
.heat-wrap{min-height:240px;display:grid;grid-template-rows:1fr auto;gap:12px}.heatmap{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;align-content:stretch}.heat-cell{position:relative;min-height:86px;border-radius:16px;padding:10px;display:flex;flex-direction:column;justify-content:space-between;border:1px solid rgba(255,255,255,.62);box-shadow:0 10px 22px color-mix(in srgb,var(--heat) 9%,transparent);color:var(--ink);overflow:hidden}.heat-cell i{position:absolute;left:10px;right:10px;bottom:8px;height:5px;border-radius:999px;background:rgba(255,255,255,.55)}.heat-cell i:after{content:"";display:block;width:var(--h);height:100%;border-radius:999px;background:color-mix(in srgb,var(--heat) 70%,white)}.heat-cell b{font-size:12px;color:color-mix(in srgb,var(--ink) 62%,transparent)}.heat-cell strong{font-size:21px;letter-spacing:-.04em}.heat-cell span{font-size:11px;font-weight:800;color:color-mix(in srgb,var(--ink) 54%,transparent);padding-bottom:8px}.heat-summary{display:grid;grid-template-columns:repeat(3,1fr);gap:10px}.heat-summary span{border-radius:14px;background:rgba(255,255,255,.62);border:1px solid rgba(148,163,184,.16);padding:10px}.heat-summary b{display:block;font-size:11px;color:var(--muted);margin-bottom:4px}.heat-summary strong{font-size:14px}.heat-empty{display:grid;place-items:center;min-height:180px;color:var(--muted);font-weight:900}
.treemap{min-height:230px;display:flex;gap:10px;flex-wrap:wrap;align-content:stretch}.tree-cell{min-width:150px;min-height:112px;border-radius:18px;padding:14px;display:grid;align-content:space-between;gap:8px;background:linear-gradient(145deg,color-mix(in srgb,var(--tree) 16%,white),color-mix(in srgb,var(--tree) 34%,white));border:1px solid color-mix(in srgb,var(--tree) 16%,transparent);box-shadow:0 14px 28px color-mix(in srgb,var(--tree) 10%,transparent)}.tree-cell span{font-weight:950;line-height:1.25}.tree-cell strong{font-size:26px;letter-spacing:-.04em;color:color-mix(in srgb,var(--tree) 72%,var(--ink))}.tree-cell small{color:var(--muted);font-weight:800;line-height:1.35}
.content-matrix{min-height:240px;display:grid;grid-template-columns:1fr 1fr;gap:10px}.matrix-cell{border-radius:16px;background:linear-gradient(145deg,color-mix(in srgb,var(--m) 9%,white),rgba(255,255,255,.78));border:1px solid color-mix(in srgb,var(--m) 14%,transparent);padding:12px;display:grid;grid-template-rows:auto 1fr;gap:8px}.matrix-head b{display:block;color:color-mix(in srgb,var(--m) 78%,var(--ink));font-size:14px;line-height:1.25}.matrix-head span{display:block;margin-top:2px;color:var(--muted);font-size:11px;font-weight:850;line-height:1.25}.matrix-items{display:grid;gap:6px;align-content:start}.matrix-item{display:grid;grid-template-columns:20px minmax(0,1fr);grid-template-rows:auto auto;column-gap:7px;align-items:start;border-radius:12px;background:rgba(255,255,255,.62);padding:7px}.matrix-item i{grid-row:1/3;width:20px;height:20px;border-radius:999px;background:color-mix(in srgb,var(--m) 22%,white);color:color-mix(in srgb,var(--m) 78%,var(--ink));display:grid;place-items:center;font-style:normal;font-weight:950;font-size:11px}.matrix-item strong{font-size:12px;line-height:1.28;white-space:normal;overflow:visible}.matrix-item span{font-size:10.5px;color:var(--muted);font-weight:800;line-height:1.3}.matrix-items em{font-style:normal;color:var(--muted);font-weight:850;font-size:12px}
.donut-wrap{display:grid;grid-template-columns:160px minmax(0,1fr);grid-template-rows:auto 1fr;gap:12px;align-items:center}.donut-title{grid-column:1/-1;font-weight:950;font-size:20px}.donut{width:156px;height:156px;border-radius:50%;display:grid;place-items:center;box-shadow:0 18px 32px rgba(15,23,42,.10)}.donut>div{width:92px;height:92px;border-radius:50%;background:rgba(255,255,255,.94);display:grid;place-items:center;text-align:center;padding:10px}.donut strong{display:block;font-size:24px;line-height:1;color:var(--ink)}.donut span{display:block;margin-top:5px;font-size:11px;color:var(--muted);font-weight:800}.donut-legends{display:grid;gap:8px;min-width:0}.donut-legend{display:grid;grid-template-columns:10px minmax(0,1fr) 42px;gap:8px;align-items:start;font-size:12px;font-weight:850}.donut-legend i{width:10px;height:10px;border-radius:999px;margin-top:3px}.donut-legend span{line-height:1.25}.donut-legend b{text-align:right}
.stacked-bar{height:34px;border-radius:999px;overflow:hidden;display:flex;background:color-mix(in srgb,var(--muted) 14%,transparent);box-shadow:inset 0 0 0 1px rgba(255,255,255,.42)}.stacked-bar i{height:100%}.stacked-legend{display:flex;gap:12px;flex-wrap:wrap;margin-top:14px}.stacked-legend span{font-size:12px;font-weight:850;color:var(--muted);line-height:1.28;max-width:190px}.stacked-legend i{display:inline-block;width:10px;height:10px;border-radius:999px;margin-right:6px;vertical-align:-1px}
.bubble-chart{min-height:190px;display:flex;align-items:flex-start;justify-content:center;gap:16px;flex-wrap:wrap;padding-top:8px}.bubble-item{width:136px;display:grid;justify-items:center;gap:9px;text-align:center}.bubble{border-radius:24px;background:linear-gradient(145deg,color-mix(in srgb,var(--bubble) 10%,white),color-mix(in srgb,var(--bubble) 34%,white));border:1px solid color-mix(in srgb,var(--bubble) 18%,transparent);display:grid;place-items:center;text-align:center;padding:8px;box-shadow:0 14px 24px color-mix(in srgb,var(--bubble) 10%,transparent)}.bubble strong{font-size:18px;color:color-mix(in srgb,var(--bubble) 68%,black);line-height:1}.bubble-item>span{font-size:12px;font-weight:900;color:var(--ink);line-height:1.28;word-break:break-word}
.gauge-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:12px}.gauge{text-align:center;border-radius:14px;padding:12px;background:linear-gradient(160deg,color-mix(in srgb,var(--g) 6%,white),rgba(255,255,255,.80));border:1px solid color-mix(in srgb,var(--g) 12%,transparent);box-shadow:0 8px 18px rgba(15,23,42,.035)}.gauge-ring{position:relative;width:88px;height:88px;border-radius:50%;margin:0 auto 8px;display:grid;place-items:center;background:conic-gradient(color-mix(in srgb,var(--g) 74%,white) var(--p),color-mix(in srgb,var(--muted) 14%,transparent) 0)}.gauge-ring strong{width:62px;height:62px;border-radius:50%;background:rgba(255,255,255,.94);display:grid;place-items:center;font-size:16px;color:var(--ink)}.gauge span{display:block;font-size:12px;font-weight:950}.gauge small{display:block;margin-top:3px;color:var(--muted);font-weight:800}
.insight-grid{display:grid;grid-template-columns:repeat(5,1fr);gap:12px;margin-top:16px}.insight{--region:var(--c1);border-radius:14px;background:linear-gradient(160deg,color-mix(in srgb,var(--region) 7%,white),rgba(255,255,255,.84));border:1px solid color-mix(in srgb,var(--region) 12%,transparent);padding:14px;min-height:108px;box-shadow:0 8px 18px rgba(15,23,42,.035)}.insight:nth-child(1){--region:var(--c1)}.insight:nth-child(2){--region:var(--c3)}.insight:nth-child(3){--region:var(--c5)}.insight:nth-child(4){--region:var(--c4)}.insight:nth-child(5){--region:var(--c7)}.insight b{display:block;color:color-mix(in srgb,var(--region) 78%,var(--ink));font-size:12px;margin-bottom:8px}.insight span{font-weight:850;line-height:1.42;font-size:13px}.footer{text-align:right;color:var(--muted);font-size:12px;margin-top:14px}
.layout-content_performance .grid{grid-template-columns:.92fr 1.08fr}.layout-project_contribution .grid{grid-template-columns:1fr 1fr}.layout-funnel_diagnostic .funnel-panel{order:-1}@media(max-width:1000px){body{padding:0}.top,.grid,.chart-strip{grid-template-columns:1fr}.kpis,.insight-grid{grid-template-columns:repeat(2,1fr)}.gauge-grid{grid-template-columns:repeat(2,1fr)}}
</style></head><body><main class="shell"><section class="board layout-${variant}" data-export-root><div class="top"><div class="hero"><div class="eyebrow">PX OPERATION OVERVIEW · ${esc(variant.replace(/_/g, ' ').toUpperCase())}</div><h1>${esc(title)}</h1><div class="sub">${esc(subtitle)} · 数据源：${esc(metrics.source)}</div><div class="hero-metrics"><span class="hero-chip" style="--chip:var(--c1)">阅读 <b>${fmt(metrics.coreKpi.readCount)}</b></span><span class="hero-chip" style="--chip:var(--c3)">转化 <b>${pct(d.readConversion)}</b></span><span class="hero-chip" style="--chip:var(--c5)">完读 <b>${pct(metrics.coreKpi.finishRate)}</b></span><span class="hero-chip" style="--chip:var(--c7)">互动 <b>${fmt(metrics.coreKpi.interactionCount)}</b></span></div></div><div class="summary-card"><span>核心判断</span><strong>${esc(d.concentrationLevel)}集中</strong><p>TOP3 阅读占比 ${pct(d.top3Share)}；${d.strongestProject ? `头部项目为 ${esc(displayText(d.strongestProject.name))}` : '项目贡献结构待观察'}。</p></div></div><section class="kpis">${kpiCards(metrics, d)}</section><section class="chart-strip"><div class="panel trend-line-panel"><div class="section-kicker">LINE / AREA</div><h2>阅读与互动趋势</h2>${weeklyLineChart(d)}</div><div class="panel donut-panel">${donutChart(projectItems, '项目阅读结构', pct(d.top3Share, 0), 'TOP3 占比')}</div>${stackedShare(projectItems)}</section><section class="grid"><div class="panel trend-panel"><div class="section-kicker">HEATMAP</div><h2>每日阅读热力</h2>${dailyHeatmap(metrics.dailyTrend)}</div><div class="panel funnel-panel"><div class="section-kicker">CONVERSION FUNNEL</div><h2>分发转化漏斗</h2>${funnel(metrics, d)}</div><div class="panel"><div class="section-kicker">TREEMAP</div><h2>项目阅读版图</h2>${projectTreemap(projectItems)}</div><div class="panel"><div class="section-kicker">BUBBLE VIEW</div><h2>病种 / 项目气泡分布</h2>${bubbleChart(diseaseItems)}</div><div class="panel"><div class="section-kicker">QUALITY GAUGES</div><h2>运营健康度仪表</h2>${qualityGauges(metrics, d)}</div><div class="panel"><div class="section-kicker">CONTENT MATRIX</div><h2>内容阅读 × 完读矩阵</h2>${contentScatter(top)}</div></section><section class="insight-grid">${insights.map((x, i) => `<article class="insight"><b>INSIGHT ${i + 1}</b><span>${esc(x)}</span></article>`).join('')}</section><div class="footer">Generated at ${esc(metrics.generatedAt)} · ${esc(metrics.range.start)} → ${esc(metrics.range.end)} · 多图表彩色版</div></section></main></body></html>`;
}

async function screenshotHtmlToPng(htmlPath: string, pngPath: string): Promise<void> {
  const configuredExecutable = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || '';
  const executablePath = configuredExecutable.trim() || undefined;
  const browser = await chromium.launch({ executablePath, headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1200 }, deviceScaleFactor: 2 });
    await page.goto(pathToFileURL(htmlPath).toString(), { waitUntil: 'networkidle' });
    await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
    await page.evaluate(() => {
      const root = document.querySelector('[data-export-root]') as HTMLElement | null;
      if (root) { root.style.overflow = 'hidden'; }
    });
    await page.locator('[data-export-root]').first().screenshot({ path: pngPath, omitBackground: false });
  } finally { await browser.close(); }
}

function renderMarkdown(metrics: PrefetchMetrics, plan: VisualPlan): string {
  const d = derive(metrics);
  const k = metrics.coreKpi;
  const insights = insightList(metrics, plan, d).map((x) => `- ${x}`).join('\n');
  const top = metrics.topContent.slice(0, 8).map((x, i) => `| ${i + 1} | ${x.title.replace(/\|/g, ' ')} | ${x.projectName || '-'} | ${fmt(x.readCount)} | ${pct(x.finishRate)} |`).join('\n');
  const projects = metrics.projects.slice(0, 8).map((x, i) => `| ${i + 1} | ${x.name.replace(/\|/g, ' ')} | ${fmt(x.readCount)} | ${fmt(x.interactionCount)} | ${fmt(x.contentCount)} |`).join('\n');
  return `# ${plan.title || '患教内容运营数据概览'}\n\n**数据周期**：${metrics.range.start} 至 ${metrics.range.end}（${metrics.range.days} 天）  \n**数据来源**：PX 指标数据\n\n## 核心 KPI\n\n| 指标 | 数值 |\n|---|---:|\n| 推送量 | ${fmt(k.pushCount)} |\n| 送达量 | ${fmt(k.deliveredCount)} |\n| 阅读人数 | ${fmt(k.readUsers)} |\n| 阅读次数 | ${fmt(k.readCount)} |\n| 互动次数 | ${fmt(k.interactionCount)} |\n| 完读率 | ${pct(k.finishRate)} |\n| 平均阅读时长 | ${(k.avgReadSec || 0).toFixed(0)} 秒 |\n\n## 结构诊断\n\n- 送达率：${pct(d.deliveryRate)}\n- 阅读转化率：${pct(d.readConversion)}\n- 互动/阅读：${pct(d.interactionRate)}\n- TOP3 阅读集中度：${pct(d.top3Share)}（${d.concentrationLevel}集中）\n\n## 运营洞察\n\n${insights}\n\n## 项目贡献\n\n| 排名 | 项目 | 阅读 | 互动 | 内容数 |\n|---:|---|---:|---:|---:|\n${projects}\n\n## TOP 内容\n\n| 排名 | 内容 | 项目 | 阅读次数 | 完读率 |\n|---:|---|---|---:|---:|\n${top}\n`;
}

const outputDir = path.resolve(arg('--output-dir', 'ai-helper/generated'));
const prefix = cleanFileName(arg('--prefix', 'overview'), 'overview').replace(/\.(html|svg|png|json|md)$/i, '');
const plan = parseJson<VisualPlan>(arg('--visual-plan', '{}'));
const prefetchMetrics = await loadPrefetchMetrics();
const metrics = await overviewMetricsForPlan(plan, prefetchMetrics);
const derived = derive(metrics);
const html = renderHtml(metrics, plan);
const markdown = renderMarkdown(metrics, plan);

await fs.mkdir(outputDir, { recursive: true });
const htmlPath = path.join(outputDir, `${prefix}_kpi.html`);
const pngPath = path.join(outputDir, `${prefix}_kpi.png`);
const reportPath = path.join(outputDir, `${prefix}_report.md`);
const metricsPath = path.join(outputDir, `${prefix}_metrics.json`);
const manifestPath = path.join(outputDir, `${prefix}_manifest.json`);
await fs.writeFile(htmlPath, html, 'utf8');
await fs.writeFile(reportPath, markdown, 'utf8');
await fs.writeFile(metricsPath, JSON.stringify({ metrics, derived, visual_plan: plan }, null, 2), 'utf8');
await screenshotHtmlToPng(htmlPath, pngPath);

const helperRoot = path.resolve(process.cwd(), 'ai-helper');
const rel = (file: string) => `/${path.relative(helperRoot, file).split(path.sep).join('/')}`;
const files = [reportPath, htmlPath, pngPath, manifestPath, metricsPath].map(rel);
const manifest = { skill_id: 'patient-education-data-overview', renderer: 'overview-html-renderer-v2', generated_at: new Date().toISOString(), files: { report: rel(reportPath), html: rel(htmlPath), png: rel(pngPath), metrics_json: rel(metricsPath) }, period: metrics.range, core_kpi: metrics.coreKpi, derived, visual_plan: plan, source: metrics.source };
await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2), 'utf8');
console.log(JSON.stringify({ ok: true, kind: 'overview_template_assets_v2', files, file: rel(pngPath), report: rel(reportPath), html: rel(htmlPath), png: rel(pngPath), manifest: rel(manifestPath), metrics_json: rel(metricsPath), period: metrics.range, core_kpi: metrics.coreKpi, derived, insights: insightList(metrics, plan, derived) }));
