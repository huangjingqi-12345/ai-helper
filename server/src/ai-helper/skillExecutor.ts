import fs from 'fs';
import fsp from 'fs/promises';
import path from 'path';
import { execFile, execFileSync } from 'child_process';
import { fileURLToPath } from 'url';
import { AI_HELPER_ROOT, GENERATED_DIR, PROJECTS_DIR, safeGeneratedPath, toAssetPath } from './paths.js';
import { renderPptDeckFromSpecs } from './pptSpecRenderer.js';

export interface SkillCall {
  type: 'skill_call';
  skill_id: string;
  action: string;
  params?: Record<string, unknown>;
  thought?: string;
}

export interface SkillResult {
  ok: boolean;
  summary: string;
  detail?: Record<string, unknown>;
  error?: string;
  files?: string[];
  file?: string;
  [key: string]: unknown;
}

export class SkillExecutionError extends Error {}

export interface SkillExecutorOptions {
  allowManualPptSvg?: boolean;
}

type ScriptRun = { stdout: string; stderr: string; command: string; duration_ms: number };

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SERVER_ROOT = path.resolve(__dirname, '../..');
const WORKSPACE_ROOT = path.resolve(SERVER_ROOT, '..');
const SKILLS_DIR = path.join(AI_HELPER_ROOT, 'skills');
const PPT_MANUAL_EXPORT_SCRIPTS = new Set(['total_md_split.py', 'finalize_svg.py', 'svg_to_pptx.py', 'validate_editable_pptx.py']);
const BINARY_EXTS = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif', '.pdf', '.ppt', '.pptx', '.xlsx', '.xls']);
const RUN_OUTPUT_DIR_SKILLS = new Set(['html-to-png', 'patient-education-data-overview']);
const PPT_SVG_BATCH_MAX_PAGES = Math.max(1, Number(process.env.PPT_SVG_BATCH_MAX_PAGES || 1) || 1);
const PPT_MANUAL_SVG_ENABLED = process.env.AI_HELPER_PPT_MANUAL_SVG === 'true';

function str(value: unknown): string { return String(value ?? '').trim(); }
function basenameOnly(value: string): string { return path.basename(value.replace(/\\/g, '/')); }
function jsonResult(summary: string, detail: Record<string, unknown> = {}, extra: Record<string, unknown> = {}): SkillResult {
  return { ok: true, summary, detail, ...extra };
}

function safeUnder(base: string, rel: string): string {
  const out = path.resolve(base, rel.replace(/^\/+/, ''));
  if (!out.startsWith(path.resolve(base))) throw new SkillExecutionError('invalid path outside allowed directory');
  return out;
}

function normalizePptProjectRel(project: string, relPath: string): { rel: string; original_rel: string; moved_from?: string } {
  const projectClean = project.replace(/\\/g, '/').replace(/^\/+|\/+$/g, '');
  let rel = relPath.replace(/\\/g, '/').replace(/^\/+/, '').trim();
  if (projectClean && (rel === projectClean || rel.startsWith(`${projectClean}/`))) rel = rel.slice(projectClean.length).replace(/^\/+/, '');
  const projectIndex = projectClean ? rel.indexOf(`${projectClean}/`) : -1;
  if (projectIndex >= 0) rel = rel.slice(projectIndex + projectClean.length + 1);
  const originalRel = rel;
  const lower = rel.toLowerCase();
  const base = basenameOnly(rel);

  if (lower.includes('/svg_output/')) rel = `svg_output/${base}`;
  else if (lower.endsWith('.svg') && !lower.startsWith('svg_output/')) rel = `svg_output/${base}`;
  else if (base.toLowerCase() === 'total.md' && lower !== 'notes/total.md') rel = 'notes/total.md';
  else if (['design_spec.md', 'spec_lock.md'].includes(base.toLowerCase()) && rel !== base) rel = base;

  rel = rel.replace(/^\/+/, '');
  if (!rel || rel.split('/').includes('..')) throw new SkillExecutionError('invalid project file path');
  return { rel, original_rel: originalRel, moved_from: originalRel !== rel ? originalRel : undefined };
}

function repairPptProjectLayoutSync(root: string): Array<{ from: string; to: string; skipped?: boolean; reason: string }> {
  const moved: Array<{ from: string; to: string; skipped?: boolean; reason: string }> = [];
  if (!fs.existsSync(root)) return moved;
  const svgDir = path.join(root, 'svg_output');
  const notesDir = path.join(root, 'notes');
  fs.mkdirSync(svgDir, { recursive: true });
  fs.mkdirSync(notesDir, { recursive: true });

  const visit = (dir: string) => {
    for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
      const abs = path.join(dir, ent.name);
      const rel = path.relative(root, abs).split(path.sep).join('/');
      if (ent.isDirectory()) {
        if (['svg_output', 'exports', 'notes'].includes(rel.split('/')[0])) continue;
        visit(abs);
        continue;
      }
      const lower = rel.toLowerCase();
      let target = '';
      let reason = '';
      if (lower.endsWith('.svg') && !lower.startsWith('svg_output/')) {
        target = path.join(svgDir, path.basename(abs));
        reason = 'misplaced_svg';
      } else if (path.basename(lower) === 'total.md' && lower !== 'notes/total.md') {
        target = path.join(notesDir, 'total.md');
        reason = 'misplaced_notes';
      }
      if (!target || path.resolve(target) === path.resolve(abs)) continue;
      const item = { from: relToHelper(abs), to: relToHelper(target), reason } as { from: string; to: string; skipped?: boolean; reason: string };
      if (fs.existsSync(target)) {
        item.skipped = true;
        moved.push(item);
        continue;
      }
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.renameSync(abs, target);
      moved.push(item);
    }
  };
  visit(root);
  return moved;
}

function relToHelper(abs: string): string {
  return `/${path.relative(AI_HELPER_ROOT, abs).split(path.sep).join('/')}`;
}

function pythonHasModules(command: string, modules: string[]): boolean {
  if (!modules.length) return true;
  try {
    execFileSync(command, ['-c', `import ${modules.join(',')}`], { stdio: 'ignore', timeout: 5000 });
    return true;
  } catch {
    return false;
  }
}

function pythonExecutable(requiredModules: string[] = []): string {
  const configured = str(process.env.PPT_MASTER_PYTHON || process.env.PYTHON);
  const candidates = [
    configured,
    path.join(WORKSPACE_ROOT, 'ai-helper', '.venv', 'bin', 'python'),
    path.join(path.resolve(WORKSPACE_ROOT, '..'), 'ai-helper', '.venv', 'bin', 'python'),
    path.join(process.env.HOME || '', 'Downloads', 'ai', '.venv', 'bin', 'python'),
    'python3',
  ].filter(Boolean);
  const unique = [...new Set(candidates)];
  for (const candidate of unique) {
    if (candidate !== 'python3' && !fs.existsSync(candidate)) continue;
    if (pythonHasModules(candidate, requiredModules)) return candidate;
  }
  return unique.find((candidate) => candidate === 'python3' || fs.existsSync(candidate)) || 'python3';
}

function tsxExecutable(): string {
  const local = path.join(SERVER_ROOT, 'node_modules', '.bin', process.platform === 'win32' ? 'tsx.cmd' : 'tsx');
  return fs.existsSync(local) ? local : 'tsx';
}

async function exec(command: string, args: string[], cwd = SERVER_ROOT, timeout = 300_000): Promise<ScriptRun> {
  const started = Date.now();
  const rendered = [command, ...args].join(' ');
  return new Promise((resolve, reject) => {
    execFile(command, args, { cwd, timeout, maxBuffer: 50 * 1024 * 1024, env: process.env }, (error, stdout, stderr) => {
      if (error) reject(new SkillExecutionError(`${rendered}\n${stderr || stdout || error.message}`));
      else resolve({ stdout, stderr, command: rendered, duration_ms: Date.now() - started });
    });
  });
}

function parseLastJson(stdout: string): Record<string, unknown> | undefined {
  for (const line of stdout.split(/\r?\n/).reverse()) {
    const t = line.trim();
    if (!t.startsWith('{')) continue;
    try {
      const parsed = JSON.parse(t);
      if (parsed && typeof parsed === 'object') return parsed;
    } catch {
      // ignore
    }
  }
  return undefined;
}

function normalizeGeneratedName(raw: unknown): string {
  let name = str(raw).replace(/\\/g, '/').replace(/^\/+/, '');
  if (name.startsWith('generated/')) name = name.slice('generated/'.length);
  name = basenameOnly(name);
  if (!name || name === '.' || name === '..' || name.includes('/')) throw new SkillExecutionError('file_name 只能是纯文件名');
  return name;
}

function compactParamsForError(params: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(params)) {
    if (typeof value === 'string' && value.length > 800) {
      out[key] = `${value.slice(0, 800)}...[truncated ${value.length - 800} chars]`;
    } else if (Array.isArray(value)) {
      out[key] = value.map((item) => (typeof item === 'string' && item.length > 800 ? `${item.slice(0, 800)}...[truncated ${item.length - 800} chars]` : item));
    } else {
      out[key] = value;
    }
  }
  return out;
}

function clipText(value: unknown, maxChars: number): string | undefined {
  if (typeof value !== 'string' || !value.trim()) return undefined;
  return value.length > maxChars ? `${value.slice(0, maxChars)}...[truncated ${value.length - maxChars} chars]` : value;
}

function compactSkillResultForContext(result: SkillResult): SkillResult {
  const out: SkillResult = {
    ok: result.ok,
    summary: result.summary,
  };
  if (result.error) out.error = result.error;
  if (result.recoverable !== undefined) out.recoverable = result.recoverable;
  if (result.detail) out.detail = result.detail;
  if (result.file) out.file = result.file;
  if (Array.isArray(result.files)) out.files = result.files;
  if (typeof result.text === 'string') out.text = clipText(result.text, 2000);
  if (result.project_path) out.project_path = result.project_path;
  if (result.background !== undefined) out.background = result.background;

  const json = result.json;
  if (json && typeof json === 'object' && !Array.isArray(json)) {
    const obj = json as Record<string, unknown>;
    if (obj.kind === 'px_metrics') {
      const detail = result.detail && typeof result.detail === 'object' ? result.detail as Record<string, unknown> : {};
      out.detail = { kind: detail.kind, duration_ms: detail.duration_ms };
      out.json = {
        ok: obj.ok,
        kind: obj.kind,
        params: obj.params,
        metrics: obj.metrics || obj.metrics_summary,
        note: obj.note,
      };
    } else if (obj.kind === 'px_data_qa_context') {
      out.json = {
        ok: obj.ok,
        kind: obj.kind,
        context: obj.context,
        metrics_summary: obj.metrics_summary,
      };
    } else {
      out.json = obj;
    }
  }

  const stderr = clipText(result.stderr, result.ok === false ? 3000 : 800);
  if (stderr) out.stderr = stderr;
  if (result.ok === false) {
    const stdout = clipText(result.stdout, 3000);
    if (stdout) out.stdout = stdout;
  }
  return out;
}

function validateSpecLock(content: string): void {
  const lower = content.toLowerCase();
  const forbidden = ['page_plan', 'page_titles', 'page_layouts', 'page_charts', 'latest_month', 'fixed page titles', '固定页标题', '固定结论', '累计阅读', '累计推送'];
  const hit = forbidden.find((x) => lower.includes(x));
  if (hit) throw new SkillExecutionError(`spec_lock.md 只能包含视觉/技术约束，不能锁定 PPT 内容或数据；发现 ${hit}`);
}

function stripCodeFence(content: string): string {
  const trimmed = content.trim();
  const match = trimmed.match(/^```(?:svg|xml)?\s*([\s\S]*?)\s*```$/i);
  return match ? match[1].trim() : content;
}

function normalizePptSvgCanvas(target: string, rawContent: string): { content: string; repaired: boolean } {
  if (!target.includes('/svg_output/') || !target.endsWith('.svg')) return { content: rawContent, repaired: false };
  let content = stripCodeFence(rawContent).trim();
  const tag = content.match(/<svg\b[^>]*>/i)?.[0] || '';
  let repaired = false;
  if (!tag) {
    const hasSvgChildren = /<(?:defs|g|rect|circle|ellipse|line|polyline|polygon|path|text|tspan|image|linearGradient|radialGradient|clipPath|mask)\b/i.test(content);
    const looksLikeTextOnly = !/[<>]/.test(content) || /^#+\s|^[-*]\s|\b(svg|页面|幻灯片|这里|以下)\b/i.test(content.slice(0, 120));
    if (!hasSvgChildren || looksLikeTextOnly) throw new SkillExecutionError('PPT SVG 缺少根 <svg> 标签');
    content = `<svg width="1280" height="720" viewBox="0 0 1280 720" xmlns="http://www.w3.org/2000/svg">\n${content}\n</svg>`;
    repaired = true;
  }
  const normalizedTag = content.match(/<svg\b[^>]*>/i)?.[0] || '';
  const tagOk = /width=["']1280["']/i.test(normalizedTag) && /height=["']720["']/i.test(normalizedTag) && /viewBox=["']0 0 1280 720["']/i.test(normalizedTag);
  if (!tagOk) throw new SkillExecutionError('PPT 16:9 SVG 必须使用 width="1280" height="720" viewBox="0 0 1280 720"');
  if (/<(?:script|foreignObject|style)\b/i.test(content)) throw new SkillExecutionError('PPT SVG 禁止 script/style/foreignObject');
  return { content, repaired };
}

function validatePptSvgCanvas(target: string, content: string): void {
  if (!target.includes('/svg_output/') || !target.endsWith('.svg')) return;
  const tag = content.match(/<svg\b[^>]*>/i)?.[0] || '';
  if (!tag) throw new SkillExecutionError('PPT SVG 缺少根 <svg> 标签');
  const ok = /width=["']1280["']/i.test(tag) && /height=["']720["']/i.test(tag) && /viewBox=["']0 0 1280 720["']/i.test(tag);
  if (!ok) throw new SkillExecutionError('PPT 16:9 SVG 必须使用 width="1280" height="720" viewBox="0 0 1280 720"');
  validatePptSvgLint(content);
}

function countPptSvgOutputFiles(files: unknown): number {
  if (!Array.isArray(files)) return 0;
  return files.filter((item) => {
    if (!item || typeof item !== 'object') return false;
    const rel = str((item as Record<string, unknown>).path).replace(/\\/g, '/').replace(/^\/+/, '');
    return (rel.startsWith('svg_output/') || rel.includes('/svg_output/')) && rel.toLowerCase().endsWith('.svg');
  }).length;
}

function validatePptSvgLint(content: string): void {
  const problems: string[] = [];
  if (/<foreignObject\b/i.test(content)) problems.push('foreignObject');
  if (/<(?:script|style)\b/i.test(content)) problems.push('script/style');
  if (/<g\b[^>]*\bopacity\s*=/i.test(content)) problems.push('<g opacity>');
  if (/&(nbsp|mdash|copy|hellip|ldquo|rdquo|lsquo|rsquo);/i.test(content)) problems.push('HTML named entities');
  if (/(?:…+|⋯+|\.{3,}|。{3,})/.test(content)) problems.push('forbidden ellipsis');
  const safeFonts = ['Microsoft YaHei', 'SimHei', 'SimSun', 'Arial', 'Calibri', 'Segoe UI', 'Times New Roman', 'Georgia', 'Consolas', 'Courier New', 'Impact', 'Arial Black', 'PingFang SC'];
  for (const match of content.matchAll(/\bfont-family\s*=\s*(['"])(.*?)\1/gi)) {
    const family = match[2] || '';
    if (!safeFonts.some((font) => family.includes(font))) {
      problems.push(`unsafe font-family: ${family.slice(0, 80)}`);
      break;
    }
  }
  if (problems.length) throw new SkillExecutionError(`PPT SVG 兼容性检查失败: ${problems.join(', ')}`);
}

/**
 * Scans skill directories for available scripts and returns a mapping
 * of skill_id -> script relative paths.
 * Excludes internal ppt-master export scripts (called via ppt_master_export)
 * and px-data scripts (called via dedicated prefetch_metrics / prefetch_data_qa_context actions).
 */
function scanSkillScripts(): Record<string, string[]> {
  const result: Record<string, string[]> = {};
  if (!fs.existsSync(SKILLS_DIR)) return result;
  const pptInternal = new Set([...PPT_MANUAL_EXPORT_SCRIPTS, 'project_manager.py', 'svg_text_wrap.py']);
  const dedicatedActionSkills = new Set(['px-data']);
  for (const skillEntry of fs.readdirSync(SKILLS_DIR, { withFileTypes: true })) {
    if (!skillEntry.isDirectory()) continue;
    const skillId = skillEntry.name;
    if (dedicatedActionSkills.has(skillId)) continue;
    const scriptsDir = path.join(SKILLS_DIR, skillId, 'scripts');
    if (!fs.existsSync(scriptsDir)) continue;
    const scripts: string[] = [];
    for (const file of fs.readdirSync(scriptsDir)) {
      if (!/\.(ts|py)$/.test(file)) continue;
      if (skillId === 'ppt-master' && pptInternal.has(file)) continue;
      scripts.push(`scripts/${file}`);
    }
    if (scripts.length) result[skillId] = scripts;
  }
  return result;
}

export class SkillExecutor {
  constructor(private outputDir = GENERATED_DIR, private options: SkillExecutorOptions = {}) {}

  scoped(outputDir: string): SkillExecutor {
    return new SkillExecutor(outputDir, this.options);
  }

  // actionSpec() is injected into the LLM system prompt.
  // If you rename or move skill scripts, update scanSkillScripts() exclusions accordingly.
  actionSpec(): Record<string, unknown> {
    return {
      actions: ['emit_text', 'read_skill_file', 'read_metric_file', 'run_skill_script', 'write_text_deliverable', 'write_project_file', 'write_project_files', 'render_ppt_from_specs', 'ppt_master_bootstrap', 'ppt_master_export', 'prefetch_metrics', 'prefetch_data_qa_context'],
      final_shape: { type: 'final', answer: '<业务用户可读中文回答>', deliverable_files: [] },
      skill_call_shape: { type: 'skill_call', skill_id: 'px-data | patient-education-data-overview | patient-education-monthly-report | ppt-master | ...', action: '<action>', params: {}, thought: '<reason>' },
      params: {
        emit_text: { content: '先展示给用户的中文正文/摘要；不会结束任务，后续继续生成文件' },
        read_metric_file: { path: 'available_metric_stores[].path 中的 /generated/.../_metrics/*.json', max_chars: '可选，默认 12000' },
        write_text_deliverable: { file_name: '纯文件名；概览/月报会按 skill 固定为 overview_report.md / monthly_report.md', content: '完整 Markdown 正文' },
        run_skill_script: { script: 'skill_id 目录下的脚本相对路径', available_scripts: scanSkillScripts(), args: ['可选命令行参数'] },
        write_project_file: { project_path: 'projects/...', path: 'svg_output/01_cover.svg 或 notes/total.md 等项目内路径', content: '完整文件内容' },
        write_project_files: { project_path: 'projects/...', files: [{ path: 'svg_output/01_cover.svg', content: '<svg ...>...</svg>' }] },
        render_ppt_from_specs: {
          project_path: 'projects/...',
          title: 'PPT 标题',
          subtitle: 'PPT 副标题',
          theme: 'executive_blue | medical_green | warm_orange | dark_tech',
          style: { font_scale: 0.95, title_size: 30, body_size: 15, number_size: 30, accent_color: '#007A6C', risk_color: '#D54941', warning_color: '#D97706', panel_fill: '#FFFFFF', panel_alt_fill: '#E8F7F2', background_color: '#F5FBF9', text_color: '#10231F', card_fill: '#FFFFFF', card_border: '#D8E7E2', corner_radius: 18 },
          design_tokens: { background: 'clean | soft_blobs | grid_dots | gradient_mesh | diagonal_ribbon', accent_shape: 'ribbon | corner_blob | vertical_rule | orbit | none', card_style: 'soft | outlined | glass | solid_header', chart_style: 'minimal | annotated | bold | sparkline', number_style: 'hero | compact | badge | plain', density: 'low | medium | high', icon_style: 'circle | square | badge | none', chart_palette: ['#007A6C', '#1A56DB'] },
          data_display: { number_format: 'raw | compact_cn', sort: 'none | asc | desc', top_n: 5, highlight_max: true, show_axis: true, show_grid: true, show_legend: true, show_value_labels: true },
          slides: [{
            slide_type: 'cover | executive_summary | kpi_dashboard | trend | comparison | ranking | diagnosis | roadmap | closing',
            layout_variant: '可选弱偏好；后端不会按固定模板硬套，而会用约束式布局根据 components/chart/metrics 自动排版',
            title: '页标题',
            subtitle: '可选副标题',
            takeaway: '本页核心结论',
            emphasis: 'hero_metric | chart | insight | ranking | timeline | balanced',
            style: { font_scale: 0.95, title_size: 30, body_size: 15, number_size: 34, accent_color: '#007A6C', risk_color: '#D54941', card_fill: '#FFFFFF' },
            design_tokens: { background: 'clean', card_style: 'soft', chart_style: 'annotated', number_style: 'badge', density: 'medium', icon_style: 'circle' },
            data_display: { number_format: 'compact_cn', sort: 'desc', top_n: 5, highlight_max: true, show_axis: true, show_grid: true, show_value_labels: true },
            bullets: ['要点1', '要点2'],
            metrics: [{ label: '指标名', value: '指标值', unit: '单位', delta: '变化', note: '说明', status: 'good | warn | risk | neutral' }],
            chart: { type: 'line | area | bar | ranking | funnel | matrix', title: '图表标题', x_label: '横轴', y_label: '纵轴', value_suffix: '次', categories: ['类目'], values: [1, 2, 3], series: [{ name: '系列', values: [1, 2, 3], color: '#007A6C' }] },
            components: [{
              type: 'metric_card | hero_metric | insight_card | risk_card | action_card | chart_panel | ranking_list | funnel_panel | timeline | matrix | callout | takeaway_band',
              layout_variant: '可选组件内部呈现，如 line | area | bar | ranking | funnel',
              title: '组件标题',
              subtitle: '组件副标题',
              text: '组件正文',
              value: '可选数值',
              unit: '单位',
              tone: 'good | warn | risk | neutral',
              icon: 'warning | growth | target | users | content | search | action | read | interaction',
              style: { body_size: 14, number_size: 32, card_fill: '#FFFFFF', card_border: '#D8E7E2' },
              data_display: { number_format: 'compact_cn', show_axis: true, show_value_labels: true },
              chart: { type: 'line | area | bar | ranking | funnel', categories: ['类目'], values: [1, 2, 3] },
              metrics: [{ label: '指标名', value: 123, unit: '次' }],
              items: ['时间线/矩阵/要点条目'],
            }],
            notes: '演讲备注',
          }],
          content_richness_rules: [
            '除封面/目录/结束页外，每页必须像咨询汇报页：有结论、有数据、有归因、有影响判断、有行动/风险/机会',
            '每页至少 1 条 takeaway、3～6 个数据点、3～5 条 bullets 或 insight/action/risk 组件，notes 写成 80～160 字可口播讲稿',
            '不要只复述数字；每页至少回答 2 个问题：发生了什么、为什么重要、由什么驱动、意味着什么、下一步做什么、风险/机会在哪里',
            '图表/组件要多样：趋势用 line/area/timeline，对比用 grouped bar/matrix，内容用 ranking/top cards，诊断用 funnel/risk matrix，行动用 roadmap/swimlane/timeline',
            'ranking_list/ranking 必须绑定真实且同口径可比较的业务指标（同为阅读量/完读率/互动量/转化率/占比等）；不要把 1/2/3/4 顺序号当数值，也不要把阅读量、平均互动、完读率混在一个条形排行里。若表达模式/原因/动作或混合口径指标，用 insight_card/action_card/risk_card/matrix/callout/metric_card',
            '标题、小标题、表头、图例和标签要可读；右侧说明用无序列表或真正有序步骤，不要用没有信息含义的装饰编号',
            '硬性禁用省略号：任何 PPT slide spec 文本不得包含中文省略号或三个连续英文句点；放不下就改短、换行、拆 bullet、拆组件或拆页',
            'KPI/summary 页至少 5 个 metrics + 2 个 insight/action 组件；trend 页 chart + 增长/波动归因 + 观察点；comparison 页 chart + 结构洞察 + 风险/机会',
            'ranking 页必须有 top 内容数据 + 成功模式总结 + 可复用动作；diagnosis 页必须有问题、原因、影响、动作；roadmap 页至少 3 个可执行 action_card',
            '如果后端返回 content_insufficient/内容不足，需要由模型基于已有数据补充该页 spec；不得引入新数据，不能让后端凭空补业务判断',
          ],
        },
        ppt_master_sequence: [
          'ppt_master_bootstrap → 得到 project_path',
          '推荐快路径：render_ppt_from_specs 一次写入 slide specs，由后端约束式布局引擎生成 design/spec/notes 与全部 svg_output/*.svg；模型决定内容/组件/主视觉，后端决定坐标与重排',
          this.options.allowManualPptSvg
            ? `当前快捷入口已启用 legacy 手写 SVG：允许 write_project_file/write_project_files 写 svg_output/*.svg；每次最多 ${PPT_SVG_BATCH_MAX_PAGES} 页；不要调用 render_ppt_from_specs`
            : '当前默认禁用模型手写 SVG；write_project_file/write_project_files 只用于非 SVG 项目文件。必须优先使用 render_ppt_from_specs 生成 PPT 页面',
          `保留手写 SVG 兼容能力：仅当快捷入口启用或后端开启 AI_HELPER_PPT_MANUAL_SVG=true 时，write_project_file/write_project_files 才可写 svg_output/*.svg；每次最多 ${PPT_SVG_BATCH_MAX_PAGES} 页`,
          '不要重复写已成功生成的文件；若文件路径写错，后端会规范化/移动到正确位置，请继续生成缺失文件而不是重写已有文件',
          'ppt_master_export(project_path) 导出可编辑 PPTX',
        ],
        ppt_svg_rules: {
          canvas: '<svg width="1280" height="720" viewBox="0 0 1280 720" xmlns="http://www.w3.org/2000/svg">',
          editable_primitives: ['rect', 'circle', 'ellipse', 'line', 'polyline', 'polygon', 'path', 'text', 'tspan'],
          notes_file: 'notes/total.md',
        },
      },
    };
  }

  describeCall(call: SkillCall): string {
    return `${call.skill_id || 'skill'}.${call.action || 'action'}`;
  }

  isBackgroundCall(call: SkillCall): boolean {
    return call.skill_id === 'ppt-master' && call.action === 'ppt_master_export' && process.env.AI_HELPER_PPT_EXPORT_BACKGROUND === 'true';
  }

  async execute(call: SkillCall): Promise<SkillResult> {
    try {
      return await this.executeStrict(call);
    } catch (err) {
      return { ok: false, recoverable: true, summary: this.describeCall(call), error: err instanceof Error ? err.message : String(err), detail: { skill_id: call.skill_id, action: call.action, params: compactParamsForError((call.params || {}) as Record<string, unknown>) } };
    }
  }

  async executeStrict(call: SkillCall): Promise<SkillResult> {
    const skillId = str(call.skill_id);
    const action = str(call.action);
    const params = (call.params || {}) as Record<string, unknown>;
    if (!skillId || !action) throw new SkillExecutionError('skill_id and action are required');
    if (skillId === 'data-autoload-from-data-dir') throw new SkillExecutionError('data-autoload 已禁用；PX 数据必须通过 px-data 获取');
    if (!fs.existsSync(path.join(SKILLS_DIR, skillId)) && skillId !== 'px-data') throw new SkillExecutionError('请使用可用 skills 目录中的能力继续');
    if (skillId === 'sql-pro' && action === 'postgres_query' && process.env.AI_HELPER_ENABLE_SQL_PRO !== 'true') {
      throw new SkillExecutionError('sql-pro.postgres_query 当前未启用；请使用 px-data 结构化查询');
    }

    if (action === 'emit_text') return this.emitText(params);
    if (skillId === 'px-data' && action === 'prefetch_metrics') return this.runSkillScript('px-data', 'scripts/prefetch_metrics.ts', [JSON.stringify(params)], 120_000);
    if (skillId === 'px-data' && action === 'prefetch_data_qa_context') return this.runSkillScript('px-data', 'scripts/prefetch_data_qa_context.ts', [JSON.stringify(params)], 120_000);
    if (skillId === 'px-data' && action === 'read_metric_file') return this.readMetricFile(params);

    if (action === 'read_skill_file') return this.readSkillFile(skillId, str(params.path || 'SKILL.md'), Number(params.max_chars || 12000));
    if (action === 'run_skill_script') return this.runSkillScript(skillId, str(params.script), Array.isArray(params.args) ? params.args.map(String) : [], Number(params.timeout_sec || 300) * 1000);
    if (action === 'write_text_deliverable') return this.writeTextDeliverable(skillId, params);
    if (action === 'write_project_file') return this.writeProjectFile(skillId, params);
    if (action === 'write_project_files') return this.writeProjectFiles(skillId, params);
    if (action === 'render_ppt_from_specs') return this.renderPptFromSpecs(skillId, params);
    if (action === 'read_project_file') return this.readProjectFile(params);
    if (action === 'ppt_master_bootstrap') return this.pptMasterBootstrap(params);
    if (action === 'ppt_master_export') return this.pptMasterExport(params);
    throw new SkillExecutionError(`unsupported action: ${action}`);
  }

  private async readSkillFile(skillId: string, rel: string, maxChars: number): Promise<SkillResult> {
    const file = safeUnder(path.join(SKILLS_DIR, skillId), rel || 'SKILL.md');
    const content = await fsp.readFile(file, 'utf8');
    return jsonResult(`读取 skill 文件 ${skillId}/${rel}`, { kind: 'read_skill', path: path.relative(SKILLS_DIR, file) }, { content: content.slice(0, Math.max(1000, maxChars)) });
  }

  private emitText(params: Record<string, unknown>): SkillResult {
    const text = str(params.content || params.text || params.markdown || params.answer);
    if (!text) throw new SkillExecutionError('emit_text requires params.content');
    return jsonResult('已输出用户可见文字，继续生成文件', { kind: 'emit_text', chars: text.length }, { text });
  }

  private async readMetricFile(params: Record<string, unknown>): Promise<SkillResult> {
    const rawPath = str(params.path || params.file || params.file_path);
    if (!rawPath) throw new SkillExecutionError('read_metric_file requires params.path');
    const file = this.resolveExportFile(rawPath);
    const root = path.resolve(this.outputDir);
    const abs = path.resolve(file);
    if (!(abs === root || abs.startsWith(`${root}${path.sep}`))) {
      throw new SkillExecutionError('read_metric_file 只能读取本轮生成目录下的指标文件');
    }
    if (!abs.includes(`${path.sep}_metrics${path.sep}`) || path.extname(abs).toLowerCase() !== '.json') {
      throw new SkillExecutionError('read_metric_file 只能读取 available_metric_stores 中的 _metrics/*.json');
    }
    const content = await fsp.readFile(abs, 'utf8');
    const maxChars = Math.max(1000, Math.min(200_000, Number(params.max_chars || 12000)));
    const clipped = content.length > maxChars ? `${content.slice(0, maxChars)}\n...[truncated ${content.length - maxChars} chars]` : content;
    let parsed: unknown;
    if (content.length <= maxChars) {
      try { parsed = JSON.parse(content); } catch { /* ignore */ }
    }
    return jsonResult(
      `读取指标文件 ${toAssetPath(abs)}`,
      { kind: 'read_metric_file', path: toAssetPath(abs), chars: content.length, truncated: content.length > maxChars },
      parsed === undefined ? { content: clipped } : { content: clipped, json: parsed },
    );
  }

  private async runSkillScript(skillId: string, scriptRel: string, args: string[], timeout: number): Promise<SkillResult> {
    if (!scriptRel) throw new SkillExecutionError('params.script is required');
    if (skillId === 'patient-education-monthly-report') {
      throw new SkillExecutionError('月报不需要运行内部脚本；请写入 monthly_report.md 后调用 md-to-pdf 生成 monthly_report.pdf');
    }
    const script = safeUnder(path.join(SKILLS_DIR, skillId), scriptRel);
    if (!fs.existsSync(script)) throw new SkillExecutionError(`skill script not found: ${skillId}/${scriptRel}`);
    if (skillId === 'ppt-master' && PPT_MANUAL_EXPORT_SCRIPTS.has(path.basename(script))) throw new SkillExecutionError('禁止手动调用 ppt-master 导出脚本；请使用 ppt_master_export');
    const finalArgs = [...args];
    if (RUN_OUTPUT_DIR_SKILLS.has(skillId) && !finalArgs.includes('--output-dir')) {
      finalArgs.push('--output-dir', this.outputDir);
    }
    if (skillId === 'md-to-pdf') this.resolveMdToPdfArgs(finalArgs);
    if (['html-to-png', 'md-to-pdf'].includes(skillId)) {
      const input = this.argValue(finalArgs, ['--input', '-i']);
      const output = this.argValue(finalArgs, ['--output', '-o']);
      if (!input || !output) throw new SkillExecutionError(`${skillId} requires --input and --output`);
      const inputPath = this.resolveExportFile(input);
      if (!fs.existsSync(inputPath)) {
        throw new SkillExecutionError(`导出源文件不存在: ${path.basename(input)}。请先写入源文件，再调用 ${skillId} 导出。`);
      }
    }
    const ext = path.extname(script).toLowerCase();
    let run: ScriptRun;
    if (ext === '.ts') run = await exec(tsxExecutable(), [script, ...finalArgs], SERVER_ROOT, timeout);
    else if (ext === '.py') run = await exec(pythonExecutable(skillId === 'md-to-pdf' ? ['reportlab', 'PIL', 'fitz'] : []), [script, ...finalArgs], SERVER_ROOT, timeout);
    else run = await exec(script, finalArgs, SERVER_ROOT, timeout);
    const parsed = parseLastJson(run.stdout) || {};
    const files = this.extractFiles(parsed);
    return jsonResult(`执行脚本 ${skillId}/${scriptRel}`, { kind: 'script', command: run.command, duration_ms: run.duration_ms }, { stdout: run.stdout.slice(-6000), stderr: run.stderr.slice(-6000), json: parsed, files });
  }

  private argValue(args: string[], names: string[]): string {
    for (const name of names) {
      const idx = args.indexOf(name);
      if (idx >= 0 && idx + 1 < args.length) return args[idx + 1];
    }
    return '';
  }

  private setArgValue(args: string[], name: string, value: string): void {
    const idx = args.indexOf(name);
    if (idx >= 0 && idx + 1 < args.length) args[idx + 1] = value;
  }

  private resolveMdToPdfArgs(args: string[]): void {
    const inputName = args.includes('--input') ? '--input' : args.includes('-i') ? '-i' : '';
    const outputName = args.includes('--output') ? '--output' : args.includes('-o') ? '-o' : '';
    if (inputName) this.setArgValue(args, inputName, this.resolveExportFile(this.argValue(args, [inputName])));
    if (outputName) {
      const outputPath = this.resolveExportFile(this.argValue(args, [outputName]));
      this.setArgValue(args, outputName, outputPath);
      const stem = outputPath.replace(/\.pdf$/i, '');
      if (!args.includes('--qa-json')) args.push('--qa-json', `${stem}_qa.json`);
      if (!args.includes('--preview-dir')) args.push('--preview-dir', `${stem}_preview`);
    }
  }

  private resolveExportFile(value: string): string {
    const raw = value.replace(/\\/g, '/');
    if (path.isAbsolute(raw)) return raw;
    if (raw.startsWith('/generated/') || raw.startsWith('/projects/')) return path.join(AI_HELPER_ROOT, raw.slice(1));
    if (raw.startsWith('generated/') || raw.startsWith('projects/')) return path.join(AI_HELPER_ROOT, raw);
    if (raw.startsWith('server/')) return path.resolve(WORKSPACE_ROOT, raw);
    return path.join(this.outputDir, path.basename(raw));
  }

  private async writeTextDeliverable(skillId: string, params: Record<string, unknown>): Promise<SkillResult> {
    const canonical: Record<string, string> = {
      'patient-education-data-overview': 'overview_report.md',
      'patient-education-monthly-report': 'monthly_report.md',
    };
    const fileName = canonical[skillId] || normalizeGeneratedName(params.file_name || 'report.md');
    const content = str(params.content || params.markdown || params.text);
    if (!content) throw new SkillExecutionError('write_text_deliverable requires params.content');
    const out = safeGeneratedPath(this.outputDir, fileName);
    await fsp.writeFile(out, content, 'utf8');
    return jsonResult(`写入交付文件 ${toAssetPath(out)}`, { kind: 'write_text', path: toAssetPath(out) }, { file: toAssetPath(out), files: [toAssetPath(out)] });
  }

  private projectPath(params: Record<string, unknown>, relPath: string): string {
    const project = str(params.project_path).replace(/^\/+/, '');
    if (!project) throw new SkillExecutionError('params.project_path is required');
    return safeUnder(AI_HELPER_ROOT, path.join(project, relPath));
  }

  private async writeProjectFile(skillId: string, params: Record<string, unknown>): Promise<SkillResult> {
    if (skillId !== 'ppt-master') throw new SkillExecutionError('write_project_file requires skill_id ppt-master');
    const project = str(params.project_path).replace(/^\/+/, '');
    if (!project) throw new SkillExecutionError('params.project_path is required');
    const inputRel = str(params.path);
    let content = str(params.content);
    if (!inputRel || !content) throw new SkillExecutionError('write_project_file requires params.path and params.content');
    const normalizedRel = normalizePptProjectRel(project, inputRel);
    const rel = normalizedRel.rel;
    if (!(PPT_MANUAL_SVG_ENABLED || this.options.allowManualPptSvg) && rel.startsWith('svg_output/') && rel.toLowerCase().endsWith('.svg')) {
      throw new SkillExecutionError('模型手写 SVG 当前已禁用；请改用 render_ppt_from_specs，让后端组件库生成 svg_output/*.svg。');
    }
    if (path.basename(rel) === 'spec_lock.md') validateSpecLock(content);
    const out = safeUnder(AI_HELPER_ROOT, path.join(project, rel));
    if (fs.existsSync(out) && fs.statSync(out).size > 0) {
      return jsonResult(
        `项目文件已存在，复用不重复写入 ${relToHelper(out)}`,
        { kind: 'write_project', path: relToHelper(out), reused_existing: true, skipped_write: true, requested_path: inputRel, normalized_path: rel },
        { file: relToHelper(out), files: [relToHelper(out)] },
      );
    }
    if (normalizedRel.moved_from) {
      const wrong = safeUnder(AI_HELPER_ROOT, path.join(project, normalizedRel.original_rel));
      if (fs.existsSync(wrong) && !fs.existsSync(out)) {
        await fsp.mkdir(path.dirname(out), { recursive: true });
        await fsp.rename(wrong, out);
        return jsonResult(
          `项目文件位置已修正 ${relToHelper(wrong)} → ${relToHelper(out)}`,
          { kind: 'write_project', path: relToHelper(out), moved_from: relToHelper(wrong), requested_path: inputRel, normalized_path: rel },
          { file: relToHelper(out), files: [relToHelper(out)] },
        );
      }
    }
    const normalized = normalizePptSvgCanvas(out, content);
    content = normalized.content;
    validatePptSvgCanvas(out, content);
    await fsp.mkdir(path.dirname(out), { recursive: true });
    await fsp.writeFile(out, content, 'utf8');
    return jsonResult(
      `写入项目文件 ${relToHelper(out)}`,
      { kind: 'write_project', path: relToHelper(out), repaired_svg_root: normalized.repaired, moved_from: normalizedRel.moved_from, requested_path: inputRel, normalized_path: rel },
      { file: relToHelper(out), files: [relToHelper(out)] },
    );
  }

  private async writeProjectFiles(skillId: string, params: Record<string, unknown>): Promise<SkillResult> {
    if (skillId !== 'ppt-master') throw new SkillExecutionError('write_project_files requires skill_id ppt-master');
    const files = params.files;
    if (!Array.isArray(files) || !files.length) throw new SkillExecutionError('params.files must be a non-empty array');
    const svgPageCount = countPptSvgOutputFiles(files);
    if (svgPageCount > PPT_SVG_BATCH_MAX_PAGES) {
      throw new SkillExecutionError(`单次 write_project_files 写入的 PPT SVG 页面过多：${svgPageCount} 个，超过上限 ${PPT_SVG_BATCH_MAX_PAGES}。请拆成多次调用。`);
    }
    const outFiles: string[] = [];
    const results: unknown[] = [];
    for (const item of files as Array<Record<string, unknown>>) {
      const res = await this.writeProjectFile(skillId, { ...params, path: item.path, content: item.content });
      if (res.file) outFiles.push(String(res.file));
      if (res.detail) results.push(res.detail);
    }
    return jsonResult(`批量处理 ${outFiles.length} 个项目文件`, { kind: 'write_project_many', files: outFiles, results }, { files: outFiles });
  }

  private async renderPptFromSpecs(skillId: string, params: Record<string, unknown>): Promise<SkillResult> {
    if (skillId !== 'ppt-master') throw new SkillExecutionError('render_ppt_from_specs requires skill_id ppt-master');
    const project = str(params.project_path).replace(/^\/+/, '');
    if (!project) throw new SkillExecutionError('render_ppt_from_specs requires params.project_path');
    if (!Array.isArray(params.slides) || params.slides.length < 1) throw new SkillExecutionError('render_ppt_from_specs requires params.slides');
    const root = safeUnder(AI_HELPER_ROOT, project);
    const rendered = await renderPptDeckFromSpecs(root, project, params);
    return jsonResult(
      `根据 slide spec 渲染 ${rendered.svg_count} 页 PPT SVG，并生成 design/spec/notes`,
      { kind: 'ppt_spec_render', project_path: rendered.project_path, svg_count: rendered.svg_count, rendering: 'programmatic_svg_from_slide_specs' },
      { files: rendered.files },
    );
  }

  private async readProjectFile(params: Record<string, unknown>): Promise<SkillResult> {
    const rel = str(params.path);
    const file = this.projectPath(params, rel);
    const content = await fsp.readFile(file, 'utf8');
    return jsonResult(`读取项目文件 ${relToHelper(file)}`, { kind: 'read_project', path: relToHelper(file) }, { content: content.slice(0, Number(params.max_chars || 12000)) });
  }

  private async pptMasterBootstrap(params: Record<string, unknown>): Promise<SkillResult> {
    await fsp.mkdir(PROJECTS_DIR, { recursive: true });
    const name = str(params.project_name || 'px_ai_ppt').replace(/[^a-zA-Z0-9_.-]+/g, '_') || 'px_ai_ppt';
    const projectName = `${name}_run_${Date.now()}`;
    const script = path.join(SKILLS_DIR, 'ppt-master', 'scripts', 'project_manager.py');
    const run = await exec(pythonExecutable(), [script, 'init', projectName, '--format', str(params.format || 'ppt169'), '--dir', PROJECTS_DIR], SERVER_ROOT, 120_000);
    const match = run.stdout.match(/Project created:\s*(.+)\s*$/m);
    const abs = match ? path.resolve(match[1].trim()) : path.join(PROJECTS_DIR, `${projectName}_ppt169_${new Date().toISOString().slice(0, 10).replace(/-/g, '')}`);
    const projectPath = path.relative(AI_HELPER_ROOT, abs).split(path.sep).join('/');
    return jsonResult(`新建 PPT 项目 ${projectPath}`, { kind: 'bootstrap', project_path: projectPath, command: run.command }, { project_path: projectPath });
  }

  pptMasterExportPrecheck(params: Record<string, unknown>): { ok: boolean; missing: string[]; project_path?: string; svg_count: number; has_total_md: boolean; moved_files?: Array<{ from: string; to: string; skipped?: boolean; reason: string }> } {
    const project = str(params.project_path).replace(/^\/+/, '');
    const missing: string[] = [];
    if (!project) return { ok: false, missing: ['params.project_path'], svg_count: 0, has_total_md: false };
    const root = safeUnder(AI_HELPER_ROOT, project);
    const movedFiles = repairPptProjectLayoutSync(root);
    const svgDir = path.join(root, 'svg_output');
    const svgs = fs.existsSync(svgDir) ? fs.readdirSync(svgDir).filter((x) => x.endsWith('.svg')) : [];
    const hasTotal = fs.existsSync(path.join(root, 'notes', 'total.md'));
    if (!svgs.length) missing.push('svg_output/*.svg');
    if (!hasTotal) missing.push('notes/total.md');
    return { ok: !missing.length, missing, project_path: project, svg_count: svgs.length, has_total_md: hasTotal, moved_files: movedFiles };
  }

  private async pptMasterExport(params: Record<string, unknown>): Promise<SkillResult> {
    const pre = this.pptMasterExportPrecheck(params);
    if (!pre.ok) throw new SkillExecutionError(`ppt-master 导出前置条件未满足: ${pre.missing.join(', ')}`);
    const project = pre.project_path || '';
    const projectAbs = safeUnder(AI_HELPER_ROOT, project);
    const scripts = path.join(SKILLS_DIR, 'ppt-master', 'scripts');
    const runs: ScriptRun[] = [];
    const isProgrammaticSpecRender = fs.existsSync(path.join(projectAbs, 'renderer_meta.json'));
    const exportSteps = [
      ...(isProgrammaticSpecRender ? [] : [['svg_text_wrap.py', [projectAbs]] as [string, string[]]]),
      ['total_md_split.py', [projectAbs]],
      ['finalize_svg.py', [projectAbs]],
      ['svg_to_pptx.py', [projectAbs, '--format', 'ppt169', '--only', 'native', '-a', 'none', '-t', 'none', '--no-notes']],
    ] as Array<[string, string[]]>;
    for (const [name, args] of exportSteps) {
      runs.push(await exec(pythonExecutable(), [path.join(scripts, name), ...args], SERVER_ROOT, 600_000));
    }
    const exportsDir = safeUnder(AI_HELPER_ROOT, path.join(project, 'exports'));
    const pptx = fs.readdirSync(exportsDir).filter((x) => x.endsWith('.pptx') && !/(compat|keynote|_svg|legacy)/i.test(x)).map((x) => path.join(exportsDir, x)).sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs)[0];
    if (!pptx) throw new SkillExecutionError('ppt-master 导出完成但未找到可编辑 PPTX');
    const out = safeGeneratedPath(this.outputDir, `ppt_${new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14)}.pptx`);
    await fsp.copyFile(pptx, out);
    return jsonResult(`导出可编辑 PPTX ${toAssetPath(out)}`, { kind: 'ppt_export', project_path: project, scripts: runs.map((r) => ({ command: r.command, duration_ms: r.duration_ms })) }, { file: toAssetPath(out), files: [toAssetPath(out)] });
  }

  private extractFiles(parsed: Record<string, unknown>): string[] {
    const out: string[] = [];
    const add = (value: unknown) => {
      if (typeof value !== 'string') return;
      const raw = value.replace(/\\/g, '/');
      if (raw.startsWith('/generated/') || raw.startsWith('/projects/')) out.push(raw);
      else if (raw.startsWith('generated/') || raw.startsWith('projects/')) out.push(`/${raw}`);
      else if (path.isAbsolute(raw) && raw.startsWith(AI_HELPER_ROOT)) out.push(toAssetPath(raw));
      else if (fs.existsSync(path.join(AI_HELPER_ROOT, raw))) out.push(`/${raw}`);
    };
    if (Array.isArray(parsed.files)) parsed.files.forEach(add);
    for (const key of ['file', 'pdf', 'manifest', 'qa_json', 'metrics_json']) add(parsed[key]);
    return [...new Set(out)];
  }

  static parseJsonObject(raw: string): Record<string, unknown> | undefined {
    let text = raw.trim();
    if (text.startsWith('```')) text = text.replace(/^```(?:json)?\s*/i, '').replace(/```$/i, '').trim();
    try {
      const obj = JSON.parse(text);
      return obj && typeof obj === 'object' && !Array.isArray(obj) ? obj : undefined;
    } catch {
      const start = text.indexOf('{');
      if (start < 0) return undefined;
      try {
        const [obj] = [JSON.parse(text.slice(start, text.lastIndexOf('}') + 1))];
        return obj && typeof obj === 'object' && !Array.isArray(obj) ? obj : undefined;
      } catch {
        return undefined;
      }
    }
  }

  static observation(result: SkillResult): string {
    return `SKILL_RESULT:\n${JSON.stringify(compactSkillResultForContext(result))}\n\n请基于上述结果继续，只输出一个 JSON 对象（skill_call 或 final）。`;
  }
}
