import { apiClient } from '@/api/client';
import type { ApiResponse, PaginatedResponse } from '@/types/api';
import type {
  User,
  PlatformSettings,
  UpdateUserDTO,
  TenantRow,
  AccountRow,
  ApprovalFlow,
  TeamMember,
  AuditLogRow,
} from '@/types/platform';
import type { TenantOption } from '@/stores/useTenantStore';

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

export async function getTenantOptions(): Promise<ApiResponse<TenantOption[]>> {
  const response = await apiClient.get<ApiResponse<TenantOption[]>>('/platform/tenants/options');
  return response.data;
}

export async function getTenants(): Promise<ApiResponse<TenantRow[]>> {
  const response = await apiClient.get<ApiResponse<TenantRow[]>>('/platform/tenants');
  return response.data;
}

export async function createTenant(data: TenantRow): Promise<ApiResponse<TenantRow>> {
  const response = await apiClient.post<ApiResponse<TenantRow>>('/platform/tenants', data);
  return response.data;
}

export async function updateTenantStatus(id: string, status: TenantRow['status']): Promise<ApiResponse<TenantRow>> {
  const response = await apiClient.patch<ApiResponse<TenantRow>>(`/platform/tenants/${id}/status`, { status });
  return response.data;
}

export async function getAccounts(): Promise<ApiResponse<AccountRow[]>> {
  const response = await apiClient.get<ApiResponse<AccountRow[]>>('/platform/accounts');
  return response.data;
}

export async function createAccount(data: AccountRow): Promise<ApiResponse<AccountRow>> {
  const response = await apiClient.post<ApiResponse<AccountRow>>('/platform/accounts', data);
  return response.data;
}

export async function updateAccountStatus(id: string, status: AccountRow['status']): Promise<ApiResponse<AccountRow>> {
  const response = await apiClient.patch<ApiResponse<AccountRow>>(`/platform/accounts/${id}/status`, { status });
  return response.data;
}

export async function updateAccount2fa(id: string, has2fa: boolean): Promise<ApiResponse<AccountRow>> {
  const response = await apiClient.patch<ApiResponse<AccountRow>>(`/platform/accounts/${id}/2fa`, { has2fa });
  return response.data;
}

export async function getApprovalFlows(tenantId?: string): Promise<ApiResponse<ApprovalFlow[]>> {
  const response = await apiClient.get<ApiResponse<ApprovalFlow[]>>('/platform/approval-flows', { params: { tenantId } });
  return response.data;
}

export async function getTeamMembers(tenantId: string): Promise<ApiResponse<TeamMember[]>> {
  const response = await apiClient.get<ApiResponse<TeamMember[]>>('/platform/team', { params: { tenantId } });
  return response.data;
}

export async function createTeamMember(tenantId: string, data: Pick<TeamMember, 'name' | 'email' | 'role'>): Promise<ApiResponse<TeamMember>> {
  const response = await apiClient.post<ApiResponse<TeamMember>>('/platform/team', { tenantId, ...data });
  return response.data;
}

export async function updateTeamMemberRole(id: string, role: TeamMember['role']): Promise<ApiResponse<TeamMember>> {
  const response = await apiClient.patch<ApiResponse<TeamMember>>(`/platform/team/${id}/role`, { role });
  return response.data;
}

export async function deleteTeamMember(id: string): Promise<ApiResponse<void>> {
  const response = await apiClient.delete<ApiResponse<void>>(`/platform/team/${id}`);
  return response.data;
}

export async function getAuditLogs(tenantId?: string): Promise<ApiResponse<AuditLogRow[]>> {
  const response = await apiClient.get<ApiResponse<AuditLogRow[]>>('/platform/audit-logs', { params: { tenantId } });
  return response.data;
}
