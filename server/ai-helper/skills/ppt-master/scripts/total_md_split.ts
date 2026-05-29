#!/usr/bin/env tsx
import fs from 'fs';
import path from 'path';

function sortSvgNames(names: string[]): string[] {
  return [...names].sort((a, b) => {
    const an = Number((a.match(/^(\d+)/) || [])[1] || 9999);
    const bn = Number((b.match(/^(\d+)/) || [])[1] || 9999);
    return an - bn || a.localeCompare(b);
  });
}

function matchSections(content: string, svgStems: string[]): Map<string, string> {
  const out = new Map<string, string>();
  const exact = new Set(svgStems);
  const byNo = new Map<number, string[]>();
  for (const stem of svgStems) {
    const n = Number((stem.match(/^(\d{1,3})/) || [])[1] || NaN);
    if (Number.isInteger(n)) byNo.set(n, [...(byNo.get(n) || []), stem]);
  }
  const normalized = content.replace(/\r\n?/g, '\n');
  const headings = [...normalized.matchAll(/^#{1,6}\s+(.+?)\s*$/gm)];
  for (let i = 0; i < headings.length; i += 1) {
    const match = headings[i];
    const heading = String(match[1] || '').trim();
    const bodyStart = (match.index || 0) + match[0].length;
    const bodyEnd = i + 1 < headings.length ? (headings[i + 1].index || normalized.length) : normalized.length;
    const body = normalized.slice(bodyStart, bodyEnd).replace(/^\s*---+\s*$/gm, '').trim();
    let stem = exact.has(heading) ? heading : '';
    if (!stem) {
      const n = Number((heading.match(/^(\d{1,3})/) || [])[1] || NaN);
      const candidates = Number.isInteger(n) ? byNo.get(n) || [] : [];
      if (candidates.length === 1) stem = candidates[0];
    }
    if (stem && !out.has(stem)) out.set(stem, body);
  }
  return out;
}

function main(): void {
  const args = process.argv.slice(2);
  const projectDir = path.resolve(args[0] || '');
  if (!args[0]) throw new Error('Usage: total_md_split.ts <project_path> [-o output_dir]');
  const outputArg = args.indexOf('-o') >= 0 ? args[args.indexOf('-o') + 1] : args.indexOf('--output') >= 0 ? args[args.indexOf('--output') + 1] : '';
  const notesDir = outputArg ? path.resolve(outputArg) : path.join(projectDir, 'notes');
  const svgDir = path.join(projectDir, 'svg_output');
  const totalPath = path.join(projectDir, 'notes', 'total.md');
  if (!fs.existsSync(svgDir)) throw new Error(`svg_output not found: ${svgDir}`);
  if (!fs.existsSync(totalPath)) throw new Error(`notes/total.md not found: ${totalPath}`);
  const svgFiles = sortSvgNames(fs.readdirSync(svgDir).filter((x) => x.toLowerCase().endsWith('.svg')));
  const stems = svgFiles.map((x) => x.replace(/\.svg$/i, ''));
  const sections = matchSections(fs.readFileSync(totalPath, 'utf8'), stems);
  const missing = stems.filter((stem) => !String(sections.get(stem) || '').trim());
  if (missing.length) throw new Error(`missing notes for ${missing.join(', ')}`);
  fs.mkdirSync(notesDir, { recursive: true });
  for (const stem of stems) fs.writeFileSync(path.join(notesDir, `${stem}.md`), `${sections.get(stem)!.trim()}\n`, 'utf8');
  console.log(JSON.stringify({ ok: true, generated: stems.length, output_dir: notesDir }));
}

try { main(); } catch (err) { console.error(err instanceof Error ? err.message : String(err)); process.exit(1); }
