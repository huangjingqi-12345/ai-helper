import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
import type { InputHTMLAttributes } from 'react';

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
}

export function Input({ label, error, className, id, ...props }: InputProps): JSX.Element {
  const inputId = id || label?.replace(/\s+/g, '-').toLowerCase();

  return (
    <div className="flex flex-col gap-1.5">
      {label && (
        <label htmlFor={inputId} className="text-sm text-text-secondary">
          {label}
        </label>
      )}
      <input
        id={inputId}
        className={twMerge(
          clsx(
            'bg-bg-secondary border border-border rounded-lg px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent-blue transition-colors',
            error && 'border-accent-red',
            className
          )
        )}
        {...props}
      />
      {error && <span className="text-xs text-accent-red">{error}</span>}
    </div>
  );
}
