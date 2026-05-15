import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { CheckCircle2, ChevronDown, ChevronRight, Circle, Layers, ShieldAlert, X } from 'lucide-react';
import { PageHeader } from '@/components/PageHeader';
import { showToast } from '@/components/ui/Toast';
import { useLogger } from '@/hooks/useLogger';
import { getApprovalTasks, updateApprovalTask } from '@/api/endpoints/approval';
import type { ApprovalTask } from '@/types/approval';

type ApprovalFilter = 'pending' | 'approved' | 'rejected' | 'all';
type ApprovalDecision = 'approve' | 'reject';

type ApprovalGroup = {
  key: string;
  label: string;
  projectName: string;
  tasks: ApprovalTask[];
};

type RequirementMeta = {
  label: string;
  shortLabel: string;
  projectName: string;
  historyActor?: string;
  historyDate?: string;
  sla?: string;
};

const requirementByContent: Record<string, RequirementMeta> = {
  'CNT-102': {
    label: '诉求 · 首输 6 周内安全信号识别',
    shortLabel: '首输 6 周内安全信号识别',
    projectName: '优赫得 · HER2 ADC 重点随访',
    historyActor: '王医生',
    historyDate: '2026-04-10',
    sla: '531h / 8h',
  },
  'CNT-105': {
    label: '诉求 · 5 年辅助服药遗忘补救 5 问',
    shortLabel: '5 年辅助服药遗忘补救 5 问',
    projectName: '他莫昔芬 · 内分泌依从性',
    historyActor: '王医生',
    historyDate: '2026-04-10',
    sla: '507h / 8h',
  },
  'CNT-106': {
    label: '诉求 · 二线口服方案 · 常见问题 8 问',
    shortLabel: '二线口服方案 · 常见问题 8 问',
    projectName: '唯择 · CDK4/6 二线依从性',
    historyActor: '王医生',
    historyDate: '2026-04-10',
    sla: '531h / 8h',
  },
  'CNT-107': {
    label: '诉求 · 机制对比 · 驳回',
    shortLabel: '机制对比 · 驳回',
    projectName: '优赫得 · HER2 ADC 重点随访',
    historyActor: '王医生',
    historyDate: '2026-04-10',
    sla: '459h / 8h',
  },
};

const APPROVAL_STEPS = [
  { label: 'DX 医学审核', role: '编辑审核' },
  { label: 'PX 运营审核', role: 'Px 审核' },
  { label: '药企审核', role: '药企审核' },
];

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

function displayNode(task: ApprovalTask): string {
  if (task.status === 'approved') return '发布';
  if (task.status === 'rejected') return 'DX 医学审核';
  if (task.node === '编辑审核') return 'DX 医学审核';
  if (task.node === 'Px 审核') return 'PX 运营审核';
  return task.node || 'DX 医学审核';
}

function displaySla(task: ApprovalTask): string {
  return requirementByContent[task.contentId]?.sla ?? task.sla;
}

function currentStepIndex(task: ApprovalTask): number {
  if (task.status === 'approved') return 3;
  const node = displayNode(task);
  const index = APPROVAL_STEPS.findIndex((step) => step.label === node || step.role === node);
  return index >= 0 ? index : 0;
}

function replaceTask(tasks: ApprovalTask[], nextTask: ApprovalTask): ApprovalTask[] {
  return tasks.map((task) => (task.id === nextTask.id || task.contentId === nextTask.contentId ? nextTask : task));
}

export function ApprovalCenter(): JSX.Element {
  const { log } = useLogger('ApprovalCenter');
  const [tasks, setTasks] = useState<ApprovalTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeFilter, setActiveFilter] = useState<ApprovalFilter>('pending');
  const [groupByRequest, setGroupByRequest] = useState(true);
  const [selectedTaskIds, setSelectedTaskIds] = useState<string[]>([]);
  const [expandedKeys, setExpandedKeys] = useState<Set<string>>(new Set());
  const [activeTask, setActiveTask] = useState<ApprovalTask | null>(null);
  const [decision, setDecision] = useState<ApprovalDecision>('approve');
  const [approvalComment, setApprovalComment] = useState('');
  const [saving, setSaving] = useState(false);

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

  const openDrawer = (task: ApprovalTask): void => {
    setActiveTask(task);
    setDecision('approve');
    setApprovalComment('');
  };

  const batchAction = async (action: ApprovalDecision): Promise<void> => {
    log.action('Approval batch action clicked', { action, selectedTaskIds });
    if (selectedTaskIds.length === 0) {
      showToast('请先勾选要批量处理的内容', 'info');
      return;
    }
    setSaving(true);
    try {
      const selectedTasks = tasks.filter((task) => selectedTaskIds.includes(task.id));
      const updated = await Promise.all(selectedTasks.map((task) => updateApprovalTask(task.id, { action })));
      setTasks((current) => updated.reduce((acc, response) => replaceTask(acc, response.data), current));
      showToast(action === 'approve' ? `已批量通过 ${selectedTaskIds.length} 条` : `已批量驳回 ${selectedTaskIds.length} 条`, 'success');
      setSelectedTaskIds([]);
      if (activeTask && selectedTaskIds.includes(activeTask.id)) setActiveTask(null);
    } catch {
      showToast(action === 'approve' ? '批量通过失败，请稍后重试' : '批量驳回失败，请稍后重试', 'error');
    } finally {
      setSaving(false);
    }
  };

  const submitActiveTask = async (): Promise<void> => {
    if (!activeTask) return;
    setSaving(true);
    try {
      const res = await updateApprovalTask(activeTask.id, {
        action: decision,
        comments: approvalComment.trim() || undefined,
        rejectReason: decision === 'reject' ? approvalComment.trim() || '医学编辑修改' : undefined,
      });
      setTasks((current) => replaceTask(current, res.data));
      setSelectedTaskIds((current) => current.filter((id) => id !== activeTask.id));
      showToast(decision === 'approve' ? '已提交通过' : '已提交不通过', 'success');
      setActiveTask(null);
    } catch {
      showToast('审批提交失败，请检查后端服务', 'error');
    } finally {
      setSaving(false);
    }
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
          <button disabled={saving} onClick={() => void batchAction('approve')} className="inline-flex h-7 items-center gap-1 rounded-md bg-primary px-3 text-[12px] font-medium text-primary-foreground disabled:opacity-50">
            <CheckCircle2 className="size-3.5" /> 批量通过
          </button>
          <button disabled={saving} onClick={() => void batchAction('reject')} className="inline-flex h-7 items-center gap-1 rounded-md border border-border bg-secondary px-3 text-[12px] text-muted-foreground hover:border-[oklch(70%_.15_200_/.4)] hover:text-foreground disabled:opacity-50">
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
                {open && <TaskTable tasks={group.tasks} selectedTaskIds={selectedTaskIds} onToggle={(id) => setSelectedTaskIds((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id])} onOpen={openDrawer} />}
              </div>
            );
          })}
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-border bg-card">
          {visibleTasks.length === 0 ? <EmptyApprovalList /> : <TaskTable tasks={visibleTasks} selectedTaskIds={selectedTaskIds} onToggle={(id) => setSelectedTaskIds((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id])} onOpen={openDrawer} />}
        </div>
      )}

      <ApprovalDrawer
        task={activeTask}
        decision={decision}
        comment={approvalComment}
        saving={saving}
        onDecision={setDecision}
        onComment={setApprovalComment}
        onClose={() => setActiveTask(null)}
        onSubmit={() => void submitActiveTask()}
      />
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

function TaskTable({
  tasks,
  selectedTaskIds,
  onToggle,
  onOpen,
}: {
  tasks: ApprovalTask[];
  selectedTaskIds: string[];
  onToggle: (id: string) => void;
  onOpen: (task: ApprovalTask) => void;
}): JSX.Element {
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
        {tasks.map((task) => {
          const requirement = requirementByContent[task.contentId];
          return (
            <tr key={task.id} className="border-t border-[oklch(30%_.02_260_/.8)] hover:bg-[oklch(24%_.02_260_/.3)]">
              <td className="px-3 py-3"><input type="checkbox" className="size-3.5 accent-primary" checked={selectedTaskIds.includes(task.id)} onChange={() => onToggle(task.id)} /></td>
              <td className="px-4 py-3">
                <div className="text-[13.5px] font-medium text-foreground">{task.title}</div>
                {requirement && <div className="mt-0.5 text-[11.5px] text-muted-foreground">项目 · {requirement.projectName} · 诉求 · {requirement.shortLabel}</div>}
                <div className="mt-0.5 text-[11.5px] text-muted-foreground">{task.contentId} · {task.disease ?? '—'}</div>
              </td>
              <td className="px-4 py-3">
                <span className="inline-flex items-center gap-1 rounded-md border border-[oklch(70%_.15_200_/.3)] bg-[oklch(70%_.15_200_/.1)] px-2 py-0.5 text-[11.5px] text-primary">
                  <CheckCircle2 className="h-3.5 w-3.5" /> {displayNode(task)}
                </span>
              </td>
              <td className="px-4 py-3 text-[12px] text-muted-foreground tabular">{task.progress}</td>
              <td className="px-4 py-3 text-[12px] text-muted-foreground tabular">{displaySla(task)}</td>
              <td className="px-4 py-3 text-right">
                <button onClick={() => onOpen(task)} className="inline-flex h-7 items-center gap-1 rounded-md border border-border bg-secondary px-2.5 text-[12px] hover:border-[oklch(70%_.15_200_/.4)] hover:text-primary">查看 / 处理</button>
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function ApprovalDrawer({
  task,
  decision,
  comment,
  saving,
  onDecision,
  onComment,
  onClose,
  onSubmit,
}: {
  task: ApprovalTask | null;
  decision: ApprovalDecision;
  comment: string;
  saving: boolean;
  onDecision: (decision: ApprovalDecision) => void;
  onComment: (comment: string) => void;
  onClose: () => void;
  onSubmit: () => void;
}): JSX.Element | null {
  if (!task) return null;
  const stepIndex = currentStepIndex(task);
  const activeNode = displayNode(task);
  const requirement = requirementByContent[task.contentId];
  const historyActor = requirement?.historyActor ?? task.author ?? '作者';
  const historyDate = requirement?.historyDate ?? '2026-04-10';

  return (
    <aside className="fixed inset-y-0 right-0 z-50 w-full max-w-[544px] border-l border-border bg-[oklch(18%_.02_260)] p-5 shadow-[-24px_0_60px_rgba(0,0,0,0.35)]">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-[14px] font-semibold leading-snug text-foreground">{task.title}</h2>
          <p className="mt-2 text-[12px] text-muted-foreground">{task.contentId} · {task.disease ?? '—'} · {task.author}</p>
        </div>
        <button aria-label="Close" onClick={onClose} className="rounded p-1 text-muted-foreground hover:bg-secondary hover:text-foreground"><X className="h-4 w-4" /></button>
      </div>

      <div className="mt-10 space-y-8">
        <section>
          <div className="mb-3 text-[12.5px] text-muted-foreground">审批链路</div>
          <div className="space-y-2">
            {APPROVAL_STEPS.map((step, index) => {
              const active = index === stepIndex;
              return (
                <div key={step.label} className={`flex items-center justify-between rounded-lg border px-3 py-2.5 ${active ? 'border-primary/60 bg-primary/10 text-primary' : 'border-border bg-secondary/70 text-muted-foreground'}`}>
                  <div className="flex items-center gap-2 text-[12.5px] font-medium">
                    <Circle className={`h-4 w-4 ${active ? 'fill-primary/20' : ''}`} />
                    {step.label}
                  </div>
                  <div className="text-[11px] opacity-80">{step.role}</div>
                </div>
              );
            })}
          </div>
        </section>

        <section>
          <div className="mb-3 text-[12.5px] text-muted-foreground">审批历史</div>
          <div className="flex items-center justify-between rounded-lg border border-border bg-secondary/70 px-3 py-2.5 text-[12px]">
            <span className="text-muted-foreground">提交 · 作者 · {historyActor}</span>
            <span className="tabular-nums text-muted-foreground">{historyDate}</span>
          </div>
        </section>

        <section>
          <div className="mb-3 text-[12.5px] text-muted-foreground">在「{activeNode}」节点处理</div>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => onDecision('approve')}
              className={`h-9 rounded-lg border text-[12.5px] font-medium transition ${decision === 'approve' ? 'border-primary bg-emerald-500/20 text-emerald-100 shadow-[0_0_0_1px_rgba(45,212,191,0.65)]' : 'border-border bg-secondary text-muted-foreground hover:text-foreground'}`}
            >
              通过
            </button>
            <button
              type="button"
              onClick={() => onDecision('reject')}
              className={`h-9 rounded-lg border text-[12.5px] font-medium transition ${decision === 'reject' ? 'border-rose-400 bg-rose-500/15 text-rose-200 shadow-[0_0_0_1px_rgba(251,113,133,0.55)]' : 'border-border bg-secondary text-muted-foreground hover:text-foreground'}`}
            >
              不通过
            </button>
          </div>
          <label className="mt-3 block text-[12px] text-muted-foreground">
            审批意见（可选）
            <textarea
              value={comment}
              onChange={(event) => onComment(event.target.value)}
              className="mt-2 h-[74px] w-full resize-none rounded-lg border border-border bg-background/70 px-3 py-2 text-[12.5px] text-foreground outline-none focus:border-primary/60"
            />
          </label>
          <div className="mt-5 flex justify-end">
            <button disabled={saving} onClick={onSubmit} className="inline-flex h-9 items-center rounded-lg bg-primary px-4 text-[12.5px] font-semibold text-primary-foreground disabled:opacity-50">
              {decision === 'approve' ? '提交通过' : '提交不通过'}
            </button>
          </div>
        </section>
      </div>
    </aside>
  );
}

function EmptyApprovalList(): JSX.Element {
  return <div className="rounded-xl border border-border bg-card p-12 text-center text-[12.5px] text-muted-foreground">当前筛选下暂无审批任务</div>;
}
