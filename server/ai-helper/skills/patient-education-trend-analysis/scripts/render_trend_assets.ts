import fs from 'fs/promises';
import path from 'path';
import { pathToFileURL } from 'url';
import { chromium } from 'playwright';
import { prefetchMetrics } from '../../../../src/ai-helper/metrics.ts';
import type { MetricPoint, PrefetchMetrics, PrefetchMetricsParams } from '../../../../src/ai-helper/types.ts';

type LayoutVariant = 'trend_command_center' | 'anomaly_review' | 'funnel_trend' | 'content_momentum';
type VisualPlan = {
  title?: string;
  subtitle?: string;
  theme?: 'blue' | 'dark' | 'green' | 'orange';
  layout_variant?: LayoutVariant;
  emphasis?: string[];
  insights?: string[];
  conclusions?: string[];
  top_content_count?: number;
  dateRange?: PrefetchMetricsParams['dateRange'];
  projectId?: string;
  contentId?: string;
  diseaseId?: string;
  tenantId?: string;
};

type Derived = {
  readRate: number;
  interactionRate: number;
  deliveryRate: number;
  dailyAvgRead: number;
  dailyAvgInteraction: number;
  bestDay?: MetricPoint;
  weakestDay?: MetricPoint;
  anomalies: Array<{ date: string; readCount: number; diffPct: number; label: string }>;
  weeks: Array<{ label: string; readCount: number; interactionCount: number; pushCount: number }>;
  canvasSeries: Array<{ date: string; readCount: number; interactionCount: number; pushCount: number }>;
};

function arg(name: string, fallback = ''): string { const idx = process.argv.indexOf(name); return idx >= 0 && idx + 1 < process.argv.length ? process.argv[idx + 1] : fallback; }
function parseJson<T extends Record<string, unknown>>(raw: string): T { if (!raw.trim()) return {} as T; try { return JSON.parse(raw) as T; } catch { return {} as T; } }
function cleanFileName(value: string, fallback: string): string { const raw = (value || fallback).replace(/\\/g, '/').split('/').pop() || fallback; return raw.replace(/[^a-zA-Z0-9_.-]+/g, '_') || fallback; }
function esc(value: unknown): string { return String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
function fmt(value: number): string { return Math.round(value || 0).toLocaleString('zh-CN'); }
function pct(value: number): string { return `${((value || 0) * 100).toFixed(1)}%`; }
function delta(value: number): string { return `${value >= 0 ? '+' : ''}${(value || 0).toFixed(1)}%`; }
function safeDiv(a: number, b: number): number { return b ? a / b : 0; }
function clamp(n: number, min: number, max: number): number { return Math.max(min, Math.min(max, n)); }
function short(text: unknown, max = 34): string { const s = String(text ?? '').trim(); return s.length > max ? `${s.slice(0, max)}…` : s; }

function planParams(plan: VisualPlan): PrefetchMetricsParams {
  return { task: 'trend', dateRange: plan.dateRange, projectId: plan.projectId, contentId: plan.contentId, diseaseId: plan.diseaseId, tenantId: plan.tenantId, granularity: 'day', limit: 180 };
}
function weekKey(date: string): string {
  const d = new Date(`${date}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return date.slice(5);
  const start = new Date(d);
  start.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return start.toISOString().slice(5, 10);
}
function weekly(rows: MetricPoint[]): Derived['weeks'] {
  const map = new Map<string, { label: string; readCount: number; interactionCount: number; pushCount: number }>();
  for (const row of rows) {
    const key = weekKey(row.date);
    const cur = map.get(key) || { label: key, readCount: 0, interactionCount: 0, pushCount: 0 };
    cur.readCount += row.readCount;
    cur.interactionCount += row.interactionCount;
    cur.pushCount += row.pushCount;
    map.set(key, cur);
  }
  return [...map.values()].slice(-12);
}
function derive(metrics: PrefetchMetrics): Derived {
  const rows = metrics.dailyTrend;
  const k = metrics.coreKpi;
  const avg = safeDiv(k.readCount, Math.max(1, rows.length));
  const anomalies = rows
    .filter((x) => avg && (x.readCount > avg * 1.18 || x.readCount < avg * 0.82))
    .map((x) => ({ date: x.date, readCount: x.readCount, diffPct: safeDiv(x.readCount - avg, avg) * 100, label: x.readCount >= avg ? '阅读高峰' : '阅读低谷' }))
    .sort((a, b) => Math.abs(b.diffPct) - Math.abs(a.diffPct))
    .slice(0, 4);
  return {
    readRate: safeDiv(k.readUsers, k.deliveredCount),
    interactionRate: safeDiv(k.interactionCount, k.readCount),
    deliveryRate: safeDiv(k.deliveredCount, k.pushCount),
    dailyAvgRead: avg,
    dailyAvgInteraction: safeDiv(k.interactionCount, Math.max(1, rows.length)),
    bestDay: [...rows].sort((a, b) => b.readCount - a.readCount)[0],
    weakestDay: [...rows].filter((x) => x.readCount > 0).sort((a, b) => a.readCount - b.readCount)[0],
    anomalies,
    weeks: weekly(rows),
    canvasSeries: rows.slice(-90).map((x) => ({ date: x.date, readCount: x.readCount, interactionCount: x.interactionCount, pushCount: x.pushCount })),
  };
}
function insights(metrics: PrefetchMetrics, plan: VisualPlan, d: Derived): string[] {
  const custom = [...(plan.insights || []), ...(plan.conclusions || [])].filter((x): x is string => typeof x === 'string' && Boolean(x.trim())).map((x) => x.trim());
  const generated = [
    `最新月阅读环比 ${delta(metrics.monthDelta.readCountPct)}，互动环比 ${delta(metrics.monthDelta.interactionCountPct)}。`,
    d.bestDay ? `${d.bestDay.date} 是阅读高峰，单日阅读 ${fmt(d.bestDay.readCount)}。` : '',
    metrics.topContent[0] ? `TOP 内容「${short(metrics.topContent[0].title, 22)}」贡献最高，可复用其主题与结构。` : '',
    d.anomalies[0] ? `识别到 ${d.anomalies.length} 个明显波动点，建议结合推送时间与内容主题复盘。` : '',
    ...metrics.insights,
  ].filter(Boolean);
  return [...custom, ...generated].filter((x, i, arr) => arr.indexOf(x) === i).slice(0, 5);
}
function chooseVariant(plan: VisualPlan, d: Derived): LayoutVariant {
  if (plan.layout_variant) return plan.layout_variant;
  const e = (plan.emphasis || []).join('');
  if (/异常|波动/.test(e) || d.anomalies.length >= 3) return 'anomaly_review';
  if (/漏斗|转化/.test(e) || d.readRate < 0.35) return 'funnel_trend';
  if (/内容|TOP|贡献/.test(e)) return 'content_momentum';
  return 'trend_command_center';
}
function themeTokens(theme: VisualPlan['theme'] = 'blue'): string {
  const map = {
    blue: { bg1: '#eef2ff', bg2: '#f8fafc', ink: '#0f172a', muted: '#64748b', panel: 'rgba(255,255,255,.84)', primary: '#2563eb', accent: '#14b8a6', warn: '#f59e0b', danger: '#ef4444', dark: '#0f172a' },
    dark: { bg1: '#020617', bg2: '#111827', ink: '#f8fafc', muted: '#cbd5e1', panel: 'rgba(15,23,42,.76)', primary: '#60a5fa', accent: '#2dd4bf', warn: '#fbbf24', danger: '#fb7185', dark: '#020617' },
    green: { bg1: '#ecfdf5', bg2: '#f8fafc', ink: '#10201b', muted: '#64748b', panel: 'rgba(255,255,255,.84)', primary: '#059669', accent: '#2563eb', warn: '#d97706', danger: '#dc2626', dark: '#064e3b' },
    orange: { bg1: '#fff7ed', bg2: '#fffbeb', ink: '#241407', muted: '#78716c', panel: 'rgba(255,255,255,.84)', primary: '#ea580c', accent: '#2563eb', warn: '#f59e0b', danger: '#dc2626', dark: '#431407' },
  } as const;
  const selected = map[theme] || map.blue;
  return Object.entries(selected).map(([k, v]) => `--${k}:${v};`).join('');
}
function bars(items: Array<{ label: string; value: number; hint?: string }>, maxValue?: number): string {
  const max = maxValue || Math.max(1, ...items.map((x) => x.value));
  return items.map((x, i) => `<div class="rank-row"><div class="rank-index">${i + 1}</div><div class="rank-main"><div class="rank-title">${esc(short(x.label, 32))}</div><div class="track"><div class="fill" style="width:${clamp(safeDiv(x.value, max) * 100, 4, 100).toFixed(1)}%"></div></div>${x.hint ? `<div class="hint">${esc(x.hint)}</div>` : ''}</div><div class="rank-num">${fmt(x.value)}</div></div>`).join('');
}
function weeklyBars(d: Derived): string {
  const max = Math.max(1, ...d.weeks.map((x) => x.readCount));
  return `<div class="weekly-bars">${d.weeks.map((x) => `<div class="week"><b style="height:${clamp(safeDiv(x.readCount, max) * 100, 6, 100).toFixed(1)}%"></b><span>${esc(x.label)}</span><em>${fmt(x.readCount)}</em></div>`).join('')}</div>`;
}
function funnel(metrics: PrefetchMetrics, d: Derived): string {
  const k = metrics.coreKpi;
  const max = Math.max(1, k.pushCount);
  const steps = [
    ['推送', k.pushCount, 1], ['送达', k.deliveredCount, d.deliveryRate], ['阅读人数', k.readUsers, d.readRate], ['互动', k.interactionCount, d.interactionRate],
  ] as Array<[string, number, number]>;
  return `<div class="funnel">${steps.map(([label, value, rate]) => `<div><div class="funnel-head"><b>${esc(label)}</b><span>${fmt(value)}</span></div><div class="funnel-bar"><i style="width:${clamp(safeDiv(value, max) * 100, 8, 100).toFixed(1)}%"></i></div><small>${label === '推送' ? '基准' : `阶段率 ${pct(rate)}`}</small></div>`).join('')}</div>`;
}
function anomalyCards(d: Derived): string {
  const items = d.anomalies.length ? d.anomalies : (d.bestDay ? [{ date: d.bestDay.date, readCount: d.bestDay.readCount, diffPct: 0, label: '阅读高峰' }] : []);
  return items.map((x) => `<article class="anom"><span>${esc(x.label)}</span><strong>${esc(x.date)}</strong><em>${fmt(x.readCount)} 阅读 · ${x.diffPct ? delta(x.diffPct) : '峰值'}</em></article>`).join('');
}
function renderHtml(metrics: PrefetchMetrics, plan: VisualPlan): string {
  const d = derive(metrics);
  const variant = chooseVariant(plan, d);
  const title = plan.title || '患教内容趋势分析';
  const subtitle = plan.subtitle || `${metrics.range.start} 至 ${metrics.range.end} · 阅读、互动与分发转化趋势`;
  const top = metrics.topContent.slice(0, Math.max(5, Math.min(Number(plan.top_content_count || 8), 12)));
  const projects = metrics.projects.slice(0, 6);
  const ins = insights(metrics, plan, d);
  const theme = plan.theme || (variant === 'anomaly_review' ? 'orange' : variant === 'funnel_trend' ? 'green' : 'blue');
  const seriesJson = JSON.stringify(d.canvasSeries);
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width, initial-scale=1"/><title>${esc(title)}</title><style>
:root{${themeTokens(theme)}}*{box-sizing:border-box}html{min-height:100%;background:var(--bg1)}body{min-height:100vh;margin:0;padding:38px;display:grid;place-items:center;background:radial-gradient(circle at 10% 0%,color-mix(in srgb,var(--primary) 24%,transparent),transparent 32%),radial-gradient(circle at 92% 4%,color-mix(in srgb,var(--accent) 18%,transparent),transparent 32%),linear-gradient(135deg,var(--bg1),var(--bg2));font-family:-apple-system,BlinkMacSystemFont,"PingFang SC","Microsoft YaHei",Inter,Arial,sans-serif;color:var(--ink)}.shell{width:1380px;max-width:100%;border-radius:0!important}.stage{position:relative;border-radius:0!important;overflow:visible;border:1px solid color-mix(in srgb,var(--ink) 10%,transparent);background:linear-gradient(120deg,rgba(255,255,255,.88),rgba(255,255,255,.68)),radial-gradient(circle at 8% 0%,color-mix(in srgb,var(--primary) 28%,transparent),transparent 28%),radial-gradient(circle at 92% 8%,color-mix(in srgb,var(--accent) 26%,transparent),transparent 26%),radial-gradient(circle at 48% 110%,rgba(254,215,170,.34),transparent 30%);box-shadow:0 28px 80px rgba(43,37,27,.12);padding:30px}.stage:before{content:"";position:absolute;inset:0;background:conic-gradient(from 120deg,transparent,rgba(37,99,235,.07),transparent,rgba(16,185,129,.06),transparent);pointer-events:none}.stage>*{position:relative;z-index:1}.top{display:grid;grid-template-columns:1fr 380px;gap:18px}.hero{position:relative;overflow:hidden;border-radius:28px;background:linear-gradient(120deg,rgba(255,255,255,.92),rgba(255,255,255,.72)),radial-gradient(circle at 8% 0%,color-mix(in srgb,var(--primary) 26%,transparent),transparent 28%),radial-gradient(circle at 92% 8%,color-mix(in srgb,var(--accent) 26%,transparent),transparent 26%);padding:26px}.hero:after{content:"";position:absolute;right:-80px;top:-80px;width:240px;height:240px;border-radius:999px;background:color-mix(in srgb,var(--primary) 22%,transparent);pointer-events:none}.hero>*{position:relative;z-index:1}.eyebrow{font-size:12px;font-weight:950;letter-spacing:.16em;color:var(--primary)}.title{font-size:46px;font-weight:950;letter-spacing:-.05em;margin:10px 0 8px}.sub{color:var(--muted);line-height:1.55}.headline{border-radius:28px;background:var(--dark);color:white;padding:24px;display:grid;align-content:space-between}.headline span{color:#cbd5e1;font-weight:900;font-size:12px}.headline strong{font-size:42px;letter-spacing:-.05em}.headline p{margin:8px 0 0;color:#e2e8f0}.kpis{display:grid;grid-template-columns:repeat(5,1fr);gap:12px;margin-top:16px}.kpi{border-radius:22px;background:var(--panel);border:1px solid color-mix(in srgb,var(--ink) 10%,transparent);padding:16px}.kpi span{font-size:12px;color:var(--muted);font-weight:900}.kpi strong{display:block;font-size:30px;margin-top:8px;color:var(--primary)}.kpi small{display:block;margin-top:6px;color:var(--muted);font-weight:750}.grid{display:grid;grid-template-columns:1.15fr .85fr;gap:16px;margin-top:16px}.panel{border-radius:26px;background:var(--panel);border:1px solid color-mix(in srgb,var(--ink) 10%,transparent);padding:20px}.panel h2{margin:0 0 14px;font-size:21px}.kicker{font-size:12px;color:var(--muted);font-weight:950;letter-spacing:.1em;margin-bottom:10px}.canvas-wrap{height:320px;position:relative}.canvas-wrap canvas{width:100%;height:100%;display:block}.weekly-bars{height:240px;display:flex;align-items:flex-end;gap:9px;border-bottom:1px solid color-mix(in srgb,var(--ink) 12%,transparent);padding:8px 6px 28px}.week{position:relative;flex:1;height:100%;display:flex;align-items:flex-end}.week b{width:100%;border-radius:12px 12px 3px 3px;background:linear-gradient(180deg,var(--accent),var(--primary));min-height:8px}.week span{position:absolute;bottom:-25px;left:50%;transform:translateX(-50%);font-size:11px;color:var(--muted);white-space:nowrap}.week em{position:absolute;top:-17px;left:50%;transform:translateX(-50%);font-size:11px;font-style:normal;font-weight:850}.rank-row{display:grid;grid-template-columns:26px 1fr 84px;gap:12px;align-items:center;margin:12px 0}.rank-index{width:26px;height:26px;border-radius:9px;background:color-mix(in srgb,var(--primary) 14%,white);color:var(--primary);font-weight:950;display:grid;place-items:center}.rank-title{font-weight:850;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.rank-num{text-align:right;font-weight:950;color:var(--primary)}.track{height:10px;border-radius:999px;background:color-mix(in srgb,var(--muted) 18%,transparent);overflow:hidden;margin-top:7px}.fill{height:100%;border-radius:999px;background:linear-gradient(90deg,var(--primary),var(--accent))}.hint{font-size:11px;color:var(--muted);margin-top:4px}.funnel{display:grid;gap:13px}.funnel-head{display:flex;justify-content:space-between;font-weight:900}.funnel-bar{height:24px;border-radius:999px;background:color-mix(in srgb,var(--muted) 16%,transparent);overflow:hidden;margin:8px 0 3px}.funnel-bar i{display:block;height:100%;border-radius:999px;background:linear-gradient(90deg,var(--primary),var(--accent))}.funnel small{color:var(--muted);font-weight:750}.anoms{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-top:16px}.anom{border-radius:20px;background:color-mix(in srgb,var(--warn) 10%,white);border:1px solid color-mix(in srgb,var(--warn) 24%,transparent);padding:14px}.anom span{font-size:12px;color:var(--muted);font-weight:900}.anom strong{display:block;margin-top:8px;font-size:22px}.anom em{display:block;margin-top:6px;font-style:normal;color:var(--muted);font-weight:750}.insights{display:grid;grid-template-columns:repeat(5,1fr);gap:12px;margin-top:16px}.insight{border-radius:20px;background:color-mix(in srgb,var(--primary) 7%,white);border:1px solid color-mix(in srgb,var(--primary) 15%,transparent);padding:14px;min-height:108px}.insight b{display:block;color:var(--primary);font-size:12px;margin-bottom:8px}.insight span{font-size:13px;font-weight:850;line-height:1.42}.footer{text-align:right;color:var(--muted);font-size:12px;margin-top:14px}.layout-funnel_trend .funnel-panel{order:-1}.layout-content_momentum .grid{grid-template-columns:.9fr 1.1fr}@media(max-width:1000px){body{padding:0}.top,.grid{grid-template-columns:1fr}.kpis,.anoms,.insights{grid-template-columns:repeat(2,1fr)}}
</style></head><body><main class="shell"><section class="stage layout-${variant}" data-export-root><div class="top"><div class="hero"><div class="eyebrow">PX TREND · ${esc(variant.replace(/_/g, ' ').toUpperCase())}</div><div class="title">${esc(title)}</div><div class="sub">${esc(subtitle)} · 数据源：${esc(metrics.source)}</div></div><div class="headline"><span>最新月阅读环比</span><strong>${delta(metrics.monthDelta.readCountPct)}</strong><p>日均阅读 ${fmt(d.dailyAvgRead)}，日均互动 ${fmt(d.dailyAvgInteraction)}。</p></div></div><section class="kpis"><article class="kpi"><span>累计阅读</span><strong>${fmt(metrics.coreKpi.readCount)}</strong><small>${metrics.range.days} 天</small></article><article class="kpi"><span>累计互动</span><strong>${fmt(metrics.coreKpi.interactionCount)}</strong><small>${delta(metrics.monthDelta.interactionCountPct)}</small></article><article class="kpi"><span>送达率</span><strong>${pct(d.deliveryRate)}</strong><small>推送 → 送达</small></article><article class="kpi"><span>阅读转化</span><strong>${pct(d.readRate)}</strong><small>送达 → 阅读</small></article><article class="kpi"><span>完读率</span><strong>${pct(metrics.coreKpi.finishRate)}</strong><small>均读 ${(metrics.coreKpi.avgReadSec || 0).toFixed(0)} 秒</small></article></section><section class="grid"><div class="panel"><div class="kicker">DAILY TREND</div><h2>日级阅读与互动走势</h2><div class="canvas-wrap"><canvas id="trendChart" width="760" height="320"></canvas></div></div><div class="panel funnel-panel"><div class="kicker">FUNNEL QUALITY</div><h2>分发转化漏斗</h2>${funnel(metrics, d)}</div><div class="panel"><div class="kicker">WEEKLY RHYTHM</div><h2>周度阅读节奏</h2>${weeklyBars(d)}</div><div class="panel"><div class="kicker">CONTENT MOMENTUM</div><h2>TOP 内容贡献</h2>${bars(top.map((x) => ({ label: x.title, value: x.readCount, hint: `${x.projectName || '未分组'} · 完读 ${pct(x.finishRate)}` })))}</div><div class="panel"><div class="kicker">PROJECT CONTRIBUTION</div><h2>项目贡献</h2>${bars(projects.map((x) => ({ label: x.name, value: x.readCount, hint: `互动 ${fmt(x.interactionCount)} · 内容 ${fmt(x.contentCount)}` })))}</div></section><section class="anoms">${anomalyCards(d)}</section><section class="insights">${ins.map((x, i) => `<article class="insight"><b>INSIGHT ${i + 1}</b><span>${esc(x)}</span></article>`).join('')}</section><div class="footer">Generated at ${esc(metrics.generatedAt)} · ${esc(metrics.range.start)} → ${esc(metrics.range.end)} · HTML screenshot</div></section></main><script>
const series=${seriesJson};
const canvas=document.getElementById('trendChart');const ctx=canvas.getContext('2d');const W=canvas.width,H=canvas.height,pad=38;const max=Math.max(1,...series.map(d=>d.readCount));ctx.clearRect(0,0,W,H);ctx.strokeStyle='rgba(100,116,139,.25)';ctx.lineWidth=1;for(let i=0;i<5;i++){const y=pad+(H-pad*2)*i/4;ctx.beginPath();ctx.moveTo(pad,y);ctx.lineTo(W-pad,y);ctx.stroke();}function x(i){return pad+(W-pad*2)*(series.length<=1?0:i/(series.length-1))}function y(v){return H-pad-(H-pad*2)*(v/max)}const grad=ctx.createLinearGradient(0,pad,0,H-pad);grad.addColorStop(0,'rgba(37,99,235,.24)');grad.addColorStop(1,'rgba(20,184,166,.02)');ctx.beginPath();series.forEach((d,i)=>{const xx=x(i),yy=y(d.readCount);if(i===0)ctx.moveTo(xx,yy);else ctx.lineTo(xx,yy)});ctx.lineTo(x(series.length-1),H-pad);ctx.lineTo(x(0),H-pad);ctx.closePath();ctx.fillStyle=grad;ctx.fill();ctx.beginPath();series.forEach((d,i)=>{const xx=x(i),yy=y(d.readCount);if(i===0)ctx.moveTo(xx,yy);else ctx.lineTo(xx,yy)});ctx.strokeStyle=getComputedStyle(document.documentElement).getPropertyValue('--primary').trim()||'#2563eb';ctx.lineWidth=4;ctx.lineJoin='round';ctx.stroke();series.filter((_,i)=>i%Math.max(1,Math.floor(series.length/8))===0).forEach((d)=>{const i=series.indexOf(d);ctx.fillStyle='rgba(100,116,139,.9)';ctx.font='12px sans-serif';ctx.fillText(d.date.slice(5),x(i)-16,H-12)});ctx.fillStyle='rgba(15,23,42,.75)';ctx.font='bold 13px sans-serif';ctx.fillText('阅读次数',pad,20);
</script></body></html>`;
}
function renderMarkdown(metrics: PrefetchMetrics, plan: VisualPlan): string {
  const d = derive(metrics);
  const topRows = metrics.topContent.slice(0, 8).map((x, i) => `| ${i + 1} | ${x.title.replace(/\|/g, ' ')} | ${fmt(x.readCount)} | ${fmt(x.interactionCount)} | ${pct(x.finishRate)} |`).join('\n');
  const projectRows = metrics.projects.slice(0, 8).map((x, i) => `| ${i + 1} | ${x.name.replace(/\|/g, ' ')} | ${fmt(x.readCount)} | ${fmt(x.interactionCount)} |`).join('\n');
  return `# ${plan.title || '患教内容趋势分析'}\n\n> 数据窗口：${metrics.range.start} 至 ${metrics.range.end}\n\n## 核心变化\n\n- 阅读量：${fmt(metrics.coreKpi.readCount)}，最新月环比 ${delta(metrics.monthDelta.readCountPct)}\n- 互动量：${fmt(metrics.coreKpi.interactionCount)}，最新月环比 ${delta(metrics.monthDelta.interactionCountPct)}\n- 推送量：${fmt(metrics.coreKpi.pushCount)}，最新月环比 ${delta(metrics.monthDelta.pushCountPct)}\n- 阅读转化：${pct(d.readRate)}；完读率：${pct(metrics.coreKpi.finishRate)}\n\n## 趋势判断\n\n${insights(metrics, plan, d).map((x) => `- ${x}`).join('\n')}\n\n## 异常波动\n\n${d.anomalies.map((x) => `- ${x.date}：${x.label}，阅读 ${fmt(x.readCount)}，相对日均 ${delta(x.diffPct)}`).join('\n') || '- 暂未发现显著异常波动。'}\n\n## TOP 内容贡献\n\n| 排名 | 内容 | 阅读 | 互动 | 完读率 |\n|---:|---|---:|---:|---:|\n${topRows}\n\n## 项目贡献\n\n| 排名 | 项目 | 阅读 | 互动 |\n|---:|---|---:|---:|\n${projectRows}\n\n## 运营建议\n\n- 复用阅读和完读表现靠前内容的主题与表达方式。\n- 对低完读率内容做标题、篇幅和结构优化。\n- 保持周度节奏监控，结合异常高峰复盘推送时间与内容主题。\n`;
}
async function screenshotHtmlToPng(htmlPath: string, pngPath: string): Promise<void> {
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
  try {
    const page = await browser.newPage({ viewport: { width: 1460, height: 1300 }, deviceScaleFactor: 2 });
    await page.goto(pathToFileURL(htmlPath).toString(), { waitUntil: 'networkidle' });
    await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
    await page.evaluate(() => {
      const root = document.querySelector('[data-export-root]') as HTMLElement | null;
      if (root) { root.style.borderRadius = '0px'; root.style.overflow = 'visible'; }
    });
    await page.locator('[data-export-root]').first().screenshot({ path: pngPath, omitBackground: false });
  } finally { await browser.close(); }
}

const outputDir = path.resolve(arg('--output-dir', 'ai-helper/generated'));
const prefix = cleanFileName(arg('--prefix', 'trend'), 'trend').replace(/\.(html|png|json|md)$/i, '');
const plan = parseJson<VisualPlan>(arg('--visual-plan', '{}'));
const metrics = await prefetchMetrics(planParams(plan));
const d = derive(metrics);
await fs.mkdir(outputDir, { recursive: true });
const htmlPath = path.join(outputDir, `${prefix}_canvas.html`);
const pngPath = path.join(outputDir, `${prefix}_canvas.png`);
const reportPath = path.join(outputDir, `${prefix}_report.md`);
const metricsPath = path.join(outputDir, `${prefix}_metrics.json`);
const manifestPath = path.join(outputDir, `${prefix}_manifest.json`);
await fs.writeFile(htmlPath, renderHtml(metrics, plan), 'utf8');
await fs.writeFile(reportPath, renderMarkdown(metrics, plan), 'utf8');
await fs.writeFile(metricsPath, JSON.stringify({ metrics, derived: d, visual_plan: plan }, null, 2), 'utf8');
await screenshotHtmlToPng(htmlPath, pngPath);
const helperRoot = path.resolve(process.cwd(), 'ai-helper');
const rel = (file: string) => `/${path.relative(helperRoot, file).split(path.sep).join('/')}`;
const manifest = { skill_id: 'patient-education-trend-analysis', renderer: 'trend-html-renderer-v2', generated_at: new Date().toISOString(), files: { report: rel(reportPath), html: rel(htmlPath), png: rel(pngPath), metrics_json: rel(metricsPath) }, period: metrics.range, derived: d, visual_plan: plan, source: metrics.source };
await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2), 'utf8');
console.log(JSON.stringify({ ok: true, kind: 'trend_template_assets_v2', files: [reportPath, htmlPath, pngPath, manifestPath, metricsPath].map(rel), file: rel(pngPath), report: rel(reportPath), html: rel(htmlPath), png: rel(pngPath), manifest: rel(manifestPath), metrics_json: rel(metricsPath), period: metrics.range, derived: d }));
