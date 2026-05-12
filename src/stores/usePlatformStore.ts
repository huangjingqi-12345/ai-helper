import { create } from 'zustand';
import type { User, PlatformSettings } from '@/types';
import { getUsers, updateUser, getSettings, updateSettings } from '@/api/endpoints/platform';
import type { UpdateUserDTO } from '@/types';
import { logger } from '@/utils/logger';

interface PlatformState {
  users: User[];
  totalUsers: number;
  settings: PlatformSettings | null;
  loading: boolean;
  error: string | null;
  fetchUsers: () => Promise<void>;
  updateUser: (id: string, data: UpdateUserDTO) => Promise<void>;
  fetchSettings: () => Promise<void>;
  updateSettings: (data: Partial<PlatformSettings>) => Promise<void>;
}

export const usePlatformStore = create<PlatformState>((set, get) => ({
  users: [],
  totalUsers: 0,
  settings: null,
  loading: false,
  error: null,

  fetchUsers: async () => {
    set({ loading: true, error: null });
    try {
      const res = await getUsers();
      set({ users: res.data, totalUsers: res.pagination.total });
      logger.feature('Platform users loaded', { count: res.data.length });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load users';
      set({ error: message });
      logger.error('Failed to load users', err);
    } finally {
      set({ loading: false });
    }
  },

  updateUser: async (id, data) => {
    set({ loading: true, error: null });
    try {
      await updateUser(id, data);
      logger.action('User updated', { id, ...data });
      await get().fetchUsers();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to update user';
      set({ error: message, loading: false });
      logger.error('Failed to update user', err);
    }
  },

  fetchSettings: async () => {
    set({ loading: true, error: null });
    try {
      const res = await getSettings();
      set({ settings: res.data });
      logger.feature('Platform settings loaded');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load settings';
      set({ error: message });
      logger.error('Failed to load settings', err);
    } finally {
      set({ loading: false });
    }
  },

  updateSettings: async (data) => {
    set({ loading: true, error: null });
    try {
      await updateSettings(data);
      logger.action('Settings updated', data as Record<string, unknown>);
      await get().fetchSettings();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to update settings';
      set({ error: message, loading: false });
      logger.error('Failed to update settings', err);
    }
  },
}));
