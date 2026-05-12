import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

interface SkeletonProps {
  className?: string;
  width?: string;
  height?: string;
}

export function Skeleton({ className, width, height }: SkeletonProps): JSX.Element {
  return (
    <div
      className={twMerge(clsx('skeleton', className))}
      style={{ width, height }}
    />
  );
}
