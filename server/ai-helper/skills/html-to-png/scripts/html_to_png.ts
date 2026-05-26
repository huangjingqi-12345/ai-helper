import fs from 'fs/promises';
import path from 'path';
import { pathToFileURL } from 'url';
import { chromium } from 'playwright';

function arg(name: string, fallback = ''): string {
  const idx = process.argv.indexOf(name);
  return idx >= 0 && idx + 1 < process.argv.length ? process.argv[idx + 1] : fallback;
}

const outputDir = path.resolve(arg('--output-dir', process.cwd()));
const input = arg('--input') || arg('-i');
const output = arg('--output') || arg('-o');
const width = Number(arg('--width', '1600')) || 1600;
const height = Number(arg('--height', '1000')) || 1000;
const scale = Number(arg('--scale', '2')) || 2;
const waitMs = Number(arg('--wait-ms', '500')) || 0;

if (!input || !output) throw new Error('html_to_png requires --input and --output');

function resolveFile(value: string): string {
  const raw = value.replace(/\\/g, '/');
  if (path.isAbsolute(raw)) return raw;
  if (raw.startsWith('/generated/') || raw.startsWith('/projects/')) return path.resolve(process.cwd(), 'ai-helper', raw.slice(1));
  if (raw.startsWith('generated/') || raw.startsWith('projects/')) return path.resolve(process.cwd(), 'ai-helper', raw);
  if (raw.startsWith('server/')) return path.resolve(path.resolve(process.cwd(), '..'), raw);
  return path.join(outputDir, path.basename(raw));
}

function assetPath(abs: string): string {
  const helperRoot = path.resolve(process.cwd(), 'ai-helper');
  return `/${path.relative(helperRoot, abs).split(path.sep).join('/')}`;
}

const inputPath = resolveFile(input);
const outputPath = resolveFile(output);
await fs.access(inputPath);
await fs.mkdir(path.dirname(outputPath), { recursive: true });

const browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
try {
  const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: scale });
  await page.goto(pathToFileURL(inputPath).toString(), { waitUntil: 'networkidle' });
  if (waitMs > 0) await page.waitForTimeout(waitMs);
  await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
  const size = await page.evaluate(() => {
    const doc = document.documentElement;
    const body = document.body;
    const squareRoots = [document.querySelector('[data-export-root]'), document.querySelector('main'), document.querySelector('.shell'), document.querySelector('.stage')].filter(Boolean) as HTMLElement[];
    for (const el of squareRoots) {
      el.style.borderRadius = '0px';
      el.style.overflow = el.style.overflow || 'visible';
    }
    const candidates = squareRoots;
    const bounds = candidates.map((el) => {
      const rect = el.getBoundingClientRect();
      const style = getComputedStyle(el);
      return {
        width: rect.width + parseFloat(style.marginLeft || '0') + parseFloat(style.marginRight || '0'),
        height: rect.bottom + window.scrollY + parseFloat(style.marginBottom || '0'),
      };
    });
    const contentWidth = Math.ceil(Math.max(doc.scrollWidth, body?.scrollWidth || 0, ...bounds.map((x) => x.width), 0));
    const contentHeight = Math.ceil(Math.max(doc.scrollHeight, body?.scrollHeight || 0, ...bounds.map((x) => x.height), 0));
    const bodyBg = body ? getComputedStyle(body).background : '';
    const htmlBg = getComputedStyle(doc).background;
    if (body && (!bodyBg || bodyBg === 'rgba(0, 0, 0, 0)')) body.style.background = htmlBg || '#f8fafc';
    doc.style.background = body ? getComputedStyle(body).background : '#f8fafc';
    return { width: contentWidth, height: contentHeight };
  });
  await page.setViewportSize({ width: Math.max(width, Math.min(size.width, 3840)), height: Math.max(640, size.height) });
  await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
  const exportRoot = page.locator('[data-export-root]').first();
  if (await exportRoot.count()) {
    await exportRoot.screenshot({ path: outputPath, omitBackground: false });
  } else {
    await page.screenshot({ path: outputPath, fullPage: true, omitBackground: false });
  }
} finally {
  await browser.close();
}

console.log(JSON.stringify({ ok: true, file: assetPath(outputPath), files: [assetPath(outputPath)], input: assetPath(inputPath), renderer: 'html-screenshot', scale }));
