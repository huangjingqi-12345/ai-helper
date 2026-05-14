import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { LayoutDashboard, FileText, Eye, Send, CheckCircle, Settings, ChevronDown, Building2, UserCog, GitBranch, FolderKanban, WalletCards, FileSignature, ReceiptText, FileCheck2 } from 'lucide-react';
import { clsx } from 'clsx';
import { useLogger } from '@/hooks/useLogger';
import { useTenantStore } from '@/stores/useTenantStore';
import { showToast } from '@/components/ui/Toast';

const mainNavItems = [
  { key: 'overview', label: '总览', path: '/', icon: 'LayoutDashboard' },
  { key: 'content-workshop', label: '患教内容工坊', path: '/content', icon: 'FileText' },
  { key: 'behavior-insights', label: '患者行为洞察', path: '/audience', icon: 'Eye' },
  { key: 'distribution-strategy', label: '分发策略', path: '/distribute', icon: 'Send' },
  { key: 'approval-center', label: '审批中心', path: '/approvals', icon: 'CheckCircle' },
];

const adminSubItems = [
  { key: 'admin-tenants', label: '租户管理', path: '/admin/tenants', icon: 'Building2' },
  { key: 'admin-accounts', label: '账号管理', path: '/admin/accounts', icon: 'UserCog' },
  { key: 'admin-projects', label: '项目管理', path: '/admin/projects', icon: 'FolderKanban' },
  { key: 'admin-approval-flows', label: '审批流配置', path: '/admin/approval-flows', icon: 'GitBranch' },
];

const financeSubItems = [
  { key: 'finance-overview', label: '业财总览', path: '/finance', icon: 'WalletCards' },
  { key: 'finance-contracts', label: '合同与订阅', path: '/finance/contracts', icon: 'FileSignature' },
  { key: 'finance-billing', label: '账单引擎', path: '/finance/billing', icon: 'ReceiptText' },
  { key: 'finance-invoicing', label: '价值交付与开票', path: '/finance/invoicing', icon: 'FileCheck2' },
];

const iconMap: Record<string, React.ReactNode> = {
  LayoutDashboard: <LayoutDashboard size={18} />,
  FileText: <FileText size={18} />,
  Eye: <Eye size={18} />,
  Send: <Send size={18} />,
  CheckCircle: <CheckCircle size={18} />,
  Settings: <Settings size={18} />,
  Building2: <Building2 size={16} />,
  UserCog: <UserCog size={16} />,
  GitBranch: <GitBranch size={16} />,
  FolderKanban: <FolderKanban size={16} />,
  WalletCards: <WalletCards size={16} />,
  FileSignature: <FileSignature size={16} />,
  ReceiptText: <ReceiptText size={16} />,
  FileCheck2: <FileCheck2 size={16} />,
};

export function Sidebar(): JSX.Element {
  const location = useLocation();
  const navigate = useNavigate();
  const { log } = useLogger('Sidebar');
  const { isOps } = useTenantStore();
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [adminExpanded, setAdminExpanded] = useState(
    location.pathname.startsWith('/admin') || location.pathname === '/platform-management'
  );
  const [financeExpanded, setFinanceExpanded] = useState(location.pathname.startsWith('/finance'));

  const isAdminActive = location.pathname.startsWith('/admin') || location.pathname === '/platform-management';
  const isFinanceActive = location.pathname.startsWith('/finance');
  const activeKey =
    adminSubItems.find((item) => item.path === location.pathname)?.key ||
    financeSubItems.find((item) => item.path === location.pathname)?.key ||
    mainNavItems.find((item) => location.pathname === item.path || location.pathname.startsWith(`${item.path}/`))?.key ||
    (location.pathname === '/settings' ? 'settings' : undefined) ||
    (location.pathname === '/platform-management' ? 'admin-tenants' : 'overview');

  const handleNavClick = (path: string, label: string): void => {
    log.nav(`Navigate to ${label}`, { path });
    navigate(path);
  };

  const toggleAdmin = () => {
    setAdminExpanded(!adminExpanded);
    if (!adminExpanded && !isAdminActive) {
      navigate('/admin/tenants');
    }
  };

  const toggleFinance = () => {
    setFinanceExpanded(!financeExpanded);
    if (!financeExpanded && !isFinanceActive) {
      navigate('/finance');
    }
  };

  const openSettings = (section: 'account' | 'team'): void => {
    setUserMenuOpen(false);
    handleNavClick('/settings', section === 'account' ? '账号设置' : '团队管理');
    if (section === 'team') {
      showToast('已打开团队管理', 'info');
    }
  };

  return (
    <aside className="w-sidebar h-screen bg-bg-secondary/95 border-r border-border flex shrink-0 flex-col overflow-y-auto backdrop-blur">
      <button
        onClick={() => handleNavClick('/', '总览')}
        className="flex items-center gap-3 border-b border-border px-5 py-4 text-left transition-colors hover:bg-bg-tertiary/60"
      >
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-accent-blue text-sm font-bold text-bg-primary shadow-[0_0_24px_rgba(8,212,232,0.26)]">
          Px
        </div>
        <div>
          <div className="font-mono text-sm font-bold text-text-primary">Px Lite</div>
          <div className="text-xs text-text-muted">极简版 · 行为洞察</div>
        </div>
      </button>

      <div className="px-4 py-4">
        <h3 className="text-[10px] uppercase tracking-widest text-text-muted font-medium mb-3">主菜单</h3>
        <nav className="flex flex-col gap-1">
          {mainNavItems
            .filter((item) => isOps || !['distribution-strategy'].includes(item.key))
            .map((item) => (
            <button
              key={item.key}
              onClick={() => handleNavClick(item.path, item.label)}
              className={clsx(
                'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors duration-150 text-left w-full',
                activeKey === item.key
                  ? 'bg-gradient-to-r from-accent-purple/20 to-accent-blue/10 text-accent-blue border-l-2 border-accent-blue'
                  : 'text-text-secondary hover:bg-bg-tertiary hover:text-text-primary'
              )}
            >
              {iconMap[item.icon]}
              <span>{item.label}</span>
            </button>
          ))}

          {/* 平台管理 expandable */}
          {isOps && (
            <button
              onClick={toggleAdmin}
              className={clsx(
                'flex items-center justify-between px-3 py-2.5 rounded-lg text-sm transition-colors duration-150 text-left w-full',
                isAdminActive
                  ? 'bg-gradient-to-r from-accent-purple/20 to-accent-blue/10 text-accent-blue border-l-2 border-accent-blue'
                  : 'text-text-secondary hover:bg-bg-tertiary hover:text-text-primary'
              )}
            >
              <div className="flex items-center gap-3">
                {iconMap.Settings}
                <span>平台管理</span>
              </div>
              <ChevronDown
                size={14}
                className={clsx('transition-transform duration-200', adminExpanded ? 'rotate-180' : '')}
              />
            </button>
          )}

          {/* Admin sub-items */}
          {isOps && adminExpanded && (
            <div className="ml-4 pl-3 border-l border-border/50 flex flex-col gap-0.5">
              {adminSubItems.map((item) => (
                <button
                  key={item.key}
                  onClick={() => handleNavClick(item.path, item.label)}
                  className={clsx(
                    'flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs transition-colors duration-150 text-left w-full',
                    activeKey === item.key
                      ? 'bg-accent-blue/10 text-accent-blue'
                      : 'text-text-muted hover:bg-bg-tertiary hover:text-text-primary'
                  )}
                >
                  {iconMap[item.icon]}
                  <span>{item.label}</span>
                </button>
              ))}
            </div>
          )}

          {isOps && (
            <button
              onClick={toggleFinance}
              className={clsx(
                'flex items-center justify-between px-3 py-2.5 rounded-lg text-sm transition-colors duration-150 text-left w-full',
                isFinanceActive
                  ? 'bg-gradient-to-r from-accent-purple/20 to-accent-blue/10 text-accent-blue border-l-2 border-accent-blue'
                  : 'text-text-secondary hover:bg-bg-tertiary hover:text-text-primary'
              )}
            >
              <div className="flex items-center gap-3">
                {iconMap.WalletCards}
                <span>财务管理</span>
              </div>
              <ChevronDown
                size={14}
                className={clsx('transition-transform duration-200', financeExpanded ? 'rotate-180' : '')}
              />
            </button>
          )}

          {isOps && financeExpanded && (
            <div className="ml-4 pl-3 border-l border-border/50 flex flex-col gap-0.5">
              {financeSubItems.map((item) => (
                <button
                  key={item.key}
                  onClick={() => handleNavClick(item.path, item.label)}
                  className={clsx(
                    'flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs transition-colors duration-150 text-left w-full',
                    activeKey === item.key
                      ? 'bg-accent-blue/10 text-accent-blue'
                      : 'text-text-muted hover:bg-bg-tertiary hover:text-text-primary'
                  )}
                >
                  {iconMap[item.icon]}
                  <span>{item.label}</span>
                </button>
              ))}
            </div>
          )}
        </nav>
      </div>

      <div className="px-4 py-4 border-t border-border mt-2">
        <h3 className="text-[10px] uppercase tracking-widest text-text-muted font-medium mb-2">说明</h3>
        <p className="text-xs text-text-muted leading-relaxed">
          {isOps
            ? '当前视图\n运营视图 Ops View。 合规枢纽 · 唯一可见患者明文 · 全部生产 / 触达能力'
            : '药企视图 Pharma View。仅可见脱敏聚合数据 · k-匿名 · 不可下钻到个体'}
        </p>
      </div>

      <div className="relative mt-auto px-4 py-4 border-t border-border">
        {userMenuOpen && (
          <>
            <button
              aria-label="关闭用户菜单"
              className="fixed inset-0 z-20 cursor-default"
              onClick={() => setUserMenuOpen(false)}
              tabIndex={-1}
            />
            <div className="absolute bottom-[86px] left-4 z-30 w-[200px] overflow-hidden rounded-lg border border-border-light bg-bg-card shadow-[0_18px_48px_rgba(0,0,0,0.38)]">
              <div className="border-b border-border px-4 py-3 text-xs text-text-primary">系统管理员</div>
              <button
                onClick={() => openSettings('account')}
                className="block w-full border-b border-border px-4 py-3 text-left text-xs text-text-secondary transition-colors hover:bg-bg-tertiary hover:text-text-primary"
              >
                账号设置
              </button>
              <button
                onClick={() => openSettings('team')}
                className="block w-full border-b border-border px-4 py-3 text-left text-xs text-text-secondary transition-colors hover:bg-bg-tertiary hover:text-text-primary"
              >
                团队管理
              </button>
              <button
                onClick={() => {
                  setUserMenuOpen(false);
                  showToast('已退出登录', 'info');
                }}
                className="block w-full px-4 py-3 text-left text-xs text-text-secondary transition-colors hover:bg-bg-tertiary hover:text-accent-red"
              >
                退出登录
              </button>
            </div>
          </>
        )}
        <button
          onClick={() => setUserMenuOpen((open) => !open)}
          className={clsx(
            'flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left transition-colors',
            activeKey === 'settings' ? 'bg-gradient-to-r from-accent-purple/20 to-accent-blue/10 text-accent-blue' : 'hover:bg-bg-tertiary',
          )}
        >
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-teal-500/20 text-xs font-bold text-teal-300">
            系
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-sm text-text-primary">系统管理员</div>
            <div className="text-xs text-text-muted">华东区域 · admin</div>
          </div>
          <ChevronDown size={14} className={clsx('shrink-0 text-text-muted transition-transform', userMenuOpen && 'rotate-180')} />
        </button>
      </div>
    </aside>
  );
}
