export function normalizeDeliverableUrl(url: string): string {
  const raw = (url || '').trim().replace(/\\/g, '/');
  if (!raw) return '';
  if (raw.startsWith('generated/') || raw.startsWith('projects/')) {
    return `/${raw}`;
  }
  return raw;
}

export function resolveAiHelperAssetUrl(url: string): string {
  const normalized = normalizeDeliverableUrl(url);
  if (normalized.startsWith('/generated/') || normalized.startsWith('/projects/')) {
    return `/ai-helper-assets${normalized}`;
  }
  return normalized;
}

function isDeliverablePath(url: string): boolean {
  const raw = normalizeDeliverableUrl(url);
  if (!raw) return false;
  if (/^https?:\/\//i.test(raw)) return true;
  const lower = raw.toLowerCase();
  if (lower.startsWith('/data/') || lower.startsWith('data/')) return false;
  if (lower.startsWith('/generated/') || lower.startsWith('generated/')) return true;
  if (lower.startsWith('/projects/') || lower.startsWith('projects/')) return true;
  return false;
}

export function isStreamDeliverable(url: string): boolean {
  if (!isDeliverablePath(url)) return false;
  const name = fileNameFromUrl(url).toLowerCase();
  const ext = name.includes('.') ? name.split('.').pop() || '' : '';
  const lower = url.toLowerCase();
  if (ext === 'json' || ext === 'csv') return false;
  if (name.includes('manifest') || name.endsWith('_qa.json') || name.includes('_qa.')) {
    return false;
  }
  if (lower.includes('/projects/') || lower.startsWith('projects/')) return false;
  if (name.includes('compat') || name.includes('keynote') || name.endsWith('_svg.pptx')) {
    return false;
  }
  return ['md', 'pdf', 'html', 'htm', 'png', 'ppt', 'pptx'].includes(ext);
}

export function isUserVisibleDeliverable(url: string): boolean {
  if (!isStreamDeliverable(url)) return false;
  const ext = fileNameFromUrl(url).toLowerCase().split('.').pop() || '';
  return ['md', 'pdf', 'html', 'htm', 'png', 'jpg', 'jpeg', 'webp', 'ppt', 'pptx'].includes(ext);
}

export function filterVisibleDeliverables(files: string[]): string[] {
  return [...new Set(files.map(normalizeDeliverableUrl).filter(isUserVisibleDeliverable))];
}

export function fileNameFromUrl(url: string): string {
  const raw = url || '';
  try {
    const parsed = /^https?:\/\//i.test(raw) ? new URL(raw).pathname : raw;
    return decodeURIComponent(parsed.split('/').pop() || '') || '未命名文件';
  } catch {
    return raw.split('?')[0]?.split('/').pop() || '未命名文件';
  }
}

export function isPptFile(name: string): boolean {
  return /\.(pptx?)$/i.test(name);
}

export function canPreviewFile(name: string): boolean {
  if (isPptFile(name)) return false;
  const ext = (name.split('.').pop() || '').toLowerCase();
  // PNG 等图片不在聊天区/列表内嵌预览，仅提供下载
  if (['png', 'jpg', 'jpeg', 'webp', 'gif', 'svg'].includes(ext)) return false;
  return ['md', 'pdf', 'html', 'htm'].includes(ext);
}
