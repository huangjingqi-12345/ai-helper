import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { CheckCircle, Clock, ListChecks, XCircle } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Modal } from '@/components/ui/Modal';
import { showToast } from '@/components/ui/Toast';
import { useLogger } from '@/hooks/useLogger';

import { getApprovalTasks, updateApprovalTask } from '@/api/endpoints/approval';
import type { ApprovalTask } from '@/types/approval';

type ApprovalFilter = 'pending' | 'approved' | 'rejected' | 'all';

const flowNodes = ['医生制作', '编辑审核', 'AI 预审', 'Px 审核', '药企审核'];

export function ApprovalCenter(): JSX.Element {
  const { log } = useLogger('ApprovalCenter');
  const [tasks, setTasks] = useState<ApprovalTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeFilter, setActiveFilter] = useState<ApprovalFilter>('pending');
  const [selected, setSelected] = useState<ApprovalTask | null>(null);
  const [action, setAction] = useState<'approve' | 'reject'>('approve');
  const [rejectReason, setRejectReason] = useState('');
  const [comments, setComments] = useState('');

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

  const pendingCount = tasks.filter((task) => task.status === 'pending').length;
  const approvedCount = tasks.filter((task) => task.status === 'approved').length;
  const rejectedCount = tasks.filter((task) => task.status === 'rejected').length;
  const filteredTasks = useMemo(() => (
    activeFilter === 'all' ? tasks : tasks.filter((task) => task.status === activeFilter)
  ), [activeFilter, tasks]);

  const submit = async (): Promise<void> => {
    if (!selected) return;
    if (action === 'reject' && (!rejectReason.trim() || !comments.trim())) {
      showToast('不通过时请填写驳回原因和修改建议', 'error');
      return;
    }
    try {
      const res = await updateApprovalTask(selected.id, { action, rejectReason, comments });
      setTasks((current) => current.map((task) => task.id === selected.id ? res.data : task));
      log.action('Approval handled', { id: selected.id, action, rejectReason, comments });
      showToast(action === 'approve' ? '已提交通过' : '已提交驳回', 'success');
      setSelected(null);
      setRejectReason('');
      setComments('');
      setAction('approve');
    } catch (error) {
      log.error('Approval action failed', error);
      showToast('审批提交失败，请检查后端服务', 'error');
    }
  };

  const openTask = (task: ApprovalTask): void => {
    setSelected(task);
    setAction(task.status === 'rejected' ? 'reject' : 'approve');
    setRejectReason('');
    setComments('');
  };

  const filterCards = [
    { filter: 'pending' as const, label: '待我审批', count: pendingCount, icon: <Clock className="mx-auto mb-2 w-5 h-5 text-accent-yellow" />, color: 'text-accent-yellow' },
    { filter: 'approved' as const, label: '已通过(全流程)', count: approvedCount, icon: <CheckCircle className="mx-auto mb-2 w-5 h-5 text-accent-green" />, color: 'text-accent-green' },
    { filter: 'rejected' as const, label: '驳回中', count: rejectedCount, icon: <XCircle className="mx-auto mb-2 w-5 h-5 text-accent-red" />, color: 'text-accent-red' },
    { filter: 'all' as const, label: '全部任务', count: tasks.length, icon: <ListChecks className="mx-auto mb-2 w-5 h-5 text-text-primary" />, color: 'text-text-primary' },
  ];

  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <Badge color="blue" className="text-[10px] uppercase tracking-wider">Approvals · Ops</Badge>
        <h1 className="text-2xl font-bold text-text-primary">审批中心</h1>
        <p className="text-sm text-text-secondary max-w-3xl">DX 小编 / AI 预审 / PX 运营 三个内部节点的代办与全量轨迹；可针对每条内容做「通过 / 不通过 + 修改建议」。</p>
        <div className="flex flex-wrap items-center gap-3 text-xs text-text-muted">
          <span>租户：Px Ops</span><span>当前流：PX 默认审批流</span><span>共 5 个节点</span><span>打回策略：回到提交人</span>
          <Link to="/admin/approval-flows" className="text-accent-blue hover:underline">审批流配置</Link>
        </div>
      </div>

      <div className="grid grid-cols-4 gap-4">
        {filterCards.map((card) => (
          <button
            key={card.filter}
            onClick={() => setActiveFilter(card.filter)}
            className={`rounded-card border bg-bg-card p-5 text-center transition-colors hover:border-accent-blue/50 ${activeFilter === card.filter ? 'border-accent-blue ring-1 ring-accent-blue/40' : 'border-border'}`}
          >
            {card.icon}
            <div className={`font-mono text-2xl font-bold ${card.color}`}>{card.count}</div>
            <div className="text-xs text-text-muted mt-1">{card.label}</div>
          </button>
        ))}
      </div>

      <Card className="p-0 overflow-hidden">
        <table className="w-full">
          <thead><tr className="border-b border-border bg-bg-secondary/60"><th className="px-4 py-3 text-left text-xs text-text-muted">内容</th><th className="px-4 py-3 text-left text-xs text-text-muted">当前节点</th><th className="px-4 py-3 text-left text-xs text-text-muted">进度</th><th className="px-4 py-3 text-left text-xs text-text-muted">SLA</th><th className="px-4 py-3 text-right text-xs text-text-muted">操作</th></tr></thead>
          <tbody>
            {loading && (
              <tr><td colSpan={5} className="px-4 py-10 text-center text-sm text-text-muted">正在从 SQLite 加载审批任务...</td></tr>
            )}
            {!loading && filteredTasks.map((task) => (
              <tr key={task.id} className="border-b border-border/50 hover:bg-bg-tertiary/30">
                <td className="px-4 py-3"><div className="text-sm font-medium text-text-primary">{task.title}</div><div className="text-xs text-text-muted mt-1">{task.id} · {task.disease}</div></td>
                <td className="px-4 py-3"><Badge color={task.status === 'rejected' ? 'red' : task.status === 'approved' ? 'green' : 'blue'}>{task.node}</Badge></td>
                <td className="px-4 py-3 text-sm font-mono text-text-secondary">{task.progress}</td>
                <td className={`px-4 py-3 text-sm font-mono ${task.status === 'approved' ? 'text-accent-green' : task.status === 'rejected' ? 'text-accent-red' : 'text-accent-yellow'}`}>{task.sla}</td>
                <td className="px-4 py-3 text-right"><Button variant="ghost" size="sm" onClick={() => openTask(task)}>查看 / 处理</Button></td>
              </tr>
            ))}
          </tbody>
        </table>
        {!loading && filteredTasks.length === 0 && <div className="px-4 py-10 text-center text-sm text-text-muted">当前筛选下暂无审批任务。</div>}
      </Card>

      <Modal
        open={!!selected}
        onClose={() => setSelected(null)}
        title={selected?.title ?? '审批处理'}
        maxWidth="max-w-2xl"
        footer={<><Button variant="secondary" onClick={() => setSelected(null)}>Close</Button><Button onClick={submit}>{action === 'approve' ? '提交通过' : '提交驳回'}</Button></>}
      >
        {selected && (
          <div className="space-y-5">
            <div className="text-xs text-text-muted">{selected.id} · {selected.disease} · {selected.author}</div>
            <div>
              <div className="mb-2 text-sm font-medium text-text-primary">审批链路</div>
              <div className="grid grid-cols-1 gap-2">
                {flowNodes.map((node) => <div key={node} className={`rounded-lg border px-3 py-2 text-xs ${node === selected.node ? 'border-accent-blue bg-accent-blue/15 text-accent-blue' : 'border-border text-text-secondary'}`}>{node}</div>)}
              </div>
            </div>
            <div>
              <div className="mb-2 text-sm font-medium text-text-primary">审批历史</div>
              <div className="space-y-2 text-xs text-text-muted"><div>提交 · 作者 · 郑医生 <span className="float-right">2026-04-11</span></div><div>通过 · 编辑审核 · DX-阿杰 <span className="float-right">2026-04-12</span></div><div>通过 · AI 预审 · AI 预审服务 <span className="float-right">2026-04-13</span></div><div>意见：AI 预审通过</div></div>
            </div>
            <div>
              <div className="mb-2 text-sm font-medium text-text-primary">在「{selected.node}」节点处理</div>
              <div className="flex gap-2"><Button size="sm" variant={action === 'approve' ? 'primary' : 'secondary'} onClick={() => setAction('approve')}>通过</Button><Button size="sm" variant={action === 'reject' ? 'danger' : 'secondary'} onClick={() => setAction('reject')}>不通过</Button></div>
              {action === 'reject' && (
                <div className="mt-3 space-y-3">
                  <textarea value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} placeholder="驳回原因（必填）" className="h-20 w-full resize-none rounded-lg border border-border bg-bg-tertiary px-3 py-2 text-sm text-text-primary placeholder:text-text-muted" />
                  <textarea value={comments} onChange={(e) => setComments(e.target.value)} placeholder="给作者的修改建议（必填，越具体返工越快）" className="h-24 w-full resize-none rounded-lg border border-border bg-bg-tertiary px-3 py-2 text-sm text-text-primary placeholder:text-text-muted" />
                </div>
              )}
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
