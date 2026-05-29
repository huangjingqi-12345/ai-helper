export type AiTaskKind = 'overview' | 'monthly' | 'ppt' | 'data-qa' | 'chat';
export type AiShortcut = 'overview' | 'monthly' | 'ppt' | 'ppt_svg' | 'data_qa';
export type AiDataScope = 'last_7_days' | 'latest_complete_month' | 'last_1_year';

export interface PrefetchMetricsParams {
  task?: AiTaskKind;
  dateRange?: { start?: string; end?: string };
  compareRange?: { start?: string; end?: string };
  projectId?: string;
  contentId?: string;
  diseaseId?: string;
  tenantId?: string;
  granularity?: 'day' | 'week' | 'month';
  limit?: number;
  purpose?: string;
}

export interface RunRequest {
  command?: string;
  message?: string;
  conversation_id?: string;
  run_id?: string;
  shortcut?: AiShortcut;
  data_scope?: AiDataScope;
  date_range?: { start?: string; end?: string };
  compare_range?: { start?: string; end?: string };
  date_label?: string;
  granularity?: PrefetchMetricsParams['granularity'];
  history?: Array<{ role?: 'user' | 'assistant'; text?: string; files?: string[]; activePptContext?: unknown }>;
}

export interface StreamEvent {
  type: string;
  data: unknown;
}

export interface MetricPoint {
  date: string;
  pushCount: number;
  deliveredCount: number;
  readUsers: number;
  readCount: number;
  interactionCount: number;
  likeCount: number;
  bookmarkCount: number;
  shareCount: number;
  finishRate: number;
  avgReadSec: number;
}

export interface TopContentMetric {
  id: string;
  title: string;
  projectId?: string;
  projectName?: string;
  type?: string;
  status?: string;
  readCount: number;
  readUsers: number;
  interactionCount: number;
  pushCount: number;
  finishRate: number;
}

export interface ProjectMetric {
  id: string;
  name: string;
  disease?: string;
  status?: string;
  contentCount: number;
  publishedCount: number;
  pushCount: number;
  readUsers: number;
  readCount: number;
  interactionCount: number;
}

export interface PrefetchMetrics {
  source: string;
  generatedAt: string;
  range: { start: string; end: string; days: number };
  coreKpi: {
    projectCount: number;
    contentCount: number;
    publishedCount: number;
    pushCount: number;
    deliveredCount: number;
    readUsers: number;
    readCount: number;
    interactionCount: number;
    finishRate: number;
    avgReadSec: number;
    activeDays: number;
  };
  latestMonth: {
    key: string;
    pushCount: number;
    readCount: number;
    interactionCount: number;
    readUsers: number;
    finishRate: number;
  };
  priorMonth?: PrefetchMetrics['latestMonth'];
  monthDelta: {
    readCountPct: number;
    interactionCountPct: number;
    pushCountPct: number;
  };
  dailyTrend: MetricPoint[];
  monthlyTrend: Array<{ month: string; readCount: number; interactionCount: number; pushCount: number; readUsers: number }>;
  topContent: TopContentMetric[];
  projects: ProjectMetric[];
  diseases: Array<{ name: string; reads: number; interactions: number; pushCount: number }>;
  insights: string[];
}

export interface DataQaContext {
  dbDriver: string;
  generatedAt: string;
  tableCounts: Record<string, number>;
  behaviorDailyMetrics: {
    rows: number;
    minDate: string;
    maxDate: string;
    distinctContent: number;
    distinctProjects: number;
  };
  modelConfigured?: boolean;
  metricDefinitions: Record<string, string>;
}

export interface GeneratedArtifactSet {
  rootDir: string;
  relRoot: string;
  files: string[];
  title: string;
  task: AiTaskKind;
}
