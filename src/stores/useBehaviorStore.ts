import { create } from 'zustand';
import type { BehaviorSummary } from '@/types';
import { getBehaviorSummary } from '@/api/endpoints/behavior';
import { logger } from '@/utils/logger';

interface BehaviorState {
  summary: BehaviorSummary | null;
  loading: boolean;
  error: string | null;
  fetchSummary: () => Promise<void>;
}

export const useBehaviorStore = create<BehaviorState>((set) => ({
  summary: null,
  loading: false,
  error: null,

  fetchSummary: async () => {
    set({ loading: true, error: null });
    try {
      const res = await getBehaviorSummary();
      set({ summary: res.data });
      logger.feature('Behavior summary loaded');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load behavior data';
      set({ error: message });
      logger.error('Failed to load behavior summary', err);
    } finally {
      set({ loading: false });
    }
  },
}));
