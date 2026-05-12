import { create } from 'zustand';
import type { ApprovalItem } from '@/types';
import { getApprovalQueue, approveContent, rejectContent } from '@/api/endpoints/approval';
import { logger } from '@/utils/logger';

interface ApprovalState {
  items: ApprovalItem[];
  total: number;
  loading: boolean;
  error: string | null;
  fetchQueue: (status?: string) => Promise<void>;
  approve: (id: string, comments?: string) => Promise<void>;
  reject: (id: string, comments: string) => Promise<void>;
}

export const useApprovalStore = create<ApprovalState>((set, get) => ({
  items: [],
  total: 0,
  loading: false,
  error: null,

  fetchQueue: async (status) => {
    set({ loading: true, error: null });
    try {
      const res = await getApprovalQueue(status ? { status } : undefined);
      set({ items: res.data, total: res.pagination.total });
      logger.feature('Approval queue loaded', { count: res.data.length });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load approval queue';
      set({ error: message });
      logger.error('Failed to load approval queue', err);
    } finally {
      set({ loading: false });
    }
  },

  approve: async (id, comments) => {
    set({ loading: true, error: null });
    try {
      await approveContent(id, comments);
      logger.action('Content approved', { id, comments });
      await get().fetchQueue();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to approve';
      set({ error: message, loading: false });
      logger.error('Failed to approve content', err);
    }
  },

  reject: async (id, comments) => {
    set({ loading: true, error: null });
    try {
      await rejectContent(id, comments);
      logger.action('Content rejected', { id, comments });
      await get().fetchQueue();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to reject';
      set({ error: message, loading: false });
      logger.error('Failed to reject content', err);
    }
  },
}));
