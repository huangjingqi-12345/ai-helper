export interface OverviewStats {
  projectCount: number;
  publishedContent: string;
  pushCount: number;
  readUsers: number;
  readCount: number;
  interactionCount: number;
  lastUpdated: string;
}

export type ProjectStatus = 'active' | 'paused' | 'archived';

export interface Project {
  id: string;
  name: string;
  disease: string;
  contentCount: number;
  publishedCount: number;
  pushCount: number;
  readCount: number;
  interactionCount: number;
  status: ProjectStatus;
  createdAt: string;
  updatedAt: string;
}
