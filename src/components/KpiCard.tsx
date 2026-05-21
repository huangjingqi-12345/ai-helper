import type { LucideIcon } from 'lucide-react';
import { clsx } from 'clsx';

interface KpiCardProps {
  label: string;
  value: string | number;
  unit?: string;
  icon?: LucideIcon;
  hint?: string;
  className?: string;
}

export function KpiCard({ label, value, unit, icon: Icon, hint, className }: KpiCardProps): JSX.Element {
  return (
    <div className={clsx('kpi-card', className)}>
      <div className="flex items-start justify-between">
        <div>
          <div className="text-[12px] font-medium uppercase tracking-[0.12em] text-muted-foreground">{label}</div>
          {hint && <div className="mt-0.5 text-[11px] text-muted-foreground/70">{hint}</div>}
        </div>
        {Icon && (
          <div className="grid h-8 w-8 place-items-center rounded-md bg-[oklch(28%_.04_200_/.35)] text-primary">
            <Icon className="h-[15px] w-[15px]" />
          </div>
        )}
      </div>
      <div className="mt-3 flex items-end gap-2">
        <div className="tabular text-[28px] font-semibold leading-none tracking-tight">{value}</div>
        {unit && <div className="pb-1 text-[12px] text-muted-foreground">{unit}</div>}
      </div>
    </div>
  );
}
