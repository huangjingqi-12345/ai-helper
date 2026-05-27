export type ChatRole = 'user' | 'assistant';

export interface PptSvgProgress {
  slides: string[];
  expectedMin?: number;
  expectedMax?: number;
  mode?: 'spec' | 'svg';
  title?: string;
  completed?: boolean;
  exportedPpt?: string;
}

export interface ChatMessage {
  id: string;
  role: ChatRole;
  text: string;
  files?: string[];
  loading?: boolean;
  loadingStatus?: string;
  loadingElapsed?: string;
  loadingStep?: number;
  loadingStartedAt?: number;
  pptSvgProgress?: PptSvgProgress;
}

export interface StreamEvent {
  type: string;
  data: unknown;
}

export interface ShortcutPrompts {
  [key: string]: string;
}

export type AiShortcut = 'overview' | 'monthly' | 'ppt' | 'ppt_svg';
export type AiDataScope = 'last_7_days' | 'latest_complete_month' | 'last_1_year';

export interface ShortcutRunOptions {
  shortcut?: AiShortcut;
  data_scope?: AiDataScope;
}

export const SHORTCUT_BUTTONS = [
  { cmd: '/overview', label: '数据概览', shortcut: 'overview', data_scope: 'last_7_days' },
  { cmd: '/ppt', label: '趋势分析 PPT 生成', shortcut: 'ppt', data_scope: 'last_1_year' },
  { cmd: '/ppt-svg', label: 'PPT SVG 直出', shortcut: 'ppt_svg', data_scope: 'last_1_year' },
  { cmd: '/monthly', label: '月度报告', shortcut: 'monthly', data_scope: 'latest_complete_month' },
] as const;
