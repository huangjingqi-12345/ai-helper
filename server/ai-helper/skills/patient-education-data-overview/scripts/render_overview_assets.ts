import fs from 'fs/promises';
import path from 'path';
import { pathToFileURL } from 'url';
import { chromium } from 'playwright';
import { prefetchMetrics } from '../../../../src/ai-helper/metrics.ts';
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
  tenantId?: string;
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
function short(text: unknown, max = 34): string {
  const s = String(text ?? '').trim();
  return s.length > max ? `${s.slice(0, max)}…` : s;
}

function planParams(plan: VisualPlan): PrefetchMetricsParams {
  return {
    task: 'overview',
    dateRange: plan.dateRange,
    projectId: plan.projectId,
    contentId: plan.contentId,
    diseaseId: plan.diseaseId,
    tenantId: plan.tenantId,
    // `limit` is used by the backend both for top-content SQL cap and dailyTrend cap.
    // Keep it high enough so weekly rhythm/anomaly modules have the full recent window;
    // visual top content count is still controlled by top_content_count below.
    limit: 120,
  };
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
    d.bestContent ? `高表现内容「${short(d.bestContent.title, 22)}」可沉淀为后续选题模板。` : '',
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
    medical_blue: { bg1: '#eff6ff', bg2: '#ecfeff', ink: '#0f172a', muted: '#64748b', panel: 'rgba(255,255,255,.82)', primary: '#2563eb', accent: '#14b8a6', warn: '#f59e0b', danger: '#ef4444', dark: '#0f172a' },
    executive_dark: { bg1: '#0f172a', bg2: '#1e293b', ink: '#f8fafc', muted: '#cbd5e1', panel: 'rgba(15,23,42,.72)', primary: '#60a5fa', accent: '#2dd4bf', warn: '#fbbf24', danger: '#fb7185', dark: '#020617' },
    clean_green: { bg1: '#ecfdf5', bg2: '#f0fdfa', ink: '#10201b', muted: '#64748b', panel: 'rgba(255,255,255,.84)', primary: '#059669', accent: '#2563eb', warn: '#d97706', danger: '#dc2626', dark: '#064e3b' },
    warm_orange: { bg1: '#fff7ed', bg2: '#fffbeb', ink: '#241407', muted: '#78716c', panel: 'rgba(255,255,255,.84)', primary: '#ea580c', accent: '#2563eb', warn: '#f59e0b', danger: '#dc2626', dark: '#431407' },
  };
  return Object.entries(map[theme] || map.medical_blue).map(([k, v]) => `--${k}:${v};`).join('');
}

function bars(items: Array<{ label: string; value: number; hint?: string }>, maxValue?: number): string {
  const max = maxValue || Math.max(1, ...items.map((x) => x.value));
  return items.map((x, i) => `<div class="rank-row"><div class="rank-index">${i + 1}</div><div class="rank-main"><div class="rank-title">${esc(short(x.label, 32))}</div><div class="track"><div class="fill" style="width:${clamp(safeDiv(x.value, max) * 100, 4, 100).toFixed(1)}%"></div></div>${x.hint ? `<div class="hint">${esc(x.hint)}</div>` : ''}</div><div class="rank-num">${fmt(x.value)}</div></div>`).join('');
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
  return `<div class="funnel">${steps.map((s) => `<div class="funnel-step"><div class="funnel-head"><b>${esc(s.label)}</b><span>${fmt(s.value)}</span></div><div class="funnel-bar"><i style="width:${clamp(safeDiv(s.value, max) * 100, 8, 100).toFixed(1)}%"></i></div><small>${s.label === '推送' ? '基准' : `阶段率 ${pct(s.rate)}`}</small></div>`).join('')}</div>`;
}
function weeklyBars(d: Derived): string {
  const max = Math.max(1, ...d.weekly.map((x) => x.readCount));
  return `<div class="weekly-bars">${d.weekly.map((x) => `<div class="week"><b style="height:${clamp(safeDiv(x.readCount, max) * 100, 6, 100).toFixed(1)}%"></b><span>${esc(x.label)}</span><em>${fmt(x.readCount)}</em></div>`).join('')}</div>`;
}
function kpiCards(metrics: PrefetchMetrics, d: Derived): string {
  const k = metrics.coreKpi;
  const cards = [
    ['推送量', fmt(k.pushCount), '分发触达规模', 'primary'],
    ['阅读人数', fmt(k.readUsers), `阅读转化 ${pct(d.readConversion)}`, 'accent'],
    ['阅读次数', fmt(k.readCount), `活跃 ${fmt(k.activeDays)} 天`, 'primary'],
    ['互动次数', fmt(k.interactionCount), `互动/阅读 ${pct(d.interactionRate)}`, 'accent'],
    ['完读率', pct(k.finishRate), `均读 ${(k.avgReadSec || 0).toFixed(0)} 秒`, 'warn'],
    ['TOP3 集中度', pct(d.top3Share), `${d.concentrationLevel}集中`, d.concentrationLevel === '高' ? 'warn' : 'accent'],
  ];
  return cards.map(([label, value, hint, tone]) => `<article class="kpi ${tone}"><span>${esc(label)}</span><strong>${esc(value)}</strong><small>${esc(hint)}</small></article>`).join('');
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
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width, initial-scale=1"/><title>${esc(title)}</title><style>
:root{${themeTokens(theme)}}*{box-sizing:border-box}html{min-height:100%;background:var(--bg1)}body{min-height:100vh;margin:0;padding:38px;display:grid;place-items:center;background:radial-gradient(circle at 9% 0%,color-mix(in srgb,var(--primary) 22%,transparent),transparent 32%),radial-gradient(circle at 96% 10%,color-mix(in srgb,var(--accent) 20%,transparent),transparent 34%),linear-gradient(135deg,var(--bg1),var(--bg2));font-family:-apple-system,BlinkMacSystemFont,"PingFang SC","Microsoft YaHei",Inter,Arial,sans-serif;color:var(--ink)}.shell{width:1360px;max-width:100%;border-radius:0!important}.board{position:relative;border-radius:0!important;overflow:visible;border:1px solid color-mix(in srgb,var(--ink) 10%,transparent);background:linear-gradient(120deg,rgba(255,255,255,.88),rgba(255,255,255,.68)),radial-gradient(circle at 8% 0%,color-mix(in srgb,var(--primary) 28%,transparent),transparent 28%),radial-gradient(circle at 92% 8%,color-mix(in srgb,var(--accent) 26%,transparent),transparent 26%),radial-gradient(circle at 48% 110%,rgba(254,215,170,.34),transparent 30%);box-shadow:0 28px 80px rgba(43,37,27,.12);padding:30px}.board:before{content:"";position:absolute;inset:0;background:conic-gradient(from 120deg,transparent,rgba(37,99,235,.07),transparent,rgba(16,185,129,.06),transparent);pointer-events:none}.board>*{position:relative;z-index:1}.top{display:grid;grid-template-columns:1fr 330px;gap:22px;align-items:stretch}.hero{position:relative;padding:26px;border-radius:28px;background:linear-gradient(120deg,rgba(255,255,255,.92),rgba(255,255,255,.72)),radial-gradient(circle at 8% 0%,color-mix(in srgb,var(--primary) 26%,transparent),transparent 28%),radial-gradient(circle at 92% 8%,color-mix(in srgb,var(--accent) 26%,transparent),transparent 26%);overflow:hidden}.hero:after{content:"";position:absolute;right:-80px;top:-80px;width:240px;height:240px;border-radius:999px;background:color-mix(in srgb,var(--primary) 24%,transparent)}.eyebrow{font-size:12px;font-weight:950;letter-spacing:.16em;color:var(--primary)}h1{position:relative;margin:10px 0 8px;font-size:46px;line-height:1.04;letter-spacing:-.05em}.sub{position:relative;color:var(--muted);font-size:15px;line-height:1.6}.summary-card{border-radius:28px;background:var(--dark);color:#fff;padding:24px;display:grid;align-content:space-between}.summary-card span{color:#cbd5e1;font-size:12px;font-weight:900;letter-spacing:.08em}.summary-card strong{font-size:42px;letter-spacing:-.05em}.summary-card p{margin:8px 0 0;color:#e2e8f0;line-height:1.5}.kpis{display:grid;grid-template-columns:repeat(6,1fr);gap:12px;margin-top:16px}.kpi{border-radius:22px;background:var(--panel);border:1px solid color-mix(in srgb,var(--ink) 10%,transparent);padding:16px;min-height:116px}.kpi span{font-size:12px;font-weight:900;color:var(--muted)}.kpi strong{display:block;margin-top:10px;font-size:30px;letter-spacing:-.04em}.kpi small{display:block;margin-top:6px;color:var(--muted);font-weight:750}.kpi.primary strong{color:var(--primary)}.kpi.accent strong{color:var(--accent)}.kpi.warn strong{color:var(--warn)}.grid{display:grid;grid-template-columns:1.12fr .88fr;gap:16px;margin-top:16px}.panel{border-radius:26px;background:var(--panel);border:1px solid color-mix(in srgb,var(--ink) 10%,transparent);padding:20px}.panel h2{margin:0 0 14px;font-size:21px;letter-spacing:-.02em}.section-kicker{font-size:12px;color:var(--muted);font-weight:950;letter-spacing:.10em;margin-bottom:12px}.rank-row{display:grid;grid-template-columns:26px 1fr 84px;gap:12px;align-items:center;margin:12px 0}.rank-index{width:26px;height:26px;border-radius:9px;background:color-mix(in srgb,var(--primary) 14%,white);color:var(--primary);font-weight:950;display:grid;place-items:center}.rank-title{font-weight:850;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.rank-num{text-align:right;font-weight:950;color:var(--primary)}.track{height:10px;border-radius:999px;background:color-mix(in srgb,var(--muted) 18%,transparent);overflow:hidden;margin-top:7px}.fill{height:100%;border-radius:999px;background:linear-gradient(90deg,var(--primary),var(--accent))}.hint{font-size:11px;color:var(--muted);margin-top:4px}.funnel{display:grid;gap:13px}.funnel-head{display:flex;justify-content:space-between;font-weight:900}.funnel-bar{height:24px;border-radius:999px;background:color-mix(in srgb,var(--muted) 16%,transparent);overflow:hidden;margin:8px 0 3px}.funnel-bar i{display:block;height:100%;border-radius:999px;background:linear-gradient(90deg,var(--primary),var(--accent))}.funnel small{color:var(--muted);font-weight:750}.weekly-bars{height:240px;display:flex;align-items:flex-end;gap:9px;border-bottom:1px solid color-mix(in srgb,var(--ink) 12%,transparent);padding:8px 6px 28px}.week{position:relative;flex:1;height:100%;display:flex;align-items:flex-end}.week b{width:100%;border-radius:12px 12px 3px 3px;background:linear-gradient(180deg,var(--accent),var(--primary));min-height:8px}.week span{position:absolute;bottom:-25px;left:50%;transform:translateX(-50%);font-size:11px;color:var(--muted);white-space:nowrap}.week em{position:absolute;top:-17px;left:50%;transform:translateX(-50%);font-size:11px;font-style:normal;font-weight:850}.insight-grid{display:grid;grid-template-columns:repeat(5,1fr);gap:12px;margin-top:16px}.insight{border-radius:20px;background:color-mix(in srgb,var(--primary) 7%,white);border:1px solid color-mix(in srgb,var(--primary) 15%,transparent);padding:14px;min-height:108px}.insight b{display:block;color:var(--primary);font-size:12px;margin-bottom:8px}.insight span{font-weight:850;line-height:1.42;font-size:13px}.diagnostics{display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;margin-top:16px}.mini{border-radius:20px;background:color-mix(in srgb,var(--accent) 7%,white);padding:15px;border:1px solid color-mix(in srgb,var(--accent) 14%,transparent)}.mini span{font-size:12px;color:var(--muted);font-weight:900}.mini strong{display:block;margin-top:8px;font-size:24px}.footer{text-align:right;color:var(--muted);font-size:12px;margin-top:14px}.layout-content_performance .grid{grid-template-columns:.92fr 1.08fr}.layout-project_contribution .grid{grid-template-columns:1fr 1fr}.layout-funnel_diagnostic .funnel-panel{order:-1}@media(max-width:1000px){body{padding:0}.top,.grid,.diagnostics{grid-template-columns:1fr}.kpis,.insight-grid{grid-template-columns:repeat(2,1fr)}}
</style></head><body><main class="shell"><section class="board layout-${variant}" data-export-root><div class="top"><div class="hero"><div class="eyebrow">PX OPERATION OVERVIEW · ${esc(variant.replace(/_/g, ' ').toUpperCase())}</div><h1>${esc(title)}</h1><div class="sub">${esc(subtitle)} · 数据源：${esc(metrics.source)}</div></div><div class="summary-card"><span>核心判断</span><strong>${esc(d.concentrationLevel)}集中</strong><p>TOP3 阅读占比 ${pct(d.top3Share)}；${d.strongestProject ? `头部项目为 ${esc(short(d.strongestProject.name, 18))}` : '项目贡献结构待观察'}。</p></div></div><section class="kpis">${kpiCards(metrics, d)}</section><section class="grid"><div class="panel trend-panel"><div class="section-kicker">TIME RHYTHM</div><h2>周度阅读节奏</h2>${weeklyBars(d)}</div><div class="panel funnel-panel"><div class="section-kicker">CONVERSION FUNNEL</div><h2>分发转化漏斗</h2>${funnel(metrics, d)}</div><div class="panel"><div class="section-kicker">PROJECT CONTRIBUTION</div><h2>项目阅读贡献</h2>${bars(projects.map((x) => ({ label: x.name, value: x.readCount, hint: `互动 ${fmt(x.interactionCount)} · 内容 ${fmt(x.contentCount)}` })))}</div><div class="panel"><div class="section-kicker">CONTENT PERFORMANCE</div><h2>TOP 内容表现</h2>${bars(top.map((x) => ({ label: x.title, value: x.readCount, hint: `${x.projectName || '未分组'} · 完读 ${pct(x.finishRate)}` })))}</div></section><section class="diagnostics"><div class="mini"><span>送达率</span><strong>${pct(d.deliveryRate)}</strong></div><div class="mini"><span>阅读转化</span><strong>${pct(d.readConversion)}</strong></div><div class="mini"><span>低完读关注</span><strong>${esc(d.weakContent ? short(d.weakContent.title, 14) : '暂无')}</strong></div></section><section class="insight-grid">${insights.map((x, i) => `<article class="insight"><b>INSIGHT ${i + 1}</b><span>${esc(x)}</span></article>`).join('')}</section><div class="footer">Generated at ${esc(metrics.generatedAt)} · ${esc(metrics.range.start)} → ${esc(metrics.range.end)} · 外层直角截图</div></section></main></body></html>`;
}

async function screenshotHtmlToPng(htmlPath: string, pngPath: string): Promise<void> {
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1200 }, deviceScaleFactor: 2 });
    await page.goto(pathToFileURL(htmlPath).toString(), { waitUntil: 'networkidle' });
    await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
    await page.evaluate(() => {
      const root = document.querySelector('[data-export-root]') as HTMLElement | null;
      if (root) { root.style.borderRadius = '0px'; root.style.overflow = 'visible'; }
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
  return `# ${plan.title || '患教内容运营数据概览'}\n\n**数据周期**：${metrics.range.start} 至 ${metrics.range.end}（${metrics.range.days} 天）  \n**数据来源**：PX SQL 聚合指标\n\n## 核心 KPI\n\n| 指标 | 数值 |\n|---|---:|\n| 推送量 | ${fmt(k.pushCount)} |\n| 送达量 | ${fmt(k.deliveredCount)} |\n| 阅读人数 | ${fmt(k.readUsers)} |\n| 阅读次数 | ${fmt(k.readCount)} |\n| 互动次数 | ${fmt(k.interactionCount)} |\n| 完读率 | ${pct(k.finishRate)} |\n| 平均阅读时长 | ${(k.avgReadSec || 0).toFixed(0)} 秒 |\n\n## 结构诊断\n\n- 送达率：${pct(d.deliveryRate)}\n- 阅读转化率：${pct(d.readConversion)}\n- 互动/阅读：${pct(d.interactionRate)}\n- TOP3 阅读集中度：${pct(d.top3Share)}（${d.concentrationLevel}集中）\n\n## 运营洞察\n\n${insights}\n\n## 项目贡献\n\n| 排名 | 项目 | 阅读 | 互动 | 内容数 |\n|---:|---|---:|---:|---:|\n${projects}\n\n## TOP 内容\n\n| 排名 | 内容 | 项目 | 阅读次数 | 完读率 |\n|---:|---|---|---:|---:|\n${top}\n`;
}

const outputDir = path.resolve(arg('--output-dir', 'ai-helper/generated'));
const prefix = cleanFileName(arg('--prefix', 'overview'), 'overview').replace(/\.(html|svg|png|json|md)$/i, '');
const plan = parseJson<VisualPlan>(arg('--visual-plan', '{}'));
const metrics = await prefetchMetrics(planParams(plan));
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
