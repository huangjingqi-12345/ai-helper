export interface AudienceConfig {
  regions: string[];
  diseases: string[];
  patientCount: number;
}

export interface ScheduleConfig {
  type: 'immediate' | 'scheduled' | 'recurring';
  startDate?: string;
  endDate?: string;
  frequency?: 'daily' | 'weekly' | 'monthly';
}

export type StrategyStatus = 'draft' | 'active' | 'paused' | 'completed';

export interface DistributionMetrics {
  pushed: number;
  delivered: number;
  opened: number;
  read: number;
}

export interface DistributionStrategy {
  id: string;
  name: string;
  projectId: string;
  targetAudience: AudienceConfig;
  contentIds: string[];
  schedule: ScheduleConfig;
  status: StrategyStatus;
  metrics: DistributionMetrics;
  createdAt: string;
  updatedAt: string;
}

export interface StrategyFilter {
  status?: StrategyStatus;
  projectId?: string;
  page?: number;
  pageSize?: number;
}

export interface CreateStrategyDTO {
  name: string;
  projectId: string;
  targetAudience: AudienceConfig;
  contentIds: string[];
  schedule: ScheduleConfig;
}

export interface UpdateStrategyDTO {
  name?: string;
  targetAudience?: AudienceConfig;
  contentIds?: string[];
  schedule?: ScheduleConfig;
  status?: StrategyStatus;
}
