import { useMemo, useState } from 'react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Select } from '@/components/ui/Select';
import { showToast } from '@/components/ui/Toast';
import { useTenantStore } from '@/stores/useTenantStore';

interface TeamMember {
  id: string;
  name: string;
  email: string;
  role: 'admin' | 'editor' | 'viewer';
  lastLogin: string;
}

const ROLE_OPTIONS = [
  { value: 'admin', label: '管理员' },
  { value: 'editor', label: '编辑' },
  { value: 'viewer', label: '查看者' },
];

const initialMembers: TeamMember[] = [
  { id: 'm-1', name: '张明', email: 'zhang.ming@px.cn', role: 'admin', lastLogin: '2026-04-28 09:14' },
  { id: 'm-2', name: '李雨晴', email: 'li.yq@px.cn', role: 'editor', lastLogin: '2026-04-27 17:42' },
  { id: 'm-3', name: '王健', email: 'wang.j@px.cn', role: 'editor', lastLogin: '2026-04-26 11:08' },
  { id: 'm-4', name: '陈思雨', email: 'chen.sy@px.cn', role: 'viewer', lastLogin: '2026-04-22 09:31' },
];

const logs = [
  ['张明 发布了内容 《心衰患者每日体重监测的 5 个细节》', '2026-04-28 09:32'],
  ['李雨晴 更新了内容 《胰岛素笔注射 7 步法》', '2026-04-27 17:46'],
  ['王健 下架了内容 《沙库巴曲缬沙坦该饭前还是饭后吃？》', '2026-04-26 11:12'],
  ['张明 邀请成员加入 陈思雨 (查看者)', '2026-04-25 15:08'],
  ['系统 导出报告 近 7 天行为汇总.csv', '2026-04-24 10:01'],
] as const;

const roleLabel: Record<TeamMember['role'], string> = {
  admin: '管理员',
  editor: '编辑',
  viewer: '查看者',
};

export function Settings(): JSX.Element {
  const { currentTenant } = useTenantStore();
  const [name, setName] = useState('系统管理员');
  const [email, setEmail] = useState('admin@px.cn');
  const [region, setRegion] = useState('华东区域');
  const [members, setMembers] = useState(initialMembers);
  const memberCount = useMemo(() => members.length, [members]);

  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <Badge color="blue" className="text-[10px] uppercase tracking-wider">Settings</Badge>
        <h1 className="text-2xl font-bold text-text-primary">设置</h1>
        <p className="text-sm text-text-secondary max-w-3xl">极简版仅保留：账号、团队成员、操作日志。行为数据导出入口请前往：患者行为洞察 &gt; 行为数据导出。</p>
        <div className="text-xs text-text-muted">当前租户：{currentTenant.shortName} · 修改在本会话内生效（演示模式）</div>
      </div>

      <Card>
        <div className="mb-4 flex items-center justify-between">
          <div><h2 className="text-base font-semibold text-text-primary">我的账号</h2><p className="mt-1 text-xs text-text-muted">基本信息与登录设置</p></div>
          <Button variant="secondary" size="sm" onClick={() => showToast('修改密码入口已打开（演示模式）', 'info')}>修改密码</Button>
        </div>
        <div className="grid grid-cols-4 gap-4">
          <label className="text-xs text-text-muted">姓名<input value={name} onChange={(e) => setName(e.target.value)} className="mt-1 w-full rounded-lg border border-border bg-bg-tertiary px-3 py-2 text-sm text-text-primary" /></label>
          <label className="text-xs text-text-muted">邮箱<input value={email} onChange={(e) => setEmail(e.target.value)} className="mt-1 w-full rounded-lg border border-border bg-bg-tertiary px-3 py-2 text-sm text-text-primary" /></label>
          <label className="text-xs text-text-muted">角色<div className="mt-1 rounded-lg border border-border bg-bg-tertiary px-3 py-2 text-sm text-text-primary">管理员</div></label>
          <label className="text-xs text-text-muted">所在区域<input value={region} onChange={(e) => setRegion(e.target.value)} className="mt-1 w-full rounded-lg border border-border bg-bg-tertiary px-3 py-2 text-sm text-text-primary" /></label>
        </div>
        <div className="mt-4 flex justify-end"><Button onClick={() => showToast('账号信息已保存（演示模式）', 'success')}>保存</Button></div>
      </Card>

      <Card className="p-0 overflow-hidden">
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <div><h2 className="text-base font-semibold text-text-primary">团队成员</h2><p className="mt-1 text-xs text-text-muted">极简权限：管理员可管理一切；编辑可创建/编辑内容；查看者只读。</p></div>
          <div className="flex items-center gap-3"><span className="text-xs text-text-muted">{memberCount} 人</span><Button size="sm" onClick={() => {
            const nextIndex = members.length + 1;
            setMembers((current) => [...current, { id: `m-${Date.now()}`, name: `新成员${nextIndex}`, email: `new${nextIndex}@px.cn`, role: 'viewer', lastLogin: '—' }]);
            showToast('已添加一名演示成员', 'success');
          }}>邀请成员</Button></div>
        </div>
        <table className="w-full">
          <thead><tr className="border-b border-border bg-bg-secondary/50"><th className="px-4 py-3 text-left text-xs text-text-muted">成员</th><th className="px-4 py-3 text-left text-xs text-text-muted">邮箱</th><th className="px-4 py-3 text-left text-xs text-text-muted">角色</th><th className="px-4 py-3 text-left text-xs text-text-muted">最近登录</th><th className="px-4 py-3 text-right text-xs text-text-muted">操作</th></tr></thead>
          <tbody>
            {members.map((member) => (
              <tr key={member.id} className="border-b border-border/50 hover:bg-bg-tertiary/30">
                <td className="px-4 py-3"><div className="flex items-center gap-3"><div className="flex h-8 w-8 items-center justify-center rounded-full bg-accent-blue/20 text-xs font-bold text-accent-blue">{member.name[0]}</div><span className="text-sm text-text-primary">{member.name}</span></div></td>
                <td className="px-4 py-3 text-sm text-text-secondary">{member.email}</td>
                <td className="px-4 py-3"><Select value={member.role} options={ROLE_OPTIONS} onChange={(value) => {
                  setMembers((current) => current.map((item) => item.id === member.id ? { ...item, role: value as TeamMember['role'] } : item));
                  showToast(`${member.name} 已设为${roleLabel[value as TeamMember['role']]}`, 'success');
                }} /></td>
                <td className="px-4 py-3 text-xs text-text-muted">{member.lastLogin}</td>
                <td className="px-4 py-3 text-right"><Button variant="ghost" size="sm" onClick={() => { setMembers((current) => current.filter((item) => item.id !== member.id)); showToast('成员已移除（演示模式）', 'success'); }}>移除</Button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      <Card>
        <div className="mb-4"><h2 className="text-base font-semibold text-text-primary">操作日志</h2><p className="mt-1 text-xs text-text-muted">近期关键操作 · 仅管理员可见</p></div>
        <div className="space-y-3">
          {logs.map(([message, time]) => (
            <div key={`${message}-${time}`} className="flex items-center justify-between rounded-lg border border-border bg-bg-tertiary px-4 py-3">
              <span className="text-sm text-text-secondary">{message}</span>
              <span className="font-mono text-xs text-text-muted">{time}</span>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
