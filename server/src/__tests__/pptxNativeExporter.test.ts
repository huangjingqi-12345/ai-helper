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

function readStoredZipEntry(zipFile: string, entryName: string): string {
  const buf = fs.readFileSync(zipFile);
  let ptr = 0;
  while (ptr < buf.length - 30) {
    if (buf.readUInt32LE(ptr) !== 0x04034b50) {
      ptr += 1;
      continue;
    }
    const method = buf.readUInt16LE(ptr + 8);
    const compSize = buf.readUInt32LE(ptr + 18);
    const nameLen = buf.readUInt16LE(ptr + 26);
    const extraLen = buf.readUInt16LE(ptr + 28);
    const name = buf.subarray(ptr + 30, ptr + 30 + nameLen).toString('utf8');
    const dataStart = ptr + 30 + nameLen + extraLen;
    if (name === entryName) {
      if (method !== 0) throw new Error(`unsupported test zip method: ${method}`);
      return buf.subarray(dataStart, dataStart + compSize).toString('utf8');
    }
    ptr = dataStart + compSize;
  }
  throw new Error(`entry not found: ${entryName}`);
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

  it('preserves SVG gradient fills as editable PPT gradient fills', () => {
    const root = createProject();
    fs.writeFileSync(path.join(root, 'svg_output', '01_cover.svg'), `
<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="720" viewBox="0 0 1280 720">
  <defs>
    <linearGradient id="bgGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#050B14"/>
      <stop offset="100%" stop-color="#0A192F"/>
    </linearGradient>
    <radialGradient id="glow" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="#00F0FF" stop-opacity="0.45"/>
      <stop offset="100%" stop-color="#00F0FF" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="1280" height="720" fill="url(#bgGrad)"/>
  <circle cx="640" cy="360" r="300" fill="url(#glow)"/>
  <text x="80" y="120" font-family="Microsoft YaHei" font-size="42" fill="#FFFFFF">科技感背景</text>
</svg>`, 'utf8');

    const exported = exportPptProjectToPptxSync(root, { projectName: 'unit_test_gradient' });
    const slideXml = readStoredZipEntry(exported.pptxPath, 'ppt/slides/slide1.xml');
    expect(slideXml).toContain('<a:gradFill');
    expect(slideXml).toContain('<a:lin');
    expect(slideXml).toContain('<a:path path="circle"');
    expect(slideXml).toContain('050B14');
    expect(slideXml).toContain('0A192F');
  });

  it('exports long CJK SVG text as a wide non-wrapping PPT text box', () => {
    const root = createProject();
    fs.writeFileSync(path.join(root, 'svg_output', '01_cover.svg'), `
<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="720" viewBox="0 0 1280 720">
  <rect width="1280" height="720" fill="#FFFFFF"/>
  <text x="80" y="92" font-family="Microsoft YaHei" font-size="42" font-weight="700" fill="#111827">内容表现：患教资产盘点与标签体系重构</text>
  <text x="80" y="150" font-family="Microsoft YaHei" font-size="22" fill="#2563EB">下方说明文字不应被标题换行挤压</text>
</svg>`, 'utf8');

    const exported = exportPptProjectToPptxSync(root, { projectName: 'unit_test_text_wrap' });
    const slideXml = readStoredZipEntry(exported.pptxPath, 'ppt/slides/slide1.xml');
    const titleShape = slideXml.match(/<p:sp>[\s\S]*?<a:t>内容表现：患教资产盘点与标签体系重构<\/a:t>[\s\S]*?<\/p:sp>/)?.[0] || '';
    expect(titleShape).toContain('wrap="none"');
    expect(titleShape).toContain('<a:noAutofit/>');
    expect(titleShape).not.toContain('<a:spAutoFit/>');
    const cx = Number(titleShape.match(/<a:ext cx="(\d+)"/)?.[1] || 0);
    expect(cx).toBeGreaterThan(10_000_000);
  });
});
