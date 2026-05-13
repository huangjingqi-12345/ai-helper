import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

interface BadgeProps {
  children: React.ReactNode;
  color?: 'blue' | 'green' | 'yellow' | 'red' | 'purple' | 'gray';
  className?: string;
}

const colorStyles = {
  blue: 'bg-accent-blue/15 text-accent-blue border-accent-blue/35',
  green: 'bg-accent-green/15 text-accent-green border-accent-green/30',
  yellow: 'bg-accent-yellow/15 text-accent-yellow border-accent-yellow/30',
  red: 'bg-accent-red/15 text-accent-red border-accent-red/30',
  purple: 'bg-accent-purple/18 text-[#DCC8FF] border-accent-purple/40',
  gray: 'bg-text-muted/15 text-text-secondary border-text-muted/30',
};

export function Badge({ children, color = 'blue', className }: BadgeProps): JSX.Element {
  return (
    <span
      className={twMerge(
        clsx(
          'inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium border',
          colorStyles[color],
          className
        )
      )}
    >
      {children}
    </span>
  );
}
