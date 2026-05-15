export type ContentType = 'article' | 'video' | 'infographic' | 'quiz' | 'qa' | 'checklist' | 'poster';

/**
 * PM 确认的 6 态内容状态模型（2026-05-15 产品确定）
 * 需求已提交→医生分发中→医生制作中→三方审核中→内部审核中→已发布
 */
export type ContentStatus =
  | 'requirement_submitted'   // 需求已提交
  | 'doctor_distributing'     // 医生分发中（中间态）
  | 'doctor_producing'        // 医生制作中
  | 'third_party_review'      // 三方审核中（DX医学编辑+PX运营）
  | 'internal_review'         // 内部审核中（药企）
  | 'published';              // 已发布

/** @deprecated Use ContentStatus instead — PM confirmed 6-state model replaces pipeline stage */
export type PipelineStage = ContentStatus;

export type ContentPriority = 'P0' | 'P1' | 'P2';

/** @deprecated Removed per PM decision (2026-05-15). Use ContentStatus 6-state model instead. */
export type ContentWorkflowState = string;

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

export interface ContentRequestProject {
  id: string;
  tenantId?: string;
  name: string;
  title?: string;
  disease: string;
  brand?: string;
  owner?: string;
  status?: string;
  contentCount?: number;
  publishedCount?: number;
  createdAt?: string;
  updatedAt?: string;
}

export type ContentRequestFormat = 'article' | 'poster' | 'checklist';
export type ContentRequestMatrix = Record<string, Partial<Record<ContentRequestFormat, number>>>;

export interface SubmitContentRequestDTO {
  projectId: string;
  requestName: string;
  priority: ContentPriority;
  expectedDate: string;
  themeFormatMatrix: ContentRequestMatrix;
  note?: string;
}

export interface ContentRequestRecord {
  id: string;
  tenantId: string;
  projectId: string;
  contentId?: string;
  requestName: string;
  title: string;
  priority: ContentPriority;
  expectedDate?: string;
  themeFormatMatrix: ContentRequestMatrix;
  totalCount: number;
  note?: string;
  status: 'pending' | 'accepted' | 'rejected' | 'converted';
  submittedBy?: string;
  submittedAt: string;
  createdAt: string;
  updatedAt: string;
}

export interface SubmitContentRequestResult {
  request: ContentRequestRecord;
  content: Content;
}
