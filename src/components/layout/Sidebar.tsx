import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  BadgeDollarSign,
  Briefcase,
  Building2,
  ChevronDown,
  ChevronRight,
  FileSignature,
  FileText,
  KeyRound,
  Layers,
  LayoutDashboard,
  LineChart,
  LogOut,
  Megaphone,
  Receipt,
  ServerCog,
  Settings,
  ShieldCheck,
  Users,
  Wallet,
  Workflow,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { clsx } from 'clsx';
import { useLogger } from '@/hooks/useLogger';
import { useTenantStore } from '@/stores/useTenantStore';
import { showToast } from '@/components/ui/Toast';

type NavItem = {
  key: string;
  label: string;
  path: string;
  icon: LucideIcon;
  exact?: boolean;
};

const mainNavItems: NavItem[] = [
  { key: 'overview', label: '总览', path: '/', icon: LayoutDashboard, exact: true },
  { key: 'content-workshop', label: '患教内容工坊', path: '/content', icon: FileText },
  { key: 'behavior-insights', label: '患者行为洞察', path: '/audience', icon: Users },
  { key: 'distribution-strategy', label: '分发策略', path: '/distribute', icon: Megaphone },
  { key: 'approval-center', label: '审批中心', path: '/approvals', icon: ShieldCheck },
];

const adminSubItems: NavItem[] = [
  { key: 'admin-tenants', label: '租户管理', path: '/admin/tenants', icon: Building2 },
  { key: 'admin-accounts', label: '账号管理', path: '/admin/accounts', icon: KeyRound },
  { key: 'admin-projects', label: '项目管理', path: '/admin/projects', icon: Briefcase },
  { key: 'admin-approval-flows', label: '审批流配置', path: '/admin/approval-flows', icon: Workflow },
];

const financeSubItems: NavItem[] = [
  { key: 'finance-overview', label: '业财总览', path: '/finance', icon: LineChart, exact: true },
  { key: 'finance-contracts', label: '合同与订阅', path: '/finance/contracts', icon: FileSignature },
  { key: 'finance-billing', label: '账单引擎', path: '/finance/billing', icon: Receipt },
  { key: 'finance-invoicing', label: '价值交付与开票', path: '/finance/invoicing', icon: BadgeDollarSign },
  { key: 'finance-data', label: '业财数据基座', path: '/finance/data', icon: Layers },
];

const ENABLE_FINANCE_MENU = false;

function isActive(pathname: string, path: string, exact?: boolean): boolean {
  if (exact) return pathname === path;
  return pathname === path || pathname.startsWith(`${path}/`);
}

export function Sidebar(): JSX.Element {
  const location = useLocation();
  const navigate = useNavigate();
  const { log } = useLogger('Sidebar');
  const { isOps } = useTenantStore();
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [adminExpanded, setAdminExpanded] = useState(
    location.pathname.startsWith('/admin') || location.pathname === '/platform-management',
  );
  const [financeExpanded, setFinanceExpanded] = useState(location.pathname.startsWith('/finance'));

  const isAdminActive = location.pathname.startsWith('/admin') || location.pathname === '/platform-management';
  const isFinanceActive = location.pathname.startsWith('/finance');

  const handleNavClick = (path: string, label: string): void => {
    log.nav(`Navigate to ${label}`, { path });
    navigate(path);
  };

  const openSettings = (section: 'account' | 'team'): void => {
    setUserMenuOpen(false);
    handleNavClick('/settings', section === 'account' ? '账号设置' : '团队管理');
    if (section === 'team') showToast('已打开团队管理', 'info');
  };

  return (
    <aside className="relative flex w-[240px] shrink-0 flex-col border-r border-sidebar-border bg-sidebar">
      <button
        onClick={() => handleNavClick('/', '总览')}
        className="flex h-16 items-center gap-3 border-b border-sidebar-border px-5 text-left transition-colors hover:bg-sidebar-accent/60"
      >
        <div className="relative grid h-9 w-9 place-items-center rounded-lg bg-gradient-to-br from-[oklch(75%_.13_195)] to-[oklch(60%_.16_220)] shadow-[0_0_18px_oklch(70%_.15_200_/.45)]">
          <span className="text-[15px] font-bold tracking-tight text-[oklch(15%_.02_260)]">Px</span>
        </div>
        <div className="leading-tight">
          <div className="text-[13px] font-semibold tracking-wide text-foreground">Px Lite</div>
          <div className="text-[11px] text-muted-foreground">极简版 · 行为洞察</div>
        </div>
      </button>

      <nav className="flex-1 overflow-y-auto px-3 py-4">
        <div className="px-2 pb-2 text-[10px] font-medium uppercase tracking-[0.14em] text-muted-foreground">主菜单</div>
        <ul className="space-y-1">
          {mainNavItems
            .filter((item) => isOps || item.key !== 'distribution-strategy')
            .map((item) => {
              const active = isActive(location.pathname, item.path, item.exact);
              const Icon = item.icon;
              return (
                <li key={item.key} className="relative">
                  {active && <span className="nav-indicator" />}
                  <button
                    onClick={() => handleNavClick(item.path, item.label)}
                    className={clsx(
                      'group flex w-full items-center gap-3 rounded-md px-3 py-2 text-left text-[13.5px] font-medium transition-colors',
                      active
                        ? 'bg-sidebar-accent text-foreground'
                        : 'text-sidebar-foreground hover:bg-sidebar-accent/60 hover:text-foreground',
                    )}
                  >
                    <Icon className={clsx('h-[16px] w-[16px] shrink-0', active ? 'text-primary' : 'text-muted-foreground group-hover:text-foreground')} />
                    <span className="flex-1">{item.label}</span>
                  </button>
                </li>
              );
            })}

          {isOps && (
            <li className="relative">
              <button
                onClick={() => setAdminExpanded((open) => !open)}
                className={clsx(
                  'group flex w-full items-center gap-3 rounded-md px-3 py-2 text-left text-[13.5px] font-medium transition-colors',
                  isAdminActive
                    ? 'bg-sidebar-accent/60 text-foreground'
                    : 'text-sidebar-foreground hover:bg-sidebar-accent/60 hover:text-foreground',
                )}
              >
                <ServerCog className={clsx('h-[16px] w-[16px] shrink-0', isAdminActive ? 'text-primary' : 'text-muted-foreground group-hover:text-foreground')} />
                <span className="flex-1">平台管理</span>
                {adminExpanded ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" /> : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />}
              </button>
              {adminExpanded && (
                <ul className="ml-5 mt-0.5 space-y-0.5 border-l border-sidebar-border/60 pl-3">
                  {adminSubItems.map((item) => {
                    const active = isActive(location.pathname, item.path, item.exact) || (item.path === '/admin/tenants' && location.pathname === '/platform-management');
                    const Icon = item.icon;
                    return (
                      <li key={item.key} className="relative">
                        {active && <span className="nav-indicator" />}
                        <button
                          onClick={() => handleNavClick(item.path, item.label)}
                          className={clsx(
                            'group flex w-full items-center gap-2.5 rounded-md px-2.5 py-1.5 text-left text-[12.5px] font-medium transition-colors',
                            active
                              ? 'bg-sidebar-accent text-foreground'
                              : 'text-sidebar-foreground/85 hover:bg-sidebar-accent/60 hover:text-foreground',
                          )}
                        >
                          <Icon className={clsx('h-[14px] w-[14px] shrink-0', active ? 'text-primary' : 'text-muted-foreground group-hover:text-foreground')} />
                          <span className="flex-1">{item.label}</span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </li>
          )}

          {ENABLE_FINANCE_MENU && isOps && (
            <li className="relative">
              <button
                onClick={() => setFinanceExpanded((open) => !open)}
                className={clsx(
                  'group flex w-full items-center gap-3 rounded-md px-3 py-2 text-left text-[13.5px] font-medium transition-colors',
                  isFinanceActive
                    ? 'bg-sidebar-accent/60 text-foreground'
                    : 'text-sidebar-foreground hover:bg-sidebar-accent/60 hover:text-foreground',
                )}
              >
                <Wallet className={clsx('h-[16px] w-[16px] shrink-0', isFinanceActive ? 'text-primary' : 'text-muted-foreground group-hover:text-foreground')} />
                <span className="flex-1">财务管理</span>
                {financeExpanded ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" /> : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />}
              </button>
              {financeExpanded && (
                <ul className="ml-5 mt-0.5 space-y-0.5 border-l border-sidebar-border/60 pl-3">
                  {financeSubItems.map((item) => {
                    const active = isActive(location.pathname, item.path, item.exact);
                    const Icon = item.icon;
                    return (
                      <li key={item.key} className="relative">
                        {active && <span className="nav-indicator" />}
                        <button
                          onClick={() => handleNavClick(item.path, item.label)}
                          className={clsx(
                            'group flex w-full items-center gap-2.5 rounded-md px-2.5 py-1.5 text-left text-[12.5px] font-medium transition-colors',
                            active
                              ? 'bg-sidebar-accent text-foreground'
                              : 'text-sidebar-foreground/85 hover:bg-sidebar-accent/60 hover:text-foreground',
                          )}
                        >
                          <Icon className={clsx('h-[14px] w-[14px] shrink-0', active ? 'text-primary' : 'text-muted-foreground group-hover:text-foreground')} />
                          <span className="flex-1">{item.label}</span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </li>
          )}
        </ul>

        <div className="mt-8 px-2 pb-2 text-[10px] font-medium uppercase tracking-[0.14em] text-muted-foreground">说明</div>
        <div className="mx-2 rounded-md border border-sidebar-border bg-[oklch(18%_.02_260)] p-3 text-[11.5px] leading-relaxed text-muted-foreground">
          <div className="mb-1.5 flex items-center gap-1.5 text-foreground">
            <ShieldCheck className="h-3.5 w-3.5 text-primary" />
            <span className="text-[11px] font-semibold tracking-wide">当前视图</span>
          </div>
          <span className="text-foreground">{isOps ? '运营视图 Ops View' : '药企视图 Pharma View'}</span>。{' '}
          {isOps ? '合规枢纽 · 唯一可见患者明文 · 全部生产 / 触达能力' : '仅可见脱敏聚合数据 · k-匿名 · 不可下钻到个体'}
        </div>
      </nav>

      <div className="relative border-t border-sidebar-border p-3">
        {userMenuOpen && (
          <>
            <button
              aria-label="关闭用户菜单"
              className="fixed inset-0 z-20 cursor-default"
              onClick={() => setUserMenuOpen(false)}
              tabIndex={-1}
            />
            <div className="absolute bottom-[70px] left-3 z-30 w-[200px] overflow-hidden rounded-lg border border-border bg-card shadow-[0_18px_48px_rgba(0,0,0,0.38)]">
              <div className="border-b border-border px-4 py-3 text-xs text-foreground">系统管理员</div>
              <button onClick={() => openSettings('account')} className="block w-full border-b border-border px-4 py-3 text-left text-xs text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground">
                <Settings className="mr-2 inline h-3.5 w-3.5" />账号设置
              </button>
              <button onClick={() => openSettings('team')} className="block w-full border-b border-border px-4 py-3 text-left text-xs text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground">
                <Users className="mr-2 inline h-3.5 w-3.5" />团队管理
              </button>
              <button
                onClick={() => {
                  setUserMenuOpen(false);
                  showToast('已退出登录', 'info');
                }}
                className="block w-full px-4 py-3 text-left text-xs text-muted-foreground transition-colors hover:bg-secondary hover:text-[oklch(75%_.18_25)]"
              >
                <LogOut className="mr-2 inline h-3.5 w-3.5" />退出登录
              </button>
            </div>
          </>
        )}
        <button
          onClick={() => setUserMenuOpen((open) => !open)}
          className="flex w-full items-center gap-3 rounded-md px-2 py-2 text-left transition-colors hover:bg-sidebar-accent"
        >
          <div className="grid h-8 w-8 place-items-center rounded-full bg-[oklch(28%_.04_200)] text-[12px] font-semibold text-primary">系</div>
          <div className="min-w-0 flex-1 leading-tight">
            <div className="truncate text-[12.5px] font-medium text-foreground">系统管理员</div>
            <div className="truncate text-[11px] text-muted-foreground">华东区域 · admin</div>
          </div>
          <ChevronDown className={clsx('h-3.5 w-3.5 text-muted-foreground transition-transform', userMenuOpen && 'rotate-180')} />
        </button>
      </div>
    </aside>
  );
}
