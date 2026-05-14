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
}
