import { useLocation, useNavigate } from 'react-router-dom';
import { LayoutDashboard, FileText, Eye, Send, CheckCircle, Settings } from 'lucide-react';
import { clsx } from 'clsx';
import { NAV_ITEMS, PAGE_DESCRIPTIONS } from '@/utils/constants';
import { useLogger } from '@/hooks/useLogger';

const iconMap: Record<string, React.ReactNode> = {
  LayoutDashboard: <LayoutDashboard size={18} />,
  FileText: <FileText size={18} />,
  Eye: <Eye size={18} />,
  Send: <Send size={18} />,
  CheckCircle: <CheckCircle size={18} />,
  Settings: <Settings size={18} />,
};

export function Sidebar(): JSX.Element {
  const location = useLocation();
  const navigate = useNavigate();
  const { log } = useLogger('Sidebar');

  const activeKey = NAV_ITEMS.find((item) => item.path === location.pathname)?.key || 'overview';

  const handleNavClick = (path: string, label: string): void => {
    log.nav(`Navigate to ${label}`, { path });
    navigate(path);
  };

  return (
    <aside className="w-sidebar h-[calc(100vh-theme(spacing.header))] bg-bg-secondary border-r border-border flex flex-col overflow-y-auto">
      <div className="px-4 py-4">
        <h3 className="text-[10px] uppercase tracking-widest text-text-muted font-medium mb-3">主菜单</h3>
        <nav className="flex flex-col gap-1">
          {NAV_ITEMS.map((item) => (
            <button
              key={item.key}
              onClick={() => handleNavClick(item.path, item.label)}
              className={clsx(
                'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors duration-150 text-left w-full',
                activeKey === item.key
                  ? 'bg-accent-blue/10 text-accent-blue border-l-2 border-accent-blue'
                  : 'text-text-secondary hover:bg-bg-tertiary hover:text-text-primary'
              )}
            >
              {iconMap[item.icon]}
              <span>{item.label}</span>
            </button>
          ))}
        </nav>
      </div>

      <div className="px-4 py-4 border-t border-border mt-2">
        <h3 className="text-[10px] uppercase tracking-widest text-text-muted font-medium mb-2">说明</h3>
        <p className="text-xs text-text-muted leading-relaxed">
          {PAGE_DESCRIPTIONS[activeKey] || ''}
        </p>
      </div>

      <div className="mt-auto px-4 py-4 border-t border-border">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-accent-blue/20 flex items-center justify-center text-accent-blue text-xs font-bold">
            管
          </div>
          <div>
            <div className="text-sm text-text-primary">系统管理员</div>
            <div className="text-xs text-text-muted">华东区域 · admin</div>
          </div>
        </div>
      </div>
    </aside>
  );
}
