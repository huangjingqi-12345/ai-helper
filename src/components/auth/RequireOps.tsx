import { Navigate } from 'react-router-dom';
import type { ReactNode } from 'react';
import { useTenantStore } from '@/stores/useTenantStore';

interface RequireOpsProps {
  children: ReactNode;
}

export function RequireOps({ children }: RequireOpsProps): JSX.Element {
  const { isOps } = useTenantStore();
  if (!isOps) return <Navigate to="/" replace />;
  return <>{children}</>;
}
