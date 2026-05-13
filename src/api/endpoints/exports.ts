import { apiClient } from '@/api/client';
import type { ApiResponse } from '@/types/api';

export interface ExportJob {
  id: string;
  status: string;
  fileUrl?: string;
  watermark?: string;
  aggregateOnly?: boolean;
  recordCount?: number;
  threshold?: number;
}

export async function createExportJob(data: { scope: string; rangeDays: number; projectId?: string; diseaseId?: string }): Promise<ApiResponse<ExportJob>> {
  const response = await apiClient.post<ApiResponse<ExportJob>>('/exports', data);
  return response.data;
}

