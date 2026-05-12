import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
import type { SelectHTMLAttributes } from 'react';

interface SelectOption {
  value: string;
  label: string;
}

interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  options: SelectOption[];
  placeholder?: string;
}

export function Select({ label, options, placeholder, className, id, ...props }: SelectProps): JSX.Element {
  const selectId = id || label?.replace(/\s+/g, '-').toLowerCase();

  return (
    <div className="flex flex-col gap-1.5">
      {label && (
        <label htmlFor={selectId} className="text-sm text-text-secondary">
          {label}
        </label>
      )}
      <select
        id={selectId}
        className={twMerge(
          clsx(
            'bg-bg-secondary border border-border rounded-lg px-3 py-2 text-sm text-text-primary focus:outline-none focus:border-accent-blue transition-colors appearance-none cursor-pointer',
            className
          )
        )}
        {...props}
      >
        {placeholder && (
          <option value="" className="text-text-muted">
            {placeholder}
          </option>
        )}
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    </div>
  );
}
