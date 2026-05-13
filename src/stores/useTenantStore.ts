import { create } from 'zustand';
import { getTenantOptions } from '@/api/endpoints/platform';
import { logger } from '@/utils/logger';

export type TenantType = 'ops' | 'pharma';

export interface TenantOption {
  id: string;
  shortName: string;
  name: string;
  type: TenantType;
}

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
  setTenant: (id: string) => void;
}

const storageKey = 'pxlite.currentTenantId';
const fallbackTenant = TENANTS[0]!;

function pickInitialTenant(tenants: TenantOption[]): TenantOption {
  if (typeof window === 'undefined') return tenants[0] ?? fallbackTenant;
  const saved = window.localStorage.getItem(storageKey);
  return tenants.find((tenant) => tenant.id === saved) ?? tenants[0] ?? fallbackTenant;
}

export const useTenantStore = create<TenantState>((set, get) => {
  const initialTenant = pickInitialTenant(TENANTS);
  return {
    tenants: TENANTS,
    currentTenantId: initialTenant.id,
    currentTenant: initialTenant,
    isOps: initialTenant.type === 'ops',
    loading: false,
    fetchTenants: async () => {
      set({ loading: true });
      try {
        const res = await getTenantOptions();
        const tenants = res.data.length > 0 ? res.data : TENANTS;
        const selected = tenants.find((tenant) => tenant.id === get().currentTenantId) ?? pickInitialTenant(tenants);
        set({ tenants, currentTenantId: selected.id, currentTenant: selected, isOps: selected.type === 'ops' });
      } catch (error) {
        logger.error('Failed to load tenants from DB, using fallback tenants', error);
      } finally {
        set({ loading: false });
      }
    },
    setTenant: (id: string) => {
      const tenant = get().tenants.find((item) => item.id === id) ?? get().tenants[0] ?? fallbackTenant;
      if (typeof window !== 'undefined') window.localStorage.setItem(storageKey, tenant.id);
      set({ currentTenantId: tenant.id, currentTenant: tenant, isOps: tenant.type === 'ops' });
    },
  };
});
