import { create } from 'zustand';
import type { Content, ContentFilter, ContentRequestProject } from '@/types';
import {
  getContentList,
  getContentById,
  createContent,
  updateContent,
  deleteContent,
  getContentRequestProjects,
  submitContentRequest,
} from '@/api/endpoints/content';
import type { CreateContentDTO, SubmitContentRequestDTO, UpdateContentDTO } from '@/types';
import { logger } from '@/utils/logger';

interface ContentState {
  items: Content[];
  selectedItem: Content | null;
  requestProjects: ContentRequestProject[];
  total: number;
  loading: boolean;
  error: string | null;
  filter: ContentFilter;
  setFilter: (filter: Partial<ContentFilter>) => void;
  fetchList: () => Promise<void>;
  fetchById: (id: string) => Promise<void>;
  fetchRequestProjects: () => Promise<void>;
  create: (data: CreateContentDTO) => Promise<void>;
  submitRequest: (data: SubmitContentRequestDTO) => Promise<Content>;
  update: (id: string, data: UpdateContentDTO) => Promise<void>;
  remove: (id: string) => Promise<void>;
  clearSelected: () => void;
}

export const useContentStore = create<ContentState>((set, get) => ({
  items: [],
  selectedItem: null,
  requestProjects: [],
  total: 0,
  loading: false,
  error: null,
  filter: { page: 1, pageSize: 20 },

  setFilter: (filter) => {
    set((state) => ({ filter: { ...state.filter, ...filter } }));
    get().fetchList();
  },

  fetchList: async () => {
    set({ loading: true, error: null });
    try {
      const res = await getContentList(get().filter);
      set({ items: res.data, total: res.pagination.total });
      logger.feature('Content list loaded', { count: res.data.length, total: res.pagination.total });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load content';
      set({ error: message });
      logger.error('Failed to load content list', err);
    } finally {
      set({ loading: false });
    }
  },

  fetchById: async (id) => {
    set({ loading: true, error: null });
    try {
      const res = await getContentById(id);
      set({ selectedItem: res.data });
      logger.feature('Content detail loaded', { id });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load content';
      set({ error: message });
      logger.error('Failed to load content detail', err);
    } finally {
      set({ loading: false });
    }
  },

  fetchRequestProjects: async () => {
    try {
      const res = await getContentRequestProjects();
      set({ requestProjects: res.data });
      logger.feature('Content request projects loaded', { count: res.data.length });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load content request projects';
      set({ error: message });
      logger.error('Failed to load content request projects', err);
    }
  },

  create: async (data) => {
    set({ loading: true, error: null });
    try {
      await createContent(data);
      logger.action('Content created', { title: data.title });
      await get().fetchList();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to create content';
      set({ error: message, loading: false });
      logger.error('Failed to create content', err);
    }
  },

  submitRequest: async (data) => {
    set({ loading: true, error: null });
    try {
      const res = await submitContentRequest(data);
      logger.action('Content request submitted', { requestName: data.requestName, contentId: res.data.content.id });
      await get().fetchList();
      return res.data.content;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to submit content request';
      set({ error: message, loading: false });
      logger.error('Failed to submit content request', err);
      throw err;
    }
  },

  update: async (id, data) => {
    set({ loading: true, error: null });
    try {
      await updateContent(id, data);
      logger.action('Content updated', { id, ...data });
      await get().fetchList();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to update content';
      set({ error: message, loading: false });
      logger.error('Failed to update content', err);
    }
  },

  remove: async (id) => {
    set({ loading: true, error: null });
    try {
      await deleteContent(id);
      logger.action('Content deleted', { id });
      await get().fetchList();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to delete content';
      set({ error: message, loading: false });
      logger.error('Failed to delete content', err);
    }
  },

  clearSelected: () => set({ selectedItem: null }),
}));
