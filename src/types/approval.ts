export type ApprovalStatus = 'pending' | 'approved' | 'rejected' | 'cancelled';

export interface ApprovalItem {
  id: string;
  contentId: string;
  contentTitle: string;
  submittedBy: string;
  submittedAt: string;
  status: ApprovalStatus;
  reviewedBy?: string;
  reviewedAt?: string;
  comments?: string;
  projectName: string;
}

export interface ApprovalFilter {
  status?: ApprovalStatus;
  page?: number;
  pageSize?: number;
}


export interface ApprovalAttachment {
  id: string;
  type: 'content_detail';
  label: string;
  contentId: string;
  title?: string;
  contentType?: string;
  excerpt?: string;
  body?: string;
  tags?: string[];
  priority?: string;
  projectName?: string;
  disease?: string;
  author?: string;
  updatedAt?: string;
  versionNo?: number;
  immutableHash?: string;
  route?: string;
  source?: 'dx_api' | 'local_cache';
  sourceLabel?: string;
  status?: 'pending' | 'ready' | 'unavailable';
  retrievedAt?: string;
  error?: string;
}

export interface ApprovalTask {
  id: string;
  taskId?: string;
  contentId: string;
  title: string;
  disease: string;
  author: string;
  node: string;
  progress: string;
  sla: string;
  status: ApprovalStatus;
  attachments?: ApprovalAttachment[];
}
