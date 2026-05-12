import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
import type { ReactNode, HTMLAttributes } from 'react';

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
  className?: string;
  hoverable?: boolean;
}

export function Card({ children, className, hoverable = false, ...props }: CardProps): JSX.Element {
  return (
    <div
      className={twMerge(
        clsx(
          'bg-bg-card border border-border rounded-card p-5',
          hoverable && 'hover:border-border-light transition-colors duration-200 cursor-pointer',
          className
        )
      )}
      {...props}
    >
      {children}
    </div>
  );
}
