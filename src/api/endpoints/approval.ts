import { apiClient } from '@/api/client';
import type { ApiResponse, PaginatedResponse } from '@/types/api';
import type { ApprovalItem, ApprovalFilter, ApprovalTask } from '@/types/approval';

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

export async function getApprovalTasks(params?: { status?: string; page?: number; pageSize?: number }): Promise<PaginatedResponse<ApprovalTask>> {
  const response = await apiClient.get<PaginatedResponse<ApprovalTask>>('/approval/tasks', { params });
  return response.data;
}

export async function updateApprovalTask(id: string, data: { action: 'approve' | 'reject'; comments?: string; rejectReason?: string }): Promise<ApiResponse<ApprovalTask>> {
  const response = await apiClient.put<ApiResponse<ApprovalTask>>(`/approval/tasks/${id}`, data);
  return response.data;
}
