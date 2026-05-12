import { Inbox } from 'lucide-react';
import { Button } from './Button';
import type { ReactNode } from 'react';

interface EmptyStateProps {
  icon?: ReactNode;
  title?: string;
  description?: string;
  action?: { label: string; onClick: () => void };
}

export function EmptyState({
  icon,
  title = '暂无数据',
  description,
  action,
}: EmptyStateProps): JSX.Element {
  return (
    <div className="flex flex-col items-center justify-center py-16 gap-4">
      <div className="text-text-muted">
        {icon || <Inbox size={48} />}
      </div>
      <h3 className="text-lg font-medium text-text-secondary">{title}</h3>
      {description && <p className="text-sm text-text-muted max-w-md text-center">{description}</p>}
      {action && (
        <Button variant="secondary" onClick={action.onClick}>
          {action.label}
        </Button>
      )}
    </div>
  );
}
