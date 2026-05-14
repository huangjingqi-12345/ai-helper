import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { CheckCircle, Clock, ListChecks, XCircle } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { showToast } from '@/components/ui/Toast';
import { useLogger } from '@/hooks/useLogger';

import { getApprovalTasks } from '@/api/endpoints/approval';
import type { ApprovalTask } from '@/types/approval';

type ApprovalFilter = 'pending' | 'approved' | 'rejected' | 'all';

type ApprovalGroup = {
  key: string;
  label: string;
  projectName: string;
  tasks: ApprovalTask[];
};

const requirementByContent: Record<string, { label: string; projectName: string }> = {
  'CNT-102': { label: '诉求 · 心衰营养 · 低盐调查表', projectName: '诺欣妥 · 慢性心衰患教计划' },
  'CNT-105': { label: '诉求 · 术后护理 KOL 解读海报', projectName: '赫赛汀 · HER2+ 术后随访教育' },
};

function approvalGroups(tasks: ApprovalTask[]): ApprovalGroup[] {
  const order: Record<string, number> = {
    'CNT-102': 1,
    'CNT-105': 2,
    'CNT-106': 3,
    'CNT-107': 4,
  };
  return [...tasks].sort((a, b) => (order[a.contentId] ?? 99) - (order[b.contentId] ?? 99)).map((task) => {
    const requirement = requirementByContent[task.contentId];
    return {
      key: requirement ? `${requirement.label}-${requirement.projectName}` : `unlinked-${task.contentId}`,
      label: requirement?.label ?? '（未关联诉求）',
      projectName: requirement?.projectName ?? '—',
      tasks: [task],
    };
  });
}

export function ApprovalCenter(): JSX.Element {
  const { log } = useLogger('ApprovalCenter');
  const [tasks, setTasks] = useState<ApprovalTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeFilter, setActiveFilter] = useState<ApprovalFilter>('pending');
  const [selectedTaskIds, setSelectedTaskIds] = useState<string[]>([]);
  const [expandedKey, setExpandedKey] = useState<string | null>(null);

  const loadTasks = async (): Promise<void> => {
    setLoading(true);
    try {
      const res = await getApprovalTasks({ pageSize: 100 });
      setTasks(res.data);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadTasks();
  }, []);

  const pendingTasks = useMemo(() => tasks.filter((task) => task.status === 'pending'), [tasks]);
  const pendingCount = pendingTasks.length;
  const approvedCount = tasks.filter((task) => task.status === 'approved').length;
  const rejectedCount = tasks.filter((task) => task.status === 'rejected').length;
  const grouped = useMemo(() => approvalGroups(pendingTasks), [pendingTasks]);

  const toggleAll = (): void => {
    setSelectedTaskIds((current) => current.length === pendingTasks.length ? [] : pendingTasks.map((task) => task.id));
  };

  const batchAction = (action: 'approve' | 'reject'): void => {
    log.action('Approval batch action clicked', { action, selectedTaskIds });
    if (selectedTaskIds.length === 0) {
      showToast('请先选择当前列表中的审批任务', 'info');
      return;
    }
    showToast(action === 'approve' ? `已批量通过 ${selectedTaskIds.length} 条任务（演示）` : `已批量驳回 ${selectedTaskIds.length} 条任务（演示）`, 'success');
  };

  const filterCards = [
    { filter: 'pending' as const, label: '待我审批', count: pendingCount, icon: <Clock className="h-4 w-4" />, tone: 'yellow' },
    { filter: 'approved' as const, label: '已通过(全流程)', count: approvedCount, icon: <CheckCircle className="h-4 w-4" />, tone: 'green' },
    { filter: 'rejected' as const, label: '驳回中', count: rejectedCount, icon: <XCircle className="h-4 w-4" />, tone: 'red' },
    { filter: 'all' as const, label: '全部任务', count: tasks.length, icon: <ListChecks className="h-4 w-4" />, tone: 'blue' },
  ];

  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <Badge color="blue" className="text-[10px] uppercase tracking-wider">Approvals · Ops</Badge>
        <h1 className="text-2xl font-bold text-text-primary">审批中心</h1>
        <p className="text-sm text-text-secondary max-w-3xl">DX 小编 / AI 预审 / PX 运营 三个内部节点的代办与全量轨迹；支持按诉求批量审核。</p>
        <div className="flex flex-wrap items-center gap-3 text-xs text-text-muted">
          <span>租户：Px Ops</span><span>当前流：PX 默认审批流</span><span>共 3 个节点</span><span>打回策略：回到提交人</span>
          <Link to="/admin/approval-flows" className="text-accent-blue hover:underline">审批流配置</Link>
        </div>
      </div>

      <div className="grid grid-cols-4 gap-4">
        {filterCards.map((card) => (
          <button
            key={card.filter}
            onClick={() => setActiveFilter(card.filter)}
            className={`flex items-center justify-between rounded-card border bg-bg-card p-5 text-left transition-colors hover:border-accent-blue/50 ${activeFilter === card.filter ? 'border-accent-blue ring-1 ring-accent-blue/30' : 'border-border'}`}
          >
            <div>
              <div className="font-mono text-2xl font-bold text-text-primary">{card.count}</div>
              <div className="mt-1 text-xs text-text-muted">{card.label}</div>
            </div>
            <span className={card.tone === 'yellow' ? 'text-accent-yellow' : card.tone === 'green' ? 'text-accent-green' : card.tone === 'red' ? 'text-accent-red' : 'text-accent-blue'}>{card.icon}</span>
          </button>
        ))}
      </div>

      <Card className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Button variant="secondary" size="sm" onClick={() => showToast('当前列表已按诉求分组', 'info')}>已按诉求分组</Button>
          <label className="flex items-center gap-2 text-xs text-text-muted">
            <input type="checkbox" checked={selectedTaskIds.length === pendingTasks.length && pendingTasks.length > 0} onChange={toggleAll} />
            全选当前列表（共 {pendingTasks.length} 条 · 已选 {selectedTaskIds.length}）
          </label>
          <div className="ml-auto flex gap-2">
            <Button size="sm" onClick={() => batchAction('approve')}>批量通过</Button>
            <Button size="sm" variant="danger" onClick={() => batchAction('reject')}>批量驳回</Button>
          </div>
        </div>

        {loading ? (
          <div className="py-10 text-center text-sm text-text-muted">正在从 SQLite 加载审批任务...</div>
        ) : (
          <div className="space-y-3">
            {grouped.map((group) => {
              const checked = group.tasks.every((task) => selectedTaskIds.includes(task.id));
              return (
                <button
                  key={group.key}
                  onClick={() => setExpandedKey((current) => current === group.key ? null : group.key)}
                  className="w-full rounded-xl border border-border bg-bg-secondary/50 p-4 text-left transition-colors hover:border-accent-blue/50"
                >
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex min-w-0 items-center gap-3">
                      <input
                        type="checkbox"
                        checked={checked}
                        onClick={(event) => event.stopPropagation()}
                        onChange={() => {
                          const ids = group.tasks.map((task) => task.id);
                          setSelectedTaskIds((current) => checked ? current.filter((id) => !ids.includes(id)) : Array.from(new Set([...current, ...ids])));
                        }}
                      />
                      <div>
                        <div className="text-sm font-medium text-text-primary">{group.label} · 项目 {group.projectName}</div>
                        <div className="mt-1 text-xs text-text-muted">{group.tasks.length} 条</div>
                      </div>
                    </div>
                    <Badge color="yellow">待审批</Badge>
                  </div>
                  {expandedKey === group.key && (
                    <div className="mt-4 space-y-2 border-t border-border pt-3">
                      {group.tasks.map((task) => (
                        <div key={task.id} className="flex items-center justify-between rounded-lg bg-bg-card px-3 py-2 text-xs">
                          <span className="text-text-secondary">{task.title}</span>
                          <span className="font-mono text-text-muted">{task.contentId} · {task.node}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </button>
              );
            })}
            {grouped.length === 0 && <div className="py-10 text-center text-sm text-text-muted">当前筛选下暂无审批任务。</div>}
          </div>
        )}
      </Card>
    </div>
  );
}
