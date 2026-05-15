import { apiClient } from '@/api/client';
import type { ApiResponse } from '@/types/api';
import type { TenantOption } from '@/stores/useTenantStore';

export type AccountType = 'ops' | 'pharma';

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  tenantId: string;
  tenantType: AccountType;
  roles: string[];
  permissions: string[];
  authProvider: 'oidc' | 'dev' | 'local' | 'break_glass';
  mfa: boolean;
}

export interface CurrentTenantResponse extends TenantOption {
  isolationMode: string;
  aggregateOnly: boolean;
  kAnonymityThreshold: number;
}

export interface AuthTokenResponse {
  token: string;
}

export interface RoleOption {
  value: string;
  label: string;
}

export interface RegistrationOptions {
  companies: TenantOption[];
  roles: Record<AccountType, RoleOption[]>;
}

export interface LoginPayload {
  email: string;
  password: string;
}

export interface RegisterPayload extends LoginPayload {
  name: string;
  accountType: AccountType;
  role: string;
  companyId?: string;
  companyName?: string;
}

export async function getCurrentUser(): Promise<ApiResponse<AuthUser>> {
  const response = await apiClient.get<ApiResponse<AuthUser>>('/auth/me');
  return response.data;
}

export async function getCurrentTenant(): Promise<ApiResponse<CurrentTenantResponse>> {
  const response = await apiClient.get<ApiResponse<CurrentTenantResponse>>('/tenants/current');
  return response.data;
}

export async function getRegistrationOptions(): Promise<ApiResponse<RegistrationOptions>> {
  const response = await apiClient.get<ApiResponse<RegistrationOptions>>('/auth/registration-options');
  return response.data;
}

export async function login(payload: LoginPayload): Promise<ApiResponse<AuthTokenResponse>> {
  const response = await apiClient.post<ApiResponse<AuthTokenResponse>>('/auth/login', payload);
  return response.data;
}

export async function register(payload: RegisterPayload): Promise<ApiResponse<AuthTokenResponse>> {
  const response = await apiClient.post<ApiResponse<AuthTokenResponse>>('/auth/register', payload);
  return response.data;
}
