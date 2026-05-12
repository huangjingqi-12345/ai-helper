import { AlertTriangle } from 'lucide-react';
import { Button } from './Button';

interface ErrorStateProps {
  message?: string;
  onRetry?: () => void;
}

export function ErrorState({
  message = '数据加载失败，请稍后重试',
  onRetry,
}: ErrorStateProps): JSX.Element {
  return (
    <div className="flex flex-col items-center justify-center py-16 gap-4">
      <AlertTriangle size={48} className="text-accent-red" />
      <p className="text-sm text-text-secondary">{message}</p>
      {onRetry && (
        <Button variant="secondary" onClick={onRetry}>
          重试
        </Button>
      )}
    </div>
  );
}
