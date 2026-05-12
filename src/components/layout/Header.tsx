import { useLocation } from 'react-router-dom';
import { Search, Bell, ChevronDown } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { NAV_ITEMS, APP_VERSION } from '@/utils/constants';

export function Header(): JSX.Element {
  const location = useLocation();
  const currentNav = NAV_ITEMS.find((item) => item.path === location.pathname);
  const pageLabel = currentNav?.label || '总览';

  return (
    <header className="h-header bg-bg-secondary border-b border-border flex items-center justify-between px-6 shrink-0">
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-md bg-accent-blue flex items-center justify-center">
            <span className="text-white font-mono text-xs font-bold">Px</span>
          </div>
          <span className="font-mono font-bold text-text-primary text-sm">Px Lite</span>
          <span className="text-xs text-text-muted">极简版 · 行为洞察</span>
        </div>
        <div className="text-text-muted text-xs">|</div>
        <div className="text-xs text-text-secondary">
          <span className="text-text-muted">Px Lite</span>
          <span className="text-text-muted mx-1">/</span>
          <span className="text-text-primary">{pageLabel}</span>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <button className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-bg-tertiary text-text-secondary text-xs hover:text-text-primary transition-colors">
          Px Ops <ChevronDown size={12} />
        </button>
        <button className="p-2 rounded-lg hover:bg-bg-tertiary text-text-muted hover:text-text-primary transition-colors">
          <Search size={16} />
        </button>
        <button className="p-2 rounded-lg hover:bg-bg-tertiary text-text-muted hover:text-text-primary transition-colors relative">
          <Bell size={16} />
          <span className="absolute top-1.5 right-1.5 w-1.5 h-1.5 bg-accent-red rounded-full" />
        </button>
        <Badge color="purple" className="text-[10px]">{APP_VERSION}</Badge>
      </div>
    </header>
  );
}
