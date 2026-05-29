import fs from 'fs/promises';
import path from 'path';
import { execFile } from 'child_process';
import { AI_HELPER_ROOT, PROJECTS_DIR, safeGeneratedPath, toAssetPath } from './paths.js';
import { exportPptProjectToPptxSync, finalizePptSvgSync, validateEditablePptxSync, type PptExportRun } from './pptxNativeExporter.js';

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

function scriptFromRun(name: string, run: PptExportRun, args: string[] = []): PptMasterExportResult['scripts'][number] {
  return { script: name, args, command: run.command, duration_ms: run.duration_ms, stdout: run.stdout, stderr: run.stderr };
}

async function initProject(): Promise<{ projectPath: string; script: PptMasterExportResult['scripts'][number] }> {
  const started = Date.now();
  await fs.mkdir(PROJECTS_DIR, { recursive: true });
  const projectName = `px_ai_ppt_run_${new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 17)}`;
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const projectPath = path.join(PROJECTS_DIR, `${projectName}_ppt169_${date}`);
  for (const rel of ['svg_output', 'svg_final', 'images', 'notes', 'templates', 'sources', 'exports']) {
    await fs.mkdir(path.join(projectPath, rel), { recursive: true });
  }
  await fs.writeFile(path.join(projectPath, 'README.md'), `# ${projectName}\n\n- Canvas format: ppt169\n- Created: ${date}\n`, 'utf8');
  return {
    projectPath,
    script: {
      script: 'node-ts project init',
      args: ['ppt169'],
      command: `node-ts init ${projectPath}`,
      duration_ms: Date.now() - started,
      stdout: `Project created: ${projectPath}`,
      stderr: '',
    },
  };
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

  const finalized = finalizePptSvgSync(projectPath);
  scripts.push(scriptFromRun('node-ts finalize svg', finalized));
  const exported = exportPptProjectToPptxSync(projectPath, { projectName: path.basename(projectPath), format: 'ppt169' });
  scripts.push(scriptFromRun('node-ts svg to pptx', exported.run));
  const validationRun = validateEditablePptxSync(exported.pptxPath);
  scripts.push(scriptFromRun('node-ts validate editable pptx', validationRun));
  if (!validationRun.ok) throw new Error('PPTX 未包含可编辑形状');
  let validation: unknown;
  try {
    validation = JSON.parse(validationRun.stdout || '{}');
  } catch {
    validation = validationRun.stdout;
  }

  await fs.mkdir(rootDir, { recursive: true });
  const pptxPath = safeGeneratedPath(rootDir, `ppt_${new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14)}.pptx`);
  await fs.copyFile(exported.pptxPath, pptxPath);
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

