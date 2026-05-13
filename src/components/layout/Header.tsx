import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Search, Bell, ChevronDown, Settings, LogOut, User, Shield } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { showToast } from '@/components/ui/Toast';
import { useTenantStore } from '@/stores/useTenantStore';
import { NAV_ITEMS, APP_VERSION } from '@/utils/constants';

const adminLabels: Record<string, string> = {
  '/admin/tenants': '租户管理',
  '/admin/accounts': '账号管理',
  '/admin/approval-flows': '审批流配置',
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
  const pageLabel = adminLabel
    ? `平台管理 / ${adminLabel}`
    : location.pathname === '/settings'
      ? '设置'
    : currentNav?.label || '总览';

  return (
    <header className="h-header bg-bg-secondary/95 border-b border-border flex items-center justify-between px-6 shrink-0 backdrop-blur">
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-md bg-gradient-to-br from-px-purple to-px-blue flex items-center justify-center shadow-[0_0_18px_rgba(114,13,215,0.38)]">
            <span className="text-white font-mono text-xs font-bold">Px</span>
          </div>
          <span className="font-mono font-bold text-text-primary text-sm">Px Lite</span>
          <span className="text-xs text-text-muted">患教运营 · 行为洞察</span>
        </div>
        <div className="text-text-muted text-xs">|</div>
        <div className="text-xs text-text-secondary">
          <span className="text-text-muted">Px 信欣健康</span>
          <span className="text-text-muted mx-1">/</span>
          <span className="text-text-primary">{pageLabel}</span>
        </div>
      </div>

      <div className="flex items-center gap-3">
        {/* Px Ops Dropdown */}
        <div className="relative">
          <button
            aria-label="切换租户视角"
            onClick={() => setPxOpsOpen(!pxOpsOpen)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-bg-tertiary text-text-secondary text-xs hover:text-text-primary transition-colors"
          >
            <Shield size={14} className="text-accent-blue" />
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
                        if (tenant.type === 'pharma' && (location.pathname.startsWith('/admin') || location.pathname.startsWith('/distribute'))) {
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
          className="p-2 rounded-lg hover:bg-bg-tertiary text-text-muted hover:text-text-primary transition-colors"
        >
          <Search size={16} />
        </button>
        <button
          onClick={() => setNoticeOpen((open) => !open)}
          className="p-2 rounded-lg hover:bg-bg-tertiary text-text-muted hover:text-text-primary transition-colors relative"
        >
          <Bell size={16} />
          <span className="absolute top-1.5 right-1.5 w-1.5 h-1.5 bg-accent-red rounded-full" />
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
        <Badge color="purple" className="text-[10px]">
          {APP_VERSION}
        </Badge>
      </div>
    </header>
  );
}
