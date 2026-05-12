export type ApprovalStatus = 'pending' | 'approved' | 'rejected';

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
