import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Search, Bell, Settings, LogOut, User, Building2, LockKeyhole, ChevronDown } from 'lucide-react';
import { showToast } from '@/components/ui/Toast';
import { useTenantStore } from '@/stores/useTenantStore';
import { useAuthStore } from '@/stores/useAuthStore';
import { NAV_ITEMS, APP_VERSION } from '@/utils/constants';

const adminLabels: Record<string, string> = {
  '/admin/tenants': '租户管理',
  '/admin/accounts': '账号管理',
  '/admin/projects': '项目管理',
  '/admin/approval-flows': '审批流配置',
};

const financeLabels: Record<string, string> = {
  '/finance': '业财总览',
  '/finance/contracts': '合同与订阅',
  '/finance/billing': '账单引擎',
  '/finance/invoicing': '价值交付与开票',
  '/finance/data': '未命名',
};

export function Header(): JSX.Element {
  const location = useLocation();
  const navigate = useNavigate();
  const { currentTenant, isOps } = useTenantStore();
  const { user, logout } = useAuthStore();
  const [accountOpen, setAccountOpen] = useState(false);
  const [noticeOpen, setNoticeOpen] = useState(false);

  const currentNav = NAV_ITEMS.find((item) =>
    item.path === '/'
      ? location.pathname === '/'
      : location.pathname === item.path || location.pathname.startsWith(`${item.path}/`),
  );
  const adminLabel = adminLabels[location.pathname];
  const financeLabel = financeLabels[location.pathname];
  const isDistributionDetail = location.pathname.startsWith('/distribute/') && location.pathname !== '/distribute';
  const pageLabelParts = adminLabel
    ? ['平台管理', adminLabel]
    : financeLabel
      ? ['财务管理', financeLabel]
    : isDistributionDetail
      ? ['分发策略', '项目详情']
    : [location.pathname === '/settings' ? '设置' : currentNav?.label || '总览'];
  const currentPageLabel = pageLabelParts[pageLabelParts.length - 1];
  const displayedVersion = APP_VERSION.includes('LOCAL') ? 'V0.1 · DEMO' : APP_VERSION;
  const viewLabel = isOps ? '运营视图' : '药企视图';

  const handleLogout = (): void => {
    setAccountOpen(false);
    logout();
    showToast('已退出登录', 'info');
    navigate('/login', { replace: true });
  };

  return (
    <header className="flex h-14 shrink-0 items-center justify-between border-b border-border bg-[oklch(17%_.02_260)] px-6">
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-3 text-[12.5px] text-muted-foreground">
          <span className="font-medium text-foreground">Px Lite</span>
          {pageLabelParts.map((part) => (
            <span key={part} className="contents">
              <span className="text-border">/</span>
              <span className={part === currentPageLabel ? 'text-foreground' : ''}>{part}</span>
            </span>
          ))}
        </div>
      </div>

      <div className="flex items-center gap-3">
        <div className="relative">
          <button
            aria-label="当前登录身份"
            onClick={() => setAccountOpen((open) => !open)}
            className="flex h-8 items-center gap-2 rounded-md border border-[oklch(30%_.02_260_/.7)] bg-[oklch(24%_.02_260_/.3)] px-2.5 text-[12px] font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            <Building2 size={14} className="text-primary" />
            {currentTenant.shortName}
            <span className="rounded-full border border-primary/35 bg-primary/10 px-1.5 py-0.5 text-[10px] text-primary">{viewLabel}</span>
            <LockKeyhole size={11} className="text-muted-foreground" />
            <ChevronDown size={12} className={`transition-transform ${accountOpen ? 'rotate-180' : ''}`} />
          </button>
          {accountOpen && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setAccountOpen(false)} />
              <div className="absolute right-0 z-50 mt-2 w-80 overflow-hidden rounded-xl border border-border bg-bg-card shadow-lg">
                <div className="border-b border-border px-4 py-3">
                  <div className="text-xs text-text-muted mb-1">当前登录身份</div>
                  <div className="text-sm font-medium text-text-primary">{user?.name ?? '已登录用户'}</div>
                  <div className="text-xs text-text-muted">{user?.email ?? '—'}</div>
                </div>
                <div className="border-b border-border px-4 py-3 text-xs leading-5 text-text-secondary">
                  <div className="flex items-center justify-between gap-3">
                    <span>公司</span>
                    <span className="text-right text-foreground">{currentTenant.name}</span>
                  </div>
                  <div className="mt-1 flex items-center justify-between gap-3">
                    <span>固定视图</span>
                    <span className="text-right text-primary">{viewLabel}</span>
                  </div>
                  <p className="mt-2 rounded-lg border border-primary/20 bg-primary/10 px-3 py-2 text-[11px] text-muted-foreground">
                    视图由注册/登录账号的角色和公司决定，不能在面板中手动切换。
                  </p>
                </div>
                <div className="py-1">
                  <button
                    onClick={() => {
                      setAccountOpen(false);
                      navigate('/settings');
                    }}
                    className="flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm text-text-secondary transition-colors hover:bg-bg-tertiary"
                  >
                    <User size={14} />
                    个人设置
                  </button>
                  <button
                    onClick={() => {
                      setAccountOpen(false);
                      navigate('/settings');
                    }}
                    className="flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm text-text-secondary transition-colors hover:bg-bg-tertiary"
                  >
                    <Settings size={14} />
                    系统设置
                  </button>
                  <div className="my-1 border-t border-border" />
                  <button
                    onClick={handleLogout}
                    className="flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm text-accent-red transition-colors hover:bg-bg-tertiary"
                  >
                    <LogOut size={14} />
                    退出登录
                  </button>
                </div>
              </div>
            </>
          )}
        </div>

        <button
          onClick={() => showToast('请在列表页使用搜索框进行精确搜索。', 'info')}
          className="grid h-8 w-8 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-[oklch(24%_.02_260)] hover:text-foreground"
        >
          <Search size={16} />
        </button>
        <button
          onClick={() => setNoticeOpen((open) => !open)}
          className="relative grid h-8 w-8 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-[oklch(24%_.02_260)] hover:text-foreground"
        >
          <Bell size={16} />
          <span className="absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full bg-primary" />
        </button>
        {noticeOpen && (
          <>
            <div className="fixed inset-0 z-40" onClick={() => setNoticeOpen(false)} />
            <div className="absolute right-20 top-12 z-50 w-72 rounded-xl border border-border bg-bg-card p-4 shadow-lg">
              <div className="text-sm font-medium text-text-primary">通知中心</div>
              <div className="mt-3 space-y-2 text-xs text-text-secondary">
                <div className="rounded-lg bg-bg-tertiary p-2">CNT-101 已超出 PX 运营审核 SLA。</div>
                <div className="rounded-lg bg-bg-tertiary p-2">有 2 条内容等待三方审核。</div>
              </div>
            </div>
          </>
        )}
        <span className="ml-1 rounded-md border border-border bg-[oklch(24%_.02_260_/.4)] px-2 py-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
          {displayedVersion}
        </span>
      </div>
    </header>
  );
}
