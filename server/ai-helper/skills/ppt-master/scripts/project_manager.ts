#!/usr/bin/env tsx
import fs from 'fs';
import path from 'path';

const CANVAS_FORMATS: Record<string, { name: string; dimensions: string; viewbox: string }> = {
  ppt169: { name: 'PPT 16:9', dimensions: '1280×720', viewbox: '0 0 1280 720' },
  ppt43: { name: 'PPT 4:3', dimensions: '1024×768', viewbox: '0 0 1024 768' },
  wechat: { name: 'WeChat Article Header', dimensions: '900×383', viewbox: '0 0 900 383' },
  xiaohongshu: { name: '小红书', dimensions: '1242×1660', viewbox: '0 0 1242 1660' },
  moments: { name: 'Moments/Instagram', dimensions: '1080×1080', viewbox: '0 0 1080 1080' },
  story: { name: 'Story/Vertical', dimensions: '1080×1920', viewbox: '0 0 1080 1920' },
  banner: { name: 'Horizontal Banner', dimensions: '1920×1080', viewbox: '0 0 1920 1080' },
  a4: { name: 'A4 Print', dimensions: '1240×1754', viewbox: '0 0 1240 1754' },
};

function valueAfter(args: string[], name: string, fallback = ''): string {
  const index = args.indexOf(name);
  return index >= 0 && index + 1 < args.length ? args[index + 1] : fallback;
}

function sanitizeName(value: string): string {
  return (value || 'px_ai_ppt').replace(/[^a-zA-Z0-9_.-]+/g, '_').replace(/^[_\-.]+|[_\-.]+$/g, '') || 'px_ai_ppt';
}

function initProject(args: string[]): void {
  const name = sanitizeName(args[1] || 'px_ai_ppt');
  const format = valueAfter(args, '--format', 'ppt169');
  const baseDir = path.resolve(valueAfter(args, '--dir', path.resolve(process.cwd(), 'projects')));
  const canvas = CANVAS_FORMATS[format];
  if (!canvas) throw new Error(`Unsupported canvas format: ${format}`);
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const projectDir = path.join(baseDir, `${name}_${format}_${date}`);
  if (fs.existsSync(projectDir)) throw new Error(`Project directory already exists: ${projectDir}`);
  for (const rel of ['svg_output', 'svg_final', 'images', 'notes', 'templates', 'sources', 'exports']) {
    fs.mkdirSync(path.join(projectDir, rel), { recursive: true });
  }
  fs.writeFileSync(path.join(projectDir, 'README.md'), [
    `# ${name}`,
    '',
    `- Canvas format: ${format}`,
    `- Canvas: ${canvas.dimensions}`,
    `- ViewBox: ${canvas.viewbox}`,
    `- Created: ${date}`,
    '',
  ].join('\n'), 'utf8');
  console.log(`Project created: ${projectDir}`);
}

function main(): void {
  const args = process.argv.slice(2);
  const action = args[0];
  if (action !== 'init') {
    console.error('Usage: project_manager.ts init <project_name> --format ppt169 --dir <projects_dir>');
    process.exit(2);
  }
  initProject(args);
}

try { main(); } catch (err) { console.error(err instanceof Error ? err.message : String(err)); process.exit(1); }
