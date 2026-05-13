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

export type DistributionProjectStatus = 'intake' | 'production' | 'distribution' | 'completed' | 'archived';
export type DistributionProjectPriority = 'P0' | 'P1' | 'P2';

export interface DistributionProject {
  id: string;
  title: string;
  priority: DistributionProjectPriority;
  status: DistributionProjectStatus;
  brand: string;
  disease: string;
  owner: string;
  tenantId: string;
  expectedDate: string;
  totalPieces: number;
  cadence: string;
  patientCap: number;
  topics: string[];
  formats: string;
  approvalFlow: string;
  progress: number;
  currentNode: string;
  contentCount: number;
  publishedCount: number;
}

export interface DoctorCandidate {
  id: string;
  name: string;
  title: string;
  dept: string;
  region: string;
  hospital?: string;
  specialties: string;
  specialtyList?: string[];
  tags: string[];
}
