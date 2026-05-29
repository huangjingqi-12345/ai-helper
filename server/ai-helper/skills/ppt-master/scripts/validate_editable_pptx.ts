#!/usr/bin/env tsx
interface Exporter {
  validateEditablePptxSync: (pptxPath: string) => { ok: boolean; slideCount: number; editableShapeCount: number; pictureCount: number; stdout: string; stderr: string };
}
async function loadExporter(): Promise<Exporter> {
  try {
    return await import('../../../../dist/ai-helper/pptxNativeExporter.js') as Exporter;
  } catch {
    return await import('../../../../src/ai-helper/pptxNativeExporter.ts') as Exporter;
  }
}
async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const pptx = args.find((arg) => !arg.startsWith('-')) || '';
  if (!pptx) throw new Error('Usage: validate_editable_pptx.ts <file.pptx> [--json]');
  const asJson = args.includes('--json');
  const { validateEditablePptxSync } = await loadExporter();
  const result = validateEditablePptxSync(pptx);
  if (asJson) console.log(result.stdout);
  else console.log(`editable=${result.ok} slides=${result.slideCount} shapes=${result.editableShapeCount} pictures=${result.pictureCount}`);
  if (!result.ok) process.exit(1);
}
main().catch((err) => { console.error(err instanceof Error ? err.message : String(err)); process.exit(1); });
