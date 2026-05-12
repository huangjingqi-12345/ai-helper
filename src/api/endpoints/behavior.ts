import { apiClient } from '@/api/client';
import type { ApiResponse } from '@/types/api';
import type { BehaviorSummary, BehaviorFilter, TrendPoint, TrendFilter } from '@/types/behavior';

export async function getBehaviorSummary(params?: BehaviorFilter): Promise<ApiResponse<BehaviorSummary>> {
  const response = await apiClient.get<ApiResponse<BehaviorSummary>>('/behavior', { params });
  return response.data;
}

export async function getBehaviorTrends(params?: TrendFilter): Promise<ApiResponse<TrendPoint[]>> {
  const response = await apiClient.get<ApiResponse<TrendPoint[]>>('/behavior/trends', { params });
  return response.data;
}
