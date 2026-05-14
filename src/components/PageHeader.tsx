import { clsx } from 'clsx';
import type { ReactNode } from 'react';

interface PageHeaderProps {
  eyebrow?: string;
  title: string;
  subtitle?: string;
  meta?: ReactNode;
  actions?: ReactNode;
  className?: string;
}

export function PageHeader({ eyebrow, title, subtitle, meta, actions, className }: PageHeaderProps): JSX.Element {
  return (
    <div
      className={clsx(
        'relative overflow-hidden rounded-xl border border-border bg-[oklch(19%_.025_260)] px-6 py-5',
        className,
      )}
    >
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-[oklch(70%_.15_200_/.4)] to-transparent" />
      <div className="pointer-events-none absolute -right-24 -top-24 h-64 w-64 rounded-full bg-[oklch(70%_.15_200_/.05)] blur-3xl" />

      <div className="relative flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          {eyebrow && (
            <div className="mb-1.5 inline-flex items-center gap-1.5 rounded border border-[oklch(70%_.15_200_/.3)] bg-[oklch(70%_.15_200_/.1)] px-2 py-0.5 text-[10.5px] font-medium uppercase tracking-[0.14em] text-primary">
              {eyebrow}
            </div>
          )}
          <h1 className="text-[22px] font-semibold tracking-tight text-foreground">{title}</h1>
          {subtitle && <p className="mt-1 max-w-2xl text-[13px] leading-relaxed text-muted-foreground">{subtitle}</p>}
          {meta && <div className="mt-3 flex flex-wrap items-center gap-2">{meta}</div>}
        </div>
        {actions && <div className="flex items-center gap-2">{actions}</div>}
      </div>
    </div>
  );
}
