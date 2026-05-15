import { create } from 'zustand';
import { getTenantOptions } from '@/api/endpoints/platform';
import { getCurrentTenant } from '@/api/endpoints/auth';
import { logger } from '@/utils/logger';

export type TenantType = 'ops' | 'pharma';

export interface TenantOption {
  id: string;
  shortName: string;
  name: string;
  type: TenantType;
}

// DEMO FALLBACK: 生产环境应仅从 API 获取租户列表，此 fallback 仅用于 API 不可用时的 demo 展示
export const TENANTS: TenantOption[] = [
  { id: 'T-PX', shortName: 'Px Ops', name: 'Px 自营运营组', type: 'ops' },
  { id: 'T-NV', shortName: '诺华', name: '诺华制药（中国）', type: 'pharma' },
  { id: 'T-AZ', shortName: '阿斯利康', name: '阿斯利康（中国）', type: 'pharma' },
  { id: 'T-MSD', shortName: '默沙东', name: '默沙东（中国）', type: 'pharma' },
  { id: 'T-RC', shortName: '罗氏', name: '罗氏制药', type: 'pharma' },
  { id: 'T-LL', shortName: '礼来', name: '礼来制药', type: 'pharma' },
];

interface TenantState {
  tenants: TenantOption[];
  currentTenantId: string;
  currentTenant: TenantOption;
  isOps: boolean;
  loading: boolean;
  fetchTenants: () => Promise<void>;
  fetchCurrentTenant: () => Promise<void>;
  setCurrentTenant: (tenant: TenantOption) => void;
  setTenant: (id: string) => void;
  resetTenant: () => void;
}

const fallbackTenant = TENANTS[0]!;

function applyTenant(tenant: TenantOption): Pick<TenantState, 'currentTenantId' | 'currentTenant' | 'isOps'> {
  return { currentTenantId: tenant.id, currentTenant: tenant, isOps: tenant.type === 'ops' };
}

export const useTenantStore = create<TenantState>((set, get) => ({
  tenants: TENANTS,
  currentTenantId: fallbackTenant.id,
  currentTenant: fallbackTenant,
  isOps: true,
  loading: false,
  fetchTenants: async () => {
    set({ loading: true });
    try {
      const res = await getTenantOptions();
      const tenants = res.data.length > 0 ? res.data : TENANTS;
      const selected = tenants.find((tenant) => tenant.id === get().currentTenantId) ?? tenants[0] ?? fallbackTenant;
      set({ tenants, ...applyTenant(selected) });
    } catch (error) {
      logger.error('Failed to load tenant options from DB, using existing tenant list', error);
    } finally {
      set({ loading: false });
    }
  },
  fetchCurrentTenant: async () => {
    set({ loading: true });
    try {
      const res = await getCurrentTenant();
      set((state) => ({
        tenants: state.tenants.some((tenant) => tenant.id === res.data.id) ? state.tenants : [res.data, ...state.tenants],
        ...applyTenant(res.data),
      }));
    } catch (error) {
      logger.error('Failed to load authenticated tenant context', error);
      throw error;
    } finally {
      set({ loading: false });
    }
  },
  setCurrentTenant: (tenant: TenantOption) => {
    set((state) => ({
      tenants: state.tenants.some((item) => item.id === tenant.id) ? state.tenants : [tenant, ...state.tenants],
      ...applyTenant(tenant),
    }));
  },
  setTenant: (id: string) => {
    const tenant = get().tenants.find((item) => item.id === id) ?? get().currentTenant ?? fallbackTenant;
    set(applyTenant(tenant));
  },
  resetTenant: () => set({ tenants: TENANTS, ...applyTenant(fallbackTenant) }),
}));
