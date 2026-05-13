import { create } from 'zustand';

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
  currentTenantId: string;
  currentTenant: TenantOption;
  isOps: boolean;
  setTenant: (id: string) => void;
}

const storageKey = 'pxlite.currentTenantId';
const getInitialTenant = (): TenantOption => {
  if (typeof window === 'undefined') return TENANTS[0]!;
  const saved = window.localStorage.getItem(storageKey);
  return TENANTS.find((tenant) => tenant.id === saved) ?? TENANTS[0]!;
};

export const useTenantStore = create<TenantState>((set) => {
  const initialTenant = getInitialTenant();
  return {
    currentTenantId: initialTenant.id,
    currentTenant: initialTenant,
    isOps: initialTenant.type === 'ops',
    setTenant: (id: string) => {
      const tenant = TENANTS.find((item) => item.id === id) ?? TENANTS[0]!;
      if (typeof window !== 'undefined') window.localStorage.setItem(storageKey, tenant.id);
      set({ currentTenantId: tenant.id, currentTenant: tenant, isOps: tenant.type === 'ops' });
    },
  };
});
