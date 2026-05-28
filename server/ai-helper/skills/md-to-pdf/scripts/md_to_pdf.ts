import fs from 'fs/promises';
import fsSync from 'fs';
import path from 'path';
import { pathToFileURL } from 'url';
import { chromium, type LaunchOptions } from 'playwright';

type QaResult = {
  ok: boolean;
  strict: boolean;
  pdf: string;
  page_count: number;
  previews: string[];
  black_block_findings: Array<Record<string, unknown>>;
  unresolved_markdown_findings: Array<Record<string, unknown>>;
  renderer: string;
};

type Args = {
  input?: string;
  output?: string;
  previewDir?: string;
  qaJson?: string;
  title?: string;
  dpi: number;
  noStrict: boolean;
  selfTest: boolean;
};

function parseArgs(argv: string[]): Args {
  const args: Args = { dpi: 150, noStrict: false, selfTest: false };
  for (let i = 0; i < argv.length; i += 1) {
    const raw = argv[i];
    const next = () => {
      i += 1;
      if (i >= argv.length) throw new Error(`${raw} requires a value`);
      return argv[i];
    };
    if (raw === '--input' || raw === '-i') args.input = next();
    else if (raw === '--output' || raw === '-o') args.output = next();
    else if (raw === '--preview-dir') args.previewDir = next();
    else if (raw === '--qa-json') args.qaJson = next();
    else if (raw === '--title') args.title = next();
    else if (raw === '--dpi') args.dpi = Number(next()) || 150;
    else if (raw === '--no-strict') args.noStrict = true;
    else if (raw === '--self-test') args.selfTest = true;
    else throw new Error(`Unknown argument: ${raw}`);
  }
  return args;
}

function workspacePath(value: string): string {
  const expanded = value.startsWith('~/') ? path.join(process.env.HOME || '', value.slice(2)) : value;
  return path.resolve(expanded);
}

function escapeHtml(value: string): string {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function escapeAttr(value: string): string {
  return escapeHtml(value).replace(/`/g, '&#96;');
}

function isTableRow(line: string): boolean {
  const stripped = line.trim();
  return stripped.startsWith('|') && stripped.endsWith('|') && stripped.split('|').length >= 3;
}

function isSeparatorRow(line: string): boolean {
  const cells = line.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((x) => x.trim());
  return cells.length > 0 && cells.every((cell) => /^:?-{3,}:?$/.test(cell));
}

function splitTableRow(line: string): string[] {
  return line.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((x) => x.trim());
}

function imageSrcToUrl(src: string, markdownDir: string): string {
  const trimmed = src.trim();
  if (/^(https?:|data:|file:)/i.test(trimmed)) return trimmed;
  const abs = path.isAbsolute(trimmed) ? trimmed : path.resolve(markdownDir, trimmed);
  return pathToFileURL(abs).toString();
}

function inlineMarkdown(raw: string, markdownDir: string): string {
  const codeSpans: string[] = [];
  let text = escapeHtml(raw);
  text = text.replace(/`([^`\n]+)`/g, (_, code: string) => {
    const token = `\u0000CODE${codeSpans.length}\u0000`;
    codeSpans.push(`<code>${escapeHtml(code)}</code>`);
    return token;
  });
  text = text.replace(/\[([^\]]+)]\(([^)]+)\)/g, (_m, label: string, href: string) => {
    const safeHref = imageSrcToUrl(String(href), markdownDir);
    return `<a href="${escapeAttr(safeHref)}">${label}</a>`;
  });
  text = text.replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>');
  text = text.replace(/__([^_\n]+)__/g, '<strong>$1</strong>');
  text = text.replace(/(?<!\*)\*([^*\n]+)\*(?!\*)/g, '<em>$1</em>');
  text = text.replace(/(?<!_)_([^_\n]+)_(?!_)/g, '<em>$1</em>');
  codeSpans.forEach((html, index) => {
    text = text.replace(`\u0000CODE${index}\u0000`, html);
  });
  return text || '&nbsp;';
}

function renderTable(rows: string[][], markdownDir: string): string {
  if (!rows.length) return '';
  const width = Math.max(...rows.map((row) => row.length));
  const normalized = rows.map((row) => row.concat(Array(Math.max(0, width - row.length)).fill('')));
  const [head, ...body] = normalized;
  return `<table><thead><tr>${head.map((cell) => `<th>${inlineMarkdown(cell, markdownDir)}</th>`).join('')}</tr></thead><tbody>${body.map((row) => `<tr>${row.map((cell) => `<td>${inlineMarkdown(cell, markdownDir)}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
}

function renderMarkdown(markdown: string, markdownDir: string): string {
  const lines = markdown.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
  const blocks: string[] = [];
  let paragraph: string[] = [];
  let index = 0;

  const flushParagraph = () => {
    const text = paragraph.map((x) => x.trim()).filter(Boolean).join(' ');
    if (text) blocks.push(`<p>${inlineMarkdown(text, markdownDir)}</p>`);
    paragraph = [];
  };

  while (index < lines.length) {
    const raw = lines[index] ?? '';
    const line = raw.replace(/\s+$/g, '');
    const stripped = line.trim();

    if (!stripped) {
      flushParagraph();
      index += 1;
      continue;
    }

    if (stripped.startsWith('```')) {
      flushParagraph();
      const codeLines: string[] = [];
      index += 1;
      while (index < lines.length && !(lines[index] ?? '').trim().startsWith('```')) {
        codeLines.push(lines[index] ?? '');
        index += 1;
      }
      if (index < lines.length) index += 1;
      blocks.push(`<pre><code>${escapeHtml(codeLines.join('\n')) || ' '}</code></pre>`);
      continue;
    }

    if (stripped === '\\pagebreak') {
      flushParagraph();
      blocks.push('<div class="page-break"></div>');
      index += 1;
      continue;
    }

    if (/^(---|\*\*\*|___)$/.test(stripped)) {
      flushParagraph();
      blocks.push('<hr/>');
      index += 1;
      continue;
    }

    if (isTableRow(stripped) && index + 1 < lines.length && isSeparatorRow(lines[index + 1] ?? '')) {
      flushParagraph();
      const tableRows = [splitTableRow(stripped)];
      index += 2;
      while (index < lines.length && isTableRow(lines[index] ?? '')) {
        tableRows.push(splitTableRow(lines[index] ?? ''));
        index += 1;
      }
      blocks.push(renderTable(tableRows, markdownDir));
      continue;
    }

    const heading = stripped.match(/^(#{1,6})\s+(.+)$/);
    if (heading) {
      flushParagraph();
      const level = Math.min(6, heading[1].length);
      blocks.push(`<h${level}>${inlineMarkdown(heading[2], markdownDir)}</h${level}>`);
      index += 1;
      continue;
    }

    if (stripped.startsWith('>')) {
      flushParagraph();
      const quoteLines: string[] = [];
      while (index < lines.length && (lines[index] ?? '').trim().startsWith('>')) {
        quoteLines.push((lines[index] ?? '').trim().replace(/^>\s?/, ''));
        index += 1;
      }
      blocks.push(`<blockquote>${inlineMarkdown(quoteLines.join(' '), markdownDir)}</blockquote>`);
      continue;
    }

    if (/^[-*+]\s+/.test(stripped) || /^\d+[.)]\s+/.test(stripped)) {
      flushParagraph();
      const ordered = /^\d+[.)]\s+/.test(stripped);
      const items: string[] = [];
      while (index < lines.length) {
        const item = (lines[index] ?? '').trim();
        const match = item.match(/^[-*+]\s+(.+)$/) || item.match(/^\d+[.)]\s+(.+)$/);
        if (!match) break;
        items.push(`<li>${inlineMarkdown(match[1], markdownDir)}</li>`);
        index += 1;
      }
      blocks.push(`<${ordered ? 'ol' : 'ul'}>${items.join('')}</${ordered ? 'ol' : 'ul'}>`);
      continue;
    }

    const image = stripped.match(/^!\[([^\]]*)]\(([^)]+)\)$/);
    if (image) {
      flushParagraph();
      blocks.push(`<figure><img src="${escapeAttr(imageSrcToUrl(image[2], markdownDir))}" alt="${escapeAttr(image[1])}"/><figcaption>${escapeHtml(image[1])}</figcaption></figure>`);
      index += 1;
      continue;
    }

    paragraph.push(stripped);
    index += 1;
  }

  flushParagraph();
  return blocks.join('\n');
}

function buildHtml(markdown: string, title: string, markdownDir: string): string {
  const body = renderMarkdown(markdown, markdownDir);
  const baseHref = pathToFileURL(markdownDir.endsWith(path.sep) ? markdownDir : `${markdownDir}${path.sep}`).toString();
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8"/>
  <base href="${escapeAttr(baseHref)}"/>
  <title>${escapeHtml(title)}</title>
  <style>
    @page { size: A4; margin: 16mm 15mm; }
    * { box-sizing: border-box; }
    html { background: #f1f5f9; }
    body {
      margin: 0;
      color: #0f172a;
      background: #fff;
      font-family: "Noto Sans CJK SC", "Noto Sans SC", "Noto Sans CJK", "PingFang SC", "Microsoft YaHei", Arial, sans-serif;
      font-size: 14px;
      line-height: 1.72;
      word-break: break-word;
      overflow-wrap: anywhere;
    }
    main {
      max-width: 820px;
      margin: 0 auto;
      padding: 26px 30px 34px;
      background:
        radial-gradient(circle at 8% 0%, rgba(37,99,235,.08), transparent 28%),
        radial-gradient(circle at 95% 3%, rgba(16,185,129,.07), transparent 26%),
        #fff;
    }
    h1, h2, h3, h4, h5, h6 { color: #0f172a; line-height: 1.25; page-break-after: avoid; break-after: avoid; }
    h1 { margin: 0 0 18px; padding-bottom: 12px; border-bottom: 3px solid #1d4ed8; font-size: 28px; letter-spacing: -.03em; }
    h2 { margin: 26px 0 12px; padding-left: 10px; border-left: 5px solid #2563eb; font-size: 21px; }
    h3 { margin: 20px 0 10px; color: #1e3a8a; font-size: 17px; }
    h4, h5, h6 { margin: 16px 0 8px; font-size: 15px; color: #334155; }
    p { margin: 8px 0 11px; }
    strong { color: #1e3a8a; font-weight: 800; }
    em { color: #334155; }
    a { color: #2563eb; text-decoration: none; }
    code {
      font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace;
      background: #f1f5f9;
      border: 1px solid #dbe3ee;
      border-radius: 5px;
      padding: 1px 5px;
      color: #334155;
      font-size: .92em;
    }
    pre {
      margin: 12px 0 14px;
      padding: 12px 14px;
      border: 1px solid #cbd5e1;
      border-radius: 12px;
      background: #f8fafc;
      white-space: pre-wrap;
      page-break-inside: avoid;
      break-inside: avoid;
    }
    pre code { border: 0; padding: 0; background: transparent; }
    blockquote {
      margin: 12px 0 14px;
      padding: 10px 14px;
      border-left: 5px solid #60a5fa;
      border-radius: 10px;
      background: #eff6ff;
      color: #334155;
    }
    ul, ol { margin: 8px 0 12px 22px; padding: 0; }
    li { margin: 3px 0; }
    table {
      width: 100%;
      border-collapse: collapse;
      margin: 12px 0 16px;
      page-break-inside: auto;
      break-inside: auto;
      font-size: 12.5px;
      box-shadow: 0 1px 0 rgba(15,23,42,.04);
    }
    tr { page-break-inside: avoid; break-inside: avoid; }
    th, td { border: 1px solid #cbd5e1; padding: 7px 8px; vertical-align: top; }
    th { background: #1e3a8a; color: #fff; font-weight: 800; }
    tbody tr:nth-child(even) td { background: #f8fafc; }
    hr { height: 1px; border: 0; background: #cbd5e1; margin: 18px 0; }
    figure { margin: 14px 0 16px; page-break-inside: avoid; break-inside: avoid; }
    img { display: block; max-width: 100%; height: auto; border-radius: 10px; }
    figcaption { margin-top: 6px; color: #64748b; font-size: 12px; text-align: center; }
    .page-break { page-break-after: always; break-after: page; height: 0; }
    @media print {
      html, body { background: #fff; }
      main { max-width: none; padding: 0; background: #fff; }
      a { color: #1e40af; }
    }
  </style>
</head>
<body><main>${body}</main></body>
</html>`;
}

function chromiumOptions(): LaunchOptions {
  const candidates = [
    process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
    process.env.CHROMIUM_EXECUTABLE_PATH,
    '/usr/bin/chromium-browser',
    '/usr/bin/chromium',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
  ].filter(Boolean) as string[];
  const executablePath = candidates.find((candidate) => fsSync.existsSync(candidate));
  return {
    headless: true,
    executablePath,
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--font-render-hinting=medium'],
  };
}

async function renderPdf(html: string, pdfPath: string, previewDir: string): Promise<{ previews: string[]; text: string }> {
  await fs.mkdir(path.dirname(pdfPath), { recursive: true });
  await fs.mkdir(previewDir, { recursive: true });
  const browser = await chromium.launch(chromiumOptions());
  try {
    const page = await browser.newPage({ viewport: { width: 1024, height: 1448 }, deviceScaleFactor: 1 });
    await page.setContent(html, { waitUntil: 'networkidle' });
    await page.emulateMedia({ media: 'print' });
    await page.pdf({
      path: pdfPath,
      format: 'A4',
      printBackground: true,
      margin: { top: '16mm', right: '15mm', bottom: '16mm', left: '15mm' },
      preferCSSPageSize: true,
    });

    await page.emulateMedia({ media: 'screen' });
    const preview = path.join(previewDir, 'page_01.png');
    await page.screenshot({ path: preview, fullPage: true, omitBackground: false });
    const text = await page.locator('body').innerText({ timeout: 5_000 }).catch(() => '');
    return { previews: [preview], text };
  } finally {
    await browser.close();
  }
}

async function countPdfPages(pdfPath: string): Promise<number> {
  const content = (await fs.readFile(pdfPath)).toString('latin1');
  const matches = content.match(/\/Type\s*\/Page\b/g);
  return Math.max(1, matches?.length || 1);
}

function unresolvedMarkdownFindings(text: string): Array<Record<string, unknown>> {
  const patterns: Array<[string, RegExp]> = [
    ['heading_marker', /^#{1,6}\s+\S/gm],
    ['bold_marker', /\*\*[^*\n]+\*\*/g],
    ['table_separator', /\|?\s*:?-{3,}:?\s*\|/g],
    ['fenced_code_marker', /```/g],
    ['inline_code_marker', /`[^`\n]+`/g],
    ['raw_link', /\[[^\]]+]\([^)]+\)/g],
  ];
  return patterns.flatMap(([type, regex]) => {
    const matches = [...text.matchAll(regex)].map((m) => m[0]);
    return matches.length ? [{ type, count: matches.length, sample: matches.slice(0, 3) }] : [];
  });
}

function fileEntry(filePath: string, role: string, label: string, mediaType: string): Record<string, string> {
  let value = filePath;
  const cwd = process.cwd();
  if (path.isAbsolute(value)) {
    const rel = path.relative(cwd, value);
    value = rel && !rel.startsWith('..') && !path.isAbsolute(rel) ? `/${rel.split(path.sep).join('/')}` : value;
  } else if (value.startsWith('generated/') || value.startsWith('projects/')) {
    value = `/${value}`;
  }
  const suffix = path.extname(value).replace(/^\./, '').toLowerCase();
  return { path: value, role, label, format: suffix || mediaType || 'file', media_type: mediaType || suffix || 'file' };
}

async function writeManifest(manifestPath: string, inputPath: string, outputPdf: string, qaJson: string, qa: QaResult, title: string): Promise<void> {
  const manifest = {
    schema_version: 'skill-deliverable-manifest/v1',
    skill_id: 'md-to-pdf',
    generated_at: new Date().toISOString(),
    files: [
      fileEntry(inputPath, 'source', '源 Markdown', 'text/markdown'),
      fileEntry(outputPdf, 'pdf', '渲染 PDF', 'application/pdf'),
      fileEntry(qaJson, 'qa', 'PDF QA JSON', 'application/json'),
    ],
    data_sources: [inputPath],
    qa: { status: qa.ok ? 'passed' : 'failed', checks: qa },
    metadata: { title, page_count: qa.page_count, renderer: 'playwright-chromium' },
  };
  await fs.writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
}

async function renderMarkdownToPdf(inputPath: string, outputPdf: string, previewDir: string, qaJson: string, title: string, strict: boolean): Promise<{ qa: QaResult; manifest: string }> {
  const markdown = await fs.readFile(inputPath, 'utf8');
  const html = buildHtml(markdown, title, path.dirname(inputPath));
  const { previews, text } = await renderPdf(html, outputPdf, previewDir);
  const qa: QaResult = {
    ok: true,
    strict,
    pdf: outputPdf,
    page_count: await countPdfPages(outputPdf),
    previews,
    black_block_findings: [],
    unresolved_markdown_findings: unresolvedMarkdownFindings(text),
    renderer: 'playwright-chromium',
  };
  qa.ok = qa.black_block_findings.length === 0 && qa.unresolved_markdown_findings.length === 0;
  await fs.writeFile(qaJson, `${JSON.stringify(qa, null, 2)}\n`, 'utf8');
  if (strict && !qa.ok) throw new Error(`PDF QA failed. See ${qaJson}`);
  const manifestPath = outputPdf.replace(/\.pdf$/i, '_manifest.json');
  await writeManifest(manifestPath, inputPath, outputPdf, qaJson, qa, title);
  return { qa, manifest: manifestPath };
}

async function runSelfTest(outputDir: string): Promise<{ pdf: string; qaJson: string; manifest: string; qa: QaResult }> {
  await fs.mkdir(outputDir, { recursive: true });
  const input = path.join(outputDir, 'md_to_pdf_selftest.md');
  const pdf = path.join(outputDir, 'md_to_pdf_selftest.pdf');
  const previewDir = path.join(outputDir, 'md_to_pdf_selftest_preview');
  const qaJson = path.join(outputDir, 'md_to_pdf_selftest_qa.json');
  const sample = `# 患教月度报告自测

## 核心摘要

本月 **阅读次数** 与 **互动率** 均保持增长，\`read_count\` 是主要流量指标。

- 阅读次数提升，内容覆盖更稳定
- 完读率改善，说明内容长度与患者需求更匹配
- 互动量增长，但仍需观察负反馈

| 指标 | 本月 | 上月 | 环比 |
|---|---:|---:|---:|
| 阅读次数 | 106,790 | 94,494 | +13.0% |
| 阅读人数 | 2,981 | 2,782 | +7.2% |
| 完读率 | 71.7% | 68.8% | +2.9pp |

> 注意：阅读人数为日级汇总，不等于严格去重月活。

### 行动建议

1. 复制 TOP 内容的主题结构。
2. 优先优化送达高但阅读率低的渠道。

---

普通段落应自动换行，不能留下 #、**、表格分隔线等未渲染 Markdown 标记。
`;
  await fs.writeFile(input, sample, 'utf8');
  const { qa, manifest } = await renderMarkdownToPdf(input, pdf, previewDir, qaJson, 'Markdown 转 PDF 自测', true);
  return { pdf, qaJson, manifest, qa };
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  if (args.selfTest) {
    const out = await runSelfTest(workspacePath(args.output || 'generated'));
    console.log(JSON.stringify({ files: [out.pdf, out.qaJson, out.manifest], pdf: out.pdf, qa_json: out.qaJson, manifest: out.manifest, qa: out.qa }, null, 0));
    return;
  }
  if (!args.input || !args.output) throw new Error('--input and --output are required unless --self-test is used');
  const inputPath = workspacePath(args.input);
  const outputPdf = workspacePath(args.output);
  const stem = outputPdf.replace(/\.pdf$/i, '');
  const previewDir = workspacePath(args.previewDir || `${stem}_preview`);
  const qaJson = workspacePath(args.qaJson || `${stem}_qa.json`);
  const title = args.title || path.basename(inputPath, path.extname(inputPath)).replace(/_/g, ' ');
  const { qa, manifest } = await renderMarkdownToPdf(inputPath, outputPdf, previewDir, qaJson, title, !args.noStrict);
  console.log(JSON.stringify({ files: [outputPdf, qaJson, manifest], pdf: outputPdf, qa_json: qaJson, manifest, qa }, null, 0));
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
