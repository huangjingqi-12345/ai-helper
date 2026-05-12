import { apiClient } from '@/api/client';
import type { ApiResponse, PaginatedResponse } from '@/types/api';
import type { Content, ContentFilter, CreateContentDTO, UpdateContentDTO } from '@/types/content';

export async function getContentList(params?: ContentFilter): Promise<PaginatedResponse<Content>> {
  const response = await apiClient.get<PaginatedResponse<Content>>('/content', { params });
  return response.data;
}

export async function getContentById(id: string): Promise<ApiResponse<Content>> {
  const response = await apiClient.get<ApiResponse<Content>>(`/content/${id}`);
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
