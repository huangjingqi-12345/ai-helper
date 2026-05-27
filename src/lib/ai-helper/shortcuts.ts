import { SHORTCUT_BUTTONS, type ShortcutPrompts, type ShortcutRunOptions } from './types';
import { aiHelperAuthHeaders } from './auth';

const FALLBACK_LABELS: Record<string, string> = {
  '/overview': '数据概览',
  '/ppt': 'PPT 快速版',
  '/ppt-svg': 'PPT 精美版',
  '/monthly': '月度报告',
};

export function buildShortcutUserContent(cmd: string, prompts: ShortcutPrompts): string {
  const raw = prompts[cmd] || '';
  if (!raw.trim()) {
    const label = FALLBACK_LABELS[cmd] || cmd.replace('/', '');
    return `请帮我完成${label}相关任务。`;
  }
  return raw
    .split(/\n+/)
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .join('\n\n');
}

export function shortcutRunOptions(cmd: string): ShortcutRunOptions {
  const item = SHORTCUT_BUTTONS.find((button) => button.cmd === cmd);
  return item ? { shortcut: item.shortcut, data_scope: item.data_scope } : {};
}

export async function fetchShortcutPrompts(): Promise<ShortcutPrompts> {
  try {
    const resp = await fetch('/api/ai-helper/system_prompt', {
      cache: 'no-store',
      headers: aiHelperAuthHeaders(),
    });
    if (!resp.ok) return {};
    const data = (await resp.json()) as { shortcut_prompts?: ShortcutPrompts };
    return data.shortcut_prompts || {};
  } catch {
    return {};
  }
}

export async function checkAiHelperHealth(): Promise<boolean> {
  try {
    const resp = await fetch('/api/ai-helper/health', {
      cache: 'no-store',
      headers: aiHelperAuthHeaders(),
    });
    if (!resp.ok) return false;
    const data = (await resp.json()) as { ok?: boolean; model_configured?: boolean };
    return data.ok === true && data.model_configured !== false;
  } catch {
    return false;
  }
}
