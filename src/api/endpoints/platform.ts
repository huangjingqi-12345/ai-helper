import { apiClient } from '@/api/client';
import type { ApiResponse, PaginatedResponse } from '@/types/api';
import type { User, PlatformSettings, UpdateUserDTO } from '@/types/platform';

export async function getUsers(): Promise<PaginatedResponse<User>> {
  const response = await apiClient.get<PaginatedResponse<User>>('/platform/users');
  return response.data;
}

export async function updateUser(id: string, data: UpdateUserDTO): Promise<ApiResponse<User>> {
  const response = await apiClient.put<ApiResponse<User>>(`/platform/users/${id}`, data);
  return response.data;
}

export async function getSettings(): Promise<ApiResponse<PlatformSettings>> {
  const response = await apiClient.get<ApiResponse<PlatformSettings>>('/platform/settings');
  return response.data;
}

export async function updateSettings(data: Partial<PlatformSettings>): Promise<ApiResponse<PlatformSettings>> {
  const response = await apiClient.put<ApiResponse<PlatformSettings>>('/platform/settings', data);
  return response.data;
}
