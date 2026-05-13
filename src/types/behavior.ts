export interface TrendPoint {
  date: string;
  value: number;
}

export interface ContentMetric {
  contentId: string;
  title: string;
  disease?: string;
  pushCount?: number;
  readUsers?: number;
  reads: number;
  interactions: number;
}

export interface DiseaseMetric {
  disease: string;
  reads: number;
  interactions: number;
  pushCount: number;
}

export interface BehaviorSummary {
  pushCount?: number;
  readUsers?: number;
  totalReads: number;
  totalInteractions: number;
  avgReadDuration: number;
  readTrend: TrendPoint[];
  interactionTrend: TrendPoint[];
  topContent: ContentMetric[];
  byDisease: DiseaseMetric[];
}

export interface BehaviorFilter {
  startDate?: string;
  endDate?: string;
  projectId?: string;
  disease?: string;
}

export type TrendFilter = BehaviorFilter;
