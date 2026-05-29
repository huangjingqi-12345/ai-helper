#!/usr/bin/env tsx
import fs from 'fs';
import path from 'path';

function attr(attrs: string, name: string): string | undefined {
  const match = attrs.match(new RegExp(`\\b${name}\\s*=\\s*(['"])(.*?)\\1`, 'i'));
  return match ? match[2] : undefined;
}
function firstNumber(value: string | undefined, fallback = 0): number {
  const match = String(value || '').match(/-?\d+(?:\.\d+)?/);
  return match ? Number(match[0]) : fallback;
}
function decode(value: string): string {
  return value.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');
}
function escapeText(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
function weight(ch: string): number {
  if (/\s/.test(ch)) return 0.32;
  if (/[\u4e00-\u9fff\u3000-\u303f]/.test(ch)) return 1.02;
  if ('，。；：、（）【】《》“”‘’'.includes(ch)) return 0.8;
  if (/[A-Z0-9]/.test(ch)) return 0.62;
  return 0.54;
}
function estimate(text: string, fontSize: number): number { return Array.from(text).reduce((s, c) => s + weight(c), 0) * fontSize; }
function tokens(text: string): string[] {
  const out: string[] = []; let buf = '';
  for (const ch of Array.from(text)) {
    if (/\s/.test(ch) || /[\u4e00-\u9fff\u3000-\u303f]/.test(ch)) { if (buf) out.push(buf); buf = ''; out.push(ch); }
    else buf += ch;
  }
  if (buf) out.push(buf);
  return out;
}
function lines(text: string, fontSize: number, maxWidth: number): string[] {
  const out: string[] = []; let cur = '';
  for (const token of tokens(text.trim())) {
    const candidate = /\s/.test(token) ? `${cur}${token}`.trim() : `${cur}${token}`;
    if (cur && estimate(candidate, fontSize) > maxWidth) { out.push(cur.trim()); cur = token.trim(); }
    else cur = candidate;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}
function canvasWidth(content: string): number {
  const root = content.match(/<svg\b([^>]*)>/i)?.[1] || '';
  const parts = String(attr(root, 'viewBox') || '').split(/[\s,]+/).map(Number).filter(Number.isFinite);
  return parts.length === 4 ? Math.max(parts[2], 1) : firstNumber(attr(root, 'width'), 1280);
}
function maxWidth(attrs: string, width: number): number {
  const x = firstNumber(attr(attrs, 'x'), 0);
  const fs = firstNumber(attr(attrs, 'font-size'), 18);
  const margin = Math.max(48, width * 0.045);
  if (x < width * 0.48) return Math.max(fs * 8, width * 0.48 - x - margin * 0.35);
  if (x < width * 0.72) return Math.max(fs * 8, width * 0.72 - x - margin * 0.35);
  return Math.max(fs * 8, width - x - margin);
}
function wrapContent(content: string): { content: string; changed: number } {
  const width = canvasWidth(content); let changed = 0;
  const next = content.replace(/<text\b([^>]*)>([^<]+)<\/text>/gi, (raw, attrs: string, body: string) => {
    const anchor = (attr(attrs, 'text-anchor') || '').toLowerCase();
    if (anchor === 'middle' || anchor === 'end') return raw;
    const text = decode(body).trim();
    if (text.length < 18) return raw;
    const fs = firstNumber(attr(attrs, 'font-size'), 18);
    const mw = maxWidth(attrs, width);
    if (estimate(text, fs) <= mw) return raw;
    const split = lines(text, fs, mw);
    if (split.length <= 1) return raw;
    const x = attr(attrs, 'x') || '0'; const gap = Math.ceil(fs * 1.22);
    changed += 1;
    return `<text${attrs}>${split.map((line, i) => `<tspan x="${x}" dy="${i ? gap : 0}">${escapeText(line)}</tspan>`).join('')}</text>`;
  });
  return { content: next, changed };
}
function main(): void {
  const projectDir = path.resolve(process.argv[2] || '');
  if (!process.argv[2]) throw new Error('Usage: svg_text_wrap.ts <project_path>');
  const svgDir = path.join(projectDir, 'svg_output');
  const files = fs.readdirSync(svgDir).filter((x) => x.toLowerCase().endsWith('.svg')).sort();
  let changed = 0;
  for (const file of files) {
    const abs = path.join(svgDir, file);
    const original = fs.readFileSync(abs, 'utf8');
    const wrapped = wrapContent(original);
    if (wrapped.changed && wrapped.content !== original) { fs.writeFileSync(abs, wrapped.content, 'utf8'); changed += wrapped.changed; }
  }
  console.log(JSON.stringify({ ok: true, files: files.length, changed }));
}
try { main(); } catch (err) { console.error(err instanceof Error ? err.message : String(err)); process.exit(1); }
