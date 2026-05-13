export type ContentType = 'article' | 'video' | 'infographic' | 'quiz' | 'qa' | 'checklist' | 'poster';
export type ContentStatus = 'draft' | 'under_review' | 'approved' | 'published' | 'archived' | 'offline';

export type PipelineStage =
  | 'requirement_submitted'
  | 'doctor_distributing'
  | 'doctor_creating'
  | 'external_review'
  | 'internal_review'
  | 'published';

export type ContentPriority = 'P0' | 'P1' | 'P2';
export type ContentWorkflowState =
  | 'draft'
  | 'system_precheck'
  | 'px_content_review'
  | 'pharma_medical_review'
  | 'pharma_marketing_review'
  | 'approved_locked'
  | 'scheduled'
  | 'published'
  | 'archived'
  | 'rejected';

export interface Content {
  id: string;
  projectId: string;
  title: string;
  type: ContentType;
  status: ContentStatus;
  workflowState?: ContentWorkflowState;
  pipelineStage: PipelineStage;
  priority: ContentPriority;
  author: string;
  excerpt?: string;
  projectBrief?: string;
  content: string;
  tags: string[];
  pushCount?: number;
  readUsers?: number;
  readCount: number;
  likeCount: number;
  dislikeCount?: number;
  bookmarkCount: number;
  shareCount?: number;
  finishRate?: number;
  avgReadSec?: number;
  createdAt: string;
  updatedAt: string;
  publishedAt?: string;
  expectedDate?: string;
  rejectionNote?: string;
  projectName?: string;
  projectColor?: string;
}

export interface ContentFilter {
  status?: ContentStatus;
  projectId?: string;
  type?: ContentType;
  pipelineStage?: PipelineStage;
  priority?: ContentPriority;
  search?: string;
  page?: number;
  pageSize?: number;
}

export interface CreateContentDTO {
  projectId: string;
  title: string;
  type: ContentType;
  content: string;
  tags: string[];
}

export interface UpdateContentDTO {
  title?: string;
  content?: string;
  tags?: string[];
  status?: ContentStatus;
}
