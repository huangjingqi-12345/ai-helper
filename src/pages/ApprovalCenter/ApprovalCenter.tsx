import { useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { CheckCircle2, ChevronDown, ChevronRight, Layers, ShieldAlert } from 'lucide-react';
import { PageHeader } from '@/components/PageHeader';
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
  'CNT-102': { label: '诉求 · 首输 6 周内安全信号识别', projectName: '优赫得 · HER2 ADC 重点随访' },
  'CNT-105': { label: '诉求 · 5 年辅助服药遗忘补救 5 问', projectName: '他莫昔芬 · 内分泌依从性' },
  'CNT-106': { label: '诉求 · 二线口服方案 · 常见问题 8 问', projectName: '唯择 · CDK4/6 二线依从性' },
  'CNT-107': { label: '诉求 · 机制对比 · 驳回', projectName: '优赫得 · HER2 ADC 重点随访' },
};

function approvalGroups(tasks: ApprovalTask[]): ApprovalGroup[] {
  const order: Record<string, number> = { 'CNT-102': 1, 'CNT-105': 2, 'CNT-106': 3, 'CNT-107': 4 };
  return [...tasks]
    .sort((a, b) => (order[a.contentId] ?? 99) - (order[b.contentId] ?? 99))
    .map((task) => {
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
  const [groupByRequest, setGroupByRequest] = useState(true);
  const [selectedTaskIds, setSelectedTaskIds] = useState<string[]>([]);
  const [expandedKeys, setExpandedKeys] = useState<Set<string>>(new Set());

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

  const counts = useMemo(() => ({
    pending: tasks.filter((task) => task.status === 'pending').length,
    approved: tasks.filter((task) => task.status === 'approved').length,
    rejected: tasks.filter((task) => task.status === 'rejected').length,
    all: tasks.length,
  }), [tasks]);

  const visibleTasks = useMemo(() => {
    if (activeFilter === 'all') return tasks;
    return tasks.filter((task) => task.status === activeFilter);
  }, [activeFilter, tasks]);

  const grouped = useMemo(() => approvalGroups(visibleTasks), [visibleTasks]);
  const visibleIds = useMemo(() => visibleTasks.map((task) => task.id), [visibleTasks]);
  const allSelected = visibleIds.length > 0 && visibleIds.every((id) => selectedTaskIds.includes(id));

  const toggleAll = (): void => {
    setSelectedTaskIds((current) => (allSelected ? current.filter((id) => !visibleIds.includes(id)) : Array.from(new Set([...current, ...visibleIds]))));
  };

  const toggleGroup = (group: ApprovalGroup): void => {
    const ids = group.tasks.map((task) => task.id);
    const groupSelected = ids.every((id) => selectedTaskIds.includes(id));
    setSelectedTaskIds((current) => groupSelected ? current.filter((id) => !ids.includes(id)) : Array.from(new Set([...current, ...ids])));
  };

  const batchAction = (action: 'approve' | 'reject'): void => {
    log.action('Approval batch action clicked', { action, selectedTaskIds });
    if (selectedTaskIds.length === 0) {
      showToast('请先勾选要批量处理的内容', 'info');
      return;
    }
    showToast(action === 'approve' ? `已批量通过 ${selectedTaskIds.length} 条` : `已批量驳回 ${selectedTaskIds.length} 条`, 'success');
    setSelectedTaskIds([]);
  };

  const tabs = [
    { key: 'pending' as const, label: '待我审批', value: counts.pending },
    { key: 'approved' as const, label: '已通过(全流程)', value: counts.approved },
    { key: 'rejected' as const, label: '驳回中', value: counts.rejected },
    { key: 'all' as const, label: '全部任务', value: counts.all },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="APPROVALS · OPS"
        title="审批中心"
        subtitle="DX 小编 / AI 预审 / PX 运营 三个内部节点的代办与全量轨迹；支持按诉求批量审核。"
        meta={
          <>
            <Chip tone="primary">租户：Px Ops</Chip>
            <Chip>当前流：PX 默认审批流</Chip>
            <Chip>共 3 个节点</Chip>
            <Chip tone="muted">打回策略：医学编辑修改</Chip>
          </>
        }
        actions={
          <Link to="/admin/approval-flows" className="inline-flex h-9 items-center gap-1 rounded-md border border-border bg-secondary px-3 text-[12.5px] hover:border-[oklch(70%_.15_200_/.4)] hover:text-primary">
            审批流配置 <ChevronRight className="h-3.5 w-3.5" />
          </Link>
        }
      />

      <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border bg-card px-3 py-2">
        <div className="flex flex-wrap items-center gap-2">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveFilter(tab.key)}
              className={
                'inline-flex items-center gap-2 rounded-md border px-3 py-1.5 text-[12.5px] transition-colors ' +
                (activeFilter === tab.key
                  ? 'border-[oklch(70%_.15_200_/.5)] bg-[oklch(70%_.15_200_/.15)] text-primary'
                  : 'border-border bg-secondary text-muted-foreground hover:text-foreground')
              }
            >
              {tab.label}
              <span className="tabular-nums text-[11.5px] opacity-80">{tab.value}</span>
            </button>
          ))}
        </div>
        <button
          onClick={() => setGroupByRequest((value) => !value)}
          className={
            'inline-flex items-center gap-1 rounded-md border px-2.5 py-1 text-[12px] transition ' +
            (groupByRequest
              ? 'border-[oklch(70%_.15_200_/.4)] bg-[oklch(70%_.15_200_/.1)] text-primary'
              : 'border-border bg-secondary text-muted-foreground hover:text-foreground')
          }
        >
          <Layers className="size-3.5" />
          {groupByRequest ? '已按诉求分组' : '按诉求分组'}
        </button>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-dashed border-border bg-[oklch(20%_.02_260_/.5)] px-3 py-2">
        <label className="flex items-center gap-2 text-[12.5px] text-muted-foreground">
          <input type="checkbox" className="size-3.5 accent-primary" checked={allSelected} onChange={toggleAll} />
          全选当前列表（共 {visibleIds.length} 条 · 已选 {selectedTaskIds.length}）
        </label>
        <div className="flex items-center gap-2">
          <button onClick={() => batchAction('approve')} className="inline-flex h-7 items-center gap-1 rounded-md bg-primary px-3 text-[12px] font-medium text-primary-foreground">
            <CheckCircle2 className="size-3.5" /> 批量通过
          </button>
          <button onClick={() => batchAction('reject')} className="inline-flex h-7 items-center gap-1 rounded-md border border-border bg-secondary px-3 text-[12px] text-muted-foreground hover:border-[oklch(70%_.15_200_/.4)] hover:text-foreground">
            <ShieldAlert className="size-3.5" /> 批量驳回
          </button>
        </div>
      </div>

      {loading ? (
        <div className="rounded-xl border border-border bg-card p-12 text-center text-[12.5px] text-muted-foreground">正在从 SQLite 加载审批任务...</div>
      ) : groupByRequest ? (
        <div className="space-y-3">
          {grouped.length === 0 && <EmptyApprovalList />}
          {grouped.map((group) => {
            const open = expandedKeys.has(group.key);
            const groupSelected = group.tasks.every((task) => selectedTaskIds.includes(task.id));
            return (
              <div key={group.key} className="overflow-hidden rounded-xl border border-border bg-card">
                <div className="flex items-center gap-2 bg-[oklch(24%_.02_260_/.3)] px-3 py-2">
                  <input
                    type="checkbox"
                    className="size-3.5 accent-primary"
                    checked={groupSelected}
                    onChange={() => toggleGroup(group)}
                  />
                  <button
                    onClick={() => setExpandedKeys((current) => {
                      const next = new Set(current);
                      if (next.has(group.key)) next.delete(group.key);
                      else next.add(group.key);
                      return next;
                    })}
                    className="flex flex-1 items-center gap-2 text-left text-[13px] font-medium text-foreground"
                  >
                    {open ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />}
                    {group.label}
                    <span className="text-[11.5px] text-muted-foreground">· 项目 {group.projectName}</span>
                  </button>
                  <span className="rounded border border-border bg-background px-1.5 py-0.5 text-[11px] text-muted-foreground">{group.tasks.length} 条</span>
                </div>
                {open && <TaskTable tasks={group.tasks} selectedTaskIds={selectedTaskIds} onToggle={(id) => setSelectedTaskIds((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id])} />}
              </div>
            );
          })}
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-border bg-card">
          {visibleTasks.length === 0 ? <EmptyApprovalList /> : <TaskTable tasks={visibleTasks} selectedTaskIds={selectedTaskIds} onToggle={(id) => setSelectedTaskIds((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id])} />}
        </div>
      )}
    </div>
  );
}

function Chip({ children, tone = 'default' }: { children: ReactNode; tone?: 'default' | 'primary' | 'muted' }): JSX.Element {
  const cls = tone === 'primary'
    ? 'border-[oklch(70%_.15_200_/.3)] bg-[oklch(70%_.15_200_/.1)] text-primary'
    : tone === 'muted'
      ? 'border-border bg-secondary text-muted-foreground'
      : 'border-border bg-secondary text-foreground';
  return <span className={`inline-flex items-center rounded-md border px-2 py-0.5 text-[11.5px] ${cls}`}>{children}</span>;
}

function TaskTable({ tasks, selectedTaskIds, onToggle }: { tasks: ApprovalTask[]; selectedTaskIds: string[]; onToggle: (id: string) => void }): JSX.Element {
  return (
    <table className="w-full text-left text-[13px]">
      <thead className="bg-[oklch(16%_.02_260)] text-[11.5px] uppercase tracking-wider text-muted-foreground">
        <tr>
          <th className="w-10 px-3 py-3 font-medium" />
          <th className="px-4 py-3 font-medium">内容</th>
          <th className="px-4 py-3 font-medium">当前节点</th>
          <th className="px-4 py-3 font-medium">进度</th>
          <th className="px-4 py-3 font-medium">SLA</th>
          <th className="px-4 py-3 text-right font-medium">操作</th>
        </tr>
      </thead>
      <tbody>
        {tasks.map((task) => (
          <tr key={task.id} className="border-t border-[oklch(30%_.02_260_/.8)] hover:bg-[oklch(24%_.02_260_/.3)]">
            <td className="px-3 py-3"><input type="checkbox" className="size-3.5 accent-primary" checked={selectedTaskIds.includes(task.id)} onChange={() => onToggle(task.id)} /></td>
            <td className="px-4 py-3">
              <div className="text-[13.5px] font-medium text-foreground">{task.title}</div>
              <div className="mt-0.5 text-[11.5px] text-muted-foreground">{task.contentId} · {task.disease ?? '—'}</div>
            </td>
            <td className="px-4 py-3">
              <span className="inline-flex items-center gap-1 rounded-md border border-[oklch(70%_.15_200_/.3)] bg-[oklch(70%_.15_200_/.1)] px-2 py-0.5 text-[11.5px] text-primary">
                <CheckCircle2 className="h-3.5 w-3.5" /> {task.node}
              </span>
            </td>
            <td className="px-4 py-3 text-[12px] text-muted-foreground tabular">{task.progress}</td>
            <td className="px-4 py-3 text-[12px] text-muted-foreground tabular">{task.sla}</td>
            <td className="px-4 py-3 text-right">
              <button className="inline-flex h-7 items-center gap-1 rounded-md border border-border bg-secondary px-2.5 text-[12px] hover:border-[oklch(70%_.15_200_/.4)] hover:text-primary">查看 / 处理</button>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function EmptyApprovalList(): JSX.Element {
  return <div className="rounded-xl border border-border bg-card p-12 text-center text-[12.5px] text-muted-foreground">当前筛选下暂无审批任务</div>;
}
