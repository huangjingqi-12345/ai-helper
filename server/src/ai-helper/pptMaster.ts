import fs from 'fs/promises';
import fsSync from 'fs';
import path from 'path';
import { execFile } from 'child_process';
import { AI_HELPER_ROOT, PROJECTS_DIR, safeGeneratedPath, toAssetPath } from './paths.js';

export interface PptMasterSlidePlan {
  file_name: string;
  title: string;
  objective?: string;
  visual_plan?: string;
  notes_points?: string[];
}

export interface PptMasterPlan {
  design_spec: string;
  spec_lock: string;
  slides: PptMasterSlidePlan[];
}

export interface PptMasterSlideContent {
  file_name: string;
  title: string;
  svg: string;
  notes: string;
}

export interface PptMasterExportResult {
  file: string;
  projectPath: string;
  slideCount: number;
  scripts: Array<{ script: string; args: string[]; command: string; duration_ms: number; stdout: string; stderr: string }>;
  validation?: unknown;
}

const SERVER_ROOT = path.resolve(AI_HELPER_ROOT, '..');
const WORKSPACE_ROOT = path.resolve(SERVER_ROOT, '../..');
const LEGACY_AI_HELPER_ROOT = path.join(WORKSPACE_ROOT, 'ai-helper');
const PPT_MASTER_SCRIPTS = path.join(LEGACY_AI_HELPER_ROOT, 'skills', 'ppt-master', 'scripts');

function pythonExecutable(): string {
  const configured = (process.env.PPT_MASTER_PYTHON || '').trim();
  if (configured) return configured;
  const venvPython = path.join(LEGACY_AI_HELPER_ROOT, '.venv', 'bin', 'python');
  if (fsSync.existsSync(venvPython)) return venvPython;
  return 'python3';
}

function commandFor(script: string, args: string[]): string {
  return [pythonExecutable(), script, ...args].join(' ');
}

async function runPythonScript(scriptName: string, args: string[], timeout = 600_000): Promise<PptMasterExportResult['scripts'][number]> {
  const script = path.join(PPT_MASTER_SCRIPTS, scriptName);
  const started = Date.now();
  const command = commandFor(script, args);
  try {
    const { stdout, stderr } = await new Promise<{ stdout: string; stderr: string }>((resolve, reject) => {
      execFile(
        pythonExecutable(),
        [script, ...args],
        {
          cwd: LEGACY_AI_HELPER_ROOT,
          timeout,
          maxBuffer: 50 * 1024 * 1024,
          env: process.env,
        },
        (error, stdout, stderr) => {
          if (error) {
            reject(Object.assign(error, { stdout, stderr }));
          } else {
            resolve({ stdout, stderr });
          }
        },
      );
    });
    return { script, args, command, duration_ms: Date.now() - started, stdout, stderr };
  } catch (err) {
    const stdout = typeof (err as { stdout?: unknown }).stdout === 'string' ? String((err as { stdout: string }).stdout) : '';
    const stderr = typeof (err as { stderr?: unknown }).stderr === 'string' ? String((err as { stderr: string }).stderr) : '';
    const detail = [stderr, stdout].filter(Boolean).join('\n').trim();
    throw new Error(`ppt-master 脚本执行失败：${scriptName}\n${command}\n${detail || (err instanceof Error ? err.message : String(err))}`);
  }
}

export function parseJsonObject<T = Record<string, unknown>>(raw: string, label: string): T {
  const text = String(raw || '').trim().replace(/^```(?:json)?\s*/i, '').replace(/```$/i, '').trim();
  try {
    return JSON.parse(text) as T;
  } catch {
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(text.slice(start, end + 1)) as T;
      } catch {
        // fall through
      }
    }
    throw new Error(`${label} 未返回可解析 JSON`);
  }
}

function asString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function safeSvgFileName(value: unknown, index: number): string {
  const raw = path.basename(asString(value) || `slide_${index + 1}.svg`);
  const withoutExt = raw.replace(/\.svg$/i, '');
  const safe = withoutExt.replace(/[^a-zA-Z0-9_\-.]+/g, '_').replace(/^[_\-.]+|[_\-.]+$/g, '') || `slide_${index + 1}`;
  const numbered = /^\d{2}_/.test(safe) ? safe : `${String(index + 1).padStart(2, '0')}_${safe}`;
  return `${numbered}.svg`;
}

export function normalizePptPlan(raw: string): PptMasterPlan {
  const parsed = parseJsonObject<Record<string, unknown>>(raw, 'PPT plan');
  const designSpec = asString(parsed.design_spec);
  const specLock = asString(parsed.spec_lock);
  if (!designSpec) throw new Error('PPT plan 缺少 design_spec');
  if (!specLock) throw new Error('PPT plan 缺少 spec_lock');
  const rawSlides = Array.isArray(parsed.slides) ? parsed.slides : [];
  if (rawSlides.length < 1) throw new Error('PPT plan 缺少 slides');
  const used = new Set<string>();
  const slides = rawSlides.slice(0, 10).map((item, index) => {
    const obj = (item && typeof item === 'object' ? item : {}) as Record<string, unknown>;
    let fileName = safeSvgFileName(obj.file_name, index);
    while (used.has(fileName)) {
      fileName = safeSvgFileName(fileName.replace(/\.svg$/i, `_${used.size + 1}.svg`), index);
    }
    used.add(fileName);
    const title = asString(obj.title) || `第 ${index + 1} 页`;
    const notesPoints = Array.isArray(obj.notes_points) ? obj.notes_points.map(asString).filter(Boolean) : undefined;
    return {
      file_name: fileName,
      title,
      objective: asString(obj.objective),
      visual_plan: asString(obj.visual_plan),
      notes_points: notesPoints,
    };
  });
  return { design_spec: designSpec, spec_lock: specLock, slides };
}

function extractSvg(raw: string): string {
  const text = String(raw || '').trim().replace(/^```(?:svg)?\s*/i, '').replace(/```$/i, '').trim();
  const start = text.search(/<svg\b/i);
  const end = text.toLowerCase().lastIndexOf('</svg>');
  if (start < 0 || end < 0) throw new Error('PPT slide 未返回完整 SVG');
  return text.slice(start, end + '</svg>'.length).trim();
}

export function sanitizePptSvg(raw: string): string {
  let svg = extractSvg(raw);
  if (/<(script|foreignObject|iframe|object|embed|link|meta|image)\b/i.test(svg)) {
    throw new Error('PPT SVG 包含禁止元素（script/foreignObject/iframe/object/embed/link/meta/image）');
  }
  if (/\s+on[a-z]+\s*=/i.test(svg)) throw new Error('PPT SVG 包含事件处理属性');
  if (/(?:href|xlink:href)\s*=\s*["']\s*(?:https?:|data:)?\/\//i.test(svg)) throw new Error('PPT SVG 包含外链资源');
  if (/url\(\s*["']?\s*(?:https?:|data:)?\/\//i.test(svg)) throw new Error('PPT SVG 包含外链 URL');
  svg = svg.replace(/<svg\b[^>]*>/i, '<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="720" viewBox="0 0 1280 720">');
  return svg;
}

export function normalizePptSlideContent(raw: string, plan: PptMasterSlidePlan): PptMasterSlideContent {
  const parsed = parseJsonObject<Record<string, unknown>>(raw, `PPT slide ${plan.file_name}`);
  const svg = sanitizePptSvg(asString(parsed.svg));
  const notes = asString(parsed.notes);
  if (!notes) throw new Error(`PPT slide ${plan.file_name} 缺少 notes`);
  return { file_name: plan.file_name, title: plan.title, svg, notes };
}

async function initProject(): Promise<{ projectPath: string; script: PptMasterExportResult['scripts'][number] }> {
  await fs.mkdir(PROJECTS_DIR, { recursive: true });
  const projectName = `px_ai_ppt_run_${new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 17)}`;
  const script = await runPythonScript('project_manager.py', ['init', projectName, '--format', 'ppt169', '--dir', PROJECTS_DIR], 120_000);
  const match = script.stdout.match(/Project created:\s*(.+)\s*$/m);
  const projectPath = match ? path.resolve(match[1].trim()) : path.join(PROJECTS_DIR, `${projectName}_ppt169_${new Date().toISOString().slice(0, 10).replace(/-/g, '')}`);
  return { projectPath, script };
}

function pickEditableNativePptx(exportsDir: string): string {
  const blocked = ['compat', 'keynote', '_svg', 'legacy'];
  const files = fsSync
    .readdirSync(exportsDir)
    .filter((name) => name.toLowerCase().endsWith('.pptx'))
    .filter((name) => !blocked.some((token) => path.basename(name, '.pptx').toLowerCase().includes(token)))
    .map((name) => path.join(exportsDir, name));
  if (!files.length) throw new Error('ppt-master 导出完成但 exports/ 中未找到可编辑原生 PPTX');
  return files.sort((a, b) => fsSync.statSync(b).mtimeMs - fsSync.statSync(a).mtimeMs)[0];
}

export async function exportPptMasterDeck(plan: PptMasterPlan, slides: PptMasterSlideContent[], rootDir: string): Promise<PptMasterExportResult> {
  const scripts: PptMasterExportResult['scripts'] = [];
  const { projectPath, script } = await initProject();
  scripts.push(script);

  const svgOutputDir = path.join(projectPath, 'svg_output');
  const notesDir = path.join(projectPath, 'notes');
  await fs.mkdir(svgOutputDir, { recursive: true });
  await fs.mkdir(notesDir, { recursive: true });

  await fs.writeFile(path.join(projectPath, 'design_spec.md'), plan.design_spec, 'utf8');
  await fs.writeFile(path.join(projectPath, 'spec_lock.md'), plan.spec_lock, 'utf8');

  for (const slide of slides) {
    await fs.writeFile(path.join(svgOutputDir, slide.file_name), slide.svg, 'utf8');
  }
  const totalNotes = slides
    .map((slide) => `# ${path.basename(slide.file_name, '.svg')}\n\n${slide.notes.trim()}\n`)
    .join('\n---\n\n');
  await fs.writeFile(path.join(notesDir, 'total.md'), totalNotes, 'utf8');

  for (const [scriptName, args] of [
    ['svg_text_wrap.py', [projectPath]],
    ['total_md_split.py', [projectPath]],
    ['finalize_svg.py', [projectPath]],
    ['svg_to_pptx.py', [projectPath, '--only', 'native', '-a', 'none', '-t', 'none', '--no-notes']],
  ] as Array<[string, string[]]>) {
    scripts.push(await runPythonScript(scriptName, args));
  }

  const nativePptx = pickEditableNativePptx(path.join(projectPath, 'exports'));
  const validationScript = await runPythonScript('validate_editable_pptx.py', [nativePptx, '--json'], 120_000);
  scripts.push(validationScript);
  let validation: unknown;
  try {
    validation = JSON.parse(validationScript.stdout || '{}');
  } catch {
    validation = validationScript.stdout;
  }

  const pptxPath = safeGeneratedPath(rootDir, `ppt_${new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14)}.pptx`);
  await fs.copyFile(nativePptx, pptxPath);
  if (process.platform === 'darwin') {
    execFile('xattr', ['-c', pptxPath], () => undefined);
  }

  return {
    file: toAssetPath(pptxPath),
    projectPath: toAssetPath(projectPath),
    slideCount: slides.length,
    scripts,
    validation,
  };
}

