import { useMemo } from 'react';
import { createLogger } from '@/utils/logger';

export function useLogger(page: string) {
  const log = useMemo(() => createLogger(page), [page]);
  return { log };
}
