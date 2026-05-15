import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Search, Bell, ChevronDown, Settings, LogOut, User, Building2 } from 'lucide-react';
import { showToast } from '@/components/ui/Toast';
import { useTenantStore } from '@/stores/useTenantStore';
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
  const { tenants, currentTenant, isOps, setTenant, fetchTenants } = useTenantStore();
  const [pxOpsOpen, setPxOpsOpen] = useState(false);
  const [noticeOpen, setNoticeOpen] = useState(false);

  useEffect(() => {
    void fetchTenants();
  }, [fetchTenants]);

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
        {/* Px Ops Dropdown */}
        <div className="relative">
          <button
            aria-label="切换租户视角"
            onClick={() => setPxOpsOpen(!pxOpsOpen)}
            className="flex h-8 items-center gap-2 rounded-md border border-[oklch(30%_.02_260_/.7)] bg-[oklch(24%_.02_260_/.3)] px-2.5 text-[12px] font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            <Building2 size={14} className="text-primary" />
            {currentTenant.shortName} <ChevronDown size={12} className={`transition-transform ${pxOpsOpen ? 'rotate-180' : ''}`} />
          </button>
          {pxOpsOpen && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setPxOpsOpen(false)} />
              <div className="absolute right-0 mt-2 w-80 bg-bg-card border border-border rounded-xl shadow-lg z-50 overflow-hidden">
                <div className="px-4 py-3 border-b border-border">
                  <div className="text-xs text-text-muted mb-1">当前租户</div>
                  <div className="text-sm font-medium text-text-primary">{currentTenant.name}</div>
                  <div className="text-xs text-text-muted">{isOps ? '运营视图 · 平台管理员' : '药企视图 · 脱敏聚合'}</div>
                </div>
                <div className="py-1">
                  <button
                    onClick={() => {
                      setPxOpsOpen(false);
                      navigate('/settings');
                    }}
                    className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-text-secondary hover:bg-bg-tertiary transition-colors text-left"
                  >
                    <User size={14} />
                    个人设置
                  </button>
                  <button
                    onClick={() => {
                      setPxOpsOpen(false);
                      navigate('/settings');
                    }}
                    className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-text-secondary hover:bg-bg-tertiary transition-colors text-left"
                  >
                    <Settings size={14} />
                    系统设置
                  </button>
                  <div className="border-t border-border my-1" />
                  <div className="px-4 py-2">
                    <div className="text-[10px] text-text-muted uppercase tracking-wider mb-1">切换租户视角</div>
                    <p className="text-[10px] leading-relaxed text-text-muted">
                      切换后，工坊 / 分发 / 洞察 / KPI 数据均按所选租户视角呈现。
                    </p>
                  </div>
                  {tenants.map((tenant) => (
                    <button
                      key={tenant.id}
                      onClick={() => {
                        setTenant(tenant.id);
                        setPxOpsOpen(false);
                        if (tenant.type === 'pharma' && (location.pathname.startsWith('/admin') || location.pathname.startsWith('/distribute') || location.pathname.startsWith('/finance'))) {
                          navigate('/');
                        }
                      }}
                      className="w-full flex items-center justify-between px-4 py-2 text-xs text-text-secondary hover:bg-bg-tertiary transition-colors"
                    >
                      <span>
                        {tenant.shortName}（{tenant.type === 'ops' ? '运营视图' : '药企视图'}）
                        <span className="block text-[10px] text-text-muted text-left">{tenant.name}</span>
                      </span>
                      {tenant.id === currentTenant.id && <span className="w-1.5 h-1.5 rounded-full bg-accent-green" />}
                    </button>
                  ))}
                  <div className="border-t border-border my-1" />
                  <button
                    onClick={() => showToast('已退出登录', 'info')}
                    className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-accent-red hover:bg-bg-tertiary transition-colors text-left"
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
