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
  runId?: string;
  files?: string[];
  activePptContext?: ActivePptContext;
  loading?: boolean;
  loadingStatus?: string;
  modelProgressStatus?: string;
  hasModelProgress?: boolean;
  loadingElapsed?: string;
  loadingStep?: number;
  loadingStartedAt?: number;
  pptSvgProgress?: PptSvgProgress;
}

export interface ActivePptSlideContext {
  slideNo: number;
  title?: string;
  slideType?: string;
  svgPath?: string;
  assetUrl?: string;
  source?: 'generated' | 'copied' | 'missing';
  deckSpec?: Record<string, unknown>;
}

export interface ActivePptContext {
  projectPath: string;
  exportedPptx?: string;
  slideCount: number;
  deckSpec?: Record<string, unknown>;
  slides: ActivePptSlideContext[];
}

export interface StreamEvent {
  type: string;
  data: unknown;
}

export interface ShortcutPrompts {
  [key: string]: string;
}

export type AiShortcut = 'overview' | 'monthly' | 'ppt' | 'ppt_svg' | 'data_qa';
export type AiDataScope = 'last_7_days' | 'latest_complete_month' | 'last_1_year';

export interface ShortcutRunOptions {
  shortcut?: AiShortcut;
  data_scope?: AiDataScope;
}

export const SHORTCUT_BUTTONS = [
  { cmd: '/overview', label: '数据概览', shortcut: 'overview', data_scope: 'last_7_days' },
  { cmd: '/ppt', label: 'PPT 快速版', shortcut: 'ppt', data_scope: 'last_1_year' },
  { cmd: '/ppt-svg', label: 'PPT 精美版', shortcut: 'ppt_svg', data_scope: 'last_1_year' },
  { cmd: '/monthly', label: '月度报告', shortcut: 'monthly', data_scope: 'latest_complete_month' },
] as const;
