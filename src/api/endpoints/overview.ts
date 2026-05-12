import { apiClient } from '@/api/client';
import type { ApiResponse, PaginatedResponse } from '@/types/api';
import type { OverviewStats, Project } from '@/types/overview';

export async function getOverviewStats(): Promise<ApiResponse<OverviewStats>> {
  const response = await apiClient.get<ApiResponse<OverviewStats>>('/overview');
  return response.data;
}

export async function getOverviewProjects(): Promise<PaginatedResponse<Project>> {
  const response = await apiClient.get<PaginatedResponse<Project>>('/overview/projects');
  return response.data;
}
