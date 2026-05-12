export type UserRole = 'admin' | 'editor' | 'viewer';

export interface User {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  region: string;
  status: 'active' | 'inactive';
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
  status?: 'active' | 'inactive';
}
