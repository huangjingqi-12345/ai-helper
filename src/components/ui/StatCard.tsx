import { Card } from './Card';
import { formatNumber } from '@/utils/formatters';
import type { ReactNode } from 'react';

interface StatCardProps {
  label: string;
  value: number | string;
  icon?: ReactNode;
  trend?: { value: number; positive: boolean };
  formatValue?: boolean;
}

export function StatCard({ label, value, icon, trend, formatValue = true }: StatCardProps): JSX.Element {
  const displayValue = typeof value === 'number' && formatValue ? formatNumber(value) : value;

  return (
    <Card className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <span className="text-xs text-text-secondary">{label}</span>
        {icon && <span className="text-text-muted">{icon}</span>}
      </div>
      <div className="font-mono text-kpi text-text-primary">{displayValue}</div>
      {trend && (
        <div className="flex items-center gap-1 text-xs">
          <span className={trend.positive ? 'text-accent-green' : 'text-accent-red'}>
            {trend.positive ? '↑' : '↓'} {Math.abs(trend.value)}%
          </span>
          <span className="text-text-muted">vs 上月</span>
        </div>
      )}
    </Card>
  );
}
