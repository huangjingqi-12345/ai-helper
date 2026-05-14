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
          'bg-bg-card/95 border border-border rounded-card p-5 shadow-[0_18px_50px_rgba(0,0,0,0.18)]',
          hoverable && 'hover:border-accent-blue/60 transition-colors duration-200 cursor-pointer',
          className
        )
      )}
      {...props}
    >
      {children}
    </div>
  );
}
