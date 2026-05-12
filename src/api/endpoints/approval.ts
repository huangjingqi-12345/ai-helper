import { apiClient } from '@/api/client';
import type { ApiResponse, PaginatedResponse } from '@/types/api';
import type { ApprovalItem, ApprovalFilter } from '@/types/approval';

export async function getApprovalQueue(params?: ApprovalFilter): Promise<PaginatedResponse<ApprovalItem>> {
  const response = await apiClient.get<PaginatedResponse<ApprovalItem>>('/approval', { params });
  return response.data;
}

export async function approveContent(id: string, comments?: string): Promise<ApiResponse<ApprovalItem>> {
  const response = await apiClient.put<ApiResponse<ApprovalItem>>(`/approval/${id}`, {
    action: 'approve',
    comments,
  });
  return response.data;
}

export async function rejectContent(id: string, comments: string): Promise<ApiResponse<ApprovalItem>> {
  const response = await apiClient.put<ApiResponse<ApprovalItem>>(`/approval/${id}`, {
    action: 'reject',
    comments,
  });
  return response.data;
}
