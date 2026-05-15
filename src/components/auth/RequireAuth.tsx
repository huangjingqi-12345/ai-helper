import { useEffect } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import type { ReactNode } from 'react';
import { Loader2 } from 'lucide-react';
import { useAuthStore } from '@/stores/useAuthStore';

interface RequireAuthProps {
  children: ReactNode;
}

export function RequireAuth({ children }: RequireAuthProps): JSX.Element {
  const location = useLocation();
  const { user, initialized, loading, fetchMe } = useAuthStore();

  useEffect(() => {
    if (!initialized) void fetchMe();
  }, [fetchMe, initialized]);

  if (!initialized || loading) {
    return (
      <div className="grid h-screen w-screen place-items-center bg-background text-foreground">
        <div className="flex items-center gap-3 rounded-xl border border-border bg-card px-5 py-4 text-sm text-muted-foreground shadow-lg">
          <Loader2 className="h-4 w-4 animate-spin text-primary" />
          正在校验登录状态…
        </div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  return <>{children}</>;
}
