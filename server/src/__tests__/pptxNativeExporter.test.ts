import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, describe, expect, it } from 'vitest';
import { exportPptProjectToPptxSync, finalizePptSvgSync, validateEditablePptxSync } from '../ai-helper/pptxNativeExporter.js';

const tempRoots: string[] = [];

function createProject(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'px-pptx-export-'));
  tempRoots.push(root);
  fs.mkdirSync(path.join(root, 'svg_output'), { recursive: true });
  fs.mkdirSync(path.join(root, 'notes'), { recursive: true });
  fs.writeFileSync(path.join(root, 'svg_output', '01_cover.svg'), `
<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="720" viewBox="0 0 1280 720">
  <rect width="1280" height="720" fill="#F7F9FC"/>
  <rect x="80" y="120" width="1120" height="420" rx="24" fill="#FFFFFF" stroke="#E5E7EB" stroke-width="2"/>
  <text x="120" y="220" font-family="Arial" font-size="42" font-weight="700" fill="#111827">测试标题</text>
  <line x1="120" y1="260" x2="760" y2="260" stroke="#1A56DB" stroke-width="4"/>
  <circle cx="940" cy="320" r="72" fill="#00A870" opacity="0.3"/>
</svg>`, 'utf8');
  return root;
}

afterEach(() => {
  for (const root of tempRoots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});

describe('pptxNativeExporter', () => {
  it('exports SVG primitives to a valid editable PPTX package without Python', () => {
    const root = createProject();
    const finalized = finalizePptSvgSync(root);
    expect(finalized.files).toHaveLength(1);
    expect(fs.existsSync(path.join(root, 'svg_final', '01_cover.svg'))).toBe(true);

    const exported = exportPptProjectToPptxSync(root, { projectName: 'unit_test' });
    expect(fs.existsSync(exported.pptxPath)).toBe(true);
    const pkg = fs.readFileSync(exported.pptxPath);
    expect(pkg.subarray(0, 2).toString()).toBe('PK');
    expect(pkg.includes(Buffer.from('ppt/slides/slide1.xml'))).toBe(true);

    const validation = validateEditablePptxSync(exported.pptxPath);
    expect(validation.ok).toBe(true);
    expect(validation.slideCount).toBe(1);
    expect(validation.editableShapeCount).toBeGreaterThanOrEqual(4);
  });
});
