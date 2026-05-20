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
  createdAt?: string;
  updatedAt?: string;
}

export interface DoctorCandidate {
  id: string;
  doctorId: number;
  phone: string;
  name: string;
  title: string;
  department: string;
  hospital: string;
  doctorLevel: string;
  inProgressCount: number;
  publishedCount: number;
  available: boolean;
}

export type DistributionRequestStatus = 'pending' | 'accepted' | 'rejected' | 'converted';
export type RequestDistributionAssignmentMode = 'mixed' | 'whitelist' | 'strategy';
export type RequestDistributionMatrix = Record<string, Partial<Record<'article' | 'poster' | 'checklist' | 'longtext' | 'manual', number>>>;

export interface DistributionRequestProject {
  id: string;
  tenantId?: string;
  name?: string;
  title?: string;
  disease?: string;
  brand?: string;
  owner?: string;
  patientCap?: number;
  contentCount?: number;
  publishedCount?: number;
}

export interface DistributionRequestRecord {
  id: string;
  tenantId: string;
  projectId: string;
  contentId?: string;
  requestName: string;
  title: string;
  priority: DistributionProjectPriority;
  expectedDate?: string;
  themeFormatMatrix: RequestDistributionMatrix;
  totalCount: number;
  note?: string;
  status: DistributionRequestStatus;
  submittedBy?: string;
  submittedAt: string;
  createdAt: string;
  updatedAt: string;
  project?: DistributionRequestProject;
}

export interface RequestDistributionConfig {
  requestId: string;
  assignmentMode: RequestDistributionAssignmentMode;
  whitelistEnabled: boolean;
  strategyEnabled: boolean;
  departmentFilters: string[];
  titleFilters: string[];
  regionFilters: string[];
  tagFilters: string[];
  whitelistDoctorIds: string[];
  whitelistDoctorQuota: Record<string, number>;
  patientChannels: string[];
  patientRegions: string[];
  patientTags: string[];
  patientGrayPercent: number;
  patientCap: number;
  note?: string;
  updatedBy?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface RequestDistributionBatch {
  id: string;
  requestId: string;
  batchMatrix: RequestDistributionMatrix;
  totalCount: number;
  whitelistTotal: number;
  strategyTotal: number;
  operator?: string;
  submittedAt: string;
  createdAt: string;
}

export interface DistributionRequestWorkbench {
  request: DistributionRequestRecord;
  config: RequestDistributionConfig;
  doctors: DoctorCandidate[];
  batches: RequestDistributionBatch[];
}
