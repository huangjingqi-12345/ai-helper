export type UserRole = 'admin' | 'editor' | 'viewer';

export interface User {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  region: string;
  status: 'active' | 'inactive' | 'frozen' | 'invited';
  lastLogin?: string;
  createdAt: string;
}

export interface FeatureFlags {
  contentWorkshop: boolean;
  behaviorInsights: boolean;
  distributionStrategy: boolean;
  approvalCenter: boolean;
}

export interface PlatformSettings {
  siteName: string;
  version: string;
  region: string;
  features: FeatureFlags;
}

export interface UpdateUserDTO {
  name?: string;
  email?: string;
  role?: UserRole;
  region?: string;
  status?: 'active' | 'inactive' | 'frozen' | 'invited';
}

export type TenantStatus = 'active' | 'inactive' | 'draft';

export interface TenantRow {
  id: string;
  name: string;
  shortName: string;
  type: '自营' | '药企租户';
  status: TenantStatus;
  contract: string;
  contact: string;
  description: string;
  diseaseScope: string;
  brandScope: string;
  regionScope: string;
  gray: string;
  kAnon: string;
  accounts: number;
  canExport: boolean;
}

export type AccountStatus = 'active' | 'frozen' | 'invited';

export interface AccountRow {
  id: string;
  name: string;
  email: string;
  tenant: string;
  tenantId: string;
  view: '运营视图' | '药企视图';
  roles: string[];
  status: AccountStatus;
  has2fa: boolean;
  lastLogin: string;
  note: string;
}

export interface FlowNode {
  id: string;
  name: string;
  reviewerType: string;
  slaHours: number;
  timeoutPolicy: string;
}

export interface ApprovalFlow {
  id: string;
  tenantId?: string;
  name: string;
  nodes: FlowNode[];
  status: 'active' | 'inactive';
  returnPolicy: string;
  lastUpdated: string;
}

export interface TeamMember {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  lastLogin: string;
}

export interface AuditLogRow {
  id: string;
  message: string;
  time: string;
  actorName?: string;
  action?: string;
}
