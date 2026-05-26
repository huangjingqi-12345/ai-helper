/** Lightweight Markdown → HTML for assistant bubbles for embedded PX assistant bubbles. */

function escapeHtml(text: string): string {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function renderInline(text: string): string {
  let out = text;
  out = out.replace(/`([^`\n]+)`/g, '<code class="md-code">$1</code>');
  out = out.replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>');
  out = out.replace(/(?<!\*)\*([^*\n]+)\*(?!\*)/g, '<em>$1</em>');
  out = out.replace(
    /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g,
    '<a class="md-link" href="$2" target="_blank" rel="noopener noreferrer">$1</a>',
  );
  return out;
}

function renderBlocks(source: string): string {
  const lines = source.replace(/\r\n/g, '\n').split('\n');
  const html: string[] = [];
  let index = 0;

  while (index < lines.length) {
    const line = lines[index] ?? '';

    if (/^```/.test(line)) {
      const fence: string[] = [];
      index += 1;
      while (index < lines.length && !/^```/.test(lines[index] ?? '')) {
        fence.push(lines[index] ?? '');
        index += 1;
      }
      if (index < lines.length) index += 1;
      html.push(`<pre class="md-pre"><code>${fence.join('\n')}</code></pre>`);
      continue;
    }

    if (/^#{1,3}\s+/.test(line)) {
      const match = line.match(/^(#{1,3})\s+(.+)$/);
      if (match?.[1] && match[2]) {
        const level = match[1].length;
        const tag = level === 1 ? 'h1' : level === 2 ? 'h2' : 'h3';
        html.push(`<${tag} class="md-${tag}">${renderInline(match[2])}</${tag}>`);
      }
      index += 1;
      continue;
    }

    if (/^(\s*[-*•]|\s*\d+\.)\s+/.test(line)) {
      const ordered = /^\s*\d+\.\s+/.test(line);
      const items: string[] = [];
      while (index < lines.length && /^(\s*[-*•]|\s*\d+\.)\s+/.test(lines[index] ?? '')) {
        items.push((lines[index] ?? '').replace(/^(\s*[-*•]|\s*\d+\.)\s+/, ''));
        index += 1;
      }
      const tag = ordered ? 'ol' : 'ul';
      html.push(
        `<${tag} class="md-list">` +
          items.map((item) => `<li>${renderInline(item)}</li>`).join('') +
          `</${tag}>`,
      );
      continue;
    }

    if (!line.trim()) {
      index += 1;
      continue;
    }

    const paragraph: string[] = [];
    while (
      index < lines.length &&
      (lines[index] ?? '').trim() &&
      !/^#{1,3}\s+/.test(lines[index] ?? '') &&
      !/^```/.test(lines[index] ?? '') &&
      !/^(\s*[-*•]|\s*\d+\.)\s+/.test(lines[index] ?? '')
    ) {
      paragraph.push(lines[index] ?? '');
      index += 1;
    }
    html.push(`<p>${renderInline(paragraph.join('<br>'))}</p>`);
  }

  return html.join('');
}

export function renderMarkdownToHtml(source: string): string {
  if (!source) return '';
  return renderBlocks(escapeHtml(source));
}
