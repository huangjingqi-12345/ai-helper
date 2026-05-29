import fs from 'fs';
import fsp from 'fs/promises';
import path from 'path';
import { execFile, execFileSync } from 'child_process';
import { fileURLToPath } from 'url';
import { AI_HELPER_ROOT, GENERATED_DIR, PROJECTS_DIR, safeGeneratedPath, toAssetPath } from './paths.js';
import { renderPptDeckFromSpecs } from './pptSpecRenderer.js';
import { restoreAiHelperProjectFromOss } from './ossStorage.js';
import { exportPptProjectToPptxSync, finalizePptSvgSync, validateEditablePptxSync } from './pptxNativeExporter.js';

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
  signal?: AbortSignal;
  publishFiles?: (files: string[]) => Promise<string[]>;
  tenantId?: string;
}

export type ActionSpecMode = 'general' | 'data-qa' | 'overview' | 'monthly' | 'ppt-svg' | 'ppt-edit-svg';

export interface ActionSpecOptions {
  mode?: ActionSpecMode;
}

type ScriptRun = { stdout: string; stderr: string; command: string; duration_ms: number };

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SERVER_ROOT = path.resolve(__dirname, '../..');
const WORKSPACE_ROOT = path.resolve(SERVER_ROOT, '..');
const SKILLS_DIR = path.join(AI_HELPER_ROOT, 'skills');
const PPT_MANUAL_EXPORT_SCRIPTS = new Set(['total_md_split.py', 'finalize_svg.py', 'svg_to_pptx.py', 'validate_editable_pptx.py']);
const BINARY_EXTS = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif', '.pdf', '.ppt', '.pptx', '.xlsx', '.xls']);
const RUN_OUTPUT_DIR_SKILLS = new Set(['patient-education-data-overview']);
const PPT_SVG_BATCH_MAX_PAGES = Math.max(1, Number(process.env.PPT_SVG_BATCH_MAX_PAGES || 1) || 1);
const PPT_MANUAL_SVG_ENABLED = process.env.AI_HELPER_PPT_MANUAL_SVG === 'true';
const DEFAULT_HIDDEN_SKILL_IDS = new Set(['data-autoload-from-data-dir', 'sql-pro']);
const PPT_SAFE_FONT_STACK = 'Microsoft YaHei, Arial, sans-serif';
const PPT_SAFE_FONTS = ['Microsoft YaHei', 'SimHei', 'SimSun', 'Arial', 'Calibri', 'Segoe UI', 'Times New Roman', 'Georgia', 'Consolas', 'Courier New', 'Impact', 'Arial Black', 'PingFang SC'];
const PPT_CANVAS_FORMATS: Record<string, { name: string; dimensions: string; viewbox: string }> = {
  ppt169: { name: 'PPT 16:9', dimensions: '1280×720', viewbox: '0 0 1280 720' },
  ppt43: { name: 'PPT 4:3', dimensions: '1024×768', viewbox: '0 0 1024 768' },
  wechat: { name: 'WeChat Article Header', dimensions: '900×383', viewbox: '0 0 900 383' },
  xiaohongshu: { name: '小红书', dimensions: '1242×1660', viewbox: '0 0 1242 1660' },
  moments: { name: 'Moments/Instagram', dimensions: '1080×1080', viewbox: '0 0 1080 1080' },
  story: { name: 'Story/Vertical', dimensions: '1080×1920', viewbox: '0 0 1080 1920' },
  banner: { name: 'Horizontal Banner', dimensions: '1920×1080', viewbox: '0 0 1920 1080' },
  a4: { name: 'A4 Print', dimensions: '1240×1754', viewbox: '0 0 1240 1754' },
};
const PPT_CANVAS_FORMAT_ALIASES: Record<string, string> = {
  xhs: 'xiaohongshu',
  'wechat_moment': 'moments',
  'wechat-moment': 'moments',
  '朋友圈': 'moments',
  '小红书': 'xiaohongshu',
};

function str(value: unknown): string { return String(value ?? '').trim(); }
function sanitizeUserContent(value: string): string {
  return value
    .replace(/管理层/g, '业务团队')
    .replace(/behavior_daily_metrics/gi, '行为指标数据')
    .replace(/SQL database via Px backend\s*\([^)]*\)/gi, 'PX 指标数据')
    .replace(/PX\s*SQL\s*聚合指标/gi, 'PX 指标数据')
    .replace(/SQL\s*聚合指标/gi, '指标数据')
    .replace(/后端\s*SQL\s*查询结果/g, '后端指标数据')
    .replace(/\bSQL\b/gi, '指标数据')
    .replace(/数据库字段名/g, '底层字段名')
    .replace(/数据库/g, '数据源');
}
function sanitizeUserContentDeep<T>(value: T): T {
  if (typeof value === 'string') return sanitizeUserContent(value) as T;
  if (Array.isArray(value)) return value.map((item) => sanitizeUserContentDeep(item)) as T;
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([key, item]) => [key, sanitizeUserContentDeep(item)])) as T;
  }
  return value;
}
function basenameOnly(value: string): string { return path.basename(value.replace(/\\/g, '/')); }
function jsonResult(summary: string, detail: Record<string, unknown> = {}, extra: Record<string, unknown> = {}): SkillResult {
  return { ok: true, summary, detail, ...extra };
}

function normalizePptCanvasFormat(value: string): string {
  const raw = (value || 'ppt169').trim();
  return PPT_CANVAS_FORMAT_ALIASES[raw] || raw;
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

function abortExecutionError(): SkillExecutionError {
  return new SkillExecutionError('技能执行已取消');
}

async function exec(command: string, args: string[], cwd = SERVER_ROOT, timeout = 300_000, signal?: AbortSignal): Promise<ScriptRun> {
  const started = Date.now();
  const rendered = [command, ...args].join(' ');
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(abortExecutionError());
      return;
    }
    execFile(command, args, { cwd, timeout, maxBuffer: 50 * 1024 * 1024, env: process.env, signal }, (error, stdout, stderr) => {
      if (signal?.aborted) reject(abortExecutionError());
      else if (error) reject(new SkillExecutionError(`${rendered}\n${stderr || stdout || error.message}`));
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

function safePptSlideFileName(rawName: unknown, slideNo: number, title: string): string {
  const raw = str(rawName);
  const baseInput = raw ? basenameOnly(raw) : title;
  const withoutExt = baseInput.replace(/\.svg$/i, '');
  const safeBase = withoutExt
    .normalize('NFKD')
    .replace(/[^a-zA-Z0-9_\-.]+/g, '_')
    .replace(/^[_\-.]+|[_\-.]+$/g, '')
    .slice(0, 64) || 'slide';
  const prefix = String(slideNo).padStart(2, '0');
  const named = /^\d{2}_/.test(safeBase) ? safeBase : `${prefix}_${safeBase}`;
  return `${named}.svg`;
}

function canonicalPptSlideFileName(slideNo: number): string {
  return `${String(slideNo).padStart(2, '0')}_slide.svg`;
}

function isOverwriteAllowedProjectFile(rel: string, params: Record<string, unknown>): boolean {
  if (params.overwrite === true || params.force === true) return true;
  return ['notes/total.md', 'design_spec.md', 'spec_lock.md'].includes(rel);
}

function sortSvgNames(names: string[]): string[] {
  return [...names].sort((a, b) => {
    const an = Number((a.match(/^(\d+)/) || [])[1] || 9999);
    const bn = Number((b.match(/^(\d+)/) || [])[1] || 9999);
    return an - bn || a.localeCompare(b);
  });
}

function markdownSectionHeadings(content: string): Set<string> {
  const headings = new Set<string>();
  for (const match of content.matchAll(/^#{1,6}\s+(.+?)\s*$/gm)) {
    headings.add(match[1].trim());
  }
  return headings;
}

function textFromSvg(svg: string): string {
  const match = svg.match(/<text\b[^>]*>([\s\S]*?)<\/text>/i);
  if (!match) return '';
  return match[1]
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80);
}

function matchExistingNoteSections(content: string, svgStems: string[]): Map<string, string> {
  const byStem = new Map<string, string>();
  const exact = new Set(svgStems);
  const byNo = new Map<number, string[]>();
  for (const stem of svgStems) {
    const n = Number((stem.match(/^(\d{1,3})/) || [])[1] || NaN);
    if (Number.isInteger(n)) byNo.set(n, [...(byNo.get(n) || []), stem]);
  }

  // Do not use a single lazy regex with `\s*$` under /m here. In JS that can
  // match the blank line immediately after a heading, producing zero-length
  // bodies for normal Markdown sections separated by blank lines / `---`.
  const normalized = content.replace(/\r\n?/g, '\n');
  const headings = [...normalized.matchAll(/^#{1,6}\s+(.+?)\s*$/gm)];
  for (let index = 0; index < headings.length; index += 1) {
    const match = headings[index];
    const heading = String(match[1] || '').trim();
    const bodyStart = (match.index || 0) + match[0].length;
    const bodyEnd = index + 1 < headings.length ? (headings[index + 1].index || normalized.length) : normalized.length;
    const body = normalized
      .slice(bodyStart, bodyEnd)
      .replace(/^\s*---+\s*$/gm, '')
      .trim();

    let stem = exact.has(heading) ? heading : '';
    if (!stem) {
      const n = Number((heading.match(/^(\d{1,3})/) || [])[1] || NaN);
      const candidates = Number.isInteger(n) ? byNo.get(n) || [] : [];
      if (candidates.length === 1) stem = candidates[0];
    }
    if (stem && !byStem.has(stem)) {
      byStem.set(stem, body);
    }
  }
  return byStem;
}

function repairPptNotesForSvgFilesSync(root: string): { repaired: boolean; missing: string[]; path: string } {
  const svgDir = path.join(root, 'svg_output');
  const notesDir = path.join(root, 'notes');
  const notesPath = path.join(notesDir, 'total.md');
  const svgFiles = fs.existsSync(svgDir)
    ? sortSvgNames(fs.readdirSync(svgDir).filter((name) => name.toLowerCase().endsWith('.svg')))
    : [];
  if (!svgFiles.length) return { repaired: false, missing: [], path: notesPath };

  fs.mkdirSync(notesDir, { recursive: true });
  const original = fs.existsSync(notesPath) ? fs.readFileSync(notesPath, 'utf8') : '';
  const stems = svgFiles.map((name) => name.replace(/\.svg$/i, ''));
  const existing = matchExistingNoteSections(original, stems);
  const missing = stems.filter((base) => !existing.has(base) || !String(existing.get(base) || '').trim());
  const sections = stems.map((base) => {
    const svgPath = path.join(svgDir, `${base}.svg`);
    const title = fs.existsSync(svgPath) ? textFromSvg(fs.readFileSync(svgPath, 'utf8')) : '';
    const conclusion = sanitizeUserContent(title || base.replace(/^\d+_/, '').replace(/[_-]+/g, ' ') || '本页内容');
    const body = existing.get(base)?.trim() || `- 核心结论：${conclusion}\n- 讲解要点：本页用于说明${conclusion}，请结合页面图表和关键数据进行简洁讲解。`;
    return `# ${base}\n${sanitizeUserContent(body)}`;
  });
  const next = sanitizeUserContent(sections.join('\n\n---\n\n'));
  if (next.trim() === original.trim()) return { repaired: false, missing: [], path: notesPath };
  fs.writeFileSync(notesPath, `${next.trim()}\n`, 'utf8');
  return { repaired: true, missing, path: notesPath };
}

function splitPptTotalNotesSync(root: string): ScriptRun & { generated: string[]; missing: string[] } {
  const started = Date.now();
  const svgDir = path.join(root, 'svg_output');
  const notesDir = path.join(root, 'notes');
  const totalPath = path.join(notesDir, 'total.md');
  const svgFiles = fs.existsSync(svgDir)
    ? sortSvgNames(fs.readdirSync(svgDir).filter((name) => name.toLowerCase().endsWith('.svg')))
    : [];
  if (!svgFiles.length) throw new SkillExecutionError('total notes split failed: no SVG files found');
  if (!fs.existsSync(totalPath)) throw new SkillExecutionError('total notes split failed: notes/total.md not found');

  const stems = svgFiles.map((name) => name.replace(/\.svg$/i, ''));
  const content = fs.readFileSync(totalPath, 'utf8');
  const notes = matchExistingNoteSections(content, stems);
  const missing = stems.filter((stem) => !String(notes.get(stem) || '').trim());
  if (missing.length) throw new SkillExecutionError(`total notes split failed: missing notes for ${missing.join(', ')}`);

  fs.mkdirSync(notesDir, { recursive: true });
  const generated: string[] = [];
  for (const stem of stems) {
    const out = path.join(notesDir, `${stem}.md`);
    fs.writeFileSync(out, `${sanitizeUserContent(String(notes.get(stem) || '').trim())}\n`, 'utf8');
    generated.push(relToHelper(out));
  }
  return {
    generated,
    missing,
    command: `node-ts split notes/total.md -> notes/*.md (${stems.length} slides)`,
    stdout: `Generated ${generated.length}/${stems.length} notes files`,
    stderr: '',
    duration_ms: Date.now() - started,
  };
}

function svgFirstNumber(value: string | undefined, fallback = 0): number {
  if (!value) return fallback;
  const match = value.match(/-?\d+(?:\.\d+)?/);
  return match ? Number(match[0]) : fallback;
}

function svgAttr(attrs: string, name: string): string | undefined {
  const match = attrs.match(new RegExp(`\\b${name}\\s*=\\s*(['"])(.*?)\\1`, 'i'));
  return match ? match[2] : undefined;
}

function svgVisualWeight(ch: string): number {
  if (/\s/.test(ch)) return 0.32;
  if (/[\u4e00-\u9fff\u3000-\u303f]/.test(ch)) return 1.02;
  if ('，。；：、（）【】《》“”‘’'.includes(ch)) return 0.8;
  if (/[A-Z0-9]/.test(ch)) return 0.62;
  return 0.54;
}

function svgEstimateTextWidth(text: string, fontSize: number): number {
  return Array.from(text).reduce((sum, ch) => sum + svgVisualWeight(ch), 0) * fontSize;
}

function svgSplitTokens(text: string): string[] {
  const tokens: string[] = [];
  let buffer = '';
  for (const ch of Array.from(text)) {
    if (/\s/.test(ch)) {
      if (buffer) tokens.push(buffer);
      buffer = '';
      tokens.push(ch);
    } else if (/[\u4e00-\u9fff\u3000-\u303f]/.test(ch)) {
      if (buffer) tokens.push(buffer);
      buffer = '';
      tokens.push(ch);
    } else {
      buffer += ch;
    }
  }
  if (buffer) tokens.push(buffer);
  return tokens;
}

function svgWrapTextLines(text: string, fontSize: number, maxWidth: number): string[] {
  const tokens = svgSplitTokens(text.trim());
  const lines: string[] = [];
  let current = '';
  for (const token of tokens) {
    const candidate = /\s/.test(token) ? `${current}${token}`.trim() : `${current}${token}`;
    if (current && svgEstimateTextWidth(candidate, fontSize) > maxWidth) {
      lines.push(current.trim());
      current = token.trim();
    } else {
      current = candidate;
    }
  }
  if (current.trim()) lines.push(current.trim());
  return lines;
}

function escapeSvgText(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function decodeBasicXmlText(value: string): string {
  return value
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');
}

function svgCanvasSize(content: string): { width: number; height: number } {
  const root = content.match(/<svg\b([^>]*)>/i)?.[1] || '';
  const viewBox = svgAttr(root, 'viewBox') || '';
  const parts = viewBox.split(/\s+/).map(Number).filter((n) => Number.isFinite(n));
  if (parts.length === 4) return { width: Math.max(parts[2], 1), height: Math.max(parts[3], 1) };
  return {
    width: svgFirstNumber(svgAttr(root, 'width'), 1280),
    height: svgFirstNumber(svgAttr(root, 'height'), 720),
  };
}

function inferredSvgTextMaxWidth(attrs: string, canvasWidth: number): number {
  const x = svgFirstNumber(svgAttr(attrs, 'x'), 0);
  const fontSize = svgFirstNumber(svgAttr(attrs, 'font-size'), 18);
  const margin = Math.max(48, canvasWidth * 0.045);
  if (x < canvasWidth * 0.48) return Math.max(fontSize * 8, canvasWidth * 0.48 - x - margin * 0.35);
  if (x < canvasWidth * 0.72) return Math.max(fontSize * 8, canvasWidth * 0.72 - x - margin * 0.35);
  return Math.max(fontSize * 8, canvasWidth - x - margin);
}

function wrapSvgTextContent(content: string): { content: string; changed: number } {
  const canvas = svgCanvasSize(content);
  let changed = 0;
  const next = content.replace(/<text\b([^>]*)>([^<]+)<\/text>/gi, (raw, attrs: string, body: string) => {
    const anchor = (svgAttr(attrs, 'text-anchor') || '').toLowerCase();
    if (anchor === 'middle' || anchor === 'end') return raw;
    const text = decodeBasicXmlText(body).trim();
    if (text.length < 18) return raw;
    const fontSize = svgFirstNumber(svgAttr(attrs, 'font-size'), 18);
    const maxWidth = inferredSvgTextMaxWidth(attrs, canvas.width);
    if (svgEstimateTextWidth(text, fontSize) <= maxWidth) return raw;
    const lines = svgWrapTextLines(text, fontSize, maxWidth);
    if (lines.length <= 1) return raw;
    const x = svgAttr(attrs, 'x') || '0';
    const lineGap = Math.ceil(fontSize * 1.22);
    const tspans = lines.map((line, index) => `<tspan x="${x}" dy="${index ? lineGap : 0}">${escapeSvgText(line)}</tspan>`).join('');
    changed += 1;
    return `<text${attrs}>${tspans}</text>`;
  });
  return { content: next, changed };
}

function wrapPptSvgTextSync(root: string): ScriptRun & { changed: number; files: string[] } {
  const started = Date.now();
  const svgDir = path.join(root, 'svg_output');
  const svgFiles = fs.existsSync(svgDir)
    ? sortSvgNames(fs.readdirSync(svgDir).filter((name) => name.toLowerCase().endsWith('.svg'))).map((name) => path.join(svgDir, name))
    : [];
  if (!svgFiles.length) {
    return { command: 'node-ts svg text wrap (no svg files)', stdout: 'No SVG files found', stderr: '', duration_ms: Date.now() - started, changed: 0, files: [] };
  }
  let totalChanged = 0;
  const changedFiles: string[] = [];
  for (const file of svgFiles) {
    const original = fs.readFileSync(file, 'utf8');
    const wrapped = wrapSvgTextContent(original);
    if (!wrapped.changed || wrapped.content === original) continue;
    fs.writeFileSync(file, wrapped.content, 'utf8');
    totalChanged += wrapped.changed;
    changedFiles.push(relToHelper(file));
  }
  return {
    command: `node-ts wrap long SVG text (${svgFiles.length} files)`,
    stdout: `SVG text wrap complete: ${totalChanged} text node(s) wrapped across ${svgFiles.length} file(s)`,
    stderr: '',
    duration_ms: Date.now() - started,
    changed: totalChanged,
    files: changedFiles,
  };
}

function compactParamsForError(params: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  const compactValue = (item: unknown): unknown => {
    if (typeof item === 'string') return item.length > 800 ? `${item.slice(0, 800)}...[truncated ${item.length - 800} chars]` : item;
    if (!item || typeof item !== 'object' || Array.isArray(item)) return item;
    const obj = { ...(item as Record<string, unknown>) };
    for (const key of ['svg', 'content']) {
      if (typeof obj[key] === 'string' && (key === 'svg' || /<svg\b/i.test(obj[key] as string))) {
        obj[key] = `[svg omitted from error detail; chars=${(obj[key] as string).length}]`;
      }
    }
    return obj;
  };
  for (const [key, value] of Object.entries(params)) {
    if (key === 'svg' && typeof value === 'string') {
      out[key] = `[svg omitted from error detail; chars=${value.length}]`;
    } else if (key === 'content' && typeof value === 'string' && /<svg\b/i.test(value)) {
      out[key] = `[svg content omitted from error detail; chars=${value.length}]`;
    } else if (typeof value === 'string' && value.length > 800) {
      out[key] = `${value.slice(0, 800)}...[truncated ${value.length - 800} chars]`;
    } else if (Array.isArray(value)) {
      out[key] = value.map(compactValue);
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

function cleanIllegalSvgChars(content: string): string {
  const namedEntities: Record<string, string> = {
    '&nbsp;': ' ',
    '&ensp;': ' ',
    '&emsp;': ' ',
    '&thinsp;': ' ',
    '&mdash;': '—',
    '&ndash;': '–',
    '&hellip;': '…',
    '&ldquo;': '“',
    '&rdquo;': '”',
    '&lsquo;': '‘',
    '&rsquo;': '’',
    '&copy;': '©',
  };
  return content
    .replace(/^\uFEFF/, '')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .replace(/&(nbsp|ensp|emsp|thinsp|mdash|ndash|hellip|ldquo|rdquo|lsquo|rsquo|copy);/gi, (m) => namedEntities[m.toLowerCase()] || '')
    .replace(/(?:…+|⋯+|\.{3,}|。{3,})/g, ' ')
    .replace(/&(?!(?:amp|lt|gt|quot|apos|#[0-9]+|#x[0-9a-fA-F]+);)/g, '&amp;');
}

function normalizePptSvgFonts(content: string): { content: string; repaired: boolean } {
  let repaired = false;
  const next = content.replace(/\bfont-family\s*=\s*(['"])(.*?)\1/gi, (raw, quote: string, family: string) => {
    const ok = PPT_SAFE_FONTS.some((font) => String(family || '').includes(font));
    if (ok && String(family || '').includes('Microsoft YaHei')) return raw;
    repaired = true;
    return `font-family=${quote}${PPT_SAFE_FONT_STACK}${quote}`;
  });
  return { content: next, repaired };
}

function normalizePptSvgRootForSlide(rawContent: string): { content: string; repaired: boolean } {
  let content = cleanIllegalSvgChars(stripCodeFence(rawContent)).trim();
  let repaired = false;
  const start = content.search(/<svg\b/i);
  const end = content.toLowerCase().lastIndexOf('</svg>');
  if (start >= 0 && end >= 0 && end > start) {
    content = content.slice(start, end + '</svg>'.length).trim();
  } else if (start >= 0 || end >= 0) {
    throw new SkillExecutionError('PPT SVG 根标签不完整');
  } else {
    const hasSvgChildren = /<(?:defs|g|rect|circle|ellipse|line|polyline|polygon|path|text|tspan|linearGradient|radialGradient|clipPath|mask)\b/i.test(content);
    const looksLikeTextOnly = !/[<>]/.test(content) || /^#+\s|^[-*]\s|\b(svg|页面|幻灯片|这里|以下)\b/i.test(content.slice(0, 120));
    if (!hasSvgChildren || looksLikeTextOnly) throw new SkillExecutionError('PPT SVG 缺少根 <svg> 标签');
    content = `<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="720" viewBox="0 0 1280 720">\n${content}\n</svg>`;
    repaired = true;
  }
  const root = content.match(/<svg\b[^>]*>/i)?.[0] || '';
  if (!root) throw new SkillExecutionError('PPT SVG 缺少根 <svg> 标签');
  const normalizedRoot = '<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="720" viewBox="0 0 1280 720">';
  if (root !== normalizedRoot) {
    content = content.replace(/<svg\b[^>]*>/i, normalizedRoot);
    repaired = true;
  }
  const fontNormalized = normalizePptSvgFonts(content);
  content = fontNormalized.content;
  repaired = repaired || fontNormalized.repaired;
  return { content, repaired };
}

function normalizePptSvgCanvas(target: string, rawContent: string): { content: string; repaired: boolean } {
  if (!target.includes('/svg_output/') || !target.endsWith('.svg')) return { content: rawContent, repaired: false };
  let content = cleanIllegalSvgChars(stripCodeFence(rawContent)).trim();
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
  const fontNormalized = normalizePptSvgFonts(content);
  content = fontNormalized.content;
  repaired = repaired || fontNormalized.repaired;
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
  for (const match of content.matchAll(/\bfont-family\s*=\s*(['"])(.*?)\1/gi)) {
    const family = match[2] || '';
    if (!PPT_SAFE_FONTS.some((font) => family.includes(font))) {
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
function hiddenSkillIds(): Set<string> {
  const hidden = new Set(DEFAULT_HIDDEN_SKILL_IDS);
  for (const id of (process.env.HIDDEN_SKILL_IDS || '').split(',')) {
    const value = id.trim();
    if (value) hidden.add(value);
  }
  return hidden;
}

function scanSkillScripts(allowedSkillIds?: Set<string>): Record<string, string[]> {
  const result: Record<string, string[]> = {};
  if (!fs.existsSync(SKILLS_DIR)) return result;
  const pptInternal = new Set([
    ...PPT_MANUAL_EXPORT_SCRIPTS,
    'project_manager.py', 'svg_text_wrap.py',
    'project_manager.ts', 'svg_text_wrap.ts', 'total_md_split.ts', 'finalize_svg.ts', 'svg_to_pptx.ts', 'validate_editable_pptx.ts',
  ]);
  const dedicatedActionSkills = new Set(['px-data']);
  const hidden = hiddenSkillIds();
  for (const skillEntry of fs.readdirSync(SKILLS_DIR, { withFileTypes: true })) {
    if (!skillEntry.isDirectory()) continue;
    const skillId = skillEntry.name;
    if (hidden.has(skillId)) continue;
    if (allowedSkillIds && !allowedSkillIds.has(skillId)) continue;
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
  // Keep it narrow by task mode; broad specs slow the model down and make it pick obsolete tools.
  actionSpec(options: ActionSpecOptions = {}): Record<string, unknown> {
    const mode = options.mode || 'general';
    const finalShape = { type: 'final', answer: '<业务用户可读中文回答>', deliverable_files: [] };
    const pxMetricParams = {
      prefetch_metrics: {
        skill_id: 'px-data',
        dateRange: { start: 'YYYY-MM-DD', end: 'YYYY-MM-DD' },
        compareRange: { start: 'YYYY-MM-DD', end: 'YYYY-MM-DD' },
        projectId: '可选',
        contentId: '可选',
        diseaseId: '可选',
        granularity: 'day|week|month',
        limit: 20,
      },
      read_metric_file: { skill_id: 'px-data', path: 'available_metric_stores[].path 中的 /generated/.../_metrics/*.json', max_chars: '可选，默认 12000' },
    };
    const overviewScripts = { 'patient-education-data-overview': ['scripts/render_overview_assets.ts'] };

    if (mode === 'data-qa') {
      return {
        mode,
        actions: ['prefetch_data_qa_context', 'prefetch_metrics', 'read_metric_file'],
        final_shape: finalShape,
        skill_call_shape: { type: 'skill_call', skill_id: 'px-data', action: '<prefetch_data_qa_context|prefetch_metrics|read_metric_file>', params: {}, thought: '<reason>' },
        params: {
          ...pxMetricParams,
          prefetch_data_qa_context: { skill_id: 'px-data', params: '无需参数；用于指标定义、数据可用性、数据状态和空值诊断' },
        },
      };
    }

    if (mode === 'overview') {
      return {
        mode,
        actions: ['run_skill_script', 'prefetch_metrics', 'read_metric_file'],
        final_shape: finalShape,
        skill_call_shape: { type: 'skill_call', skill_id: 'patient-education-data-overview | px-data', action: '<run_skill_script|prefetch_metrics|read_metric_file>', params: {}, thought: '<reason>' },
        params: {
          ...pxMetricParams,
          run_skill_script: {
            skill_id: 'patient-education-data-overview',
            script: 'scripts/render_overview_assets.ts',
            available_scripts: overviewScripts,
            args: ['--visual-plan', '{"title":"患教内容运营数据概览","insights":["核心表现","结构贡献","行动建议"],"top_content_count":5,"breakdown_count":5}'],
            timeout_sec: 120,
          },
        },
      };
    }

    if (mode === 'monthly') {
      return {
        mode,
        actions: ['write_text_deliverable', 'prefetch_metrics', 'read_metric_file'],
        final_shape: finalShape,
        skill_call_shape: { type: 'skill_call', skill_id: 'patient-education-monthly-report | px-data', action: '<write_text_deliverable|prefetch_metrics|read_metric_file>', params: {}, thought: '<reason>' },
        params: {
          ...pxMetricParams,
          write_text_deliverable: { skill_id: 'patient-education-monthly-report', file_name: 'monthly_report.md', content: '完整 Markdown 正文；后端会自动转 PDF' },
        },
      };
    }

    if (mode === 'ppt-svg' || mode === 'ppt-edit-svg') {
      const isEdit = mode === 'ppt-edit-svg';
      return {
        mode,
        actions: isEdit
          ? ['read_project_file', 'ppt_master_clone_for_edit', 'write_project_file', 'write_project_files', 'write_ppt_svg_slide', 'ppt_master_export']
          : ['emit_text', 'prefetch_metrics', 'read_metric_file', 'write_project_file', 'write_project_files', 'write_ppt_svg_slide', 'ppt_master_bootstrap', 'ppt_master_export'],
        final_shape: finalShape,
        skill_call_shape: { type: 'skill_call', skill_id: 'ppt-master | px-data', action: '<action>', params: {}, thought: '<reason>' },
        params: {
          ...(isEdit ? {} : { emit_text: { content: '先展示给用户的 300-800 字中文正文/摘要；不会结束任务，后续继续生成文件' } }),
          ...(isEdit ? {} : pxMetricParams),
          ppt_master_bootstrap: { skill_id: 'ppt-master', project_name: 'px_ai_ppt', format: 'ppt169' },
          ppt_master_clone_for_edit: { skill_id: 'ppt-master', source_project_path: 'projects/上一版项目', edit_pages: [4], copy_pages: [1, 2, 3, 5, 6, 7], project_name: 'px_ai_ppt_edit' },
          write_project_file: { skill_id: 'ppt-master', project_path: 'projects/...', path: 'design_spec.md 或 spec_lock.md 或 notes/total.md', content: '完整文件内容' },
          write_project_files: { skill_id: 'ppt-master', project_path: 'projects/...', files: [{ path: 'design_spec.md', content: '...' }] },
          write_ppt_svg_slide: {
            skill_id: 'ppt-master',
            project_path: 'projects/...',
            slide_no: 1,
            title: '本页标题',
            core_conclusion: '本页核心结论/一句话 takeaway（用于压缩上下文与进度展示）',
            svg: '<svg width="1280" height="720" viewBox="0 0 1280 720" xmlns="http://www.w3.org/2000/svg">...</svg>',
            file_name: '不建议提供；后端统一按 slide_no 写入 svg_output/NN_slide.svg，避免同页多文件',
            backend_repairs: ['校验/抽取 SVG 根标签', '自动补齐 width/height/viewBox/xmlns', '清理 XML 非法控制字符和常见 HTML 实体', '成功后上下文只保留页码/路径/标题/结论'],
          },
          ppt_master_export: { skill_id: 'ppt-master', project_path: 'projects/...' },
          ppt_svg_rules: {
            canvas: '<svg width="1280" height="720" viewBox="0 0 1280 720" xmlns="http://www.w3.org/2000/svg">',
            editable_primitives: ['rect', 'circle', 'ellipse', 'line', 'polyline', 'polygon', 'path', 'text', 'tspan'],
            notes_file: 'notes/total.md',
            max_svg_pages_per_call: PPT_SVG_BATCH_MAX_PAGES,
          },
        },
      };
    }

    return {
      mode,
      actions: ['prefetch_data_qa_context', 'prefetch_metrics', 'read_metric_file', 'run_skill_script', 'write_text_deliverable'],
      final_shape: finalShape,
      skill_call_shape: { type: 'skill_call', skill_id: 'px-data | patient-education-data-overview | patient-education-monthly-report', action: '<action>', params: {}, thought: '<reason>' },
      params: {
        ...pxMetricParams,
        prefetch_data_qa_context: { skill_id: 'px-data', params: '无需参数；用于指标定义、数据可用性、数据状态和空值诊断' },
        run_skill_script: { script: 'skill_id 目录下的脚本相对路径', available_scripts: overviewScripts, args: ['可选命令行参数'] },
        write_text_deliverable: { file_name: '纯文件名；概览/月报会按 skill 固定为 overview_report.md / monthly_report.md', content: '完整 Markdown 正文' },
      },
      note: '普通对话不暴露 PPT/SVG 大 schema；PPT 快捷入口使用后端专门的结构化快路径。',
    };
  }

  describeCall(call: SkillCall): string {
    return `${call.skill_id || 'skill'}.${call.action || 'action'}`;
  }

  isBackgroundCall(call: SkillCall): boolean {
    return call.skill_id === 'ppt-master' && call.action === 'ppt_master_export' && process.env.AI_HELPER_PPT_EXPORT_BACKGROUND === 'true';
  }

  private scopedMetricParams(params: Record<string, unknown>): Record<string, unknown> {
    const tenantId = str(this.options.tenantId);
    return tenantId ? { ...params, tenantId } : params;
  }

  async execute(call: SkillCall): Promise<SkillResult> {
    try {
      return await this.executeStrict(call);
    } catch (err) {
      return { ok: false, recoverable: true, summary: this.describeCall(call), error: err instanceof Error ? err.message : String(err), detail: { skill_id: call.skill_id, action: call.action, params: compactParamsForError((call.params || {}) as Record<string, unknown>) } };
    }
  }

  async executeStrict(call: SkillCall): Promise<SkillResult> {
    if (this.options.signal?.aborted) throw abortExecutionError();
    const skillId = str(call.skill_id);
    const action = str(call.action);
    const params = (call.params || {}) as Record<string, unknown>;
    if (!skillId || !action) throw new SkillExecutionError('skill_id and action are required');
    if (skillId === 'data-autoload-from-data-dir') throw new SkillExecutionError('data-autoload 已禁用；PX 数据必须通过 px-data 获取');
    if (!fs.existsSync(path.join(SKILLS_DIR, skillId)) && skillId !== 'px-data') throw new SkillExecutionError('请使用可用 skills 目录中的能力继续');
    if (skillId === 'sql-pro' && action === 'postgres_query' && process.env.AI_HELPER_ENABLE_SQL_PRO !== 'true') {
      throw new SkillExecutionError('sql-pro.postgres_query 当前未启用；请使用 px-data 结构化查询');
    }

    let result: SkillResult;
    if (action === 'emit_text') result = this.emitText(params);
    else if (skillId === 'px-data' && action === 'prefetch_metrics') result = await this.runSkillScript('px-data', 'scripts/prefetch_metrics.ts', [JSON.stringify(this.scopedMetricParams(params))], 120_000);
    else if (skillId === 'px-data' && action === 'prefetch_data_qa_context') result = await this.runSkillScript('px-data', 'scripts/prefetch_data_qa_context.ts', [JSON.stringify(this.scopedMetricParams(params))], 120_000);
    else if (skillId === 'px-data' && action === 'read_metric_file') result = await this.readMetricFile(params);
    else if (action === 'read_skill_file') result = await this.readSkillFile(skillId, str(params.path || 'SKILL.md'), Number(params.max_chars || 12000));
    else if (action === 'run_skill_script') result = await this.runSkillScript(skillId, str(params.script), Array.isArray(params.args) ? params.args.map(String) : [], Number(params.timeout_sec || 300) * 1000);
    else if (action === 'write_text_deliverable') result = await this.writeTextDeliverable(skillId, params);
    else if (action === 'write_project_file') result = await this.writeProjectFile(skillId, params);
    else if (action === 'write_project_files') result = await this.writeProjectFiles(skillId, params);
    else if (action === 'write_ppt_svg_slide') result = await this.writePptSvgSlide(skillId, params);
    else if (action === 'render_ppt_from_specs') result = await this.renderPptFromSpecs(skillId, params);
    else if (action === 'read_project_file') result = await this.readProjectFile(params);
    else if (action === 'ppt_master_bootstrap') result = await this.pptMasterBootstrap(params);
    else if (action === 'ppt_master_clone_for_edit') result = await this.pptMasterCloneForEdit(params);
    else if (action === 'ppt_master_export') result = await this.pptMasterExport(params);
    else throw new SkillExecutionError(`unsupported action: ${action}`);
    return this.publishResultFiles(result);
  }

  private async publishResultFiles(result: SkillResult): Promise<SkillResult> {
    if (!this.options.publishFiles || result.ok === false) return result;
    const originals = [
      ...(Array.isArray(result.files) ? result.files.filter((file): file is string => typeof file === 'string') : []),
      ...(typeof result.file === 'string' ? [result.file] : []),
    ];
    if (!originals.length) return result;
    const uniqueOriginals = [...new Set(originals)];
    const published = await this.options.publishFiles(uniqueOriginals);
    const map = new Map(uniqueOriginals.map((file, index) => [file, published[index] || file]));
    return {
      ...result,
      files: Array.isArray(result.files) ? result.files.map((file) => map.get(file) || file) : result.files,
      file: typeof result.file === 'string' ? map.get(result.file) || result.file : result.file,
    };
  }

  private async readSkillFile(skillId: string, rel: string, maxChars: number): Promise<SkillResult> {
    const file = safeUnder(path.join(SKILLS_DIR, skillId), rel || 'SKILL.md');
    const content = await fsp.readFile(file, 'utf8');
    return jsonResult(`读取 skill 文件 ${skillId}/${rel}`, { kind: 'read_skill', path: path.relative(SKILLS_DIR, file) }, { content: content.slice(0, Math.max(1000, maxChars)) });
  }

  private emitText(params: Record<string, unknown>): SkillResult {
    const text = sanitizeUserContent(str(params.content || params.text || params.markdown || params.answer));
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
    if (skillId === 'md-to-pdf') {
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
    if (ext === '.ts') run = await exec(tsxExecutable(), [script, ...finalArgs], SERVER_ROOT, timeout, this.options.signal);
    else if (ext === '.py') run = await exec(pythonExecutable(skillId === 'md-to-pdf' ? ['reportlab', 'PIL', 'fitz'] : []), [script, ...finalArgs], SERVER_ROOT, timeout, this.options.signal);
    else run = await exec(script, finalArgs, SERVER_ROOT, timeout, this.options.signal);
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
    if (raw.startsWith('/generated/') || raw.startsWith('/projects/')) return path.join(AI_HELPER_ROOT, raw.slice(1));
    if (raw.startsWith('generated/') || raw.startsWith('projects/')) return path.join(AI_HELPER_ROOT, raw);
    if (path.isAbsolute(raw)) return raw;
    if (raw.startsWith('server/')) return path.resolve(WORKSPACE_ROOT, raw);
    return path.join(this.outputDir, path.basename(raw));
  }

  private async writeTextDeliverable(skillId: string, params: Record<string, unknown>): Promise<SkillResult> {
    const canonical: Record<string, string> = {
      'patient-education-data-overview': 'overview_report.md',
      'patient-education-monthly-report': 'monthly_report.md',
    };
    const fileName = canonical[skillId] || normalizeGeneratedName(params.file_name || 'report.md');
    const content = sanitizeUserContent(str(params.content || params.markdown || params.text));
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
    let content = sanitizeUserContent(str(params.content));
    if (!inputRel || !content) throw new SkillExecutionError('write_project_file requires params.path and params.content');
    const normalizedRel = normalizePptProjectRel(project, inputRel);
    const rel = normalizedRel.rel;
    if (!(PPT_MANUAL_SVG_ENABLED || this.options.allowManualPptSvg) && rel.startsWith('svg_output/') && rel.toLowerCase().endsWith('.svg')) {
      throw new SkillExecutionError('模型手写 SVG 当前已禁用；请改用 render_ppt_from_specs，让后端组件库生成 svg_output/*.svg。');
    }
    if (path.basename(rel) === 'spec_lock.md') validateSpecLock(content);
    const out = safeUnder(AI_HELPER_ROOT, path.join(project, rel));
    const existed = fs.existsSync(out) && fs.statSync(out).size > 0;
    if (existed && !isOverwriteAllowedProjectFile(rel, params)) {
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
      `${existed ? '更新' : '写入'}项目文件 ${relToHelper(out)}`,
      { kind: 'write_project', path: relToHelper(out), repaired_svg_root: normalized.repaired, moved_from: normalizedRel.moved_from, requested_path: inputRel, normalized_path: rel, overwritten: existed || undefined },
      { file: relToHelper(out), files: [relToHelper(out)] },
    );
  }

  private async writePptSvgSlide(skillId: string, params: Record<string, unknown>): Promise<SkillResult> {
    if (skillId !== 'ppt-master') throw new SkillExecutionError('write_ppt_svg_slide requires skill_id ppt-master');
    const slideNo = Number(params.slide_no || params.slideNo);
    if (!Number.isInteger(slideNo) || slideNo < 1 || slideNo > 99) throw new SkillExecutionError('write_ppt_svg_slide requires params.slide_no 1-99');
    const title = sanitizeUserContent(str(params.title) || `第 ${slideNo} 页`);
    const coreConclusion = sanitizeUserContent(str(params.core_conclusion || params.takeaway || params.conclusion || params.objective));
    const rawSvg = sanitizeUserContent(str(params.svg || params.content));
    if (!rawSvg) throw new SkillExecutionError('write_ppt_svg_slide requires params.svg');
    const normalizedSvg = normalizePptSvgRootForSlide(rawSvg);
    validatePptSvgLint(normalizedSvg.content);

    const requestedFileName = str(params.file_name || params.path);
    const fileName = canonicalPptSlideFileName(slideNo);
    const rel = `svg_output/${fileName}`;
    const result = await this.writeProjectFile(skillId, { ...params, path: rel, content: normalizedSvg.content });
    const detail = result.detail && typeof result.detail === 'object' ? result.detail as Record<string, unknown> : {};
    const file = typeof result.file === 'string' ? result.file : String(detail.path || '');
    return jsonResult(
      `写入第 ${slideNo} 页 SVG ${file || rel}`,
      {
        kind: 'write_ppt_svg_slide',
        slide_no: slideNo,
        title,
        core_conclusion: coreConclusion,
        path: file || detail.path || rel,
        repaired_svg_root: normalizedSvg.repaired || Boolean(detail.repaired_svg_root),
        reused_existing: Boolean(detail.reused_existing),
        requested_file_name: requestedFileName || undefined,
        normalized_file_name: fileName,
      },
      { file: file || undefined, files: result.files || (file ? [file] : []) },
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
    const svgDir = path.join(root, 'svg_output');
    const existingSvgs = fs.existsSync(svgDir) ? fs.readdirSync(svgDir).filter((name) => name.toLowerCase().endsWith('.svg')) : [];
    if (fs.existsSync(path.join(root, 'renderer_meta.json')) || existingSvgs.length) {
      throw new SkillExecutionError('render_ppt_from_specs 必须一次性输出完整 slides；当前项目已渲染过 SVG，禁止再次追加或覆盖。请新建项目后一次性提交完整 deck spec。');
    }
    const rendered = await renderPptDeckFromSpecs(root, project, sanitizeUserContentDeep(params));
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
    const format = normalizePptCanvasFormat(str(params.format || 'ppt169'));
    const canvas = PPT_CANVAS_FORMATS[format];
    if (!canvas) throw new SkillExecutionError(`Unsupported canvas format: ${format}`);
    const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const abs = path.join(PROJECTS_DIR, `${projectName}_${format}_${date}`);
    if (fs.existsSync(abs)) throw new SkillExecutionError(`Project directory already exists: ${path.relative(AI_HELPER_ROOT, abs)}`);

    for (const rel of ['svg_output', 'svg_final', 'images', 'notes', 'templates', 'sources', 'exports']) {
      await fsp.mkdir(path.join(abs, rel), { recursive: true });
    }
    await fsp.writeFile(path.join(abs, 'README.md'), [
      `# ${projectName}`,
      '',
      `- Canvas format: ${format}`,
      `- Created: ${date}`,
      '',
      '## Directories',
      '',
      '- `svg_output/`: raw SVG output',
      '- `svg_final/`: finalized SVG output',
      '- `images/`: presentation assets',
      '- `notes/`: speaker notes',
      '- `templates/`: project templates',
      '- `sources/`: source materials and normalized markdown',
      '- `exports/`: main native pptx (timestamped)',
      '- `backup/<timestamp>/`: SVG snapshot pptx + svg_output/ archive (auto-created on export; safe to delete old timestamps)',
      '',
    ].join('\n'), 'utf8');

    const projectPath = path.relative(AI_HELPER_ROOT, abs).split(path.sep).join('/');
    return jsonResult(
      `新建 PPT 项目 ${projectPath}`,
      { kind: 'bootstrap', project_path: projectPath, runtime: 'node-ts', canvas: { format, ...canvas } },
      { project_path: projectPath },
    );
  }

  private parsePageNumbers(value: unknown): number[] {
    if (!Array.isArray(value)) return [];
    return [...new Set(value.map(Number).filter((n) => Number.isInteger(n) && n > 0 && n < 100))].sort((a, b) => a - b);
  }

  private async pptMasterCloneForEdit(params: Record<string, unknown>): Promise<SkillResult> {
    const sourceProject = str(params.source_project_path || params.sourceProjectPath).replace(/^\/+/, '');
    if (!sourceProject) throw new SkillExecutionError('ppt_master_clone_for_edit requires params.source_project_path');
    const editPages = this.parsePageNumbers(params.edit_pages || params.editPages);
    if (!editPages.length) throw new SkillExecutionError('ppt_master_clone_for_edit requires params.edit_pages');
    const copyPages = this.parsePageNumbers(params.copy_pages || params.copyPages);
    const sourceAbs = safeUnder(AI_HELPER_ROOT, sourceProject);
    if (!fs.existsSync(sourceAbs) || !fs.statSync(sourceAbs).isDirectory()) {
      await restoreAiHelperProjectFromOss(sourceProject);
    }
    if (!fs.existsSync(sourceAbs) || !fs.statSync(sourceAbs).isDirectory()) throw new SkillExecutionError(`source_project_path not found: ${sourceProject}`);

    await fsp.mkdir(PROJECTS_DIR, { recursive: true });
    const name = str(params.project_name || 'px_ai_ppt_edit').replace(/[^a-zA-Z0-9_.-]+/g, '_') || 'px_ai_ppt_edit';
    const targetName = `${name}_run_${Date.now()}_ppt169_${new Date().toISOString().slice(0, 10).replace(/-/g, '')}`;
    const targetAbs = safeUnder(PROJECTS_DIR, targetName);
    await fsp.cp(sourceAbs, targetAbs, {
      recursive: true,
      filter: (src) => !/(^|\/)(exports|svg_final|backup)(\/|$)/.test(src.replace(/\\/g, '/')),
    });

    const svgDir = path.join(targetAbs, 'svg_output');
    const removed: string[] = [];
    if (fs.existsSync(svgDir)) {
      for (const file of await fsp.readdir(svgDir)) {
        const match = file.match(/^(\d{1,2})[_-].*\.svg$/i);
        const slideNo = match ? Number(match[1]) : undefined;
        if (slideNo && editPages.includes(slideNo)) {
          const abs = path.join(svgDir, file);
          await fsp.rm(abs, { force: true });
          removed.push(relToHelper(abs));
        }
      }
    }

    const targetProject = path.relative(AI_HELPER_ROOT, targetAbs).split(path.sep).join('/');
    const files = fs.existsSync(svgDir)
      ? (await fsp.readdir(svgDir)).filter((file) => file.toLowerCase().endsWith('.svg')).map((file) => relToHelper(path.join(svgDir, file)))
      : [];
    return jsonResult(
      `复制上一版 PPT 项目并清空待编辑页 ${editPages.join(', ')}`,
      { kind: 'ppt_clone_for_edit', source_project_path: sourceProject, project_path: targetProject, edit_pages: editPages, copy_pages: copyPages, removed },
      { project_path: targetProject, files },
    );
  }

  pptMasterExportPrecheck(params: Record<string, unknown>): { ok: boolean; missing: string[]; project_path?: string; svg_count: number; has_total_md: boolean; moved_files?: Array<{ from: string; to: string; skipped?: boolean; reason: string }>; notes_repaired?: boolean; notes_missing_sections?: string[] } {
    const project = str(params.project_path).replace(/^\/+/, '');
    const missing: string[] = [];
    if (!project) return { ok: false, missing: ['params.project_path'], svg_count: 0, has_total_md: false };
    const root = safeUnder(AI_HELPER_ROOT, project);
    const movedFiles = repairPptProjectLayoutSync(root);
    const svgDir = path.join(root, 'svg_output');
    const svgs = fs.existsSync(svgDir) ? fs.readdirSync(svgDir).filter((x) => x.endsWith('.svg')) : [];
    const notesRepair = svgs.length ? repairPptNotesForSvgFilesSync(root) : { repaired: false, missing: [] as string[], path: path.join(root, 'notes', 'total.md') };
    const hasTotal = fs.existsSync(path.join(root, 'notes', 'total.md'));
    if (!svgs.length) missing.push('svg_output/*.svg');
    if (!hasTotal) missing.push('notes/total.md');
    return { ok: !missing.length, missing, project_path: project, svg_count: svgs.length, has_total_md: hasTotal, moved_files: movedFiles, notes_repaired: notesRepair.repaired, notes_missing_sections: notesRepair.missing };
  }

  private async pptMasterExport(params: Record<string, unknown>): Promise<SkillResult> {
    const pre = this.pptMasterExportPrecheck(params);
    if (!pre.ok) throw new SkillExecutionError(`ppt-master 导出前置条件未满足: ${pre.missing.join(', ')}`);
    const project = pre.project_path || '';
    const projectAbs = safeUnder(AI_HELPER_ROOT, project);
    const runs: ScriptRun[] = [];
    const isProgrammaticSpecRender = fs.existsSync(path.join(projectAbs, 'renderer_meta.json'));
    runs.push(splitPptTotalNotesSync(projectAbs));
    if (!isProgrammaticSpecRender) runs.push(wrapPptSvgTextSync(projectAbs));
    runs.push(finalizePptSvgSync(projectAbs));
    const exported = exportPptProjectToPptxSync(projectAbs, { projectName: path.basename(projectAbs), format: 'ppt169' });
    runs.push(exported.run);
    const pptx = exported.pptxPath;
    if (!pptx || !fs.existsSync(pptx)) throw new SkillExecutionError('ppt-master 导出完成但未找到可编辑 PPTX');
    const validation = validateEditablePptxSync(pptx);
    runs.push(validation);
    if (!validation.ok) throw new SkillExecutionError('ppt-master 导出完成但 PPTX 未包含可编辑形状');
    await fsp.mkdir(this.outputDir, { recursive: true });
    const out = safeGeneratedPath(this.outputDir, `ppt_${new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14)}.pptx`);
    await fsp.copyFile(pptx, out);
    return jsonResult(
      `导出可编辑 PPTX ${toAssetPath(out)}`,
      {
        kind: 'ppt_export',
        project_path: project,
        svg_count: pre.svg_count,
        notes_repaired: pre.notes_repaired,
        notes_missing_sections: pre.notes_missing_sections,
        scripts: runs.map((r) => ({ command: r.command, duration_ms: r.duration_ms })),
      },
      { file: toAssetPath(out), files: [toAssetPath(out)] },
    );
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
