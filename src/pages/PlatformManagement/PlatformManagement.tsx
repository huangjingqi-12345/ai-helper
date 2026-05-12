import { useEffect, useState } from 'react';
import { Settings, Users, Shield, Activity, ToggleLeft, ToggleRight } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Table } from '@/components/ui/Table';
import { Spinner } from '@/components/ui/Spinner';
import { ErrorState } from '@/components/ui/ErrorState';
import { showToast } from '@/components/ui/Toast';
import { usePlatformStore } from '@/stores/usePlatformStore';
import { useLogger } from '@/hooks/useLogger';
import { ROLE_MAP } from '@/utils/constants';
import { formatDate } from '@/utils/formatters';
import type { User } from '@/types';

export function PlatformManagement(): JSX.Element {
  const { users, settings, loading, error, fetchUsers, fetchSettings, updateSettings } = usePlatformStore();
  const { log } = useLogger('PlatformManagement');
  const [activeTab, setActiveTab] = useState<'users' | 'settings'>('users');

  useEffect(() => {
    log.nav('Platform Management page loaded');
    fetchUsers();
    fetchSettings();
  }, [fetchUsers, fetchSettings, log]);

  if (error && !loading) {
    return <ErrorState message={error} onRetry={() => { fetchUsers(); fetchSettings(); }} />;
  }

  const handleToggleFeature = async (featureKey: string, currentValue: boolean) => {
    if (!settings) return;
    log.action('Feature toggle clicked', { feature: featureKey, newValue: !currentValue });
    await updateSettings({
      features: { ...settings.features, [featureKey]: !currentValue },
    });
    showToast(`功能 "${featureKey}" 已${!currentValue ? '启用' : '禁用'}`, 'success');
  };

  const userColumns = [
    {
      key: 'name' as const,
      header: '用户',
      render: (user: User) => (
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-accent-blue/20 flex items-center justify-center text-accent-blue text-sm font-bold">
            {user.name[0]}
          </div>
          <div>
            <div className="font-medium text-text-primary">{user.name}</div>
            <div className="text-xs text-text-muted">{user.email}</div>
          </div>
        </div>
      ),
    },
    {
      key: 'role' as const,
      header: '角色',
      render: (user: User) => {
        const roleInfo = ROLE_MAP[user.role];
        return <Badge color={roleInfo.color as 'blue' | 'green' | 'gray'}>{roleInfo.label}</Badge>;
      },
    },
    {
      key: 'region' as const,
      header: '区域',
      render: (user: User) => <span className="text-text-secondary">{user.region}</span>,
    },
    {
      key: 'status' as const,
      header: '状态',
      render: (user: User) => (
        <Badge color={user.status === 'active' ? 'green' : 'gray'}>
          {user.status === 'active' ? '活跃' : '停用'}
        </Badge>
      ),
    },
    {
      key: 'lastLogin' as const,
      header: '最后登录',
      render: (user: User) => (
        <span className="text-text-muted text-xs">
          {user.lastLogin ? formatDate(user.lastLogin) : '从未登录'}
        </span>
      ),
    },
    {
      key: 'createdAt' as const,
      header: '创建时间',
      render: (user: User) => <span className="text-text-muted text-xs">{formatDate(user.createdAt)}</span>,
    },
  ];

  const activeUsers = users.filter(u => u.status === 'active').length;
  const adminCount = users.filter(u => u.role === 'admin').length;
  const editorCount = users.filter(u => u.role === 'editor').length;

  const FEATURE_LIST = settings ? [
    { key: 'contentWorkshop', label: '患教内容工坊', desc: '内容创建、编辑、审核和发布管理', value: settings.features.contentWorkshop },
    { key: 'behaviorInsights', label: '患者行为洞察', desc: '患者阅读和互动行为数据分析', value: settings.features.behaviorInsights },
    { key: 'distributionStrategy', label: '分发策略', desc: '内容分发推送策略配置', value: settings.features.distributionStrategy },
    { key: 'approvalCenter', label: '审批中心', desc: '内容发布前的审批工作流', value: settings.features.approvalCenter },
  ] : [];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="space-y-3">
        <Badge color="blue" className="text-[10px] uppercase tracking-wider">Platform Management</Badge>
        <h1 className="text-2xl font-bold text-text-primary">平台管理</h1>
        <p className="text-sm text-text-secondary">管理平台用户、角色权限和系统设置。</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-2">
        <button
          onClick={() => { setActiveTab('users'); log.action('Tab switched to users'); }}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            activeTab === 'users'
              ? 'bg-accent-blue text-white'
              : 'bg-bg-card text-text-secondary hover:text-text-primary border border-border'
          }`}
        >
          <Users className="w-4 h-4" />
          用户管理
        </button>
        <button
          onClick={() => { setActiveTab('settings'); log.action('Tab switched to settings'); }}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            activeTab === 'settings'
              ? 'bg-accent-blue text-white'
              : 'bg-bg-card text-text-secondary hover:text-text-primary border border-border'
          }`}
        >
          <Settings className="w-4 h-4" />
          系统设置
        </button>
      </div>

      {activeTab === 'users' ? (
        <>
          {/* User Stats */}
          <div className="grid grid-cols-4 gap-4">
            <Card className="text-center">
              <Users className="w-5 h-5 text-accent-blue mx-auto mb-2" />
              <div className="text-2xl font-bold text-text-primary">{users.length}</div>
              <div className="text-xs text-text-muted mt-1">总用户</div>
            </Card>
            <Card className="text-center">
              <Activity className="w-5 h-5 text-accent-green mx-auto mb-2" />
              <div className="text-2xl font-bold text-accent-green">{activeUsers}</div>
              <div className="text-xs text-text-muted mt-1">活跃用户</div>
            </Card>
            <Card className="text-center">
              <Shield className="w-5 h-5 text-accent-purple mx-auto mb-2" />
              <div className="text-2xl font-bold text-accent-purple">{adminCount}</div>
              <div className="text-xs text-text-muted mt-1">管理员</div>
            </Card>
            <Card className="text-center">
              <Users className="w-5 h-5 text-accent-yellow mx-auto mb-2" />
              <div className="text-2xl font-bold text-accent-yellow">{editorCount}</div>
              <div className="text-xs text-text-muted mt-1">编辑</div>
            </Card>
          </div>

          {/* User Table */}
          <Card>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-text-primary">用户列表</h2>
              <Button size="sm" onClick={() => log.action('Add user clicked')}>
                <Users className="w-4 h-4" />
                添加用户
              </Button>
            </div>
            {loading ? (
              <div className="flex justify-center py-12"><Spinner size="lg" /></div>
            ) : (
              <Table columns={userColumns} data={users} rowKey="id" />
            )}
          </Card>
        </>
      ) : (
        <>
          {/* Platform Info */}
          {settings && (
            <Card>
              <h2 className="text-lg font-semibold text-text-primary mb-4">平台信息</h2>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <div className="text-xs text-text-muted">平台名称</div>
                  <div className="text-sm text-text-primary font-medium">{settings.siteName}</div>
                </div>
                <div className="space-y-1">
                  <div className="text-xs text-text-muted">版本</div>
                  <div className="text-sm text-text-primary font-medium">{settings.version}</div>
                </div>
                <div className="space-y-1">
                  <div className="text-xs text-text-muted">区域</div>
                  <div className="text-sm text-text-primary font-medium">{settings.region}</div>
                </div>
              </div>
            </Card>
          )}

          {/* Feature Flags */}
          <Card>
            <h2 className="text-lg font-semibold text-text-primary mb-4">功能开关</h2>
            <div className="space-y-4">
              {FEATURE_LIST.map((feature) => (
                <div
                  key={feature.key}
                  className="flex items-center justify-between py-3 border-b border-border/50 last:border-0"
                >
                  <div>
                    <div className="text-sm font-medium text-text-primary">{feature.label}</div>
                    <div className="text-xs text-text-muted mt-0.5">{feature.desc}</div>
                  </div>
                  <button
                    onClick={() => handleToggleFeature(feature.key, feature.value)}
                    className="text-2xl transition-colors"
                  >
                    {feature.value ? (
                      <ToggleRight className="w-8 h-8 text-accent-green" />
                    ) : (
                      <ToggleLeft className="w-8 h-8 text-text-muted" />
                    )}
                  </button>
                </div>
              ))}
            </div>
          </Card>
        </>
      )}
    </div>
  );
}
