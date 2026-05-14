import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
import type { ButtonHTMLAttributes, ReactNode } from 'react';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  children: ReactNode;
}

const variantStyles = {
  primary: 'bg-accent-blue/15 hover:bg-accent-blue/25 text-accent-blue border border-accent-blue/45 shadow-[0_0_22px_rgba(8,212,232,0.14)]',
  secondary: 'bg-bg-tertiary/85 hover:bg-bg-tertiary text-text-primary border border-border hover:border-accent-blue/60',
  ghost: 'bg-transparent hover:bg-accent-blue/10 text-text-secondary hover:text-text-primary',
  danger: 'bg-accent-red hover:bg-accent-red/80 text-white',
};

const sizeStyles = {
  sm: 'px-3 py-1.5 text-xs',
  md: 'px-4 py-2 text-sm',
  lg: 'px-6 py-3 text-base',
};

export function Button({
  variant = 'primary',
  size = 'md',
  className,
  children,
  ...props
}: ButtonProps): JSX.Element {
  return (
    <button
      className={twMerge(
        clsx(
          'inline-flex items-center justify-center gap-2 rounded-lg font-medium transition-colors duration-150 disabled:opacity-50 disabled:cursor-not-allowed',
          variantStyles[variant],
          sizeStyles[size],
          className
        )
      )}
      {...props}
    >
      {children}
    </button>
  );
}
