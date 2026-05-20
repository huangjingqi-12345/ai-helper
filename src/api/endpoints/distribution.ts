import { apiClient } from '@/api/client';
import type { ApiResponse, PaginatedResponse } from '@/types/api';
import type {
  DistributionStrategy,
  StrategyFilter,
  CreateStrategyDTO,
  UpdateStrategyDTO,
  DistributionProject,
  DoctorCandidate,
  DistributionRequestWorkbench,
  RequestDistributionBatch,
  RequestDistributionConfig,
} from '@/types/distribution';

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

export async function getDistributionProjects(params?: { status?: string; priority?: string; search?: string; page?: number; pageSize?: number }): Promise<PaginatedResponse<DistributionProject>> {
  const response = await apiClient.get<PaginatedResponse<DistributionProject>>('/distribution/projects', { params });
  return response.data;
}

export async function createDistributionProject(data: {
  tenantId: string;
  name: string;
  brand?: string;
  disease: string;
  owner: string;
  note?: string;
}): Promise<ApiResponse<DistributionProject>> {
  const response = await apiClient.post<ApiResponse<DistributionProject>>('/distribution/projects', data);
  return response.data;
}

export async function getDistributionProjectById(id: string): Promise<ApiResponse<DistributionProject>> {
  const response = await apiClient.get<ApiResponse<DistributionProject>>(`/distribution/projects/${id}`);
  return response.data;
}

export async function getDistributionProjectDoctors(id: string): Promise<ApiResponse<DoctorCandidate[]>> {
  const response = await apiClient.get<ApiResponse<DoctorCandidate[]>>(`/distribution/projects/${id}/doctors`);
  return response.data;
}

export async function getDistributionRequestWorkbench(id: string): Promise<ApiResponse<DistributionRequestWorkbench>> {
  const response = await apiClient.get<ApiResponse<DistributionRequestWorkbench>>(`/distribution/requests/${id}`);
  return response.data;
}

export async function acceptDistributionRequest(id: string, note?: string): Promise<ApiResponse<DistributionRequestWorkbench['request']>> {
  const response = await apiClient.post<ApiResponse<DistributionRequestWorkbench['request']>>(`/distribution/requests/${id}/accept`, { note });
  return response.data;
}

export async function saveRequestDistributionConfig(id: string, data: RequestDistributionConfig): Promise<ApiResponse<RequestDistributionConfig>> {
  const response = await apiClient.put<ApiResponse<RequestDistributionConfig>>(`/distribution/requests/${id}/config`, data);
  return response.data;
}

export async function submitRequestDistributionBatch(
  id: string,
  data: Pick<RequestDistributionBatch, 'batchMatrix' | 'whitelistTotal' | 'strategyTotal'>
): Promise<ApiResponse<RequestDistributionBatch>> {
  const response = await apiClient.post<ApiResponse<RequestDistributionBatch>>(`/distribution/requests/${id}/batches`, data);
  return response.data;
}

export async function retryRequestDistributionBatch(id: string, batchId: string): Promise<ApiResponse<RequestDistributionBatch>> {
  const response = await apiClient.post<ApiResponse<RequestDistributionBatch>>(`/distribution/requests/${id}/batches/${batchId}/retry`);
  return response.data;
}

export async function syncDxTaskStatuses(): Promise<ApiResponse<{
  fetched: number;
  matched: number;
  updated: number;
  contentAdvanced: number;
  cursor: string | null;
}>> {
  const response = await apiClient.post<ApiResponse<{
    fetched: number;
    matched: number;
    updated: number;
    contentAdvanced: number;
    cursor: string | null;
  }>>('/distribution/dx-tasks/sync');
  return response.data;
}
