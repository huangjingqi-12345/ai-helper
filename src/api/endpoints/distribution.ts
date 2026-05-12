import { apiClient } from '@/api/client';
import type { ApiResponse, PaginatedResponse } from '@/types/api';
import type { DistributionStrategy, StrategyFilter, CreateStrategyDTO, UpdateStrategyDTO } from '@/types/distribution';

export async function getStrategies(params?: StrategyFilter): Promise<PaginatedResponse<DistributionStrategy>> {
  const response = await apiClient.get<PaginatedResponse<DistributionStrategy>>('/distribution', { params });
  return response.data;
}

export async function createStrategy(data: CreateStrategyDTO): Promise<ApiResponse<DistributionStrategy>> {
  const response = await apiClient.post<ApiResponse<DistributionStrategy>>('/distribution', data);
  return response.data;
}

export async function updateStrategy(id: string, data: UpdateStrategyDTO): Promise<ApiResponse<DistributionStrategy>> {
  const response = await apiClient.put<ApiResponse<DistributionStrategy>>(`/distribution/${id}`, data);
  return response.data;
}
