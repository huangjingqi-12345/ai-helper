import { create } from 'zustand';
import type { CreateStrategyDTO, DistributionStrategy, StrategyStatus, UpdateStrategyDTO } from '@/types';
import { getStrategies, createStrategy, updateStrategy } from '@/api/endpoints/distribution';
import { logger } from '@/utils/logger';

interface DistributionState {
  strategies: DistributionStrategy[];
  total: number;
  loading: boolean;
  error: string | null;
  fetchStrategies: (status?: StrategyStatus) => Promise<void>;
  createStrategy: (data: CreateStrategyDTO) => Promise<void>;
  updateStrategy: (id: string, data: UpdateStrategyDTO) => Promise<void>;
}

export const useDistributionStore = create<DistributionState>((set, get) => ({
  strategies: [],
  total: 0,
  loading: false,
  error: null,

  fetchStrategies: async (status) => {
    set({ loading: true, error: null });
    try {
      const res = await getStrategies(status ? { status } : undefined);
      set({ strategies: res.data, total: res.pagination.total });
      logger.feature('Distribution strategies loaded', { count: res.data.length });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load strategies';
      set({ error: message });
      logger.error('Failed to load distribution strategies', err);
    } finally {
      set({ loading: false });
    }
  },

  createStrategy: async (data) => {
    set({ loading: true, error: null });
    try {
      await createStrategy(data);
      logger.action('Strategy created', { name: data.name });
      await get().fetchStrategies();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to create strategy';
      set({ error: message, loading: false });
      logger.error('Failed to create strategy', err);
    }
  },

  updateStrategy: async (id, data) => {
    set({ loading: true, error: null });
    try {
      await updateStrategy(id, data);
      logger.action('Strategy updated', { id });
      await get().fetchStrategies();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to update strategy';
      set({ error: message, loading: false });
      logger.error('Failed to update strategy', err);
    }
  },
}));
