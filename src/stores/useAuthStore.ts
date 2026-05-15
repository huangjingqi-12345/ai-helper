import { create } from 'zustand';
import {
  getCurrentTenant,
  getCurrentUser,
  login as loginRequest,
  register as registerRequest,
  type AuthUser,
  type LoginPayload,
  type RegisterPayload,
} from '@/api/endpoints/auth';
import { useTenantStore } from '@/stores/useTenantStore';
import { logger } from '@/utils/logger';

const authTokenKey = 'pxlite.authToken';

interface AuthState {
  token: string | null;
  user: AuthUser | null;
  initialized: boolean;
  loading: boolean;
  error: string | null;
  fetchMe: () => Promise<AuthUser | null>;
  login: (payload: LoginPayload) => Promise<AuthUser>;
  register: (payload: RegisterPayload) => Promise<AuthUser>;
  logout: () => void;
  clearError: () => void;
}

function storedToken(): string | null {
  if (typeof window === 'undefined') return null;
  return window.localStorage.getItem(authTokenKey);
}

function persistToken(token: string | null): void {
  if (typeof window === 'undefined') return;
  if (token) window.localStorage.setItem(authTokenKey, token);
  else window.localStorage.removeItem(authTokenKey);
}

function messageFromError(error: unknown, fallback: string): string {
  if (error && typeof error === 'object' && 'response' in error) {
    const response = (error as { response?: { data?: { message?: string } } }).response;
    if (response?.data?.message) return response.data.message;
  }
  return error instanceof Error ? error.message : fallback;
}

async function loadSession(): Promise<AuthUser> {
  const [userRes, tenantRes] = await Promise.all([getCurrentUser(), getCurrentTenant()]);
  useTenantStore.getState().setCurrentTenant(tenantRes.data);
  return userRes.data;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  token: storedToken(),
  user: null,
  initialized: false,
  loading: false,
  error: null,
  fetchMe: async () => {
    const token = get().token ?? storedToken();
    if (!token) {
      useTenantStore.getState().resetTenant();
      set({ token: null, user: null, initialized: true, loading: false });
      return null;
    }

    set({ loading: true, error: null, token });
    try {
      const user = await loadSession();
      set({ user, initialized: true, loading: false, error: null });
      return user;
    } catch (error) {
      logger.error('Failed to restore authenticated session', error);
      persistToken(null);
      useTenantStore.getState().resetTenant();
      set({ token: null, user: null, initialized: true, loading: false, error: null });
      return null;
    }
  },
  login: async (payload: LoginPayload) => {
    set({ loading: true, error: null });
    try {
      const res = await loginRequest(payload);
      persistToken(res.data.token);
      set({ token: res.data.token });
      const user = await loadSession();
      set({ user, initialized: true, loading: false, error: null });
      return user;
    } catch (error) {
      const message = messageFromError(error, '登录失败，请重试');
      set({ loading: false, error: message });
      throw new Error(message);
    }
  },
  register: async (payload: RegisterPayload) => {
    set({ loading: true, error: null });
    try {
      const res = await registerRequest(payload);
      persistToken(res.data.token);
      set({ token: res.data.token });
      const user = await loadSession();
      set({ user, initialized: true, loading: false, error: null });
      return user;
    } catch (error) {
      const message = messageFromError(error, '注册失败，请重试');
      set({ loading: false, error: message });
      throw new Error(message);
    }
  },
  logout: () => {
    persistToken(null);
    useTenantStore.getState().resetTenant();
    set({ token: null, user: null, initialized: true, loading: false, error: null });
  },
  clearError: () => set({ error: null }),
}));
