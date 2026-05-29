#!/usr/bin/env tsx
import fs from 'fs';
import path from 'path';

interface Exporter {
  exportPptProjectToPptxSync: (projectRoot: string, options?: { projectName?: string; format?: string }) => { pptxPath: string; slideCount: number; run: unknown };
}

async function loadExporter(): Promise<Exporter> {
  try {
    return await import('../../../../dist/ai-helper/pptxNativeExporter.js') as Exporter;
  } catch {
    return await import('../../../../src/ai-helper/pptxNativeExporter.ts') as Exporter;
  }
}

function valueAfter(args: string[], names: string[], fallback = ''): string {
  for (const name of names) {
    const index = args.indexOf(name);
    if (index >= 0 && index + 1 < args.length) return args[index + 1];
  }
  return fallback;
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const projectDir = args[0];
  if (!projectDir) throw new Error('Usage: svg_to_pptx.ts <project_path> [--format ppt169] [--only native] [-o out.pptx]');
  const only = valueAfter(args, ['--only'], 'native');
  if (only !== 'native') throw new Error('TS svg_to_pptx currently supports --only native');
  const output = valueAfter(args, ['-o', '--output']);
  const format = valueAfter(args, ['--format', '-f'], 'ppt169');
  const { exportPptProjectToPptxSync } = await loadExporter();
  const result = exportPptProjectToPptxSync(projectDir, { projectName: path.basename(path.resolve(projectDir)), format });
  if (output) {
    fs.mkdirSync(path.dirname(path.resolve(output)), { recursive: true });
    fs.copyFileSync(result.pptxPath, path.resolve(output));
  }
  console.log(JSON.stringify({ ok: true, file: output ? path.resolve(output) : result.pptxPath, slide_count: result.slideCount, result }, null, 2));
}

main().catch((err) => { console.error(err instanceof Error ? err.message : String(err)); process.exit(1); });
