import { useEffect, useState } from 'react';
import { CheckCircle, AlertTriangle, Info, X } from 'lucide-react';
import { clsx } from 'clsx';

type ToastType = 'success' | 'error' | 'warning' | 'info';

interface ToastItem {
  id: string;
  type: ToastType;
  message: string;
}

const icons = {
  success: <CheckCircle size={16} className="text-accent-green" />,
  error: <AlertTriangle size={16} className="text-accent-red" />,
  warning: <AlertTriangle size={16} className="text-accent-yellow" />,
  info: <Info size={16} className="text-accent-blue" />,
};

// Global toast state
let toastListeners: ((toasts: ToastItem[]) => void)[] = [];
let toasts: ToastItem[] = [];

function notifyListeners(): void {
  toastListeners.forEach((listener) => listener([...toasts]));
}

function isToastType(value: string): value is ToastType {
  return ['success', 'error', 'warning', 'info'].includes(value);
}

export function showToast(type: ToastType, message: string): void;
export function showToast(message: string, type?: ToastType): void;
export function showToast(first: ToastType | string, second = 'info'): void {
  const type = isToastType(first) ? first : isToastType(second) ? second : 'info';
  const message = isToastType(first) ? second : first;
  const id = Date.now().toString();
  toasts = [...toasts, { id, type, message }];
  notifyListeners();
  setTimeout(() => {
    toasts = toasts.filter((t) => t.id !== id);
    notifyListeners();
  }, 4000);
}

export function ToastContainer(): JSX.Element {
  const [items, setItems] = useState<ToastItem[]>([]);

  useEffect(() => {
    toastListeners.push(setItems);
    return () => {
      toastListeners = toastListeners.filter((l) => l !== setItems);
    };
  }, []);

  const removeToast = (id: string): void => {
    toasts = toasts.filter((t) => t.id !== id);
    notifyListeners();
  };

  return (
    <div className="fixed top-4 right-4 z-[100] flex flex-col gap-2">
      {items.map((toast) => (
        <div
          key={toast.id}
          className={clsx(
            'flex items-center gap-3 px-4 py-3 rounded-lg border bg-bg-secondary shadow-lg min-w-[300px] animate-in slide-in-from-right duration-300',
            'border-border'
          )}
        >
          {icons[toast.type]}
          <span className="text-sm text-text-primary flex-1">{toast.message}</span>
          <button onClick={() => removeToast(toast.id)} className="text-text-muted hover:text-text-primary">
            <X size={14} />
          </button>
        </div>
      ))}
    </div>
  );
}
