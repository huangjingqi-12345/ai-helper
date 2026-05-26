import fs from 'fs/promises';
import path from 'path';
import { pathToFileURL } from 'url';
import { chromium } from 'playwright';
import type { AiTaskKind, GeneratedArtifactSet, PrefetchMetrics } from './types.js';
import { safeGeneratedPath, toAssetPath } from './paths.js';

function escHtml(s: string): string { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
function fmt(n: number): string { return Math.round(n || 0).toLocaleString('zh-CN'); }
function pct(n: number): string { return `${((n || 0) * 100).toFixed(1)}%`; }
function delta(n: number): string { return `${n >= 0 ? '+' : ''}${(n || 0).toFixed(1)}%`; }
function taskTitle(task: AiTaskKind): string {
  const titles: Record<AiTaskKind, string> = {
    overview: '患教数据概览',
    monthly: '患教月度报告',
    ppt: '患教汇报 PPT',
    'data-qa': '患教数据问答',
    chat: '患教数据分析',
  };
  return titles[task];
}

function buildHtml(task: AiTaskKind, metrics: PrefetchMetrics, answer: string): string {
  const k = metrics.coreKpi;
  const top = metrics.topContent.slice(0, 6);
  const maxTop = Math.max(1, ...top.map((t) => t.readCount));
  const months = metrics.monthlyTrend.slice(-8);
  const maxMonth = Math.max(1, ...months.map((m) => m.readCount));
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width, initial-scale=1"/><title>${escHtml(taskTitle(task))}</title><style>
  *{box-sizing:border-box}html{min-height:100%;background:#f8fafc}body{min-height:100vh;margin:0;background:radial-gradient(circle at 12% 8%,rgba(199,210,254,.55),transparent 30%),radial-gradient(circle at 88% 16%,rgba(153,246,228,.45),transparent 32%),radial-gradient(circle at 48% 105%,rgba(254,215,170,.35),transparent 30%),linear-gradient(135deg,#f8fafc 0%,#eef2ff 48%,#f1f5f9 100%);color:#0f172a;font-family:-apple-system,BlinkMacSystemFont,"PingFang SC","Microsoft YaHei",Segoe UI,sans-serif;padding:40px;display:grid;place-items:center}.stage{position:relative;width:1200px;max-width:100%;margin:auto;padding:28px;border-radius:0!important;overflow:visible;border:1px solid rgba(15,23,42,.10);background:linear-gradient(120deg,rgba(255,255,255,.92),rgba(255,255,255,.72)),radial-gradient(circle at 8% 0%,#c7d2fe,transparent 28%),radial-gradient(circle at 92% 8%,#99f6e4,transparent 26%);box-shadow:0 28px 80px rgba(43,37,27,.12)}.stage:before{content:"";position:absolute;inset:0;background:conic-gradient(from 120deg,transparent,rgba(37,99,235,.07),transparent,rgba(16,185,129,.06),transparent);pointer-events:none}.stage>*{position:relative;z-index:1}.hero{display:flex;justify-content:space-between;gap:24px;align-items:flex-end;margin-bottom:22px}.eyebrow{font-size:12px;color:#2563eb;font-weight:900;letter-spacing:.14em}.title{font-size:40px;line-height:1.05;font-weight:900;letter-spacing:-.04em;margin:8px 0;color:#0f172a}.sub{font-size:14px;color:#64748b;line-height:1.55}.grid{display:grid;grid-template-columns:repeat(4,1fr);gap:14px}.card{background:linear-gradient(180deg,rgba(255,255,255,.92),rgba(248,250,252,.88));border:1px solid rgba(15,23,42,.10);border-radius:24px;padding:16px;box-shadow:inset 0 1px rgba(255,255,255,.8)}.label{font-size:12px;color:#64748b;font-weight:900;margin-bottom:8px}.value{font-size:30px;font-weight:900;letter-spacing:-.03em;margin-top:8px;color:#0f172a}.main{display:grid;grid-template-columns:1.15fr .85fr;gap:18px;margin-top:18px}.section-title{font-size:18px;font-weight:900;letter-spacing:-.02em;margin-bottom:14px;color:#0f172a}.bar{height:12px;border-radius:999px;background:rgba(100,116,139,.18);overflow:hidden}.bar>span{display:block;height:100%;border-radius:999px;background:linear-gradient(90deg,#2563eb,#10b981)}.row{display:grid;grid-template-columns:1fr 90px;gap:12px;margin:12px 0;align-items:center;font-size:13px}.insight{padding:12px 14px;border-radius:16px;background:rgba(15,23,42,.045);border:1px solid rgba(15,23,42,.10);margin:9px 0;color:#172033;font-weight:750;line-height:1.45}.answer{white-space:pre-wrap;line-height:1.7;font-size:13px;color:#334155;max-height:210px;overflow:hidden}.trend{display:flex;align-items:flex-end;gap:8px;height:145px;margin-top:8px}.col{flex:1;background:linear-gradient(180deg,#60a5fa,#2563eb);border-radius:8px 8px 3px 3px;min-height:8px}.footer{margin-top:18px;color:#64748b;font-size:12px;text-align:right}@media(max-width:900px){body{padding:0}.hero{display:block}.grid,.main{grid-template-columns:1fr 1fr}.stage{max-width:100%}}
  </style></head><body><main class="stage" data-export-root><div class="hero"><div><div class="eyebrow">PX AI HELPER</div><h1 class="title">${escHtml(taskTitle(task))}</h1><div class="sub">统计窗口：${escHtml(metrics.range.start)} 至 ${escHtml(metrics.range.end)} · 数据来源：${escHtml(metrics.source)}</div></div><div class="card" style="width:260px"><div class="label">最新月 ${escHtml(metrics.latestMonth.key)}</div><div class="value">${delta(metrics.monthDelta.readCountPct)}</div><div class="sub">阅读环比变化</div></div></div><section class="grid"><div class="card"><div class="label">累计推送</div><div class="value">${fmt(k.pushCount)}</div></div><div class="card"><div class="label">累计阅读</div><div class="value">${fmt(k.readCount)}</div></div><div class="card"><div class="label">阅读用户</div><div class="value">${fmt(k.readUsers)}</div></div><div class="card"><div class="label">完成率</div><div class="value">${pct(k.finishRate)}</div></div></section><section class="main"><div class="card"><div class="section-title">月度变化</div><div class="trend">${months.map((m) => `<div class="col" title="${escHtml(m.month)} ${fmt(m.readCount)}" style="height:${Math.max(8, (m.readCount / maxMonth) * 140)}px"></div>`).join('')}</div><div class="section-title" style="margin-top:18px">Top 内容</div>${top.map((t) => `<div class="row"><div><div style="font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${escHtml(t.title)}</div><div class="bar"><span style="width:${Math.max(4, (t.readCount / maxTop) * 100)}%"></span></div></div><div>${fmt(t.readCount)}</div></div>`).join('')}</div><div class="card"><div class="section-title">AI 洞察</div>${metrics.insights.map((x) => `<div class="insight">${escHtml(x)}</div>`).join('')}<div class="section-title" style="margin-top:16px">总结</div><div class="answer">${escHtml(answer)}</div></div></section><div class="footer">Generated at ${escHtml(metrics.generatedAt)}</div></main></body></html>`;
}
function markdown(task: AiTaskKind, metrics: PrefetchMetrics, answer: string): string {
  const k = metrics.coreKpi;
  const topRows = metrics.topContent.slice(0, 10).map((t, i) => `| ${i + 1} | ${t.title.replace(/\|/g, ' ')} | ${fmt(t.readCount)} | ${fmt(t.interactionCount)} | ${pct(t.finishRate)} |`).join('\n');
  return `# ${taskTitle(task)}\n\n> 数据窗口：${metrics.range.start} 至 ${metrics.range.end}；生成时间：${metrics.generatedAt}\n\n## 核心指标\n\n| 指标 | 数值 |\n| --- | ---: |\n| 项目数 | ${fmt(k.projectCount)} |\n| 内容数 | ${fmt(k.contentCount)} |\n| 累计推送 | ${fmt(k.pushCount)} |\n| 累计阅读 | ${fmt(k.readCount)} |\n| 阅读用户 | ${fmt(k.readUsers)} |\n| 累计互动 | ${fmt(k.interactionCount)} |\n| 完成率 | ${pct(k.finishRate)} |\n\n## Top 内容\n\n| 排名 | 内容 | 阅读 | 互动 | 完成率 |\n| ---: | --- | ---: | ---: | ---: |\n${topRows || '| — | 暂无 | 0 | 0 | 0% |'}\n\n## AI 总结\n\n${answer}\n`;
}
async function renderHtmlToPng(htmlPath: string, pngPath: string): Promise<void> {
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: 2 });
    await page.goto(pathToFileURL(htmlPath).toString(), { waitUntil: 'networkidle' });
    await page.evaluate(() => {
      const root = document.querySelector('[data-export-root]') as HTMLElement | null;
      if (root) { root.style.borderRadius = '0px'; root.style.overflow = 'visible'; }
    });
    const root = page.locator('[data-export-root]').first();
    await root.screenshot({ path: pngPath, omitBackground: false });
  } finally { await browser.close(); }
}
async function renderPdfWithPlaywright(htmlPath: string, pdfPath: string): Promise<void> {
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
  try {
    const page = await browser.newPage({ viewport: { width: 900, height: 1200 } });
    await page.goto(pathToFileURL(htmlPath).toString(), { waitUntil: 'networkidle' });
    await page.pdf({ path: pdfPath, format: 'A4', printBackground: true, margin: { top: '18mm', right: '14mm', bottom: '18mm', left: '14mm' } });
  } finally { await browser.close(); }
}

export async function generateArtifacts(task: AiTaskKind, metrics: PrefetchMetrics, answer: string, rootDir: string, _unused = '', extraFiles: string[] = []): Promise<GeneratedArtifactSet> {
  const prefix = task === 'chat' || task === 'data-qa' ? 'overview' : task;
  const title = taskTitle(task);
  const htmlPath = safeGeneratedPath(rootDir, `${prefix}_canvas.html`);
  const pngPath = safeGeneratedPath(rootDir, `${prefix}_canvas.png`);
  const mdPath = safeGeneratedPath(rootDir, `${prefix}_report.md`);
  const pdfPath = safeGeneratedPath(rootDir, `${prefix}_report.pdf`);
  const metricsPath = safeGeneratedPath(rootDir, `${prefix}_metrics.json`);
  const manifestPath = safeGeneratedPath(rootDir, `${prefix}_manifest.json`);
  await fs.writeFile(htmlPath, buildHtml(task, metrics, answer), 'utf8');
  await fs.writeFile(mdPath, markdown(task, metrics, answer), 'utf8');
  await fs.writeFile(metricsPath, JSON.stringify(metrics, null, 2), 'utf8');
  await Promise.all([renderHtmlToPng(htmlPath, pngPath), renderPdfWithPlaywright(htmlPath, pdfPath)]);
  const files = [mdPath, htmlPath, pngPath, pdfPath];
  const relFiles = [...files.map(toAssetPath), ...extraFiles];
  await fs.writeFile(manifestPath, JSON.stringify({ schema_version: 'px-ai-helper-manifest/v1', task, generated_at: new Date().toISOString(), files: relFiles, data_sources: [metrics.source] }, null, 2), 'utf8');
  return { rootDir, relRoot: path.dirname(toAssetPath(mdPath)), files: relFiles, title, task };
}
