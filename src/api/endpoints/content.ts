import { apiClient } from '@/api/client';
import type { ApiResponse, PaginatedResponse } from '@/types/api';
import type {
  Content,
  ContentFilter,
  ContentRequestRecord,
  ContentRequestProject,
  CreateContentDTO,
  DxTaskStatusDetail,
  SubmitContentRequestDTO,
  SubmitContentRequestResult,
  UpdateContentDTO,
} from '@/types/content';

export async function getContentList(params?: ContentFilter): Promise<PaginatedResponse<Content>> {
  const response = await apiClient.get<PaginatedResponse<Content>>('/content', { params });
  return response.data;
}

export async function getContentById(id: string): Promise<ApiResponse<Content>> {
  const response = await apiClient.get<ApiResponse<Content>>(`/content/${id}`);
  return response.data;
}

export async function getContentDxTaskStatus(id: string): Promise<ApiResponse<DxTaskStatusDetail>> {
  const response = await apiClient.get<ApiResponse<DxTaskStatusDetail>>(`/content/${id}/dx-task-status`);
  return response.data;
}

export async function createContent(data: CreateContentDTO): Promise<ApiResponse<Content>> {
  const response = await apiClient.post<ApiResponse<Content>>('/content', data);
  return response.data;
}

export async function updateContent(id: string, data: UpdateContentDTO): Promise<ApiResponse<Content>> {
  const response = await apiClient.put<ApiResponse<Content>>(`/content/${id}`, data);
  return response.data;
}

export async function deleteContent(id: string): Promise<ApiResponse<void>> {
  const response = await apiClient.delete<ApiResponse<void>>(`/content/${id}`);
  return response.data;
}

export async function getContentRequestProjects(): Promise<ApiResponse<ContentRequestProject[]>> {
  const response = await apiClient.get<ApiResponse<ContentRequestProject[]>>('/content/request-projects');
  return response.data;
}

export async function getContentRequests(params?: { projectId?: string; status?: string; page?: number; pageSize?: number }): Promise<PaginatedResponse<ContentRequestRecord>> {
  const response = await apiClient.get<PaginatedResponse<ContentRequestRecord>>('/content/requests', { params });
  return response.data;
}

export async function submitContentRequest(data: SubmitContentRequestDTO): Promise<ApiResponse<SubmitContentRequestResult>> {
  const response = await apiClient.post<ApiResponse<SubmitContentRequestResult>>('/content/requests', data);
  return response.data;
}
