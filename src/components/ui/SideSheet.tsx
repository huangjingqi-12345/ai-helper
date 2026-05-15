import { useEffect, type ReactNode } from 'react';
import { X } from 'lucide-react';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

interface SideSheetProps {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  widthClass?: string;
  className?: string;
  showClose?: boolean;
}

export function SideSheet({
  open,
  onClose,
  children,
  widthClass = 'w-[560px]',
  className,
  showClose = true,
}: SideSheetProps): JSX.Element | null {
  useEffect(() => {
    if (open) document.body.style.overflow = 'hidden';
    else document.body.style.overflow = '';

    return () => {
      document.body.style.overflow = '';
    };
  }, [open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <aside
        className={twMerge(
          clsx(
            'absolute right-0 top-0 flex h-full max-w-full flex-col overflow-hidden border-l border-border bg-background shadow-2xl',
            widthClass,
            className,
          ),
        )}
      >
        {showClose && (
          <button
            aria-label="Close"
            onClick={onClose}
            className="absolute right-4 top-4 z-10 grid h-8 w-8 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-secondary/50 hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        )}
        {children}
      </aside>
    </div>
  );
}
