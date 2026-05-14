import { ArrowDownRight, ArrowUpRight } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { clsx } from 'clsx';

interface KpiCardProps {
  label: string;
  value: string | number;
  unit?: string;
  delta?: { value: number; suffix?: string };
  icon?: LucideIcon;
  hint?: string;
  className?: string;
}

export function KpiCard({ label, value, unit, delta, icon: Icon, hint, className }: KpiCardProps): JSX.Element {
  const isUp = (delta?.value ?? 0) >= 0;
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
      {delta && (
        <div className="mt-2 flex items-center gap-1.5 text-[11.5px]">
          <span
            className={clsx(
              'inline-flex items-center gap-0.5 rounded-sm px-1.5 py-0.5 font-medium tabular',
              isUp
                ? 'bg-[oklch(28%_.08_165_/.35)] text-[oklch(80%_.16_165)]'
                : 'bg-[oklch(28%_.08_25_/.35)] text-[oklch(80%_.18_25)]',
            )}
          >
            {isUp ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
            {Math.abs(delta.value)}
            {delta.suffix ?? '%'}
          </span>
          <span className="text-muted-foreground">较上周</span>
        </div>
      )}
    </div>
  );
}
