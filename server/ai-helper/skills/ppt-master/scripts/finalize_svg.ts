#!/usr/bin/env tsx
async function loadExporter(): Promise<{ finalizePptSvgSync: (projectRoot: string) => unknown }> {
  try {
    return await import('../../../../dist/ai-helper/pptxNativeExporter.js');
  } catch {
    return await import('../../../../src/ai-helper/pptxNativeExporter.ts');
  }
}

async function main(): Promise<void> {
  const projectDir = process.argv[2];
  if (!projectDir) throw new Error('Usage: finalize_svg.ts <project_path>');
  const { finalizePptSvgSync } = await loadExporter();
  const result = finalizePptSvgSync(projectDir);
  console.log(JSON.stringify({ ok: true, result }, null, 2));
}

main().catch((err) => { console.error(err instanceof Error ? err.message : String(err)); process.exit(1); });
