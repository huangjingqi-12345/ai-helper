import { useEffect, useMemo, useState } from 'react';
import { Plus, Trash2, ArrowUp, ArrowDown, Pause, Workflow } from 'lucide-react';
import { PageHeader } from '@/components/PageHeader';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Select } from '@/components/ui/Select';
import { useLogger } from '@/hooks/useLogger';
import { getApprovalFlows } from '@/api/endpoints/platform';
import type { ApprovalFlow, FlowNode } from '@/types/platform';

const REVIEWER_OPTIONS = [
  { value: 'dx_editor', label: '编辑审核' },
  { value: 'px_ops', label: 'Px 审核' },
  { value: 'pharma_med', label: '药企审核' },
];

const TIMEOUT_OPTIONS = [
  { value: 'remind_only', label: '仅提醒催办' },
  { value: 'auto_pass', label: '超时自动通过' },
  { value: 'escalate', label: '升级 / 驳回重审' },
];

const RETURN_OPTIONS = [
  { value: 'submitter', label: '回到提交人重做' },
  { value: 'previous', label: '回到上一节点重审' },
];

export function ApprovalFlowConfig(): JSX.Element {
  const { log } = useLogger('ApprovalFlowConfig');
  const [flows, setFlows] = useState<ApprovalFlow[]>([]);
  const [selectedFlowId, setSelectedFlowId] = useState<string>('');
  const [selectedTenant, setSelectedTenant] = useState('T-PX');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    setLoading(true);
    getApprovalFlows(selectedTenant)
      .then((res) => {
        if (!mounted) return;
        setFlows(res.data);
        setSelectedFlowId((current) => res.data.some((flow) => flow.id === current) ? current : res.data[0]?.id ?? '');
      })
      .finally(() => { if (mounted) setLoading(false); });
    return () => { mounted = false; };
  }, [selectedTenant]);

  const selectOptions = useMemo(() => [{ value: 'T-PX', label: `Px Ops（${flows.length}）` }], [flows.length]);
  const selectedFlow = flows.find((f) => f.id === selectedFlowId) ?? flows[0];

  const addNode = () => {
    if (!selectedFlow) return;
    log.action('Add node clicked');
    const newNode: FlowNode = {
      id: `node-${Date.now()}`,
      name: '新审核节点',
      reviewerType: 'dx_editor',
      slaHours: 24,
      timeoutPolicy: 'remind_only',
    };
    setFlows(flows.map((f) => f.id === selectedFlowId ? { ...f, nodes: [...f.nodes, newNode] } : f));
  };

  const removeNode = (nodeId: string) => {
    log.action('Remove node', { nodeId });
    if (!selectedFlow) return;
    setFlows(flows.map((f) => f.id === selectedFlowId ? { ...f, nodes: f.nodes.filter((n) => n.id !== nodeId) } : f));
  };

  const moveNode = (index: number, direction: 'up' | 'down') => {
    if (!selectedFlow) return;
    const newIndex = direction === 'up' ? index - 1 : index + 1;
    if (newIndex < 0 || newIndex >= selectedFlow.nodes.length) return;
    const newNodes = [...selectedFlow.nodes];
    const temp = newNodes[index];
    const target = newNodes[newIndex];
    if (!temp || !target) return;
    newNodes[index] = target;
    newNodes[newIndex] = temp;
    setFlows(flows.map((f) => f.id === selectedFlowId ? { ...f, nodes: newNodes } : f));
  };

  const addFlow = () => {
    log.action('Create new flow');
    const newFlow: ApprovalFlow = {
      id: `flow-${Date.now()}`,
      name: '新审批流',
      status: 'inactive',
      returnPolicy: 'submitter',
      lastUpdated: new Date().toISOString().slice(0, 10),
      nodes: [{ id: `node-${Date.now()}`, name: '编辑审核', reviewerType: 'dx_editor', slaHours: 24, timeoutPolicy: 'remind_only' }],
    };
    setFlows([...flows, newFlow]);
    setSelectedFlowId(newFlow.id);
  };

  const chainDesc = selectedFlow?.nodes.map((n) => n.name).join(' → ') ?? '';

  if (loading) {
    return <div className="py-10 text-center text-sm text-text-muted">正在从 SQLite 加载审批流...</div>;
  }

  if (!selectedFlow) {
    return <Card className="py-10 text-center text-sm text-text-muted">当前租户暂无审批流。</Card>;
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="平台管理 · 审批流配置"
        title="自定义审批流"
        subtitle="编排「编辑审核 → Px 审核 → 药企审核」纯审核链路，可按业务自由增删节点、设置 SLA 与打回策略。不同租户独立配置。"
        meta={
          <>
            <span className="inline-flex items-center gap-1 rounded-md border border-border bg-secondary px-2 py-0.5 text-[11.5px] text-muted-foreground">
              <Workflow className="h-3.5 w-3.5" /> Px Ops 共 {flows.length} 个审批流
            </span>
            <span className="inline-flex items-center gap-1 rounded-md border border-border bg-secondary px-2 py-0.5 text-[11.5px] text-muted-foreground">
              修改本会话内生效（演示模式）
            </span>
          </>
        }
        actions={
          <div className="flex items-center gap-2">
            <span className="text-xs text-text-muted">选择租户</span>
            <Select options={selectOptions} value={selectedTenant} onChange={setSelectedTenant} />
          </div>
        }
      />

      <div className="grid grid-cols-[260px_1fr] gap-4">
        {/* Left panel: Flow list */}
        <Card className="rounded-xl border-border bg-card p-0">
          <div className="flex items-center justify-between px-4 py-3 border-b border-border">
            <span className="text-sm font-medium text-text-primary">当前租户审批流</span>
            <Button size="sm" variant="ghost" onClick={addFlow}>
              <Plus className="w-3.5 h-3.5" />
              新建
            </Button>
          </div>
          <div className="flex flex-col">
            {flows.map((flow) => (
              <button
                key={flow.id}
                onClick={() => setSelectedFlowId(flow.id)}
                className={`px-4 py-3 text-left border-b border-border/50 transition-colors ${
                  selectedFlowId === flow.id ? 'bg-accent-blue/10' : 'hover:bg-bg-tertiary'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className={`text-sm font-medium ${selectedFlowId === flow.id ? 'text-accent-blue' : 'text-text-primary'}`}>
                    {flow.name}
                  </span>
                  {flow.status === 'active' && <span className="w-2 h-2 rounded-full bg-accent-green" />}
                </div>
                <div className="text-xs text-text-muted mt-0.5">
                  {flow.nodes.length} 节点 · {flow.status === 'active' ? '启用中' : '已停用'}
                </div>
              </button>
            ))}
          </div>
        </Card>

        {/* Right panel: Flow editor */}
        <Card className="space-y-5 rounded-xl border-border bg-card p-4">
          <div className="space-y-3">
            <div className="grid grid-cols-[1fr_auto] items-end gap-3">
              <div>
                <label className="text-xs text-text-muted block mb-1">流名称</label>
                <input
                  type="text"
                  value={selectedFlow.name}
                  onChange={(e) => setFlows(flows.map((f) => f.id === selectedFlowId ? { ...f, name: e.target.value } : f))}
                  className="w-full px-3 py-2 bg-bg-tertiary border border-border rounded-lg text-sm text-text-primary focus:outline-none focus:ring-1 focus:ring-accent-blue"
                />
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  log.action('Toggle flow status', { id: selectedFlowId });
                  setFlows(flows.map((f) => f.id === selectedFlowId ? { ...f, status: f.status === 'active' ? 'inactive' : 'active' } : f));
                }}
              >
                <Pause className="w-4 h-4" />
                {selectedFlow.status === 'active' ? '停用' : '启用'}
              </Button>
            </div>
          </div>

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-6">
              <div>
                <label className="text-xs text-text-muted block mb-1">打回策略</label>
                <Select
                  options={RETURN_OPTIONS}
                  value={selectedFlow.returnPolicy}
                  onChange={(v) => setFlows(flows.map((f) => f.id === selectedFlowId ? { ...f, returnPolicy: v } : f))}
                />
              </div>
              <div>
                <label className="text-xs text-text-muted block mb-1">最近更新</label>
                <span className="text-sm text-text-secondary">{selectedFlow.lastUpdated}</span>
              </div>
            </div>
          </div>

          {/* Nodes table */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm font-medium text-text-primary">节点（按顺序执行）</span>
              <Button size="sm" onClick={addNode}>
                <Plus className="w-3.5 h-3.5" />
                新增节点
              </Button>
            </div>
            <table className="w-full">
              <thead>
                <tr className="border-b border-border bg-bg-secondary/50">
                  <th className="px-3 py-2 text-left text-xs font-medium text-text-muted w-8">#</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-text-muted">节点名称</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-text-muted">角色</th>
                  <th className="px-3 py-2 text-center text-xs font-medium text-text-muted">SLA（小时）</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-text-muted">超时动作</th>
                  <th className="px-3 py-2 text-center text-xs font-medium text-text-muted w-24">操作</th>
                </tr>
              </thead>
              <tbody>
                {selectedFlow.nodes.map((node, idx) => (
                  <tr key={node.id} className="border-b border-border/50">
                    <td className="px-3 py-2 text-sm text-text-muted">{idx + 1}</td>
                    <td className="px-3 py-2">
                      <input
                        type="text"
                        value={node.name}
                        placeholder="节点显示名"
                        onChange={(e) => {
                          const newNodes = [...selectedFlow.nodes];
                          const currentNode = newNodes[idx];
                          if (!currentNode) return;
                          newNodes[idx] = { ...currentNode, name: e.target.value };
                          setFlows(flows.map((f) => f.id === selectedFlowId ? { ...f, nodes: newNodes } : f));
                        }}
                        className="w-full px-2 py-1 bg-bg-tertiary border border-border rounded text-sm text-text-primary focus:outline-none focus:ring-1 focus:ring-accent-blue"
                      />
                    </td>
                    <td className="px-3 py-2">
                      <select
                        value={node.reviewerType}
                        onChange={(e) => {
                          const newNodes = [...selectedFlow.nodes];
                          const currentNode = newNodes[idx];
                          if (!currentNode) return;
                          newNodes[idx] = { ...currentNode, reviewerType: e.target.value };
                          setFlows(flows.map((f) => f.id === selectedFlowId ? { ...f, nodes: newNodes } : f));
                        }}
                        className="px-2 py-1 bg-bg-tertiary border border-border rounded text-xs text-text-primary focus:outline-none"
                      >
                        {REVIEWER_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                      </select>
                    </td>
                    <td className="px-3 py-2 text-center">
                      <div className="flex items-center justify-center gap-1">
                        <input
                          type="number"
                          value={node.slaHours}
                          onChange={(e) => {
                            const newNodes = [...selectedFlow.nodes];
                            const currentNode = newNodes[idx];
                            if (!currentNode) return;
                            newNodes[idx] = { ...currentNode, slaHours: parseInt(e.target.value) || 0 };
                            setFlows(flows.map((f) => f.id === selectedFlowId ? { ...f, nodes: newNodes } : f));
                          }}
                          className="w-14 px-2 py-1 bg-bg-tertiary border border-border rounded text-xs text-text-primary text-center focus:outline-none"
                        />
                        <span className="text-xs text-text-muted">小时</span>
                      </div>
                    </td>
                    <td className="px-3 py-2">
                      <select
                        value={node.timeoutPolicy}
                        onChange={(e) => {
                          const newNodes = [...selectedFlow.nodes];
                          const currentNode = newNodes[idx];
                          if (!currentNode) return;
                          newNodes[idx] = { ...currentNode, timeoutPolicy: e.target.value };
                          setFlows(flows.map((f) => f.id === selectedFlowId ? { ...f, nodes: newNodes } : f));
                        }}
                        className="px-2 py-1 bg-bg-tertiary border border-border rounded text-xs text-text-primary focus:outline-none"
                      >
                        {TIMEOUT_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                      </select>
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex items-center justify-center gap-1">
                        <button onClick={() => moveNode(idx, 'up')} disabled={idx === 0} className="p-1 rounded hover:bg-bg-tertiary text-text-muted disabled:opacity-30">
                          <ArrowUp size={12} />
                        </button>
                        <button onClick={() => moveNode(idx, 'down')} disabled={idx === selectedFlow.nodes.length - 1} className="p-1 rounded hover:bg-bg-tertiary text-text-muted disabled:opacity-30">
                          <ArrowDown size={12} />
                        </button>
                        <button onClick={() => removeNode(node.id)} className="p-1 rounded hover:bg-accent-red/10 text-accent-red">
                          <Trash2 size={12} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="rounded-lg border border-border bg-bg-secondary/50 p-3">
            <div className="text-xs text-text-muted">链路预览</div>
            <div className="mt-2 text-sm text-text-primary">{chainDesc} → 发布</div>
          </div>
        </Card>
      </div>
    </div>
  );
}
