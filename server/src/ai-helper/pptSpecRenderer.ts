import fsp from 'fs/promises';
import path from 'path';

export type PptThemeName = 'executive_blue' | 'medical_green' | 'warm_orange' | 'dark_tech';

export interface DeckMetric {
  label?: string;
  value?: string | number;
  display_value?: string;
  unit?: string;
  delta?: string | number;
  note?: string;
  status?: 'good' | 'warn' | 'risk' | 'neutral';
  icon?: string;
}

export interface DeckChart {
  type?: 'line' | 'area' | 'bar' | 'ranking' | 'funnel' | 'matrix';
  title?: string;
  x_label?: string;
  y_label?: string;
  value_suffix?: string;
  categories?: string[];
  values?: Array<number | string>;
  series?: Array<{ name?: string; values?: Array<number | string>; color?: string }>;
  items?: Array<{ label?: string; value?: string | number; note?: string; color?: string }>;
}

export interface DeckHighlightPoint {
  index?: number;
  label?: string;
  reason?: string;
  value?: string | number;
}

export interface DeckDesignTokens {
  mood?: 'consulting' | 'medical' | 'tech' | 'warm' | 'minimal';
  density?: 'low' | 'medium' | 'high';
  background?: 'soft_blobs' | 'gradient_mesh' | 'diagonal_ribbon' | 'grid_dots' | 'clean';
  accent_shape?: 'ribbon' | 'corner_blob' | 'vertical_rule' | 'orbit' | 'none';
  chart_style?: 'minimal' | 'annotated' | 'bold' | 'sparkline';
  number_style?: 'hero' | 'compact' | 'badge' | 'plain';
  card_style?: 'soft' | 'outlined' | 'glass' | 'solid_header';
  font_scale?: number;
  title_size?: number;
  body_size?: number;
  number_size?: number;
  accent_color?: string;
  risk_color?: string;
  warning_color?: string;
  panel_fill?: string;
  panel_alt_fill?: string;
  background_color?: string;
  text_color?: string;
  subtext_color?: string;
  panel_border?: string;
  card_fill?: string;
  card_border?: string;
  chart_palette?: string[];
  corner_radius?: number;
  gap?: number;
  icon_style?: 'circle' | 'square' | 'badge' | 'none';
}

export interface DeckDataDisplay {
  number_format?: 'raw' | 'compact_cn';
  sort?: 'none' | 'asc' | 'desc';
  top_n?: number;
  highlight_max?: boolean;
  show_axis?: boolean;
  show_grid?: boolean;
  show_legend?: boolean;
  show_value_labels?: boolean;
}

export interface DeckComponentSpec {
  type?: 'metric_card' | 'hero_metric' | 'insight_card' | 'risk_card' | 'action_card' | 'chart_panel' | 'ranking_list' | 'funnel_panel' | 'timeline' | 'matrix' | 'callout' | 'takeaway_band' | string;
  layout_variant?: string;
  emphasis?: string;
  title?: string;
  subtitle?: string;
  text?: string;
  value?: string | number;
  unit?: string;
  note?: string;
  tone?: 'good' | 'warn' | 'risk' | 'neutral';
  icon?: string;
  style?: DeckDesignTokens;
  data_display?: DeckDataDisplay;
  chart?: DeckChart;
  metrics?: DeckMetric[];
  table?: Array<Record<string, string | number>>;
  items?: string[];
}

export interface DeckSlideSpec {
  id?: string;
  slide_type?: string;
  layout_variant?: string;
  visual_intent?: 'executive_summary' | 'diagnosis' | 'growth_story' | 'comparison' | 'action_plan' | string;
  emphasis?: 'hero_metric' | 'chart' | 'insight' | 'ranking' | 'timeline' | 'balanced' | string;
  density?: DeckDesignTokens['density'];
  design_tokens?: DeckDesignTokens;
  style?: DeckDesignTokens;
  data_display?: DeckDataDisplay;
  components?: DeckComponentSpec[];
  highlight_points?: DeckHighlightPoint[];
  title?: string;
  subtitle?: string;
  takeaway?: string;
  section?: string;
  bullets?: string[];
  metrics?: DeckMetric[];
  chart?: DeckChart;
  table?: Array<Record<string, string | number>>;
  notes?: string;
}

export interface DeckSpecParams {
  project_path?: string;
  title?: string;
  subtitle?: string;
  audience?: string;
  theme?: PptThemeName | string;
  style?: string | DeckDesignTokens;
  visual_style?: DeckDesignTokens;
  data_display?: DeckDataDisplay;
  design_tokens?: DeckDesignTokens;
  data_scope?: string;
  slides?: DeckSlideSpec[];
  summary?: string;
}

export interface RenderedDeckResult {
  files: string[];
  svg_count: number;
  project_path: string;
}

export interface VisualQaIssue {
  code: 'low_density' | 'underfilled_panel' | 'narrow_panel' | 'text_overlap' | 'truncation' | 'content_insufficient';
  severity: 'warn' | 'error';
  message: string;
}

export interface VisualQaSlideReport {
  file: string;
  score: number;
  retried: boolean;
  metrics: {
    text_count: number;
    text_chars: number;
    large_panel_count: number;
    underfilled_panel_count: number;
    narrow_panel_count: number;
    overlap_count: number;
    truncation_count: number;
    density: number;
  };
  issues: VisualQaIssue[];
}

type Theme = {
  name: string;
  primary: string;
  secondary: string;
  accent: string;
  danger: string;
  warning: string;
  bg: string;
  panel: string;
  panel2: string;
  text: string;
  subtext: string;
  grid: string;
  dark: string;
};

const W = 1280;
const H = 720;
const FONT = 'PingFang SC, Microsoft YaHei, Helvetica Neue, Arial, sans-serif';

const THEMES: Record<string, Theme> = {
  executive_blue: {
    name: 'executive_blue', primary: '#1A56DB', secondary: '#00A870', accent: '#7C3AED', danger: '#D54941', warning: '#E37318', bg: '#F7F9FC', panel: '#FFFFFF', panel2: '#EFF6FF', text: '#111827', subtext: '#6B7280', grid: '#E5E7EB', dark: '#102A56',
  },
  medical_green: {
    name: 'medical_green', primary: '#007A6C', secondary: '#1A56DB', accent: '#00A870', danger: '#D54941', warning: '#D97706', bg: '#F5FBF9', panel: '#FFFFFF', panel2: '#E8F7F2', text: '#10231F', subtext: '#60736F', grid: '#D8E7E2', dark: '#083B35',
  },
  warm_orange: {
    name: 'warm_orange', primary: '#C2410C', secondary: '#1A56DB', accent: '#F59E0B', danger: '#B91C1C', warning: '#E37318', bg: '#FFF8F1', panel: '#FFFFFF', panel2: '#FFEDD5', text: '#1F2937', subtext: '#78716C', grid: '#FED7AA', dark: '#7C2D12',
  },
  dark_tech: {
    name: 'dark_tech', primary: '#60A5FA', secondary: '#34D399', accent: '#A78BFA', danger: '#F87171', warning: '#FBBF24', bg: '#0F172A', panel: '#172554', panel2: '#1E293B', text: '#F8FAFC', subtext: '#CBD5E1', grid: '#334155', dark: '#020617',
  },
};

function themeOf(raw: unknown): Theme {
  const key = String(raw || '').trim();
  return THEMES[key] || THEMES.executive_blue;
}

function objectStyle(value: unknown): DeckDesignTokens | undefined {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as DeckDesignTokens : undefined;
}

function mergeTokens(deckTokens?: DeckDesignTokens, slideTokens?: DeckDesignTokens, slide?: DeckSlideSpec): DeckDesignTokens {
  const tokens: DeckDesignTokens = { density: 'medium', background: 'soft_blobs', accent_shape: 'vertical_rule', chart_style: 'annotated', number_style: 'hero', card_style: 'soft', ...(deckTokens || {}), ...(slideTokens || {}) };
  if (slide?.density) tokens.density = slide.density;
  if (slide?.emphasis === 'hero_metric') tokens.number_style = 'hero';
  if (slide?.emphasis === 'chart') tokens.chart_style = 'bold';
  if (slide?.visual_intent === 'diagnosis') tokens.accent_shape = 'ribbon';
  tokens.font_scale = clamp(Number(tokens.font_scale || 1), 0.85, 1.15);
  if (tokens.title_size !== undefined) tokens.title_size = clamp(Number(tokens.title_size), 24, 42);
  if (tokens.body_size !== undefined) tokens.body_size = clamp(Number(tokens.body_size), 11, 20);
  if (tokens.number_size !== undefined) tokens.number_size = clamp(Number(tokens.number_size), 20, 64);
  if (tokens.corner_radius !== undefined) tokens.corner_radius = clamp(Number(tokens.corner_radius), 8, 28);
  if (tokens.gap !== undefined) tokens.gap = clamp(Number(tokens.gap), 8, 24);
  if (Array.isArray(tokens.chart_palette)) tokens.chart_palette = tokens.chart_palette.map(safeColor).filter(Boolean) as string[];
  return tokens;
}

function safeColor(value: unknown): string | undefined {
  const raw = plain(value);
  return /^#[0-9a-fA-F]{6}$/.test(raw) ? raw.toUpperCase() : undefined;
}

function themeWithTokens(base: Theme, tokens: DeckDesignTokens): Theme {
  return {
    ...base,
    primary: safeColor(tokens.accent_color) || base.primary,
    danger: safeColor(tokens.risk_color) || base.danger,
    warning: safeColor(tokens.warning_color) || base.warning,
    bg: safeColor(tokens.background_color) || base.bg,
    panel: safeColor(tokens.panel_fill) || base.panel,
    panel2: safeColor(tokens.panel_alt_fill) || base.panel2,
    text: safeColor(tokens.text_color) || base.text,
    subtext: safeColor(tokens.subtext_color) || base.subtext,
    grid: safeColor(tokens.panel_border) || base.grid,
  };
}

function sanitizeAudienceTerm(value: string): string {
  return value.replace(/管理层/g, '业务团队');
}

function sanitizeDeckParams(params: DeckSpecParams): DeckSpecParams {
  return JSON.parse(JSON.stringify(params), (_key, value) => (typeof value === 'string' ? sanitizeAudienceTerm(value) : value)) as DeckSpecParams;
}

function scaledSize(tokens: DeckDesignTokens, base: number, explicit?: number): number {
  const scale = Number(tokens.font_scale || 1);
  const size = explicit !== undefined ? explicit : base * scale;
  return Math.round(clamp(size, 8, 72));
}

function esc(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function removeEllipsis(value: unknown): string {
  return String(value ?? '')
    .replace(/(?:…+|⋯+|\.{3,}|。{3,})/g, '')
    .trim();
}

function plain(value: unknown): string { return removeEllipsis(value); }
function cleanText(value: unknown): string {
  return plain(value)
    .replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu, '')
    .replace(/\s+/g, ' ')
    .trim();
}
function num(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  const raw = String(value ?? '').trim();
  const cleaned = raw.replace(/[,，%]/g, '');
  const direct = Number(cleaned);
  if (Number.isFinite(direct)) return direct;
  const match = cleaned.match(/-?\d+(?:\.\d+)?/);
  if (!match) return 0;
  const base = Number(match[0]);
  if (!Number.isFinite(base)) return 0;
  if (/亿/.test(cleaned)) return base * 100_000_000;
  if (/万/.test(cleaned)) return base * 10_000;
  return base;
}
function clamp(n: number, min: number, max: number): number { return Math.max(min, Math.min(max, n)); }
function pct(n: number, total: number): number { return total > 0 ? clamp(n / total, 0, 1) : 0; }

function wrapText(text: string, maxChars: number, maxLines = 3): string[] {
  const cleaned = plain(text).replace(/\s+/g, ' ');
  if (!cleaned) return [];
  const out: string[] = [];
  let line = '';
  for (const ch of cleaned) {
    const next = line + ch;
    const width = [...next].reduce((sum, c) => sum + (/^[\x00-\x7F]$/.test(c) ? 0.55 : 1), 0);
    if (width > maxChars && line) {
      out.push(line);
      line = ch;
      if (out.length >= maxLines) break;
    } else {
      line = next;
    }
  }
  if (line && out.length < maxLines) out.push(line);
  return out;
}

function fitLines(text: string, maxChars: number, maxLines: number): string[] {
  for (let chars = maxChars; chars >= 6; chars -= 1) {
    const lines = wrapText(text, chars, maxLines);
    if (lines.length <= maxLines) return lines;
  }
  return wrapText(text, maxChars, maxLines);
}

function text(x: number, y: number, content: unknown, size = 24, fill = '#111827', weight = 400, anchor: 'start' | 'middle' | 'end' = 'start'): string {
  return `<text x="${x}" y="${y}" font-family="${FONT}" font-size="${size}" font-weight="${weight}" fill="${fill}" text-anchor="${anchor}">${esc(removeEllipsis(content))}</text>`;
}

function multiline(x: number, y: number, content: unknown, opts: { size?: number; fill?: string; weight?: number; maxChars?: number; maxLines?: number; lineHeight?: number; anchor?: 'start' | 'middle' | 'end' } = {}): string {
  const size = opts.size || 18;
  const lines = wrapText(plain(content), opts.maxChars || 32, opts.maxLines || 3);
  if (!lines.length) return '';
  const lineHeight = opts.lineHeight || Math.round(size * 1.45);
  return lines.map((line, i) => text(x, y + i * lineHeight, line, size, opts.fill || '#111827', opts.weight || 400, opts.anchor || 'start')).join('');
}

function panel(x: number, y: number, w: number, h: number, t: Theme, radius = 18): string {
  return `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${radius}" fill="${t.panel}" stroke="${t.grid}" stroke-width="1"/>`;
}

function bg(t: Theme, tokens: DeckDesignTokens = {}): string {
  const background = tokens.background || 'soft_blobs';
  if (background === 'clean') return `<rect width="${W}" height="${H}" fill="${t.bg}"/>`;
  if (background === 'gradient_mesh') {
    return `<defs><linearGradient id="bg_mesh" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${t.bg}"/><stop offset="0.55" stop-color="${t.panel2}"/><stop offset="1" stop-color="${t.bg}"/></linearGradient></defs><rect width="${W}" height="${H}" fill="url(#bg_mesh)"/><circle cx="1040" cy="158" r="128" fill="${t.primary}" opacity="0.10"/><circle cx="238" cy="576" r="118" fill="${t.accent}" opacity="0.08"/><circle cx="665" cy="82" r="58" fill="${t.secondary}" opacity="0.06"/>`;
  }
  if (background === 'diagonal_ribbon') {
    return `<rect width="${W}" height="${H}" fill="${t.bg}"/><path d="M760 0 L1280 0 L1280 720 L980 720 Z" fill="${t.primary}" opacity="0.06"/><path d="M910 0 L1280 0 L1280 540 Z" fill="${t.secondary}" opacity="0.08"/>`;
  }
  if (background === 'grid_dots') {
    let dots = `<rect width="${W}" height="${H}" fill="${t.bg}"/>`;
    for (let yy = 92; yy <= 632; yy += 60) {
      for (let xx = 92; xx <= 1180; xx += 60) dots += `<circle cx="${xx}" cy="${yy}" r="1.7" fill="${t.grid}" opacity="0.65"/>`;
    }
    dots += `<circle cx="1088" cy="162" r="118" fill="${t.primary}" opacity="0.07"/>`;
    return dots;
  }
  if (t.name === 'dark_tech') {
    return `<rect width="${W}" height="${H}" fill="${t.bg}"/><circle cx="1100" cy="160" r="150" fill="${t.primary}" opacity="0.12"/><circle cx="180" cy="560" r="140" fill="${t.accent}" opacity="0.10"/>`;
  }
  return `<rect width="${W}" height="${H}" fill="${t.bg}"/><circle cx="1100" cy="130" r="130" fill="${t.primary}" opacity="0.08"/><circle cx="180" cy="560" r="140" fill="${t.secondary}" opacity="0.06"/>`;
}

function accentShape(t: Theme, tokens: DeckDesignTokens = {}): string {
  const shape = tokens.accent_shape || 'vertical_rule';
  if (shape === 'none') return '';
  if (shape === 'ribbon') return `<path d="M0 0 L330 0 L260 70 L0 70 Z" fill="${t.primary}" opacity="0.10"/><path d="M970 720 L1280 720 L1280 650 L1040 650 Z" fill="${t.secondary}" opacity="0.10"/>`;
  if (shape === 'corner_blob') return `<circle cx="1114" cy="106" r="72" fill="${t.primary}" opacity="0.10"/><circle cx="1168" cy="170" r="42" fill="${t.secondary}" opacity="0.14"/>`;
  if (shape === 'orbit') return `<circle cx="1110" cy="118" r="70" fill="none" stroke="${t.primary}" stroke-width="2" opacity="0.16"/><circle cx="1110" cy="118" r="38" fill="none" stroke="${t.secondary}" stroke-width="2" opacity="0.20"/><circle cx="1160" cy="72" r="6" fill="${t.accent}" opacity="0.7"/>`;
  return `<rect x="0" y="0" width="8" height="${H}" fill="${t.primary}" opacity="0.95"/>`;
}

function frame(title: string, subtitle: string, t: Theme, tokens: DeckDesignTokens = {}): string {
  return `${bg(t, tokens)}${accentShape(t, tokens)}<rect x="0" y="0" width="${W}" height="6" fill="${t.primary}"/>${text(72, 74, title, scaledSize(tokens, 30, tokens.title_size), t.text, 750)}${subtitle ? text(72, 104, subtitle, scaledSize(tokens, 14, tokens.body_size ? tokens.body_size - 1 : undefined), t.subtext, 500) : ''}<line x1="72" y1="126" x2="1208" y2="126" stroke="${t.grid}" stroke-width="1"/>`;
}

function palette(t: Theme, i: number): string {
  return [t.primary, t.secondary, t.accent, t.warning, t.danger][i % 5];
}

function tokenPalette(t: Theme, tokens: DeckDesignTokens | undefined, i: number): string {
  const colors = Array.isArray(tokens?.chart_palette) && tokens.chart_palette.length ? tokens.chart_palette : undefined;
  return colors?.[i % colors.length] || palette(t, i);
}

function metricColor(m: DeckMetric, t: Theme, i: number): string {
  if (m.status === 'risk') return t.danger;
  if (m.status === 'warn') return t.warning;
  if (m.status === 'good') return t.secondary;
  return palette(t, i);
}

function metricValue(m: DeckMetric): string {
  return `${plain(m.display_value || m.value)}${plain(m.unit)}`;
}

function compactCn(value: unknown): string {
  const raw = plain(value);
  if (!raw) return '';
  const n = num(value);
  if (!Number.isFinite(n)) return raw;
  if (Math.abs(n) >= 100_000_000) return `${(n / 100_000_000).toFixed(n % 100_000_000 ? 1 : 0)}亿`;
  if (Math.abs(n) >= 10_000) return `${(n / 10_000).toFixed(n % 10_000 ? 1 : 0)}万`;
  return String(Math.round(n));
}

function chartAsMetrics(chart: DeckChart | undefined): DeckMetric[] {
  if (chart?.items?.length) return chart.items.map((i) => ({ label: i.label, value: i.value, note: i.note }));
  if (chart?.series?.some((s) => s.values?.length)) {
    const series = chart.series.filter((s) => s.values?.length);
    const primary = series[0];
    const length = Math.max(...series.map((s) => s.values?.length || 0));
    const cats = chart.categories?.length ? chart.categories : Array.from({ length }, (_, i) => String(i + 1));
    return cats.slice(0, length).map((label, i) => {
      const value = primary?.values?.[i];
      const note = series.slice(1)
        .map((s) => `${plain(s.name || '系列')} ${compactCn(s.values?.[i])}`)
        .filter((x) => !/\s$/.test(x))
        .join(' · ');
      return { label, value: value ?? '', note };
    }).filter((m) => plain(m.label) && (plain(m.value) || m.value === 0));
  }
  const cats = chart?.categories || [];
  const vals = chart?.values || [];
  return cats.map((label, i) => ({ label, value: vals[i] ?? '' })).filter((m) => plain(m.label) || plain(m.value));
}

function chartFromMetrics(metrics: DeckMetric[] | undefined, type: DeckChart['type'] = 'bar'): DeckChart | undefined {
  const list = (metrics || []).filter((m) => plain(m.label) && plain(m.value)).slice(0, 8);
  if (!list.length) return undefined;
  return {
    type,
    categories: list.map((m) => plain(m.label)),
    values: list.map((m) => num(m.value)),
    items: list.map((m) => ({ label: m.label, value: m.value, note: m.note, color: metricColor(m, THEMES.executive_blue, 0) })),
  };
}

function componentText(component: DeckComponentSpec): string {
  if (plain(component.text || component.note || component.title || component.value)) return plain(component.text || component.note || component.title || component.value);
  if (component.metrics?.length || component.chart || component.table?.length || component.items?.length) return plain(component.type || 'component');
  return '';
}

function componentItems(component: DeckComponentSpec): string[] {
  return (component.items || []).map(plain).filter(Boolean);
}

function componentMetrics(component: DeckComponentSpec): DeckMetric[] {
  if (component.metrics?.length) return component.metrics;
  if (component.chart) return chartAsMetrics(component.chart);
  if (component.table?.length) {
    return component.table.slice(0, 8).map((row) => {
      const values = Object.values(row);
      return { label: plain(values[0]), value: values[1] ?? '', note: plain(values[2]) };
    }).filter((m) => plain(m.label) || plain(m.value));
  }
  if (component.value !== undefined || component.text) {
    return [{ label: component.title || component.type, value: component.value ?? component.text, unit: component.unit, note: component.note, status: component.tone, icon: component.icon }];
  }
  return componentItems(component).map((item, index) => ({ label: item, value: index + 1 }));
}

function componentChart(component: DeckComponentSpec, preferredType: DeckChart['type'] = 'bar'): DeckChart | undefined {
  if (component.chart) return component.chart;
  const metrics = componentMetrics(component).filter((m) => plain(m.label) && (plain(m.value) || m.value === 0));
  return chartFromMetrics(metrics, preferredType);
}

function metricsFromComponents(components: DeckComponentSpec[] | undefined): DeckMetric[] {
  return (components || [])
    .filter((component) => ['metric_card', 'hero_metric'].includes(plain(component.type)))
    .map((component) => ({
      label: component.title,
      value: component.value ?? component.text,
      unit: component.unit,
      note: component.note,
      status: component.tone,
      icon: component.icon,
    }))
    .filter((metric) => plain(metric.label) || plain(metric.value));
}

function bulletsFromComponents(components: DeckComponentSpec[] | undefined): string[] {
  return (components || [])
    .filter((component) => !['metric_card', 'hero_metric', 'chart_panel', 'ranking_list', 'funnel_panel', 'matrix'].includes(plain(component.type)))
    .map(componentText)
    .filter(Boolean);
}

function applyDataDisplay(metrics: DeckMetric[], display?: DeckDataDisplay): DeckMetric[] {
  let out = [...metrics];
  if (display?.sort && display.sort !== 'none') {
    out = out.sort((a, b) => (display.sort === 'asc' ? 1 : -1) * (num(a.value) - num(b.value)));
  }
  if (display?.top_n) out = out.slice(0, Math.max(1, Math.min(10, Number(display.top_n))));
  if (display?.highlight_max && out.length) {
    const maxValue = Math.max(...out.map((m) => num(m.value)));
    out = out.map((m) => (num(m.value) === maxValue && !m.status ? { ...m, status: 'good' } : m));
  }
  if (display?.number_format === 'compact_cn') {
    out = out.map((m) => ({ ...m, display_value: m.display_value || compactCn(m.value), unit: m.unit }));
  }
  return out;
}

function applyDataDisplayToChart(chart: DeckChart | undefined, display?: DeckDataDisplay): DeckChart | undefined {
  if (!chart) return undefined;
  if (!display?.sort && !display?.top_n && display?.number_format !== 'compact_cn') return chart;
  if (chart.series?.length && !chart.values?.length && !chart.items?.length) {
    const first = chart.series.find((s) => s.values?.length);
    const pairs = (chart.categories?.length ? chart.categories : (first?.values || []).map((_, i) => String(i + 1)))
      .map((label, index) => ({ label, index, value: num(first?.values?.[index]) }));
    let selected = pairs;
    if (display.sort && display.sort !== 'none') selected = [...selected].sort((a, b) => (display.sort === 'asc' ? 1 : -1) * (a.value - b.value));
    if (display.top_n) selected = selected.slice(0, Math.max(1, Math.min(10, Number(display.top_n))));
    if (selected.length === pairs.length && selected.every((p, i) => p.index === i)) return chart;
    return {
      ...chart,
      categories: selected.map((p) => p.label),
      series: chart.series.map((s) => ({ ...s, values: selected.map((p) => s.values?.[p.index] ?? '') })),
    };
  }
  const metrics = applyDataDisplay(chartAsMetrics(chart), display);
  if (!metrics.length) return chart;
  return {
    ...chart,
    categories: metrics.map((m) => plain(m.label)),
    values: metrics.map((m) => num(m.value)),
    items: metrics.map((m) => ({ label: m.label, value: m.display_value || m.value, note: m.note })),
    series: chart.series?.length ? undefined : chart.series,
  };
}

function hydrateSlide(slide: DeckSlideSpec, deckDisplay?: DeckDataDisplay): DeckSlideSpec {
  const rawComponents = Array.isArray(slide.components) ? slide.components : [];
  const display = { ...(deckDisplay || {}), ...(slide.data_display || {}) };
  const components = rawComponents.map((component) => (
    display.number_format === 'compact_cn' && component.value !== undefined
      ? { ...component, value: compactCn(component.value) }
      : component
  ));
  const bullets = slide.bullets?.length
    ? slide.bullets
    : [...bulletsFromComponents(components), slide.takeaway].map(plain).filter(Boolean).slice(0, 6);
  const chartMetrics = chartAsMetrics(slide.chart);
  const rawMetrics = slide.metrics?.length ? slide.metrics : (metricsFromComponents(components).length ? metricsFromComponents(components) : chartMetrics);
  const metrics = applyDataDisplay(rawMetrics, display);
  const type = normalizeType(slide);
  const rawChart = slide.chart || (['comparison', 'project_comparison', 'bar_chart', 'ranking', 'top_content', 'content_highlight'].includes(type) ? chartFromMetrics(metrics, type.includes('ranking') || type.includes('content') ? 'ranking' : 'bar') : undefined);
  const chart = applyDataDisplayToChart(rawChart, display);
  return { ...slide, components, bullets, metrics, chart };
}

function metricCards(metrics: DeckMetric[], x: number, y: number, w: number, h: number, t: Theme, maxItems = 6, tokens: DeckDesignTokens = {}): string {
  if (!metrics.length) return '';
  const list = metrics.slice(0, maxItems);
  const gap = 16;
  const cols = list.length > 4 ? 3 : list.length > 2 && h >= 230 ? 2 : list.length;
  const rows = Math.ceil(list.length / Math.max(1, cols));
  const cw = (w - gap * (cols - 1)) / Math.max(1, cols);
  const ch = (h - gap * (rows - 1)) / Math.max(1, rows);
  return list.map((m, i) => {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const cx = x + col * (cw + gap);
    const cy = y + row * (ch + gap);
    const color = metricColor(m, t, i);
    const baseValueSize = cw < 175 ? 24 : cw < 240 ? 28 : 34;
    const valueSize = scaledSize(tokens, baseValueSize, tokens.number_size);
    const labelSize = scaledSize(tokens, 13, tokens.body_size ? Math.max(11, tokens.body_size - 2) : undefined);
    const fill = safeColor(tokens.card_fill) || t.panel;
    const stroke = safeColor(tokens.card_border) || t.grid;
    const radius = tokens.corner_radius || 14;
    const cardBg = tokens.card_style === 'glass'
      ? `<rect x="${cx}" y="${cy}" width="${cw}" height="${ch}" rx="${radius}" fill="${t.panel2}" fill-opacity="0.65" stroke="${stroke}" stroke-width="1"/>`
      : tokens.card_style === 'outlined'
        ? `<rect x="${cx}" y="${cy}" width="${cw}" height="${ch}" rx="${radius}" fill="${fill}" fill-opacity="0.35" stroke="${color}" stroke-opacity="0.45" stroke-width="1.4"/>`
        : `<rect x="${cx}" y="${cy}" width="${cw}" height="${ch}" rx="${radius}" fill="${fill}" stroke="${stroke}" stroke-width="1"/>`;
    return `<g>${cardBg}<rect x="${cx}" y="${cy}" width="${cw}" height="6" rx="3" fill="${color}"/>${text(cx + 18, cy + 34, m.label || `指标${i + 1}`, labelSize, t.subtext, 600)}${text(cx + 18, cy + 78, metricValue(m), valueSize, color, 850)}${m.delta !== undefined && m.delta !== '' ? `<rect x="${cx + 18}" y="${cy + 94}" width="${Math.min(cw - 36, 128)}" height="24" rx="12" fill="${color}" opacity="0.10"/>${text(cx + 30, cy + 112, `${plain(m.delta)}`, 13, color, 800)}` : ''}${m.note ? multiline(cx + 18, cy + ch - 26, m.note, { size: 12, fill: t.subtext, maxChars: Math.max(10, Math.floor(cw / 13)), maxLines: 1 }) : ''}</g>`;
  }).join('');
}

function bulletList(items: string[], x: number, y: number, t: Theme, max = 5, maxChars = 42): string {
  return items.slice(0, max).map((b, i) => {
    const yy = y + i * 64;
    return `<g><circle cx="${x}" cy="${yy - 5}" r="7" fill="${palette(t, i)}" opacity="0.9"/><circle cx="${x}" cy="${yy - 5}" r="13" fill="${palette(t, i)}" opacity="0.10"/>${multiline(x + 24, yy, cleanText(b), { size: 16, fill: t.text, maxChars, maxLines: 2, lineHeight: 24 })}</g>`;
  }).join('');
}

function comparableText(value: unknown): string {
  return cleanText(value).replace(/[，。；、,.!！?？:\s]/g, '').toLowerCase();
}

function uniqueTexts(items: Array<unknown>, exclude: Array<unknown> = [], max = 6): string[] {
  const seen = new Set(exclude.map(comparableText).filter(Boolean));
  const out: string[] = [];
  for (const item of items) {
    const textValue = cleanText(item);
    const key = comparableText(textValue);
    if (!textValue || !key || seen.has(key)) continue;
    seen.add(key);
    out.push(textValue);
    if (out.length >= max) break;
  }
  return out;
}

function insightCards(items: string[], x: number, y: number, w: number, h: number, t: Theme, max = 4): string {
  if (!items.length) return '';
  const list = items.slice(0, max);
  const gap = 14;
  const ch = (h - gap * (list.length - 1)) / Math.max(1, list.length);
  return list.map((item, i) => {
    const cy = y + i * (ch + gap);
    const color = palette(t, i);
    const maxLines = ch < 78 ? 1 : 2;
    return `<g>${panel(x, cy, w, ch, t, 14)}<rect x="${x}" y="${cy}" width="8" height="${ch}" rx="4" fill="${color}"/>${text(x + 28, cy + 25, `洞察 ${String(i + 1).padStart(2, '0')}`, 11, color, 800)}${multiline(x + 28, cy + 50, cleanText(item), { size: 14, fill: t.text, weight: 600, maxChars: Math.max(12, Math.floor((w - 56) / 14)), maxLines, lineHeight: 20 })}</g>`;
  }).join('');
}

function compactBulletList(items: string[], x: number, y: number, w: number, h: number, t: Theme, max = 4): string {
  if (!items.length) return '';
  const gap = 12;
  const fittedCount = Math.max(1, Math.min(max, items.length, Math.floor((h + gap) / (34 + gap)) || 1));
  const list = items.slice(0, fittedCount);
  const rowH = Math.max(34, Math.min(58, (h - gap * (list.length - 1)) / list.length));
  const textSize = rowH < 44 ? 13 : rowH < 54 ? 14 : 15;
  const lineHeight = Math.round(textSize * 1.42);
  return list.map((item, i) => {
    const cy = y + i * (rowH + gap);
    const color = palette(t, i);
    const maxLines = rowH >= 52 ? 2 : 1;
    const maxChars = Math.max(12, Math.floor((w - 58) / Math.max(1, textSize)));
    const lines = wrapText(cleanText(item), maxChars, maxLines);
    const blockH = (lines.length - 1) * lineHeight + textSize;
    const firstBaseline = cy + (rowH - blockH) / 2 + textSize;
    const lineSvg = lines.map((line, li) => text(x + 42, Math.round(firstBaseline + li * lineHeight), line, textSize, t.text, 680)).join('');
    return `<g><rect x="${x}" y="${cy}" width="${w}" height="${rowH}" rx="14" fill="${t.panel2}" stroke="${t.grid}" stroke-width="1"/><rect x="${x}" y="${cy}" width="6" height="${rowH}" rx="3" fill="${color}"/><circle cx="${x + 23}" cy="${cy + rowH / 2}" r="5" fill="${color}" opacity="0.95"/>${lineSvg}</g>`;
  }).join('');
}

function takeawayBand(slide: DeckSlideSpec, x: number, y: number, w: number, t: Theme): string {
  if (!slide.takeaway) return '';
  return `<g><rect x="${x}" y="${y}" width="${w}" height="58" rx="14" fill="${t.primary}" opacity="0.08"/><rect x="${x}" y="${y}" width="6" height="58" rx="3" fill="${t.primary}"/>${multiline(x + 26, y + 36, slide.takeaway, { size: 17, fill: t.text, weight: 700, maxChars: Math.floor(w / 18), maxLines: 1 })}</g>`;
}

function sectionKicker(x: number, y: number, label: string, t: Theme, i = 0): string {
  const color = palette(t, i);
  return `<g><rect x="${x}" y="${y - 20}" width="${Math.min(220, Math.max(90, plain(label).length * 10 + 28))}" height="30" rx="15" fill="${color}" opacity="0.10"/><circle cx="${x + 16}" cy="${y - 5}" r="4.5" fill="${color}"/>${text(x + 30, y, label, 12, color, 850)}</g>`;
}

function heroMetricBlock(m: DeckMetric | undefined, x: number, y: number, w: number, h: number, t: Theme, label = '核心指标', tokens: DeckDesignTokens = {}): string {
  if (!m) return '';
  const metric = m;
  const value = metricValue(metric);
  const baseValueSize = value.length > 10 ? 42 : value.length > 7 ? 50 : 62;
  const valueSize = scaledSize(tokens, baseValueSize, tokens.number_size);
  const color = metricColor(metric, t, 0);
  const numberStyle = tokens.number_style || 'hero';
  const badge = numberStyle === 'badge'
    ? `<rect x="${x + 32}" y="${y + 94}" width="${Math.min(w - 64, value.length * valueSize * 0.62 + 42)}" height="${valueSize + 26}" rx="${Math.round((valueSize + 26) / 2)}" fill="${color}" opacity="0.10"/>`
    : '';
  return `<g>${panel(x, y, w, h, t, tokens.corner_radius || 24)}<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${tokens.corner_radius || 24}" fill="${color}" opacity="${numberStyle === 'plain' ? 0.035 : 0.07}"/>${sectionKicker(x + 32, y + 52, metric.label || label, t, 0)}${badge}${text(x + 32, y + 132, value, valueSize, color, 900)}${metric.delta !== undefined && metric.delta !== '' ? `<rect x="${x + 34}" y="${y + 154}" width="132" height="30" rx="15" fill="${color}" opacity="0.12"/>${text(x + 100, y + 176, plain(metric.delta), 14, color, 850, 'middle')}` : ''}${metric.note ? multiline(x + 32, y + h - 42, metric.note, { size: 15, fill: t.subtext, weight: 600, maxChars: Math.floor((w - 64) / 15), maxLines: 2 }) : ''}</g>`;
}

function metricRibbon(metrics: DeckMetric[], x: number, y: number, w: number, h: number, t: Theme, max = 5): string {
  if (!metrics.length) return '';
  const list = metrics.slice(0, max);
  const cw = w / Math.max(1, list.length);
  return `<g><rect x="${x}" y="${y}" width="${w}" height="${h}" rx="18" fill="${t.panel}" stroke="${t.grid}"/>${list.map((m, i) => {
    const cx = x + cw * i;
    const color = metricColor(m, t, i);
    return `<g>${i ? `<line x1="${cx}" y1="${y + 18}" x2="${cx}" y2="${y + h - 18}" stroke="${t.grid}" stroke-width="1"/>` : ''}<rect x="${cx + 18}" y="${y + 18}" width="38" height="38" rx="12" fill="${color}" opacity="0.10"/>${text(cx + 37, y + 45, i + 1, 15, color, 850, 'middle')}${multiline(cx + 68, y + 38, m.label || '', { size: 12, fill: t.subtext, weight: 650, maxChars: Math.max(6, Math.floor((cw - 92) / 12)), maxLines: 1 })}${text(cx + 68, y + 72, metricValue(m), cw < 160 ? 20 : 24, color, 850)}</g>`;
  }).join('')}</g>`;
}

function pillStrip(items: string[], x: number, y: number, t: Theme, max = 4): string {
  let cursor = x;
  return items.slice(0, max).map((item, i) => {
    const w = Math.min(238, Math.max(104, plain(item).length * 13 + 34));
    const color = palette(t, i);
    const out = `<g><rect x="${cursor}" y="${y}" width="${w}" height="34" rx="17" fill="${color}" opacity="0.10"/><circle cx="${cursor + 18}" cy="${y + 17}" r="5" fill="${color}"/>${multiline(cursor + 32, y + 23, item, { size: 13, fill: t.text, weight: 700, maxChars: Math.max(6, Math.floor((w - 44) / 13)), maxLines: 1 })}</g>`;
    cursor += w + 12;
    return out;
  }).join('');
}

function timelineBand(items: string[], x: number, y: number, w: number, t: Theme, max = 5): string {
  if (!items.length) return '';
  const list = items.slice(0, max);
  const step = w / Math.max(1, list.length - 1);
  return `<g><line x1="${x}" y1="${y}" x2="${x + w}" y2="${y}" stroke="${t.grid}" stroke-width="4" stroke-linecap="round"/>${list.map((item, i) => {
    const cx = list.length === 1 ? x + w / 2 : x + step * i;
    const color = palette(t, i);
    return `<g><circle cx="${cx}" cy="${y}" r="18" fill="${color}"/><circle cx="${cx}" cy="${y}" r="34" fill="${color}" opacity="0.10"/>${text(cx, y + 6, i + 1, 14, '#FFFFFF', 850, 'middle')}${multiline(cx, y + 60, item, { size: 14, fill: t.text, weight: 700, maxChars: 9, maxLines: 2, anchor: 'middle', lineHeight: 20 })}</g>`;
  }).join('')}</g>`;
}

function highlightBadges(points: DeckHighlightPoint[] | undefined, x: number, y: number, w: number, t: Theme, max = 3): string {
  const list = (points || []).filter((p) => p.label || p.reason || p.value !== undefined).slice(0, max);
  if (!list.length) return '';
  const gap = 12;
  const bw = (w - gap * (list.length - 1)) / list.length;
  return list.map((p, i) => {
    const bx = x + i * (bw + gap);
    const color = palette(t, i);
    return `<g><rect x="${bx}" y="${y}" width="${bw}" height="78" rx="16" fill="${color}" opacity="0.09" stroke="${color}" stroke-opacity="0.24"/><text x="${bx + 18}" y="${y + 28}" font-family="${FONT}" font-size="12" font-weight="850" fill="${color}">${esc(p.label || `高亮 ${i + 1}`)}</text>${multiline(bx + 18, y + 56, p.reason || p.value || '', { size: 13, fill: t.text, weight: 650, maxChars: Math.max(8, Math.floor((bw - 36) / 13)), maxLines: 1 })}</g>`;
  }).join('');
}

function autoHighlightPoints(chart: DeckChart | undefined): DeckHighlightPoint[] {
  const series = chart?.series?.filter((s) => s.values?.length) || [];
  const categories = chart?.categories || [];
  if (series.length) {
    return series.slice(0, 2).map((s) => {
      const vals = (s.values || []).map(num);
      const last = vals[vals.length - 1] || 0;
      const prev = vals.length > 1 ? vals[vals.length - 2] || 0 : 0;
      const delta = prev ? `${last >= prev ? '+' : ''}${(((last - prev) / prev) * 100).toFixed(1)}%` : '';
      const label = plain(s.name) || '最新值';
      const period = categories[vals.length - 1] || '最新周期';
      return { label, value: compactCn(last), reason: `${period} ${compactCn(last)}${delta ? `，环比 ${delta}` : ''}` };
    });
  }
  const values = chart?.values?.map(num) || [];
  if (!values.length) return [];
  const last = values[values.length - 1] || 0;
  const maxValue = Math.max(...values);
  const maxIndex = values.findIndex((v) => v === maxValue);
  return [
    { label: '最新值', value: compactCn(last), reason: `${categories[values.length - 1] || '最新周期'} ${compactCn(last)}` },
    { label: '峰值', value: compactCn(maxValue), reason: `${categories[maxIndex] || '峰值周期'} 达到 ${compactCn(maxValue)}` },
  ];
}

type LayoutRect = { x: number; y: number; w: number; h: number };

function hasComponentType(components: DeckComponentSpec[], types: string[]): boolean {
  const normalized = new Set(types.map(canonicalVariant));
  return components.some((component) => normalized.has(canonicalVariant(component.type || '')));
}

function insightToneForSlide(slide: DeckSlideSpec): DeckComponentSpec['tone'] {
  const type = normalizeType(slide);
  if (['diagnosis', 'risk', 'issue', 'funnel'].includes(type)) return 'warn';
  if (['roadmap', 'next_steps', 'recommendation'].includes(type)) return 'good';
  return 'neutral';
}

function normalizedComponentType(component: DeckComponentSpec): string {
  return canonicalVariant(component.type || '');
}

function isPrimaryComponent(component: DeckComponentSpec, slide: DeckSlideSpec): boolean {
  const type = normalizedComponentType(component);
  if (slide.emphasis === 'chart') return ['chart_panel', 'chart'].includes(type) || !!component.chart;
  if (slide.emphasis === 'ranking') return type === 'ranking_list';
  if (slide.emphasis === 'timeline') return type === 'timeline';
  if (slide.emphasis === 'hero_metric') return type === 'hero_metric';
  return ['chart_panel', 'chart', 'ranking_list', 'funnel_panel', 'hero_metric'].includes(type) || !!component.chart;
}

function componentsFromSlide(slide: DeckSlideSpec): DeckComponentSpec[] {
  const type = normalizeType(slide);
  const out: DeckComponentSpec[] = [...(slide.components || [])];
  const shouldPreferMetricRanking = ['ranking', 'top_content', 'content_highlight'].includes(type) && !!slide.metrics?.length;
  if (slide.chart && !shouldPreferMetricRanking && !hasComponentType(out, ['chart_panel', 'chart', 'ranking_list', 'funnel_panel'])) {
    const chartType = canonicalVariant(slide.chart.type || '');
    const componentType = chartType === 'ranking' ? 'ranking_list' : chartType === 'funnel' ? 'funnel_panel' : 'chart_panel';
    out.unshift({
      type: componentType,
      layout_variant: chartType || undefined,
      title: slide.chart.title || (type === 'trend' ? '趋势表现' : '数据图表'),
      chart: slide.chart,
      data_display: slide.data_display,
    });
  }

  if (slide.metrics?.length && !hasComponentType(out, ['metric_card', 'hero_metric', 'ranking_list', 'funnel_panel'])) {
    if (['ranking', 'top_content', 'content_highlight'].includes(type)) {
      out.push({ type: 'ranking_list', title: '高表现内容', metrics: slide.metrics, data_display: slide.data_display });
    } else if (['diagnosis', 'risk', 'issue', 'funnel'].includes(type)) {
      out.push({ type: 'funnel_panel', title: '关键链路', metrics: slide.metrics, data_display: slide.data_display });
    } else {
      slide.metrics.slice(0, 5).forEach((metric, index) => {
        out.push({
          type: index === 0 && (slide.emphasis === 'hero_metric' || ['executive_summary', 'kpi_dashboard', 'overview'].includes(type)) ? 'hero_metric' : 'metric_card',
          title: metric.label,
          value: metric.display_value || metric.value,
          unit: metric.unit,
          note: metric.note,
          tone: metric.status,
          icon: metric.icon,
          data_display: slide.data_display,
        });
      });
    }
  }

  const insightBullets = uniqueTexts(slide.bullets || [], [slide.takeaway], 4);
  if (insightBullets.length && !hasComponentType(out, ['insight_card', 'risk_card', 'action_card', 'callout', 'timeline'])) {
    if (['roadmap', 'next_steps', 'recommendation'].includes(type)) {
      insightBullets.slice(0, 4).forEach((item, index) => out.push({ type: 'action_card', title: `行动 ${index + 1}`, text: item, tone: 'good', icon: 'action' }));
    } else {
      insightBullets.slice(0, 3).forEach((item, index) => out.push({ type: type === 'diagnosis' ? 'risk_card' : 'insight_card', title: `${type === 'diagnosis' ? '问题信号' : '洞察'} ${index + 1}`, text: item, tone: insightToneForSlide(slide), icon: type === 'diagnosis' ? 'warning' : 'lightbulb' }));
    }
  }

  if (slide.takeaway && out.length < 2 && !hasComponentType(out, ['callout', 'takeaway_band'])) {
    out.push({ type: 'callout', title: '核心结论', text: slide.takeaway, tone: 'good', icon: 'check' });
  }

  const nonDecorativeType = normalizeType(slide);
  const isContentPage = !['cover', 'toc', 'agenda', 'closing', 'thanks'].includes(nonDecorativeType);
  const nonMetricCount = out.filter((component) => !['metric_card', 'hero_metric'].includes(normalizedComponentType(component))).length;
  if (isContentPage && out.filter((component) => ['metric_card', 'hero_metric'].includes(normalizedComponentType(component))).length >= 3 && nonMetricCount < 2) {
    const metricList = (slide.metrics || []).slice(0, 5);
    const metricSentence = metricList.length
      ? `重点指标：${metricList.map((m) => `${m.label || '指标'} ${metricValue(m)}`).join('，')}。`
      : '';
    const bullets = uniqueTexts(slide.bullets || [], [slide.takeaway], 2);
    const factualInsight = bullets[0] || slide.takeaway || metricSentence;
    const existingAction = bullets[1];
    if (factualInsight) {
      out.push({
        type: 'insight_card',
        title: '指标解读',
        text: factualInsight,
        tone: 'neutral',
        icon: 'lightbulb',
      });
    }
    if (existingAction) {
      out.push({
        type: 'action_card',
        title: '管理关注',
        text: existingAction,
        tone: 'good',
        icon: 'action',
      });
    }
  }

  if (!out.length && (slide.notes || slide.takeaway)) {
    out.push({ type: 'callout', title: '页面要点', text: slide.takeaway || slide.notes, tone: 'neutral' });
  }

  return out.filter((component) => componentText(component) || componentMetrics(component).length || component.chart).slice(0, 8);
}

function splitRectsForGrid(count: number, rect: LayoutRect, gap: number): LayoutRect[] {
  if (count <= 0) return [];
  const oneColH = (rect.h - gap * (count - 1)) / Math.max(1, count);
  const canUseTwoCols = rect.w >= 388 && count >= 3;
  const cols = rect.w < 388
    ? (oneColH < 112 && rect.w >= 340 ? 2 : 1)
    : rect.w < 720
      ? (canUseTwoCols && oneColH < 150 ? Math.min(2, count) : count <= 2 ? 1 : Math.min(2, count))
      : count > 4 ? 3 : count > 2 ? 2 : count;
  const rows = Math.ceil(count / cols);
  const cw = (rect.w - gap * (cols - 1)) / cols;
  const ch = (rect.h - gap * (rows - 1)) / rows;
  return Array.from({ length: count }, (_, index) => ({
    x: rect.x + (index % cols) * (cw + gap),
    y: rect.y + Math.floor(index / cols) * (ch + gap),
    w: cw,
    h: ch,
  }));
}

function renderComponentInRect(component: DeckComponentSpec, rect: LayoutRect, t: Theme, tokens: DeckDesignTokens, index: number): string {
  return renderComponentCard(component, rect.x, rect.y, rect.w, rect.h, t, tokens, index);
}

function componentDensityScore(components: DeckComponentSpec[]): number {
  return components.reduce((score, component) => {
    const type = normalizedComponentType(component);
    if (component.chart || ['chart_panel', 'chart', 'ranking_list', 'funnel_panel', 'timeline'].includes(type)) return score + 2;
    if (['metric_card', 'hero_metric'].includes(type)) return score + 1.25;
    return score + 1;
  }, 0);
}

function componentTextLoad(component: DeckComponentSpec): number {
  const items = componentItems(component);
  return cleanText(component.title).length
    + cleanText(component.subtitle).length
    + cleanText(component.text || component.note).length
    + items.reduce((sum, item) => sum + cleanText(item).length, 0)
    + componentMetrics(component).slice(0, 5).reduce((sum, metric) => sum + cleanText(metric.label).length + cleanText(metric.note).length, 0);
}

function isAnalyticComponent(component: DeckComponentSpec): boolean {
  return ['insight_card', 'risk_card', 'action_card', 'callout', 'matrix', 'timeline'].includes(normalizedComponentType(component));
}

function compactSidebarComponents(rest: DeckComponentSpec[], primary: DeckComponentSpec): DeckComponentSpec[] {
  if (rest.length <= 3) return rest;
  const primaryHasData = Boolean(primary.chart || componentMetrics(primary).length);
  const analytics = rest.filter(isAnalyticComponent);
  const nonMetric = rest.filter((component) => !['metric_card', 'hero_metric'].includes(normalizedComponentType(component)) && !analytics.includes(component));
  const metrics = rest.filter((component) => ['metric_card', 'hero_metric'].includes(normalizedComponentType(component)));
  const preferred = primaryHasData ? [...analytics, ...nonMetric, ...metrics] : [...metrics, ...analytics, ...nonMetric];
  const selected = preferred.slice(0, 2);
  const selectedSet = new Set(selected);
  const extraTexts = uniqueTexts(
    preferred
      .filter((component) => !selectedSet.has(component))
      .map((component) => {
        const items = componentItems(component);
        if (items.length) return items.join('；');
        const metric = componentMetrics(component)[0];
        if (metric) return `${metric.label || component.title || '指标'}：${metricValue(metric)}${metric.note ? `，${metric.note}` : ''}`;
        return componentText(component);
      }),
    selected.map(componentText),
    3,
  );
  if (extraTexts.length) {
    selected.push({
      type: 'insight_card',
      title: '补充观察',
      items: extraTexts,
      tone: 'neutral',
      icon: 'lightbulb',
    });
  }
  return selected.length ? selected : rest.slice(0, 3);
}

function splitRectsVertical(count: number, rect: LayoutRect, gap: number): LayoutRect[] {
  if (count <= 0) return [];
  const h = (rect.h - gap * (count - 1)) / count;
  return Array.from({ length: count }, (_, index) => ({
    x: rect.x,
    y: rect.y + index * (h + gap),
    w: rect.w,
    h,
  }));
}

function renderMetricDashboardLayout(slide: DeckSlideSpec, components: DeckComponentSpec[], t: Theme, tokens: DeckDesignTokens): string {
  const metrics = components
    .filter((component) => ['metric_card', 'hero_metric'].includes(normalizedComponentType(component)))
    .map((component) => componentMetrics(component)[0])
    .filter((metric): metric is DeckMetric => Boolean(metric));
  const nonMetrics = components.filter((component) => !['metric_card', 'hero_metric'].includes(normalizedComponentType(component)));
  const metricArea: LayoutRect = { x: 80, y: 154, w: 1120, h: nonMetrics.length ? 250 : 420 };
  const cols = metrics.length >= 5 ? 5 : metrics.length === 4 ? 4 : Math.max(1, metrics.length);
  const cardGap = tokens.gap || 18;
  const cardW = (metricArea.w - cardGap * (cols - 1)) / cols;
  const cardH = metrics.length > cols ? (metricArea.h - cardGap) / 2 : metricArea.h;
  let body = metrics.map((metric, i) => {
    const rect = {
      x: metricArea.x + (i % cols) * (cardW + cardGap),
      y: metricArea.y + Math.floor(i / cols) * (cardH + cardGap),
      w: cardW,
      h: cardH,
    };
    return renderComponentInRect({
      type: i === 0 ? 'hero_metric' : 'metric_card',
      title: metric.label,
      value: metric.display_value || metric.value,
      unit: metric.unit,
      note: metric.note,
      tone: metric.status,
      icon: metric.icon,
    }, rect, t, tokens, i);
  }).join('');

  if (nonMetrics.length) {
    const insightArea: LayoutRect = { x: 80, y: 430, w: 1120, h: 144 };
    const count = Math.min(nonMetrics.length, 3);
    const rects = count <= 2
      ? Array.from({ length: count }, (_, index) => ({
        x: insightArea.x + index * ((insightArea.w - cardGap) / 2 + cardGap),
        y: insightArea.y,
        w: (insightArea.w - cardGap) / 2,
        h: insightArea.h,
      }))
      : [
        { x: 80, y: 430, w: 360, h: 144 },
        { x: 460, y: 430, w: 360, h: 144 },
        { x: 840, y: 430, w: 360, h: 144 },
      ];
    body += nonMetrics.slice(0, count).map((component, index) => renderComponentInRect(component, rects[index], t, tokens, metrics.length + index)).join('');
  }

  return svg(frame(slide.title || '核心指标概览', slide.subtitle || 'EXECUTIVE SUMMARY', t, tokens)
    + body
    + takeawayBand(slide, 80, 612, 1120, t));
}

function renderConstraintLayout(slide: DeckSlideSpec, t: Theme, tokens: DeckDesignTokens): string {
  const components = componentsFromSlide(slide);
  if (!components.length) return narrativeTemplateSlide(slide, t, tokens);

  const gap = tokens.gap || 18;
  const content: LayoutRect = { x: 80, y: 154, w: 1120, h: 420 };
  let body = '';
  const primaryIndex = components.findIndex((component) => isPrimaryComponent(component, slide));
  const density = componentDensityScore(components);
  const metricCount = components.filter((component) => ['metric_card', 'hero_metric'].includes(normalizedComponentType(component))).length;

  if (metricCount >= 3 && !components.some((component) => component.chart)) {
    return renderMetricDashboardLayout(slide, components, t, tokens);
  }

  if (density < 2 && slide.takeaway && !hasComponentType(components, ['callout'])) {
    components.push({ type: 'callout', title: '核心判断', text: slide.takeaway, tone: 'good' });
  }

  if (primaryIndex >= 0 && components.length > 1) {
    const primary = components[primaryIndex];
    const rawRest = components.filter((_, index) => index !== primaryIndex);
    const rest = compactSidebarComponents(rawRest, primary);
    const primaryType = normalizedComponentType(primary);
    const textHeavyRest = rest.reduce((sum, component) => sum + componentTextLoad(component), 0) > rest.length * 46;
    const primaryW = primaryType === 'hero_metric'
      ? 400
      : rest.length >= 4 ? 620 : rest.length === 3 ? (textHeavyRest ? 640 : 650) : 700;
    const mainRect: LayoutRect = { x: content.x, y: content.y, w: primaryW, h: content.h };
    const sideRect: LayoutRect = { x: content.x + primaryW + gap, y: content.y, w: content.w - primaryW - gap, h: content.h };
    body += renderComponentInRect(primary, mainRect, t, tokens, 0);
    const isVisualPrimary = ['chart_panel', 'chart', 'ranking_list', 'funnel_panel'].includes(primaryType) || !!primary.chart;
    const sideRects = isVisualPrimary
      ? splitRectsVertical(rest.length, sideRect, Math.max(14, gap - 2))
      : splitRectsForGrid(rest.length, sideRect, Math.max(12, gap - 4));
    body += rest.map((component, index) => renderComponentInRect(component, sideRects[index], t, tokens, index + 1)).join('');
  } else {
    const rects = splitRectsForGrid(components.length, content, gap);
    body += components.map((component, index) => renderComponentInRect(component, rects[index], t, tokens, index)).join('');
  }

  return svg(frame(slide.title || '分析页', slide.subtitle || plain(slide.slide_type).toUpperCase(), t, tokens)
    + body
    + takeawayBand({ ...slide, takeaway: uniqueTexts([slide.takeaway], components.map(componentText), 1)[0] || slide.takeaway }, 80, 612, 1120, t));
}

function componentToneColor(component: DeckComponentSpec, t: Theme, index: number): string {
  if (component.tone === 'risk') return t.danger;
  if (component.tone === 'warn') return t.warning;
  if (component.tone === 'good') return t.secondary;
  return palette(t, index);
}

function iconLabel(raw: unknown): string {
  const key = plain(raw).toLowerCase();
  const labels: Record<string, string> = {
    warning: '!',
    risk: '!',
    growth: '+',
    trend: '+',
    target: 'T',
    users: 'U',
    content: 'C',
    check: 'OK',
    search: 'S',
    calendar: 'D',
    medical: 'M',
    lightbulb: 'I',
    action: 'A',
    project: 'P',
    read: 'R',
    interaction: 'IN',
  };
  return labels[key] || (key ? key.slice(0, 2).toUpperCase() : 'I');
}

function componentPanel(x: number, y: number, w: number, h: number, color: string, t: Theme, tokens: DeckDesignTokens): string {
  const radius = tokens.corner_radius || 16;
  const fill = safeColor(tokens.card_fill) || t.panel;
  const stroke = safeColor(tokens.card_border) || t.grid;
  if (tokens.card_style === 'outlined') {
    return `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${radius}" fill="${fill}" fill-opacity="0.35" stroke="${color}" stroke-opacity="0.42" stroke-width="1.4"/>`;
  }
  if (tokens.card_style === 'glass') {
    return `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${radius}" fill="${t.panel2}" fill-opacity="0.62" stroke="${stroke}" stroke-width="1"/>`;
  }
  return `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${radius}" fill="${fill}" stroke="${stroke}" stroke-width="1"/>`;
}

function componentHeaderSizing(component: DeckComponentSpec, x: number, w: number, h: number, tokens: DeckDesignTokens): { compact: boolean; titleX: number; titleSize: number; maxChars: number; maxLines: number; lineCount: number; reserve: number } {
  const compact = h < 150 || w < 300 || tokens.density === 'high';
  const iconStyle = tokens.icon_style || 'circle';
  const titleX = x + (iconStyle === 'none' ? 18 : compact ? 50 : 64);
  const titleSize = compact ? 14 : 16;
  const maxChars = Math.max(8, Math.floor((w - (titleX - x) - 16) / titleSize));
  const maxLines = h >= 128 && w >= 210 ? 2 : 1;
  const title = plain(component.title || component.subtitle || component.type || '组件');
  const lineCount = Math.max(1, wrapText(title, maxChars, maxLines).length || 1);
  const reserve = compact ? (lineCount > 1 ? 74 : 60) : (lineCount > 1 ? 92 : 76);
  return { compact, titleX, titleSize, maxChars, maxLines, lineCount, reserve };
}

function componentHeader(component: DeckComponentSpec, x: number, y: number, w: number, h: number, color: string, t: Theme, tokens: DeckDesignTokens, index: number): string {
  const title = plain(component.title || component.subtitle || component.type || `组件 ${index + 1}`);
  const sizing = componentHeaderSizing(component, x, w, h, tokens);
  const compact = sizing.compact || w < 300;
  const iconStyle = tokens.icon_style || 'circle';
  const iconR = compact ? 14 : 18;
  const iconCx = x + (compact ? 28 : 36);
  const iconCy = y + (compact ? 30 : 40);
  const headerY = y + (compact ? 34 : 36);
  const icon = iconStyle === 'none'
    ? ''
    : iconStyle === 'square'
      ? `<rect x="${iconCx - iconR}" y="${iconCy - iconR}" width="${iconR * 2}" height="${iconR * 2}" rx="9" fill="${color}" opacity="0.14"/>${text(iconCx, iconCy + 5, iconLabel(component.icon || component.type), compact ? 9 : 11, color, 850, 'middle')}`
      : `<circle cx="${iconCx}" cy="${iconCy}" r="${iconR}" fill="${color}" opacity="0.14"/>${text(iconCx, iconCy + 5, iconLabel(component.icon || component.type), compact ? 9 : 11, color, 850, 'middle')}`;
  const headerFill = tokens.card_style === 'solid_header' ? `<rect x="${x}" y="${y}" width="${w}" height="${compact ? 54 : 68}" rx="${tokens.corner_radius || 16}" fill="${color}" opacity="0.10"/><rect x="${x}" y="${y + (compact ? 46 : 56)}" width="${w}" height="16" fill="${safeColor(tokens.card_fill) || t.panel}"/>` : `<rect x="${x}" y="${y}" width="${w}" height="6" rx="3" fill="${color}"/>`;
  const titleX = x + (iconStyle === 'none' ? 18 : compact ? 50 : 64);
  const titleSize = compact ? 14 : 16;
  return `${headerFill}${icon}${multiline(titleX, headerY, title, { size: titleSize, fill: color, weight: 850, maxChars: sizing.maxChars, maxLines: sizing.maxLines, lineHeight: compact ? 19 : 22 })}`;
}

function splitListText(value: unknown): string[] {
  const raw = plain(value);
  if (!raw) return [];
  const normalized = raw.replace(/([；;])\s*/g, '\n').replace(/\s*(\d+[）)]|[①②③④⑤⑥⑦⑧⑨]|[一二三四五六七八九][、.])\s*/g, '\n$1 ');
  return normalized.split(/\n+/).map((item) => item.trim()).filter(Boolean);
}

function fittedFontSize(content: unknown, width: number, height: number, preferred: number, maxLines: number, min = 10): number {
  const textValue = plain(content);
  if (!textValue) return preferred;
  for (let size = preferred; size >= min; size -= 1) {
    const lineHeight = Math.round(size * 1.45);
    const allowedLines = Math.max(1, Math.min(maxLines, Math.floor(height / lineHeight)));
    const maxChars = Math.max(6, Math.floor(width / Math.max(1, size)));
    const lines = wrapText(textValue, maxChars, allowedLines);
    if (lines.join('').length >= textValue.length || lines.length < allowedLines) return size;
  }
  return min;
}

function renderComponentCard(component: DeckComponentSpec, x: number, y: number, w: number, h: number, t: Theme, tokens: DeckDesignTokens, index: number): string {
  const type = canonicalVariant(component.type || '');
  const mergedTokens = mergeTokens(tokens, component.style, undefined);
  const color = componentToneColor(component, t, index);
  const display = { ...(component.data_display || {}) };
  const headerSizing = componentHeaderSizing(component, x, w, h, mergedTokens);
  const header = componentHeader(component, x, y, w, h, color, t, mergedTokens, index);
  const contentY = y + headerSizing.reserve;
  const contentH = Math.max(36, h - headerSizing.reserve - 18);
  const body = component.text || component.note || '';
  const preferredBodySize = scaledSize(mergedTokens, 16, mergedTokens.body_size);
  const maxBodyLines = h > 180 ? 4 : h > 130 ? 3 : 2;
  const bodySize = fittedFontSize(body || component.value || component.title || '', w - 48, contentH, preferredBodySize, maxBodyLines);
  const metrics = applyDataDisplay(componentMetrics(component), display);
  const chart = componentChart({ ...component, metrics }, type === 'funnel_panel' ? 'funnel' : type === 'ranking_list' ? 'ranking' : type === 'timeline' ? 'line' : 'bar');

  let content = '';
  if (type === 'metric_card' || type === 'hero_metric') {
    const metric = metrics[0] || { label: component.title, value: component.value ?? component.text, unit: component.unit, note: component.note, status: component.tone };
    const value = metricValue(metric);
    const compactMetric = h < 155 || w < 250;
    const valueSize = compactMetric
      ? Math.min(30, scaledSize(mergedTokens, 26, mergedTokens.number_size))
      : scaledSize(mergedTokens, type === 'hero_metric' ? (h > 220 ? 46 : 38) : 30, mergedTokens.number_size);
    const hasNote = Boolean(metric.note);
    const valueY = compactMetric
      ? Math.min(y + h - (hasNote ? 42 : 24), contentY + 34)
      : type === 'hero_metric'
        ? y + Math.max(108, Math.round(h * (hasNote ? 0.48 : 0.56)))
        : y + Math.max(112, Math.round(h * (hasNote ? 0.50 : 0.56)));
    const noteY = compactMetric ? Math.min(y + h - 18, valueY + 28) : type === 'hero_metric' ? Math.min(y + h - 34, valueY + 54) : contentY + 66;
    content = `${text(x + 24, valueY, value, valueSize, color, 900)}${metric.delta !== undefined && metric.delta !== '' && !compactMetric ? text(x + 24, valueY + 30, plain(metric.delta), 13, color, 800) : ''}${metric.note ? multiline(x + 24, noteY, metric.note, { size: compactMetric ? 11 : 12, fill: t.subtext, maxChars: Math.max(10, Math.floor((w - 48) / (compactMetric ? 11 : 12))), maxLines: compactMetric ? 1 : 2 }) : ''}`;
  } else if (type === 'chart_panel' || type === 'chart' || component.chart) {
    const chartType = canonicalVariant(chart?.type || component.layout_variant || '');
    content = chartType === 'line' || chartType === 'area'
      ? lineChart(chart, x + 18, contentY - 4, w - 36, contentH, t, { show_axis: true, show_grid: true, show_value_labels: display.show_value_labels, ...display }, mergedTokens)
      : chartType === 'ranking'
        ? rankingList(chartAsMetrics(chart), x + 18, contentY - 4, w - 36, contentH, t)
        : chartType === 'funnel'
          ? funnel(chartAsMetrics(chart), x + 18, contentY - 4, w - 36, contentH, t)
          : barChart(chart, x + 18, contentY - 4, w - 36, contentH, t, { show_axis: true, show_value_labels: display.show_value_labels, ...display }, mergedTokens);
  } else if (type === 'ranking_list') {
    content = rankingList(metrics, x + 18, contentY - 4, w - 36, contentH, t);
  } else if (type === 'funnel_panel') {
    content = funnel(metrics, x + 18, contentY - 4, w - 36, contentH, t);
  } else if (component.table?.length) {
    content = dataTable(component.table, x + 18, contentY - 4, w - 36, contentH, t);
  } else if (type === 'timeline') {
    const items = componentItems(component).length ? componentItems(component) : metrics.map((m) => plain(m.label || m.note || m.value)).filter(Boolean);
    content = timelineBand(items.length ? items : [body].filter(Boolean), x + 44, contentY + 42, w - 88, t, 4);
  } else if (type === 'matrix') {
    const items = componentItems(component).length ? componentItems(component) : metrics.map((m) => `${plain(m.label)} ${plain(m.value)}`).filter(Boolean);
    content = items.slice(0, 4).map((item, i) => {
      const bx = x + 22 + (i % 2) * ((w - 58) / 2 + 14);
      const by = contentY + Math.floor(i / 2) * ((contentH - 14) / 2 + 14);
      const bw = (w - 58) / 2;
      const bh = (contentH - 14) / 2;
      const c = tokenPalette(t, mergedTokens, i);
      return `<g><rect x="${bx}" y="${by}" width="${bw}" height="${bh}" rx="12" fill="${c}" opacity="0.08" stroke="${c}" stroke-opacity="0.20"/>${multiline(bx + 16, by + 30, item, { size: Math.min(bodySize, 14), fill: t.text, weight: 700, maxChars: Math.max(8, Math.floor((bw - 32) / 13)), maxLines: 2 })}</g>`;
    }).join('');
  } else if (type === 'takeaway_band' || type === 'callout') {
    const calloutH = Math.min(contentH, Math.max(86, h - 104));
    const calloutSize = fittedFontSize(body || component.title || component.value || '', w - 76, calloutH - 28, Math.min(bodySize + 2, 18), 4, 11);
    const maxLines = Math.max(2, Math.floor((calloutH - 20) / Math.round(calloutSize * 1.5)));
    const lineCount = wrapText(plain(body || component.title || component.value || ''), Math.max(12, Math.floor((w - 76) / calloutSize)), maxLines).length || 1;
    const textBlockH = lineCount * Math.round(calloutSize * 1.5);
    const textY = contentY + Math.max(34, Math.round((calloutH - textBlockH) / 2) + calloutSize);
    const listItems = splitListText(body);
    const listSvg = listItems.length >= 2 && listItems.length <= 5
      ? listItems.slice(0, 5).map((item, li) => {
        const count = Math.min(listItems.length, 5);
        const rowH = Math.max(22, Math.floor((calloutH - 24) / count));
        const yy = contentY + 14 + rowH * li + Math.round(rowH / 2) + 5;
        const itemText = item.replace(/^\d+[）)]\s*/, '').replace(/^[①②③④⑤⑥⑦⑧⑨]\s*/, '').replace(/^[一二三四五六七八九][、.]\s*/, '');
        const size = Math.min(Math.max(13, calloutSize - 1), 15);
        return `<circle cx="${x + 48}" cy="${yy - 5}" r="4.2" fill="${color}"/>${multiline(x + 62, yy, itemText, { size, fill: t.text, weight: 720, maxChars: Math.max(12, Math.floor((w - 96) / size)), maxLines: 1 })}`;
      }).join('')
      : '';
    content = `<rect x="${x + 22}" y="${contentY}" width="${w - 44}" height="${calloutH}" rx="16" fill="${color}" opacity="0.09"/><rect x="${x + 22}" y="${contentY}" width="6" height="${calloutH}" rx="3" fill="${color}"/>${listSvg || multiline(x + 44, textY, body || component.title || component.value || '', { size: calloutSize, fill: t.text, weight: 800, maxChars: Math.max(12, Math.floor((w - 76) / calloutSize)), maxLines, lineHeight: Math.round(calloutSize * 1.5) })}`;
  } else {
	    const items = componentItems(component);
	    content = items.length
	      ? compactBulletList(items, x + 22, contentY - 2, w - 44, contentH, t, 3)
	      : multiline(x + 24, contentY + 6, body || component.value || component.title || '', { size: bodySize, fill: t.text, weight: 650, maxChars: Math.max(10, Math.floor((w - 48) / bodySize)), maxLines: maxBodyLines, lineHeight: Math.round(bodySize * 1.45) });
  }
  if (!content) {
    content = multiline(x + 24, contentY + 6, component.title || component.type || `组件 ${index + 1}`, { size: bodySize, fill: t.text, weight: 650, maxChars: Math.max(10, Math.floor((w - 48) / bodySize)), maxLines: 2 });
  }
  return `<g>${componentPanel(x, y, w, h, color, t, mergedTokens)}${header}${content}</g>`;
}

function componentCards(components: DeckComponentSpec[] | undefined, x: number, y: number, w: number, h: number, t: Theme, tokens: DeckDesignTokens, max = 6): string {
  const list = (components || []).filter((component) => componentText(component)).slice(0, max);
  if (!list.length) return '';
  const gap = tokens.gap || 14;
  const cols = list.length > 4 ? 3 : list.length > 2 ? 2 : list.length;
  const rows = Math.ceil(list.length / Math.max(1, cols));
  const cardW = (w - gap * (cols - 1)) / Math.max(1, cols);
  const cardH = (h - gap * (rows - 1)) / Math.max(1, rows);
  return list.map((component, index) => {
    const col = index % cols;
    const row = Math.floor(index / cols);
    const cx = x + col * (cardW + gap);
    const cy = y + row * (cardH + gap);
    return renderComponentCard(component, cx, cy, cardW, cardH, t, tokens, index);
  }).join('');
}

function lineChart(chart: DeckChart | undefined, x: number, y: number, w: number, h: number, t: Theme, display: DeckDataDisplay = {}, tokens: DeckDesignTokens = {}): string {
  const hasSeries = !!chart?.series?.some((s) => s.values?.length);
  const hasValues = !!chart?.values?.length;
  if (!hasSeries && !hasValues) return '';
  const firstValuesLen = hasSeries ? Math.max(...(chart?.series || []).map((s) => s.values?.length || 0)) : (chart?.values?.length || 0);
  const categories = chart?.categories?.length ? chart.categories : Array.from({ length: firstValuesLen }, (_, i) => String(i + 1));
  const series = hasSeries ? chart?.series || [] : [{ name: '趋势', values: chart?.values || [] }];
  const all = series.flatMap((s) => (s.values || []).map(num));
  const max = Math.max(...all, 1);
  const min = Math.min(...all, 0);
  const range = max - min || 1;
  const left = x + 72;
  const right = x + w - 36;
  const suffix = plain(chart?.value_suffix);
  const title = plain(chart?.title) || '趋势';
  const titleMaxChars = Math.max(12, Math.floor((w - 48) / 16));
  const titleLines = wrapText(title, titleMaxChars, 2);
  const top = y + (titleLines.length > 1 ? 74 : 56);
  const bottom = y + h - 48;
  let out = `<g>${panel(x, y, w, h, t, 16)}${multiline(x + 24, y + 31, title, { size: 16, fill: t.primary, weight: 850, maxChars: titleMaxChars, maxLines: 2, lineHeight: 20 })}`;
  if (display.show_grid !== false || display.show_axis !== false) out += '<g opacity="0.75">';
  if (display.show_grid !== false || display.show_axis !== false) {
    for (let i = 0; i <= 4; i++) {
      const gy = top + (bottom - top) * i / 4;
      const val = max - (range * i / 4);
      if (display.show_grid !== false) out += `<line x1="${left}" y1="${gy}" x2="${right}" y2="${gy}" stroke="${t.grid}" stroke-width="1"/>`;
      if (display.show_axis !== false) out += text(x + 22, gy + 4, `${compactCn(Math.round(val))}${suffix}`, 13, t.subtext, 500);
    }
  }
  if (display.show_grid !== false || display.show_axis !== false) out += `</g>`;
  if (display.show_axis !== false) out += `<line x1="${left}" y1="${bottom}" x2="${right}" y2="${bottom}" stroke="${t.grid}" stroke-width="1.5"/><line x1="${left}" y1="${top}" x2="${left}" y2="${bottom}" stroke="${t.grid}" stroke-width="1.5"/>`;
  series.slice(0, 3).forEach((s, si) => {
    const vals = (s.values || []).map(num);
    const color = safeColor(s.color) || tokenPalette(t, tokens, si);
    const isArea = canonicalVariant(chart?.type || '') === 'area';
    const pts = vals.map((v, i) => {
      const px = left + (right - left) * (i / Math.max(1, vals.length - 1));
      const py = top + (bottom - top) * (1 - (v - min) / range);
      return [px, py];
    });
    const strokeWidth = tokens.chart_style === 'bold' ? 5 : tokens.chart_style === 'sparkline' ? 3 : 4;
    if (isArea && pts.length) {
      out += `<polygon points="${[[pts[0][0], bottom], ...pts, [pts[pts.length - 1][0], bottom]].map((p) => p.join(',')).join(' ')}" fill="${color}" opacity="${si === 0 ? 0.16 : 0.08}"/>`;
    }
    out += `<polyline points="${pts.map((p) => p.join(',')).join(' ')}" fill="none" stroke="${color}" stroke-width="${strokeWidth}" stroke-linecap="round" stroke-linejoin="round"/>`;
    out += pts.map((p) => `<circle cx="${p[0]}" cy="${p[1]}" r="5" fill="${color}"/>`).join('');
    if (display.show_value_labels) out += pts.map((p, pi) => text(p[0], p[1] - 12, `${compactCn(vals[pi])}${suffix}`, 12, color, 750, 'middle')).join('');
    if (display.show_legend !== false) out += text(x + 64 + si * 150, y + 30, s.name || `系列${si + 1}`, 14, color, 700);
  });
  if (display.show_axis !== false) {
    out += categories.slice(0, 8).map((c, i) => text(left + (right - left) * (i / Math.max(1, categories.length - 1)), y + h - 20, c, 14, t.subtext, 650, 'middle')).join('');
    if (chart?.x_label) out += text((left + right) / 2, y + h - 4, chart.x_label, 12, t.subtext, 600, 'middle');
    if (chart?.y_label) out += text(x + 18, top - 18, chart.y_label, 12, t.subtext, 600);
  }
  return out + '</g>';
}

function barChart(chart: DeckChart | undefined, x: number, y: number, w: number, h: number, t: Theme, display: DeckDataDisplay = {}, tokens: DeckDesignTokens = {}): string {
  const labels = chart?.categories?.length ? chart.categories : (chart?.items || []).map((i) => plain(i.label)).filter(Boolean);
  const values = chart?.values?.length ? chart.values.map(num) : (chart?.items || []).map((i) => num(i.value));
  const series = (chart?.series || []).filter((s) => s.values?.length);
  const isMultiSeries = !values.length && labels.length && series.length > 0;
  if (!labels.length || (!values.length && !isMultiSeries)) return '';
  const cats = labels.slice(0, 7);
  const vals = values;
  const allValues = isMultiSeries ? series.flatMap((s) => (s.values || []).map(num)) : vals;
  const max = Math.max(...allValues, 1);
  const suffix = plain(chart?.value_suffix);
  const title = plain(chart?.title) || '对比';
  const titleMaxChars = Math.max(12, Math.floor((w - 48) / 16));
  const titleLines = wrapText(title, titleMaxChars, 2);
  const legendVisible = isMultiSeries && display.show_legend !== false;
  const chartTopY = y + (titleLines.length > 1 ? (legendVisible ? 100 : 78) : (legendVisible ? 82 : 64));
  const rowH = Math.max(30, Math.min(54, (h - (titleLines.length > 1 ? (legendVisible ? 138 : 116) : (legendVisible ? 118 : 98))) / Math.max(1, cats.slice(0, 7).length)));
  let out = `<g>${panel(x, y, w, h, t, 16)}${multiline(x + 24, y + 31, title, { size: 16, fill: t.primary, weight: 850, maxChars: titleMaxChars, maxLines: 2, lineHeight: 20 })}`;
  const axisY = y + h - 34;
  const labelW = Math.max(118, Math.min(190, w * 0.30));
  const barX = x + labelW + 34;
  const valueX = x + w - 32;
  const barMaxW = valueX - barX - 18;
  if (legendVisible) {
    let legendX = x + 24;
    const legendY = y + (titleLines.length > 1 ? 56 : 44);
    series.slice(0, 3).forEach((s, i) => {
      const name = plain(s.name || `系列${i + 1}`);
      const lx = legendX;
      const color = safeColor(s.color) || tokenPalette(t, tokens, i);
      out += `<rect x="${lx}" y="${legendY - 11}" width="12" height="12" rx="3" fill="${color}"/>${text(lx + 18, legendY, name, 13, color, 750)}`;
      legendX += Math.max(82, visualWidth(name, 12) + 46);
    });
  }
  if (display.show_axis !== false) {
    out += `<line x1="${barX}" y1="${axisY}" x2="${valueX - 18}" y2="${axisY}" stroke="${t.grid}" stroke-width="1"/>${text(barX, axisY + 20, '0', 12, t.subtext, 500, 'middle')}${text(valueX - 18, axisY + 20, `${compactCn(Math.round(max))}${suffix}`, 12, t.subtext, 500, 'middle')}`;
    if (chart?.x_label) out += text((barX + valueX) / 2, axisY + 34, chart.x_label, 11, t.subtext, 600, 'middle');
  }
  cats.forEach((label, i) => {
    const yy = chartTopY + i * rowH;
    out += multiline(x + 24, yy + 5, label, { size: 16, fill: t.text, weight: 780, maxChars: Math.floor(labelW / 16), maxLines: 1 });
    if (isMultiSeries) {
      const shown = series.slice(0, 3);
      const bh = Math.max(7, Math.min(11, (rowH - 12) / Math.max(1, shown.length)));
      const showMultiValueLabels = display.show_value_labels !== false && shown.length <= 2 && rowH >= 42 && barMaxW > 160;
      shown.forEach((s, si) => {
        const v = num(s.values?.[i]);
        const color = safeColor(s.color) || tokenPalette(t, tokens, si);
        const by = yy - 18 + si * (bh + 4);
        const bw = Math.max(3, barMaxW * pct(v, max));
        out += `<rect x="${barX}" y="${by}" width="${barMaxW}" height="${bh}" rx="${bh / 2}" fill="${t.panel2}"/><rect x="${barX}" y="${by}" width="${bw}" height="${bh}" rx="${bh / 2}" fill="${color}"/>`;
        if (showMultiValueLabels) {
          const labelText = shown.length > 1 ? `${plain(s.name || '').slice(0, 2)} ${compactCn(v)}${suffix}` : `${compactCn(v)}${suffix}`;
          const labelX = Math.min(valueX, barX + bw + visualWidth(labelText, 11.5) + 8);
          out += text(labelX, by + bh, labelText, 11.5, si === 0 ? t.text : color, 800, 'end');
        }
      });
    } else {
      const bw = Math.max(4, barMaxW * pct(vals[i] || 0, max));
      const color = tokenPalette(t, tokens, i);
      out += `<rect x="${barX}" y="${yy - 14}" width="${barMaxW}" height="24" rx="12" fill="${t.panel2}"/><rect x="${barX}" y="${yy - 14}" width="${bw}" height="24" rx="12" fill="${color}"/>`;
      if (display.show_value_labels !== false) out += text(valueX, yy + 4, `${compactCn(vals[i] ?? '')}${suffix}`, 14, t.text, 850, 'end');
    }
  });
  return out + '</g>';
}

function dataTable(rows: Array<Record<string, string | number>>, x: number, y: number, w: number, h: number, t: Theme): string {
  const first = rows[0];
  if (!first) return '';
  const keys = Object.keys(first).slice(0, 4);
  if (!keys.length) return '';
  const maxRows = Math.max(1, Math.min(rows.length, Math.floor((h - 42) / 38)));
  const shown = rows.slice(0, maxRows);
  const colW = w / keys.length;
  const headerH = 36;
  const rowH = Math.max(32, Math.min(44, (h - headerH - 10) / shown.length));
  let out = `<g>${panel(x, y, w, h, t, 16)}<rect x="${x}" y="${y}" width="${w}" height="${headerH}" rx="16" fill="${t.primary}" opacity="0.08"/><rect x="${x}" y="${y + headerH - 12}" width="${w}" height="12" fill="${t.primary}" opacity="0.08"/>`;
  keys.forEach((key, i) => {
    const cx = x + i * colW;
    if (i) out += `<line x1="${cx}" y1="${y + 10}" x2="${cx}" y2="${y + h - 10}" stroke="${t.grid}" stroke-width="1"/>`;
    out += multiline(cx + 12, y + 24, key, { size: 13, fill: t.primary, weight: 850, maxChars: Math.max(4, Math.floor((colW - 24) / 13)), maxLines: 1 });
  });
  shown.forEach((row, ri) => {
    const ry = y + headerH + ri * rowH;
    out += `<line x1="${x + 10}" y1="${ry}" x2="${x + w - 10}" y2="${ry}" stroke="${t.grid}" stroke-width="1" opacity="0.8"/>`;
    keys.forEach((key, ci) => {
      const value = plain(row[key]);
      const cx = x + ci * colW;
      out += multiline(cx + 12, ry + 24, value, { size: ci === 0 ? 14 : 13, fill: ci === 0 ? t.text : t.subtext, weight: ci === 0 ? 750 : 650, maxChars: Math.max(4, Math.floor((colW - 24) / (ci === 0 ? 14 : 13))), maxLines: 1 });
    });
  });
  return out + '</g>';
}

function metricUnitSignature(metric: DeckMetric): string {
  const label = plain(metric.label);
  const unit = plain(metric.unit);
  const valueText = metricValue(metric);
  const combined = `${label} ${unit} ${valueText}`;
  if (/%|率|占比|转化|完读/.test(combined)) return 'rate';
  if (/次\s*\/\s*(篇|人|条|个)|均|平均/.test(combined)) return 'average';
  if (/人|用户|患者/.test(combined)) return 'people';
  if (/篇|条|个/.test(unit)) return 'items';
  if (/次|阅读量|互动量|推送量|触达/.test(combined)) return 'count';
  return unit || 'number';
}

function rankingValuesComparable(items: DeckMetric[]): boolean {
  const signatures = new Set(items.map(metricUnitSignature).filter(Boolean));
  if (signatures.size > 1) return false;
  const values = items.map((m) => plain(m.value ?? m.display_value));
  if (values.some((v) => !v || /[^\d.,，万亿%+\-\s]/.test(v.replace(/次|人|篇|条|个|%/g, '')))) return false;
  return true;
}

function metricSummaryRows(items: DeckMetric[], x: number, y: number, w: number, h: number, t: Theme): string {
  const list = items.slice(0, 5);
  let out = `<g>${panel(x, y, w, h, t, 16)}`;
  const rowH = Math.max(54, Math.min(78, (h - 42) / Math.max(1, list.length)));
  list.forEach((m, i) => {
    const yy = y + 38 + i * rowH;
    const color = [t.primary, t.secondary, t.accent, t.warning, t.danger][i % 5];
    const value = metricValue(m);
    const valueW = Math.min(160, Math.max(86, visualWidth(value, 15) + 30));
    out += `<rect x="${x + 20}" y="${yy - 20}" width="${w - 40}" height="${Math.max(42, rowH - 12)}" rx="14" fill="${t.panel2}" opacity="0.75" stroke="${t.grid}" stroke-width="1"/>`;
    out += `<circle cx="${x + 42}" cy="${yy + 2}" r="5" fill="${color}"/>`;
    out += multiline(x + 58, yy + 4, m.label || '', { size: 15, fill: t.text, weight: 760, maxChars: Math.max(10, Math.floor((w - valueW - 96) / 15)), maxLines: 1 });
    out += `<rect x="${x + w - valueW - 24}" y="${yy - 16}" width="${valueW}" height="30" rx="15" fill="${color}" opacity="0.10"/>${text(x + w - 24 - valueW / 2, yy + 5, value, 15, color, 850, 'middle')}`;
    if (m.note) out += multiline(x + 58, yy + 28, m.note, { size: 12, fill: t.subtext, weight: 600, maxChars: Math.max(12, Math.floor((w - 96) / 12)), maxLines: 1 });
  });
  return out + '</g>';
}

function rankingList(items: DeckMetric[], x: number, y: number, w: number, h: number, t: Theme): string {
  if (!items.length) return '';
  const list = items.slice(0, 6);
  const numericValues = list.map((m) => num(m.value));
  const ordinalOnly = list.length > 1 && numericValues.every((v, i) => v === i + 1 || (v >= 1 && v <= list.length && Number.isInteger(v)));
  const comparableValues = !ordinalOnly && rankingValuesComparable(list);
  if (!ordinalOnly && !comparableValues) {
    // Different units (e.g. read count vs interaction-per-content vs completion rate)
    // should not be compared with the same bar scale. Render as a scorecard list.
    return metricSummaryRows(list, x, y, w, h, t);
  }
  const max = Math.max(...list.map((m) => num(m.value)), 1);
  let out = `<g>${panel(x, y, w, h, t, 16)}`;
  const rowH = Math.max(52, Math.min(ordinalOnly ? 92 : 72, (h - 46) / Math.max(1, list.length)));
  const labelW = Math.max(180, Math.min(360, w * 0.50));
  const barX = x + 58 + labelW + 20;
  const valueW = 72;
  const barW = Math.max(80, w - (barX - x) - valueW - 30);
  list.forEach((m, i) => {
    const yy = y + 46 + i * rowH;
    const color = [t.primary, t.secondary, t.accent, t.warning][i % 4];
    const value = metricValue(m);
    if (ordinalOnly) {
      const textW = w - 74;
      out += `<rect x="${x + 22}" y="${yy - 24}" width="8" height="${Math.max(34, rowH - 18)}" rx="4" fill="${color}"/><circle cx="${x + 44}" cy="${yy - 6}" r="5" fill="${color}" opacity="0.92"/>`;
      out += multiline(x + 58, yy - 7, m.label || '', { size: 16, fill: t.text, weight: 760, maxChars: Math.max(12, Math.floor(textW / 16)), maxLines: rowH >= 62 ? 2 : 1, lineHeight: 21 });
      if (m.note) out += multiline(x + 58, yy + 18, m.note, { size: 12, fill: t.subtext, weight: 600, maxChars: Math.max(12, Math.floor(textW / 12)), maxLines: 1 });
    } else {
      out += `<circle cx="${x + 32}" cy="${yy - 6}" r="15" fill="${color}" opacity="0.12"/>${text(x + 32, yy, i + 1, 14, color, 800, 'middle')}`;
      out += multiline(x + 58, yy - 5, m.label || '', { size: 16, fill: t.text, weight: 760, maxChars: Math.max(10, Math.floor(labelW / 16)), maxLines: rowH >= 62 ? 2 : 1, lineHeight: 21 });
      out += `<rect x="${barX}" y="${yy - 16}" width="${barW}" height="14" rx="7" fill="${t.panel2}"/><rect x="${barX}" y="${yy - 16}" width="${barW * pct(num(m.value), max)}" height="14" rx="7" fill="${color}"/>`;
      out += text(x + w - 24, yy - 3, value, 14, t.text, 800, 'end');
    }
  });
  return out + '</g>';
}

function funnel(items: DeckMetric[], x: number, y: number, w: number, h: number, t: Theme): string {
  if (!items.length) return '';
  const list = items.slice(0, 5);
  const max = Math.max(...list.map((m) => num(m.value)), 1);
  let out = `<g>${panel(x, y, w, h, t, 16)}`;
  const rowH = Math.min(54, (h - 50) / Math.max(1, list.length));
  list.forEach((m, i) => {
    const yy = y + 38 + i * rowH;
    const labelW = Math.min(120, Math.max(76, w * 0.28));
    const barX = x + labelW + 30;
    const barW = w - labelW - 64;
    const bw = barW * (0.18 + 0.82 * pct(num(m.value), max));
    const color = [t.primary, t.secondary, t.accent, t.warning, t.danger][i % 5];
    out += `${multiline(x + 20, yy + 29, m.label || '', { size: 13, fill: t.text, weight: 700, maxChars: Math.floor(labelW / 13), maxLines: 1 })}<rect x="${barX}" y="${yy + 8}" width="${barW}" height="26" rx="13" fill="${t.panel2}"/><rect x="${barX}" y="${yy + 8}" width="${bw}" height="26" rx="13" fill="${color}" opacity="0.88"/>${text(x + w - 22, yy + 28, metricValue(m), 13, t.text, 850, 'end')}`;
  });
  return out + '</g>';
}

function cover(slide: DeckSlideSpec, deck: DeckSpecParams, t: Theme, idx: number, tokens: DeckDesignTokens = {}): string {
  const title = slide.title || deck.title || 'PX 患教运营汇报';
  const subtitle = slide.subtitle || deck.subtitle || deck.data_scope || 'Patient Education Operations Review';
  const chips = (slide.bullets?.length ? slide.bullets : []).slice(0, 3);
  const chipSvg = chips.map((c, i) => `<g><rect x="${128 + i * 154}" y="530" width="132" height="34" rx="17" fill="${palette(t, i)}" opacity="0.10"/><circle cx="${146 + i * 154}" cy="547" r="5" fill="${palette(t, i)}"/>${multiline(160 + i * 154, 552, c, { size: 13, fill: t.text, weight: 700, maxChars: 8, maxLines: 1 })}</g>`).join('');
  const metricPanel = slide.metrics?.length
    ? metricCards(slide.metrics, 806, 186, 330, 286, t, 4, tokens)
    : `<g><rect x="806" y="186" width="330" height="286" rx="26" fill="${t.primary}" opacity="0.08"/><circle cx="970" cy="318" r="84" fill="${t.primary}" opacity="0.12"/><path d="M885 356 C925 286 1012 280 1058 220" fill="none" stroke="${t.primary}" stroke-width="8" stroke-linecap="round"/><circle cx="885" cy="356" r="9" fill="${t.primary}"/><circle cx="1058" cy="220" r="9" fill="${t.secondary}"/></g>`;
  return svg(`${bg(t, tokens)}${accentShape(t, tokens)}<rect x="80" y="96" width="1120" height="528" rx="30" fill="${t.panel}" stroke="${t.grid}"/><path d="M824 96 L1200 96 L1200 624 L704 624 C794 506 842 346 824 96 Z" fill="${t.panel2}" opacity="0.92"/><path d="M84 122 L84 598" stroke="${t.primary}" stroke-width="8" stroke-linecap="round"/>${text(126, 164, 'PX · PATIENT EDUCATION', 16, t.primary, 850)}${multiline(126, 272, title, { size: 48, fill: t.text, weight: 850, maxChars: 18, maxLines: 2, lineHeight: 64 })}${multiline(130, 402, subtitle, { size: 21, fill: t.subtext, maxChars: 34, maxLines: 2, lineHeight: 32 })}${slide.takeaway ? multiline(130, 482, slide.takeaway, { size: 19, fill: t.text, weight: 700, maxChars: 34, maxLines: 2, lineHeight: 28 }) : ''}${chipSvg}${metricPanel}<rect x="910" y="548" width="224" height="4" rx="2" fill="${t.primary}"/>${text(1136, 586, String(idx).padStart(2, '0'), 40, t.grid, 850, 'end')}`);
}

function toc(slide: DeckSlideSpec, deck: DeckSpecParams, t: Theme, tokens: DeckDesignTokens = {}): string {
  const bullets = slide.bullets?.length ? slide.bullets : (deck.slides || []).filter((s) => s.slide_type !== 'cover' && s.slide_type !== 'toc').map((s) => s.section || s.title || '').filter(Boolean).slice(0, 6);
  let body = '';
  bullets.slice(0, 6).forEach((b, i) => {
    const x = 94 + (i % 2) * 560;
    const y = 172 + Math.floor(i / 2) * 132;
    const color = palette(t, i);
    body += `<g>${panel(x, y, 520, 102, t, 18)}<rect x="${x}" y="${y}" width="11" height="102" rx="5.5" fill="${color}"/><circle cx="${x + 58}" cy="${y + 51}" r="30" fill="${color}" opacity="0.12"/>${text(x + 58, y + 62, String(i + 1).padStart(2, '0'), 30, color, 850, 'middle')}${multiline(x + 106, y + 43, b, { size: 20, fill: t.text, weight: 700, maxChars: 18, maxLines: 2, lineHeight: 28 })}</g>`;
  });
  return svg(frame(slide.title || '目录', slide.subtitle || '本次汇报的核心结构', t, tokens) + `<path d="M650 170 L650 548" stroke="${t.grid}" stroke-width="2" stroke-dasharray="8 10" opacity="0.7"/>` + body);
}

function executiveSummary(slide: DeckSlideSpec, t: Theme, tokens: DeckDesignTokens = {}): string {
  const metrics = slide.metrics?.length ? slide.metrics : [];
  const rawBullets = slide.bullets?.length ? slide.bullets : [];
  const bullets = uniqueTexts(rawBullets, [slide.takeaway], 2);
  const lead = slide.takeaway || bullets[0] || '';
  const decisionBullets = bullets.length
    ? bullets
    : metrics.slice(0, 2).map((m) => `${m.label || '核心指标'}：${metricValue(m)}`).filter(Boolean);
  return svg(frame(slide.title || '核心结论', slide.subtitle || 'EXECUTIVE SUMMARY', t, tokens)
    + `<g>${panel(80, 158, 520, 244, t, 22)}<rect x="80" y="158" width="520" height="244" rx="22" fill="${t.primary}" opacity="0.06"/><text x="116" y="208" font-family="${FONT}" font-size="15" font-weight="850" fill="${t.primary}">ONE-SENTENCE SUMMARY</text>${multiline(116, 278, lead, { size: 28, fill: t.text, weight: 850, maxChars: 16, maxLines: 3, lineHeight: 40 })}</g>`
    + metricCards(metrics.slice(0, 4), 636, 158, 564, 244, t, 4, tokens)
    + `<g>${panel(80, 430, 1120, 158, t, 18)}${text(112, 478, '决策关注点', 22, t.primary, 850)}${bulletList(decisionBullets, 340, 492, t, 2, 42)}</g>`
    + takeawayBand(slide, 80, 614, 1120, t));
}

function kpiDashboard(slide: DeckSlideSpec, t: Theme, tokens: DeckDesignTokens = {}): string {
  const bullets = slide.bullets || (slide.takeaway ? [slide.takeaway] : []);
  const metrics = slide.metrics || [];
  if (!metrics.length && !slide.chart) return narrativeTemplateSlide(slide, t, tokens);
  return svg(frame(slide.title || '关键指标总览', slide.subtitle || 'KEY PERFORMANCE INDICATORS', t, tokens)
    + metricCards(metrics, 80, 150, 690, 276, t, 6, tokens)
    + `<g>${panel(800, 150, 400, 276, t, 20)}${text(828, 198, '运营漏斗 / 结构参考', 20, t.primary, 850)}${funnel(metrics.slice(0, 5), 830, 216, 340, 184, t)}</g>`
    + `${lineChart(slide.chart, 80, 456, 690, 154, t, slide.data_display, tokens)}`
    + `<g>${panel(800, 456, 400, 154, t, 18)}${text(828, 500, '本页解读', 20, t.primary, 850)}${bulletList(bullets, 838, 546, t, 2, 22)}</g>`
    + takeawayBand(slide, 80, 630, 1120, t));
}

function trendSlide(slide: DeckSlideSpec, t: Theme, tokens: DeckDesignTokens = {}): string {
  const bullets = slide.bullets || (slide.takeaway ? [slide.takeaway] : []);
  const callouts = (slide.metrics || []).slice(0, 3);
  if (!slide.chart && !callouts.length) return narrativeTemplateSlide(slide, t, tokens);
  return svg(frame(slide.title || '趋势分析', slide.subtitle || 'TREND VIEW', t, tokens)
    + `${lineChart(slide.chart, 78, 154, 760, 410, t, slide.data_display, tokens)}`
    + `<g>${panel(870, 154, 330, 410, t, 20)}${text(898, 204, '趋势解读', 22, t.primary, 850)}${compactBulletList(bullets, 898, 232, 274, 188, t, 3)}${callouts.map((m, i) => `<g><rect x="${898 + i * 92}" y="466" width="78" height="58" rx="14" fill="${palette(t, i)}" opacity="0.10"/>${text(937 + i * 92, 491, metricValue(m), 15, palette(t, i), 850, 'middle')}${multiline(937 + i * 92, 514, m.label || '', { size: 10, fill: t.subtext, weight: 600, anchor: 'middle', maxChars: 6, maxLines: 1 })}</g>`).join('')}</g>`
    + takeawayBand(slide, 80, 610, 1120, t));
}

function comparisonSlide(slide: DeckSlideSpec, t: Theme, tokens: DeckDesignTokens = {}): string {
  const bullets = slide.bullets || (slide.takeaway ? [slide.takeaway] : []);
  const metrics = (slide.metrics?.length ? slide.metrics : chartAsMetrics(slide.chart)).slice(0, 2);
  if (!slide.chart && !metrics.length) return narrativeTemplateSlide(slide, t, tokens);
  return svg(frame(slide.title || '结构对比', slide.subtitle || 'COMPARISON', t, tokens)
    + `${barChart(slide.chart, 80, 154, 646, 418, t, slide.data_display, tokens)}`
    + `<g>${panel(760, 154, 440, 418, t, 20)}${text(792, 206, '结构洞察', 22, t.primary, 850)}${metricCards(metrics, 792, 234, 376, 142, t, 2, tokens)}${compactBulletList(bullets, 792, 404, 376, 126, t, 2)}</g>`
    + takeawayBand(slide, 80, 612, 1120, t));
}

function rankingSlide(slide: DeckSlideSpec, t: Theme, tokens: DeckDesignTokens = {}): string {
  const metrics = slide.metrics?.length ? slide.metrics : chartAsMetrics(slide.chart);
  const bullets = slide.bullets || (slide.takeaway ? [slide.takeaway] : []);
  if (!metrics.length) return narrativeTemplateSlide(slide, t, tokens);
  return svg(frame(slide.title || '高表现内容', slide.subtitle || 'TOP CONTENT', t, tokens)
    + `${rankingList(metrics, 80, 154, 718, 420, t)}`
    + `<g>${panel(832, 154, 368, 420, t, 20)}${text(862, 204, '内容方法提炼', 22, t.primary, 850)}${compactBulletList(bullets, 862, 238, 286, 218, t, 4)}<rect x="862" y="510" width="286" height="34" rx="17" fill="${t.primary}" opacity="0.10"/>${text(1005, 533, '沉淀选题 · 表达 · 触达方法', 14, t.primary, 800, 'middle')}</g>`
    + takeawayBand(slide, 80, 612, 1120, t));
}

function diagnosisSlide(slide: DeckSlideSpec, t: Theme, tokens: DeckDesignTokens = {}): string {
  const metrics = slide.metrics?.length ? slide.metrics : [];
  const bullets = slide.bullets || (slide.takeaway ? [slide.takeaway] : []);
  if (!metrics.length && !bullets.length) return narrativeTemplateSlide(slide, t, tokens);
  const left = metrics.length
    ? funnel(metrics, 80, 160, 500, 400, t)
    : `<g>${panel(80, 160, 500, 400, t, 20)}${text(112, 210, '问题信号', 22, t.danger, 850)}${compactBulletList(bullets.slice(0, 4), 112, 244, 436, 240, t, 4)}</g>`;
  const quad = bullets.slice(0, 4).map((b, i) => {
    const x = 638 + (i % 2) * 272;
    const y = 226 + Math.floor(i / 2) * 142;
    const color = [t.danger, t.warning, t.primary, t.secondary][i % 4];
    return `<g><rect x="${x}" y="${y}" width="246" height="116" rx="16" fill="${color}" opacity="0.08" stroke="${color}" stroke-opacity="0.26"/><text x="${x + 20}" y="${y + 32}" font-family="${FONT}" font-size="13" font-weight="850" fill="${color}">${['风险', '阻塞', '机会', '动作'][i] || '洞察'}</text>${multiline(x + 20, y + 66, cleanText(b), { size: 13, fill: t.text, weight: 650, maxChars: 15, maxLines: 2, lineHeight: 20 })}</g>`;
  }).join('');
  return svg(frame(slide.title || '问题诊断', slide.subtitle || 'ISSUES & RISKS', t, tokens)
    + left
    + `<g>${panel(620, 160, 580, 400, t, 20)}${text(652, 210, '诊断矩阵', 22, t.danger, 850)}<line x1="910" y1="226" x2="910" y2="484" stroke="${t.grid}" stroke-width="2"/><line x1="638" y1="362" x2="1156" y2="362" stroke="${t.grid}" stroke-width="2"/>${quad}</g>`
    + takeawayBand(slide, 80, 612, 1120, t));
}

function roadmapSlide(slide: DeckSlideSpec, t: Theme, tokens: DeckDesignTokens = {}): string {
  const items = (slide.bullets?.length ? slide.bullets : []).slice(0, 4);
  if (!items.length) return narrativeTemplateSlide(slide, t, tokens);
  let body = '';
  items.forEach((item, i) => {
    const x = 96 + i * 280;
    const color = [t.primary, t.secondary, t.accent, t.warning][i % 4];
    body += `<g><circle cx="${x + 96}" cy="232" r="44" fill="${color}" opacity="0.12"/><circle cx="${x + 96}" cy="232" r="24" fill="${color}"/>${text(x + 96, 240, i + 1, 21, '#FFFFFF', 850, 'middle')}<rect x="${x}" y="310" width="232" height="196" rx="20" fill="${t.panel}" stroke="${t.grid}"/><rect x="${x}" y="310" width="232" height="8" rx="4" fill="${color}"/>${text(x + 24, 354, ['短期动作', '中期优化', '机制沉淀', '复盘迭代'][i] || '行动项', 16, color, 850)}${multiline(x + 24, 400, item, { size: 18, fill: t.text, weight: 750, maxChars: 10, maxLines: 3, lineHeight: 28 })}<rect x="${x + 24}" y="462" width="94" height="26" rx="13" fill="${color}" opacity="0.10"/>${text(x + 71, 481, `Step ${i + 1}`, 12, color, 850, 'middle')}</g>`;
    if (i < items.length - 1) body += `<path d="M ${x + 160} 260 L ${x + 278} 260" stroke="${t.grid}" stroke-width="4" stroke-linecap="round"/><path d="M ${x + 270} 250 L ${x + 286} 260 L ${x + 270} 270" fill="none" stroke="${t.grid}" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>`;
  });
  return svg(frame(slide.title || '下阶段运营重点', slide.subtitle || 'NEXT STEPS', t, tokens) + `<line x1="192" y1="260" x2="1032" y2="260" stroke="${t.grid}" stroke-width="3" stroke-dasharray="10 10"/>` + body + takeawayBand(slide, 100, 600, 1080, t));
}

function closingSlide(slide: DeckSlideSpec, deck: DeckSpecParams, t: Theme, tokens: DeckDesignTokens = {}): string {
  return svg(`${bg(t, tokens)}${accentShape(t, tokens)}<rect x="96" y="118" width="1088" height="484" rx="30" fill="${t.panel}" stroke="${t.grid}"/><circle cx="640" cy="246" r="86" fill="${t.primary}" opacity="0.08"/><circle cx="640" cy="246" r="42" fill="${t.primary}" opacity="0.14"/>${text(640, 264, slide.title || deck.title || '', 52, t.primary, 850, 'middle')}${multiline(640, 358, slide.takeaway || deck.summary || '', { size: 25, fill: t.text, weight: 750, maxChars: 30, maxLines: 3, lineHeight: 40, anchor: 'middle' })}${bulletList(slide.bullets || [], 458, 494, t, 3, 24)}<rect x="500" y="554" width="280" height="4" rx="2" fill="${t.primary}"/>`);
}

function genericSlide(slide: DeckSlideSpec, t: Theme, tokens: DeckDesignTokens = {}): string {
  const chart = barChart(slide.chart, 650, 386, 520, 154, t, slide.data_display, tokens);
  const metrics = metricCards(slide.metrics || [], 650, 202, 520, 156, t, 4, tokens);
  return svg(frame(slide.title || '分析页', slide.subtitle || plain(slide.slide_type).toUpperCase(), t, tokens)
    + `<g>${panel(80, 154, 500, 420, t, 20)}${text(112, 206, '核心信息', 22, t.primary, 850)}${bulletList(slide.bullets || (slide.takeaway ? [slide.takeaway] : []), 122, 268, t, 5, 27)}</g>`
    + (metrics || chart ? `<g>${panel(620, 154, 580, 420, t, 20)}${metrics}${chart}</g>` : `<g>${panel(620, 154, 580, 420, t, 20)}<path d="M690 488 C780 328 930 264 1118 214" fill="none" stroke="${t.primary}" stroke-width="8" stroke-linecap="round" opacity="0.16"/><circle cx="690" cy="488" r="10" fill="${t.primary}" opacity="0.4"/><circle cx="1118" cy="214" r="10" fill="${t.secondary}" opacity="0.4"/></g>`)
    + takeawayBand(slide, 80, 612, 1120, t));
}

function narrativeTemplateSlide(slide: DeckSlideSpec, t: Theme, tokens: DeckDesignTokens = {}): string {
  const bullets = slide.bullets || [];
  const hasText = bullets.length || slide.takeaway || slide.notes;
  const cards = hasText
    ? `<g>${panel(80, 154, 720, 420, t, 22)}${text(112, 206, '页面要点', 22, t.primary, 850)}${compactBulletList(bullets.length ? bullets : [slide.takeaway || slide.notes || ''], 112, 242, 646, 260, t, 4)}</g>`
    : `<g>${panel(80, 154, 720, 420, t, 22)}<path d="M138 486 C250 306 458 244 708 204" fill="none" stroke="${t.primary}" stroke-width="8" stroke-linecap="round" opacity="0.28"/><circle cx="138" cy="486" r="12" fill="${t.primary}" opacity="0.55"/><circle cx="708" cy="204" r="12" fill="${t.secondary}" opacity="0.55"/></g>`;
  return svg(frame(slide.title || '分析页', slide.subtitle || plain(slide.slide_type).toUpperCase(), t, tokens)
    + cards
    + `<g>${panel(838, 154, 362, 420, t, 22)}${sectionKicker(870, 204, plain(slide.layout_variant || slide.visual_intent || 'VISUAL TEMPLATE'), t)}<rect x="872" y="246" width="250" height="74" rx="18" fill="${t.primary}" opacity="0.09"/><rect x="912" y="350" width="218" height="18" rx="9" fill="${t.panel2}"/><rect x="912" y="386" width="168" height="18" rx="9" fill="${t.panel2}"/><circle cx="1108" cy="462" r="48" fill="${t.secondary}" opacity="0.12"/></g>`
    + takeawayBand(slide, 80, 612, 1120, t));
}

function coverStatement(slide: DeckSlideSpec, deck: DeckSpecParams, t: Theme, idx: number, tokens: DeckDesignTokens = {}): string {
  const title = slide.title || deck.title || 'PX 患教运营汇报';
  const subtitle = slide.subtitle || deck.subtitle || deck.data_scope || 'Patient Education Operations Review';
  return svg(`${bg(t, { ...tokens, background: tokens.background || 'diagonal_ribbon' })}${accentShape(t, { ...tokens, accent_shape: tokens.accent_shape || 'ribbon' })}<rect x="88" y="98" width="1104" height="524" rx="34" fill="${t.panel}" stroke="${t.grid}"/><rect x="124" y="134" width="1032" height="452" rx="28" fill="${t.primary}" opacity="0.05"/>${sectionKicker(150, 178, 'PX PATIENT EDUCATION REPORT', t)}${multiline(150, 302, title, { size: 54, fill: t.text, weight: 900, maxChars: 17, maxLines: 2, lineHeight: 70 })}${multiline(154, 452, subtitle, { size: 22, fill: t.subtext, weight: 600, maxChars: 38, maxLines: 2, lineHeight: 34 })}${pillStrip(slide.bullets || ['业务汇报', '数据复盘', '行动建议'], 154, 530, t, 3)}${heroMetricBlock((slide.metrics || [])[0], 850, 214, 250, 240, t, '核心指标', tokens)}<rect x="1020" y="548" width="96" height="34" rx="17" fill="${t.grid}" opacity="0.45"/>${text(1068, 572, String(idx).padStart(2, '0'), 16, t.subtext, 850, 'middle')}`);
}

function executiveSplit(slide: DeckSlideSpec, t: Theme, tokens: DeckDesignTokens = {}): string {
  const bullets = slide.bullets?.length ? slide.bullets : (slide.takeaway ? [slide.takeaway] : []);
  return svg(frame(slide.title || '核心结论', slide.subtitle || 'EXECUTIVE SUMMARY', t, { ...tokens, background: tokens.background || 'clean' })
    + heroMetricBlock((slide.metrics || [])[0], 80, 158, 360, 356, t, '本期最关键变化', tokens)
    + `<g>${panel(474, 158, 726, 356, t, 24)}${sectionKicker(508, 206, 'KEY INSIGHTS', t, 1)}${insightCards(bullets, 508, 236, 656, 220, t, 3)}${highlightBadges(slide.highlight_points, 508, 480, 656, t, 3)}</g>`
    + metricRibbon((slide.metrics || []).slice(1), 80, 548, 1120, 82, t, 5));
}

function kpiHeroMetric(slide: DeckSlideSpec, t: Theme, tokens: DeckDesignTokens = {}): string {
  const metrics = slide.metrics || [];
  if (!metrics.length && !slide.chart) return narrativeTemplateSlide(slide, t, tokens);
  return svg(frame(slide.title || '关键指标总览', slide.subtitle || 'KEY PERFORMANCE INDICATORS', t, { ...tokens, background: tokens.background || 'gradient_mesh' })
    + heroMetricBlock(metrics[0], 80, 154, 360, 360, t, '核心 KPI', tokens)
    + metricCards(metrics.slice(1), 474, 154, 726, 176, t, 6, tokens)
    + lineChart(slide.chart, 474, 358, 726, 156, t, slide.data_display, tokens)
    + `<g>${panel(80, 548, 1120, 76, t, 18)}${text(112, 594, '管理提示', 20, t.primary, 850)}${bulletList(slide.bullets || (slide.takeaway ? [slide.takeaway] : []), 274, 594, t, 1, 52)}</g>`);
}

function kpiScorecard(slide: DeckSlideSpec, t: Theme, tokens: DeckDesignTokens = {}): string {
  if (!slide.metrics?.length && !slide.chart) return narrativeTemplateSlide(slide, t, tokens);
  return svg(frame(slide.title || '关键指标总览', slide.subtitle || 'EXECUTIVE SCORECARD', t, { ...tokens, background: tokens.background || 'grid_dots' })
    + metricRibbon(slide.metrics || [], 80, 150, 1120, 96, t, 6)
    + `<g>${panel(80, 282, 540, 284, t, 20)}${text(112, 330, '指标结构', 22, t.primary, 850)}${funnel(slide.metrics || [], 112, 352, 476, 174, t)}</g>`
    + `<g>${panel(660, 282, 540, 284, t, 20)}${text(692, 330, '趋势与解释', 22, t.primary, 850)}${lineChart(slide.chart, 692, 352, 476, 112, t, slide.data_display, tokens)}${bulletList(slide.bullets || (slide.takeaway ? [slide.takeaway] : []), 702, 514, t, 1, 30)}</g>`
    + takeawayBand(slide, 80, 612, 1120, t));
}

function trendFullBleed(slide: DeckSlideSpec, t: Theme, tokens: DeckDesignTokens = {}): string {
  if (!slide.chart) return narrativeTemplateSlide(slide, t, tokens);
  const points = slide.highlight_points?.length ? slide.highlight_points : autoHighlightPoints(slide.chart);
  return svg(frame(slide.title || '趋势分析', slide.subtitle || 'FULL BLEED TREND', t, { ...tokens, background: tokens.background || 'clean' })
    + lineChart(slide.chart, 80, 152, 1120, 360, t, slide.data_display, tokens)
    + highlightBadges(points, 100, 534, 640, t, 3)
    + `<g>${panel(782, 534, 418, 82, t, 16)}${text(812, 574, '趋势判断', 20, t.primary, 850)}${compactBulletList(slide.bullets || (slide.takeaway ? [slide.takeaway] : []), 944, 552, 218, 42, t, 1)}</g>`);
}

function trendTimeline(slide: DeckSlideSpec, t: Theme, tokens: DeckDesignTokens = {}): string {
  const timeline = (slide.highlight_points || []).map((p) => p.label || p.reason || '').filter(Boolean);
  if (!slide.chart && !timeline.length) return narrativeTemplateSlide(slide, t, tokens);
  return svg(frame(slide.title || '趋势分析', slide.subtitle || 'TIMELINE BAND', t, tokens)
    + lineChart(slide.chart, 80, 150, 730, 288, t, slide.data_display, tokens)
    + `<g>${panel(842, 150, 358, 288, t, 20)}${text(872, 198, '变化解释', 22, t.primary, 850)}${compactBulletList(slide.bullets || (slide.takeaway ? [slide.takeaway] : []), 872, 226, 296, 172, t, 3)}</g>`
    + `<g>${panel(80, 476, 1120, 128, t, 20)}${timelineBand(timeline.length ? timeline : (slide.bullets || []), 160, 522, 960, t, 5)}</g>`
    + takeawayBand(slide, 80, 626, 1120, t));
}

function comparisonMatrix(slide: DeckSlideSpec, t: Theme, tokens: DeckDesignTokens = {}): string {
  const bullets = (slide.bullets || (slide.takeaway ? [slide.takeaway] : [])).slice(0, 3);
  const chart = slide.chart || chartFromMetrics(slide.metrics, 'bar');
  if (!chart && !bullets.length && !slide.metrics?.length) return narrativeTemplateSlide(slide, t, tokens);
  return svg(frame(slide.title || '结构对比', slide.subtitle || 'COMPARISON MATRIX', t, { ...tokens, background: tokens.background || 'grid_dots' })
    + barChart(chart, 80, 154, 650, 420, t, slide.data_display, tokens)
    + `<g>${panel(764, 154, 436, 420, t, 20)}${text(794, 204, '结构洞察', 22, t.primary, 850)}${metricCards((slide.metrics || chartAsMetrics(chart)).slice(0, 2), 794, 232, 376, 132, t, 2, tokens)}${insightCards(bullets.length ? bullets : (slide.metrics || []).map((m) => `${m.label}：${metricValue(m)}`), 794, 394, 376, 136, t, 2)}</g>`
    + takeawayBand(slide, 80, 612, 1120, t));
}

function rankingCards(slide: DeckSlideSpec, t: Theme, tokens: DeckDesignTokens = {}): string {
  const items = (slide.metrics?.length ? slide.metrics : chartAsMetrics(slide.chart)).slice(0, 6);
  if (!items.length) return narrativeTemplateSlide(slide, t, tokens);
  return svg(frame(slide.title || '高表现内容', slide.subtitle || 'CONTENT CARDS', t, { ...tokens, background: tokens.background || 'gradient_mesh' })
    + items.map((m, i) => {
      const x = 80 + (i % 3) * 382;
      const y = 154 + Math.floor(i / 3) * 188;
      const color = palette(t, i);
      return `<g>${panel(x, y, 348, 156, t, 20)}<circle cx="${x + 46}" cy="${y + 48}" r="26" fill="${color}" opacity="0.12"/>${text(x + 46, y + 58, i + 1, 26, color, 900, 'middle')}${multiline(x + 88, y + 42, m.label || '', { size: 19, fill: t.text, weight: 800, maxChars: 13, maxLines: 2, lineHeight: 26 })}${text(x + 88, y + 112, metricValue(m), 24, color, 900)}${m.note ? multiline(x + 190, y + 112, m.note, { size: 12, fill: t.subtext, maxChars: 12, maxLines: 1 }) : ''}</g>`;
    }).join('')
    + takeawayBand(slide, 80, 612, 1120, t));
}

function diagnosisFunnelFocus(slide: DeckSlideSpec, t: Theme, tokens: DeckDesignTokens = {}): string {
  const metrics = slide.metrics?.length ? slide.metrics : [];
  const bullets = slide.bullets || (slide.takeaway ? [slide.takeaway] : []);
  if (!metrics.length && !bullets.length) return narrativeTemplateSlide(slide, t, tokens);
  const left = metrics.length
    ? `<g>${panel(80, 154, 620, 420, t, 22)}${text(112, 204, '转化链路', 22, t.primary, 850)}${funnel(metrics, 112, 228, 556, 284, t)}</g>`
    : `<g>${panel(80, 154, 620, 420, t, 22)}${text(112, 204, '问题信号', 22, t.primary, 850)}${insightCards(bullets.slice(0, 4), 112, 232, 556, 270, t, 4)}</g>`;
  const rightItems = metrics.length ? bullets : (bullets.slice(4).length ? bullets.slice(4) : bullets.slice(0, 4));
  return svg(frame(slide.title || '问题诊断', slide.subtitle || 'FUNNEL DIAGNOSIS', t, { ...tokens, background: tokens.background || 'clean' })
    + left
    + `<g>${panel(740, 154, 460, 420, t, 22)}${text(772, 204, metrics.length ? '问题归因' : '原因判断', 22, t.danger, 850)}${compactBulletList(rightItems, 772, 238, 388, 244, t, 4)}</g>`
    + takeawayBand(slide, 80, 612, 1120, t));
}

function roadmapSwimlane(slide: DeckSlideSpec, t: Theme, tokens: DeckDesignTokens = {}): string {
  const items = (slide.bullets?.length ? slide.bullets : []).slice(0, 6);
  if (!items.length) return narrativeTemplateSlide(slide, t, tokens);
  return svg(frame(slide.title || '下阶段运营重点', slide.subtitle || 'ACTION SWIMLANE', t, { ...tokens, background: tokens.background || 'grid_dots' })
    + `<g>${panel(80, 154, 1120, 420, t, 22)}${['内容策略', '运营动作', '复盘机制'].map((lane, li) => `<g><rect x="112" y="${206 + li * 112}" width="150" height="52" rx="16" fill="${palette(t, li)}" opacity="0.10"/>${text(187, 239 + li * 112, lane, 17, palette(t, li), 850, 'middle')}<line x1="286" y1="${232 + li * 112}" x2="1154" y2="${232 + li * 112}" stroke="${t.grid}" stroke-width="2"/></g>`).join('')}${items.map((item, i) => {
      const lane = i % 3;
      const col = Math.floor(i / 3);
      const x = 324 + col * 410;
      const y = 186 + lane * 112;
      const color = palette(t, i);
      return `<g><rect x="${x}" y="${y}" width="346" height="84" rx="18" fill="${t.panel2}" stroke="${t.grid}"/><rect x="${x}" y="${y}" width="8" height="84" rx="4" fill="${color}"/>${text(x + 28, y + 30, `Action ${i + 1}`, 13, color, 850)}${multiline(x + 28, y + 58, item, { size: 15, fill: t.text, weight: 700, maxChars: 18, maxLines: 1 })}</g>`;
    }).join('')}</g>`
    + takeawayBand(slide, 80, 612, 1120, t));
}

function componentGridSlide(slide: DeckSlideSpec, t: Theme, tokens: DeckDesignTokens = {}): string {
  const components = slide.components?.length
    ? slide.components
    : (slide.bullets || []).map((item, index) => ({ type: 'insight_card', title: `要点 ${index + 1}`, text: item }));
  if (!components.length) return narrativeTemplateSlide(slide, t, tokens);
  return svg(frame(slide.title || '结构化洞察', slide.subtitle || 'COMPONENT VIEW', t, tokens)
    + componentCards(components, 80, 154, 1120, 420, t, tokens, 6)
    + takeawayBand(slide, 80, 612, 1120, t));
}

function componentDashboardSlide(slide: DeckSlideSpec, t: Theme, tokens: DeckDesignTokens = {}): string {
  const components = slide.components || [];
  const chartComponent = components.find((c) => ['chart_panel', 'chart', 'ranking_list', 'funnel_panel'].includes(canonicalVariant(c.type || '')));
  const metricComponents = components.filter((c) => ['metric_card', 'hero_metric'].includes(canonicalVariant(c.type || ''))).slice(0, 4);
  const insightComponents = components.filter((c) => !metricComponents.includes(c) && c !== chartComponent);
  const chart = chartComponent ? componentChart(chartComponent, canonicalVariant(chartComponent.type || '') === 'ranking_list' ? 'ranking' : 'bar') : slide.chart;
  const metrics = metricComponents.length ? metricComponents.map((c) => componentMetrics(c)[0]).filter((m): m is DeckMetric => Boolean(m)) : (slide.metrics || []).slice(0, 4);
  const bullets = insightComponents.length ? insightComponents.map(componentText).filter(Boolean) : (slide.bullets || []);
  if (!chart && !metrics.length && !bullets.length) return componentGridSlide(slide, t, tokens);
  const display = slide.data_display || {};
  const chartType = canonicalVariant(chart?.type || chartComponent?.layout_variant || chartComponent?.type || '');
  const chartSvg = chartType === 'line' || chartType === 'area'
    ? lineChart(chart, 80, 154, 704, 360, t, display, tokens)
    : chartType === 'ranking' || chartType === 'ranking_list'
      ? rankingList(chartAsMetrics(chart), 80, 154, 704, 360, t)
      : chartType === 'funnel' || chartType === 'funnel_panel'
        ? funnel(chartAsMetrics(chart), 80, 154, 704, 360, t)
        : barChart(chart, 80, 154, 704, 360, t, display, tokens);
  return svg(frame(slide.title || '组件化看板', slide.subtitle || 'MODEL CONTROLLED DASHBOARD', t, tokens)
    + chartSvg
    + metricCards(metrics, 820, 154, 380, 170, t, 4, tokens)
    + `<g>${panel(820, 354, 380, 160, t, 18)}${text(848, 400, '洞察 / 动作', 20, t.primary, 850)}${compactBulletList(bullets.length ? bullets : (slide.takeaway ? [slide.takeaway] : []), 848, 426, 314, 64, t, 2)}</g>`
    + takeawayBand(slide, 80, 612, 1120, t));
}

function svg(inner: string): string {
  return `<svg width="1280" height="720" viewBox="0 0 1280 720" xmlns="http://www.w3.org/2000/svg">${inner}</svg>`;
}

function attrNumber(tag: string, name: string, fallback = 0): number {
  const match = tag.match(new RegExp(`\\s${name}="([^"]+)"`));
  if (!match) return fallback;
  const n = Number(match[1]);
  return Number.isFinite(n) ? n : fallback;
}

function stripTags(value: string): string {
  return value.replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').trim();
}

function visualWidth(value: string, size: number): number {
  return [...value].reduce((sum, ch) => sum + (/^[\x00-\x7F]$/.test(ch) ? 0.56 : 1), 0) * size;
}

function rectIntersection(a: LayoutRect, b: LayoutRect): number {
  const x = Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x));
  const y = Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
  return x * y;
}

function assessSvgVisualQuality(svgContent: string, file: string): VisualQaSlideReport {
  const textBoxes: Array<LayoutRect & { text: string }> = [];
  const texts = [...svgContent.matchAll(/<text\b([^>]*)>([\s\S]*?)<\/text>/g)].map((match) => {
    const attrs = match[1];
    const rawText = stripTags(match[2]);
    const size = attrNumber(attrs, 'font-size', 14);
    const x = attrNumber(attrs, 'x', 0);
    const y = attrNumber(attrs, 'y', 0);
    const anchor = (attrs.match(/\stext-anchor="([^"]+)"/)?.[1] || 'start') as 'start' | 'middle' | 'end';
    const w = Math.max(size * 2, visualWidth(rawText, size));
    const h = size * 1.22;
    const bx = anchor === 'middle' ? x - w / 2 : anchor === 'end' ? x - w : x;
    const box = { x: bx, y: y - h, w, h, text: rawText };
    if (rawText) textBoxes.push(box);
    return { text: rawText, size, x, y };
  });

  const rects = [...svgContent.matchAll(/<rect\b[^>]*>/g)].map((match) => {
    const tag = match[0];
    return { x: attrNumber(tag, 'x', 0), y: attrNumber(tag, 'y', 0), w: attrNumber(tag, 'width', 0), h: attrNumber(tag, 'height', 0), tag };
  }).filter((rect) => rect.w > 0 && rect.h > 0 && !(rect.x === 0 && rect.y === 0 && rect.w >= W && rect.h >= H));

  const panelRects = rects.filter((rect) => rect.w >= 120 && rect.h >= 70 && /stroke=/.test(rect.tag));
  const largePanels = panelRects.filter((rect) => rect.w * rect.h > 42_000);
  const narrowPanels = panelRects.filter((rect) => rect.w < 185 && rect.h > 130);
  const shapeCount = rects.length + [...svgContent.matchAll(/<(circle|ellipse|line|polyline|path)\b/g)].length;
  const textChars = texts.reduce((sum, item) => sum + item.text.length, 0);
  const truncationCount = texts.filter((item) => item.text.includes('…')).length;

  const underfilled = largePanels.filter((panel) => {
    const insideTexts = textBoxes.filter((box) => box.x >= panel.x && box.x <= panel.x + panel.w && box.y >= panel.y && box.y <= panel.y + panel.h);
    const chars = insideTexts.reduce((sum, box) => sum + box.text.length, 0);
    const innerShapes = rects.filter((rect) => rect !== panel && rect.x >= panel.x && rect.y >= panel.y && rect.x + rect.w <= panel.x + panel.w && rect.y + rect.h <= panel.y + panel.h).length;
    const area = panel.w * panel.h;
    return area > 90_000 && chars < Math.max(22, area / 8_500) && innerShapes < 4;
  });

  let overlapCount = 0;
  for (let i = 0; i < textBoxes.length; i += 1) {
    for (let j = i + 1; j < textBoxes.length; j += 1) {
      const a = textBoxes[i];
      const b = textBoxes[j];
      if (!a.text || !b.text) continue;
      const area = rectIntersection(a, b);
      if (area > Math.min(a.w * a.h, b.w * b.h) * 0.35) overlapCount += 1;
    }
  }

  const density = (textChars * 5 + shapeCount * 18) / (W * H / 1000);
  const issues: VisualQaIssue[] = [];
  if (density < 1.35) issues.push({ code: 'low_density', severity: 'warn', message: `页面信息密度偏低 (${density.toFixed(2)})` });
  if (underfilled.length) issues.push({ code: 'underfilled_panel', severity: 'warn', message: `${underfilled.length} 个大面板内容不足` });
  if (narrowPanels.length) issues.push({ code: 'narrow_panel', severity: 'warn', message: `${narrowPanels.length} 个窄高卡片影响可读性` });
  if (overlapCount) issues.push({ code: 'text_overlap', severity: 'error', message: `${overlapCount} 处疑似文字重叠` });
  if (truncationCount > 4) issues.push({ code: 'truncation', severity: 'warn', message: `${truncationCount} 处文本截断过多` });

  const score = Math.max(0, Math.round(100
    - Math.max(0, 1.35 - density) * 16
    - underfilled.length * 10
    - narrowPanels.length * 7
    - overlapCount * 18
    - Math.max(0, truncationCount - 3) * 4));

  return {
    file,
    score,
    retried: false,
    metrics: {
      text_count: texts.length,
      text_chars: textChars,
      large_panel_count: largePanels.length,
      underfilled_panel_count: underfilled.length,
      narrow_panel_count: narrowPanels.length,
      overlap_count: overlapCount,
      truncation_count: truncationCount,
      density: Number(density.toFixed(2)),
    },
    issues,
  };
}

function shouldRetryVisualQa(report: VisualQaSlideReport): boolean {
  return report.score < 82 || report.metrics.overlap_count > 0 || report.metrics.underfilled_panel_count > 0 || report.metrics.narrow_panel_count > 2;
}

function compactSlideForVisualRetry(slide: DeckSlideSpec): DeckSlideSpec {
  return {
    ...slide,
    density: 'high',
    style: {
      ...(slide.style || {}),
      font_scale: Math.min(0.98, Number(slide.style?.font_scale || 1) || 1),
      body_size: Math.min(14, Number(slide.style?.body_size || 15) || 15),
      number_size: Math.min(32, Number(slide.style?.number_size || 34) || 34),
      gap: 14,
    },
    design_tokens: {
      ...(slide.design_tokens || {}),
      density: 'high',
      gap: 14,
      number_style: slide.design_tokens?.number_style === 'hero' ? 'compact' : slide.design_tokens?.number_style,
    },
  };
}

function assessSlideContentRichness(slide: DeckSlideSpec): VisualQaIssue[] {
  const type = normalizeType(slide);
  if (['cover', 'toc', 'agenda', 'closing', 'thanks'].includes(type)) return [];
  const metricsCount = slide.metrics?.length || 0;
  const bulletCount = slide.bullets?.filter((b) => plain(b)).length || 0;
  const components = slide.components || [];
  const hasChart = Boolean(slide.chart || components.some((c) => c.chart || ['chart_panel', 'chart', 'ranking_list', 'funnel_panel'].includes(canonicalVariant(c.type || ''))));
  const analyticComponents = components.filter((c) => ['insight_card', 'risk_card', 'action_card', 'callout'].includes(canonicalVariant(c.type || '')) && plain(c.text || c.note || c.title)).length;
  const hasConclusion = Boolean(plain(slide.takeaway));
  const categories = [metricsCount > 0 || hasChart, hasConclusion, bulletCount >= 2 || analyticComponents >= 1, analyticComponents >= 1 || bulletCount >= 3].filter(Boolean).length;
  const issues: VisualQaIssue[] = [];
  if (categories < 3) {
    issues.push({
      code: 'content_insufficient',
      severity: 'warn',
      message: '页面内容类型不足：请由模型基于已有数据补充结论、分析/解释、风险/机会或行动建议，不得引入新数据。',
    });
  }
  if (metricsCount >= 3 && bulletCount < 2 && analyticComponents < 1) {
    issues.push({
      code: 'content_insufficient',
      severity: 'warn',
      message: 'KPI 页只有指标，缺少至少 2 条分析/解释或 insight/action 组件。',
    });
  }
  if (['comparison', 'project_comparison', 'bar_chart'].includes(type) && !hasChart) {
    issues.push({
      code: 'content_insufficient',
      severity: 'error',
      message: '对比页缺少 chart，需模型补充可渲染图表数据。',
    });
  }
  return issues;
}

function normalizeType(slide: DeckSlideSpec): string {
  return plain(slide.slide_type || slide.layout_variant).toLowerCase().replace(/[\s-]+/g, '_');
}

const AUTO_VARIANTS: Record<string, string[]> = {
  cover: ['hero_split', 'statement_cover'],
  executive_summary: ['board_summary', 'insight_split'],
  kpi_dashboard: ['metric_wall', 'hero_metric', 'scorecard'],
  overview: ['metric_wall', 'hero_metric', 'scorecard'],
  trend: ['chart_plus_insights', 'full_bleed_chart', 'timeline_band'],
  monthly_trend: ['chart_plus_insights', 'full_bleed_chart', 'timeline_band'],
  comparison: ['bar_with_insights', 'matrix'],
  project_comparison: ['bar_with_insights', 'matrix'],
  ranking: ['leaderboard', 'content_cards'],
  top_content: ['leaderboard', 'content_cards'],
  diagnosis: ['quadrant', 'funnel_focus'],
  risk: ['quadrant', 'funnel_focus'],
  roadmap: ['timeline', 'swimlane'],
  next_steps: ['timeline', 'swimlane'],
  components: ['component_grid', 'component_dashboard'],
};

function canonicalVariant(raw: string): string {
  return plain(raw).toLowerCase().replace(/[\s-]+/g, '_');
}

function variantFor(slide: DeckSlideSpec, index: number, previous?: string): string {
  const explicit = canonicalVariant(slide.layout_variant || '');
  if (explicit) return explicit;
  const type = normalizeType(slide);
  const pool = AUTO_VARIANTS[type] || ['default'];
  let variant = pool[(index - 1) % pool.length];
  if (previous && variant === previous && pool.length > 1) variant = pool[index % pool.length];
  if (slide.emphasis === 'hero_metric' && pool.includes('hero_metric')) return 'hero_metric';
  if (slide.emphasis === 'chart' && pool.includes('full_bleed_chart')) return 'full_bleed_chart';
  if (slide.emphasis === 'timeline' && pool.includes('timeline_band')) return 'timeline_band';
  return variant;
}

function applyRhythm(slides: DeckSlideSpec[]): DeckSlideSpec[] {
  let previous = '';
  return slides.map((slide, i) => {
    const variant = variantFor(slide, i + 1, previous);
    previous = variant;
    return { ...slide, layout_variant: variant };
  });
}

function renderSlide(slide: DeckSlideSpec, deck: DeckSpecParams, t: Theme, index: number): string {
  const hydrated = { ...hydrateSlide(slide, deck.data_display), data_display: { ...(deck.data_display || {}), ...(slide.data_display || {}) } };
  const type = normalizeType(hydrated);
  const variant = canonicalVariant(hydrated.layout_variant || '');
  const deckStyle = objectStyle(deck.style) || deck.visual_style;
  const tokens = mergeTokens({ ...(deck.design_tokens || {}), ...(deckStyle || {}) }, { ...(hydrated.design_tokens || {}), ...(hydrated.style || {}) }, hydrated);
  const theme = themeWithTokens(t, tokens);
  if (index === 1 || type === 'cover') return variant === 'statement_cover' || variant === 'title_wall' ? coverStatement(hydrated, deck, theme, index, tokens) : cover(hydrated, deck, theme, index, tokens);
  if (type === 'toc' || type === 'agenda') return toc(hydrated, deck, theme, tokens);
  if (type === 'closing' || type === 'thanks') return closingSlide(hydrated, deck, theme, tokens);
  return renderConstraintLayout(hydrated, theme, tokens);
}

function defaultSlides(deck: DeckSpecParams): DeckSlideSpec[] {
  return [
    { slide_type: 'cover', title: deck.title || '', subtitle: deck.subtitle || deck.data_scope },
    { slide_type: 'generic', title: deck.summary || deck.title || '' },
    { slide_type: 'closing', title: deck.title || '', takeaway: deck.summary || '' },
  ];
}

function slug(value: unknown, fallback: string): string {
  const s = plain(value).toLowerCase().replace(/[^a-z0-9\u4e00-\u9fa5]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 40);
  return s || fallback;
}

function designSpec(deck: DeckSpecParams, t: Theme): string {
  return `# Design Specification\n\n## Audience\n${deck.audience || '业务团队、内容运营和项目负责人'}\n\n## Objective\n用结构化数据叙事说明患教运营表现、问题和下一步行动。\n\n## Visual System\n- Theme: ${t.name}\n- Primary: ${t.primary}\n- Secondary: ${t.secondary}\n- Background: ${t.bg}\n- Font: ${FONT}\n- Design tokens: ${JSON.stringify(deck.design_tokens || {})}\n- Data display: ${JSON.stringify(deck.data_display || {})}\n\n## Four-layer Model Control\n1. 内容层：title/subtitle/takeaway/bullets/metrics/chart/table/notes/highlight_points。\n2. 结构层：slide_type/visual_intent/emphasis/density/components，renderer 接收页面目标、主视觉和组件关系；layout_variant 仅作弱偏好，不锁死模板。\n3. 视觉层：theme/design_tokens/style/data_display，包括字号、颜色、卡片风格、背景、图表轴线/标签策略。\n4. 组件层：components[] 声明 metric_card/hero_metric/insight_card/risk_card/action_card/chart_panel/ranking_list/funnel_panel/timeline/matrix/callout/takeaway_band 等组件及其数据。\n\n## Available Components\nhero_metric, metric_card, chart_panel, ranking_list, funnel_panel, insight_card, risk_card, action_card, timeline, matrix, callout, takeaway_band.\n\n## Content Richness Rules\n除封面/目录/结束页外，每页必须像咨询汇报页而不是数据陈列页：至少 1 条 takeaway、3～6 个数据点、3～5 条 bullets 或 insight/action/risk 组件，并覆盖数据、结论、归因/解释、影响判断、行动/风险/机会中的至少 4 类信息。图表表达要多样：趋势用 line/area/timeline，对比用 grouped bar/matrix，内容用 ranking/top cards，诊断用 funnel/risk matrix，行动用 roadmap/swimlane/timeline。ranking_list/ranking 只能绑定真实且同口径可比较的业务指标（阅读量、完读率、互动量、转化率、占比等），不得把 1/2/3/4 顺序号当作图表数值，也不得混合阅读量、平均互动、完读率等不同单位；模式、原因、动作应使用 insight_card/action_card/risk_card/matrix/callout。硬性禁用省略号，任何 PPT 文本不得包含中文省略号或三个连续英文句点；放不下就改短、换行、拆条目、拆组件或拆页。KPI/summary 页至少 5 个 metrics + 2 个 insight/action；trend 页必须有增长/波动归因；comparison 页必须有结构洞察和风险/机会；ranking 页必须有成功模式总结和可复用动作；diagnosis 页必须有问题、原因、影响、动作。如后端 QA 标记 content_insufficient，必须由模型基于已有数据补丰富页面 spec，不得引入新数据，也不得由后端凭空补业务判断。\n\n## Deck Rhythm\n封面/目录 → 核心结论 → 数据表现 → 结构洞察 → 问题诊断 → 行动建议；renderer 会在缺省 layout_variant 时自动选择不同页面节奏，避免连续同构。\n\n## Rendering Strategy\n模型提供页面语义、组件关系与数据绑定，后端使用约束式布局引擎生成可编辑 SVG 组件页面，再由 ppt-master 导出原生可编辑 PPTX；后端负责 safe area、坐标、轴线、文本测量/缩放/截断、内容缺失重排与空内容降级，避免空模板、重叠和缺坐标。\n`;
}

function specLock(t: Theme): string {
  return `# 视觉与技术执行约束\n\n## Canvas\ncanvas=1280x720; safe_margin=72px.\n\n## Typography\nfont_family='${FONT}'; title_weight=700; body_weight=400.\n\n## Palette\nprimary=${t.primary}; secondary=${t.secondary}; accent=${t.accent}; warning=${t.warning}; danger=${t.danger}; bg=${t.bg}; panel=${t.panel}; text=${t.text}; subtext=${t.subtext}.\n\n## SVG Rules\nUse native SVG text/shapes only. No script, style, foreignObject, external image, or raster full-slide screenshot.\n`;
}

function notesTotal(slides: DeckSlideSpec[], deck: DeckSpecParams): string {
  return slides.map((s, i) => {
    const id = `${String(i + 1).padStart(2, '0')}_${slug(s.id || s.title || s.slide_type, 'slide')}`;
    const note = plain(s.notes) || plain(s.takeaway) || (s.bullets || []).join('；') || plain(deck.summary) || '本页用于承接整体汇报叙事。';
    return `# ${id}\n\n${note}`;
  }).join('\n\n---\n\n');
}

export async function renderPptDeckFromSpecs(projectRoot: string, projectRel: string, params: DeckSpecParams): Promise<RenderedDeckResult> {
  params = sanitizeDeckParams(params);
  const theme = themeOf(params.theme);
  const slides = applyRhythm((Array.isArray(params.slides) && params.slides.length ? params.slides : defaultSlides(params)).slice(0, 16));

  const svgDir = path.join(projectRoot, 'svg_output');
  const notesDir = path.join(projectRoot, 'notes');
  await fsp.mkdir(svgDir, { recursive: true });
  await fsp.mkdir(notesDir, { recursive: true });
  await fsp.mkdir(path.join(projectRoot, 'exports'), { recursive: true });
  await fsp.mkdir(path.join(projectRoot, 'images'), { recursive: true });
  await fsp.mkdir(path.join(projectRoot, 'sources'), { recursive: true });
  await fsp.mkdir(path.join(projectRoot, 'templates'), { recursive: true });

  const files: string[] = [];
  await fsp.writeFile(path.join(projectRoot, 'renderer_meta.json'), JSON.stringify({ kind: 'programmatic_ppt_specs', text_wrapped_by_renderer: true, created_at: new Date().toISOString() }, null, 2), 'utf8');
  await fsp.writeFile(path.join(projectRoot, 'design_spec.md'), designSpec(params, theme), 'utf8');
  await fsp.writeFile(path.join(projectRoot, 'spec_lock.md'), specLock(theme), 'utf8');
  files.push(`/${projectRel}/design_spec.md`, `/${projectRel}/spec_lock.md`);

  const qaReports: VisualQaSlideReport[] = [];
  for (let i = 0; i < slides.length; i += 1) {
    const slide = slides[i];
    const name = `${String(i + 1).padStart(2, '0')}_${slug(slide.id || slide.slide_type || slide.title, 'slide')}.svg`;
    let content = renderSlide(slide, params, theme, i + 1);
    let report = assessSvgVisualQuality(content, name);
    const richnessIssues = assessSlideContentRichness(slide);
    if (richnessIssues.length) {
      report.issues.push(...richnessIssues);
      report.score = Math.max(0, report.score - richnessIssues.length * 8);
    }
    if (i > 0 && !['cover', 'toc', 'agenda', 'closing', 'thanks'].includes(normalizeType(slide)) && shouldRetryVisualQa(report)) {
      const compact = compactSlideForVisualRetry(slide);
      const retryContent = renderSlide(compact, params, theme, i + 1);
      const retryReport = assessSvgVisualQuality(retryContent, name);
      if (richnessIssues.length) {
        retryReport.issues.push(...richnessIssues);
        retryReport.score = Math.max(0, retryReport.score - richnessIssues.length * 8);
      }
      retryReport.retried = true;
      if (retryReport.score >= report.score || retryReport.metrics.overlap_count < report.metrics.overlap_count) {
        content = retryContent;
        report = retryReport;
      }
    }
    qaReports.push(report);
    await fsp.writeFile(path.join(svgDir, name), content, 'utf8');
    files.push(`/${projectRel}/svg_output/${name}`);
  }
  await fsp.writeFile(path.join(notesDir, 'total.md'), notesTotal(slides, params), 'utf8');
  files.push(`/${projectRel}/notes/total.md`);
  const qaPath = path.join(projectRoot, 'visual_qa.json');
  await fsp.writeFile(qaPath, JSON.stringify({
    kind: 'ppt_visual_qa',
    threshold: 82,
    slide_count: qaReports.length,
    average_score: qaReports.length ? Math.round(qaReports.reduce((sum, item) => sum + item.score, 0) / qaReports.length) : 0,
    reports: qaReports,
  }, null, 2), 'utf8');
  files.push(`/${projectRel}/visual_qa.json`);

  return { files, svg_count: slides.length, project_path: projectRel };
}
