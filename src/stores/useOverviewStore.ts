import { create } from 'zustand';
import type { OverviewStats, Project } from '@/types';
import { getOverviewStats, getOverviewProjects } from '@/api/endpoints/overview';
import { logger } from '@/utils/logger';

interface OverviewState {
  stats: OverviewStats | null;
  projects: Project[];
  loading: boolean;
  error: string | null;
  fetchStats: () => Promise<void>;
  fetchProjects: () => Promise<void>;
  fetchAll: () => Promise<void>;
}

export const useOverviewStore = create<OverviewState>((set) => ({
  stats: null,
  projects: [],
  loading: false,
  error: null,

  fetchStats: async () => {
    try {
      const res = await getOverviewStats();
      set({ stats: res.data });
      logger.feature('Overview stats loaded', { stats: res.data as unknown as Record<string, unknown> });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load stats';
      set({ error: message });
      logger.error('Failed to load overview stats', err);
    }
  },

  fetchProjects: async () => {
    try {
      const res = await getOverviewProjects();
      set({ projects: res.data });
      logger.feature('Overview projects loaded', { count: res.data.length });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load projects';
      set({ error: message });
      logger.error('Failed to load overview projects', err);
    }
  },

  fetchAll: async () => {
    set({ loading: true, error: null });
    const store = useOverviewStore.getState();
    await Promise.all([store.fetchStats(), store.fetchProjects()]);
    set({ loading: false });
  },
}));
