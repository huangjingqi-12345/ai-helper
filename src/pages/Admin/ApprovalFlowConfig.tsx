import { useEffect, useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, CheckCircle2, Lock, Plus, Power, PowerOff, Trash2, Workflow } from 'lucide-react';
import { PageHeader } from '@/components/PageHeader';
import { showToast } from '@/components/ui/Toast';
import { getApprovalFlows, getTenantOptions } from '@/api/endpoints/platform';
import type { ApprovalFlow, FlowNode } from '@/types/platform';
import { TENANTS as FALLBACK_TENANTS, type TenantOption } from '@/stores/useTenantStore';

type EditorNode = FlowNode & { locked?: boolean };
type EditorFlow = Omit<ApprovalFlow, 'nodes'> & { description?: string; nodes: EditorNode[] };

const NODE_ROLE_OPTIONS = ['dx_editor', 'px_ops', 'pharma_med'] as const;
const ROLE_LABEL: Record<string, string> = {
  dx_editor: 'DX 医学审核',
  px_ops: 'PX 运营审核',
  pharma_med: '药企审核',
  pharma_mkt: '药企市场审核',
  system_precheck: 'AI 预审',
};

const RETURN_OPTIONS = [{ key: 'submitter', label: '医学编辑修改' }];
const TIMEOUT_ACTIONS = [{ key: 'remind_only', label: '飞书提醒' }];

function nowStr(): string {
  const d = new Date();
  const pad = (n: number): string => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function normalizeFlow(flow: ApprovalFlow & { description?: string }): EditorFlow {
  return {
    ...flow,
    description: flow.description ?? flow.nodes.map((node) => node.name).join(' → '),
    returnPolicy: 'submitter',
    nodes: flow.nodes.map((node, index) => ({
      ...node,
      timeoutPolicy: 'remind_only',
      locked: index < 2 && (node.reviewerType === 'dx_editor' || node.reviewerType === 'px_ops'),
    })),
  };
}

export function ApprovalFlowConfig(): JSX.Element {
  const [tenants, setTenants] = useState<TenantOption[]>(FALLBACK_TENANTS);
  const [selectedTenantId, setSelectedTenantId] = useState('T-PX');
  const [flows, setFlows] = useState<EditorFlow[]>([]);
  const [activeId, setActiveId] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    setLoading(true);
    Promise.resolve()
      .then(async () => {
        const tenantRes = await getTenantOptions();
        const tenantList = tenantRes.data.length > 0 ? tenantRes.data : FALLBACK_TENANTS;
        const flowLists = await Promise.all(tenantList.map(async (tenant) => {
          try {
            const res = await getApprovalFlows(tenant.id);
            return res.data.map((flow) => normalizeFlow(flow as ApprovalFlow & { description?: string }));
          } catch {
            return [] as EditorFlow[];
          }
        }));
        if (!mounted) return;
        const nextFlows = flowLists.flat();
        setTenants(tenantList);
        setFlows(nextFlows);
        setActiveId(nextFlows.find((flow) => flow.tenantId === 'T-PX')?.id ?? nextFlows[0]?.id ?? '');
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });
    return () => { mounted = false; };
  }, []);

  const selectedTenant = tenants.find((tenant) => tenant.id === selectedTenantId) ?? tenants[0] ?? FALLBACK_TENANTS[0]!;
  const tenantFlows = useMemo(() => flows.filter((flow) => flow.tenantId === selectedTenantId), [flows, selectedTenantId]);
  const active = useMemo(() => tenantFlows.find((flow) => flow.id === activeId) ?? null, [activeId, tenantFlows]);

  useEffect(() => {
    if (tenantFlows.length === 0 && activeId) setActiveId('');
    if (tenantFlows.length > 0 && !tenantFlows.some((flow) => flow.id === activeId)) setActiveId(tenantFlows[0]?.id ?? '');
  }, [activeId, tenantFlows]);

  function updateFlow(patch: Partial<EditorFlow>): void {
    setFlows((current) => current.map((flow) => (flow.id === activeId ? { ...flow, ...patch, lastUpdated: nowStr() } : flow)));
  }

  function updateNode(nodeId: string, patch: Partial<EditorNode>): void {
    if (!active) return;
    updateFlow({ nodes: active.nodes.map((node) => (node.id === nodeId ? { ...node, ...patch } : node)) });
  }

  function addNode(): void {
    if (!active) return;
    const used = new Set(active.nodes.map((node) => node.reviewerType));
    const reviewerType = NODE_ROLE_OPTIONS.find((role) => !used.has(role)) ?? 'px_ops';
    updateFlow({
      nodes: [
        ...active.nodes,
        {
          id: `N${Date.now()}`,
          name: ROLE_LABEL[reviewerType] ?? reviewerType,
          reviewerType,
          slaHours: 8,
          timeoutPolicy: 'remind_only',
        },
      ],
    });
    showToast('已新增节点', 'success');
  }

  function removeNode(nodeId: string): void {
    if (!active) return;
    const target = active.nodes.find((node) => node.id === nodeId);
    if (target?.locked) {
      showToast('该节点为系统内置节点，不允许删除', 'error');
      return;
    }
    if (active.nodes.length <= 1) {
      showToast('至少保留 1 个节点', 'error');
      return;
    }
    updateFlow({ nodes: active.nodes.filter((node) => node.id !== nodeId) });
  }

  function moveNode(nodeId: string, dir: -1 | 1): void {
    if (!active) return;
    const i = active.nodes.findIndex((node) => node.id === nodeId);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= active.nodes.length) return;
    const currentNode = active.nodes[i];
    const targetNode = active.nodes[j];
    if (!currentNode || !targetNode) return;
    if (currentNode.locked || targetNode.locked) {
      showToast('系统内置节点位置固定，不允许调整顺序', 'error');
      return;
    }
    const next = active.nodes.slice();
    next[i] = targetNode;
    next[j] = currentNode;
    updateFlow({ nodes: next });
  }

  function toggleActive(): void {
    if (!active) return;
    updateFlow({ status: active.status === 'active' ? 'inactive' : 'active' });
    showToast(active.status === 'active' ? '已停用该流' : '已启用该流', 'success');
  }

  function addFlow(): void {
    const id = `FLOW-${selectedTenantId}-${Date.now().toString(36)}`;
    const newFlow: EditorFlow = {
      id,
      tenantId: selectedTenantId,
      name: `新建审批流 · ${tenantFlows.length + 1}`,
      description: 'DX 医学审核 → PX 运营审核 → 药企审核',
      nodes: [
        { id: `${id}-N1`, name: 'DX 医学审核', reviewerType: 'dx_editor', slaHours: 8, timeoutPolicy: 'remind_only', locked: true },
        { id: `${id}-N2`, name: 'PX 运营审核', reviewerType: 'px_ops', slaHours: 8, timeoutPolicy: 'remind_only', locked: true },
        { id: `${id}-N3`, name: '药企审核', reviewerType: 'pharma_med', slaHours: 8, timeoutPolicy: 'remind_only' },
      ],
      returnPolicy: 'submitter',
      status: 'inactive',
      lastUpdated: nowStr(),
    };
    setFlows((current) => [...current, newFlow]);
    setActiveId(id);
    showToast('已新建审批流草稿，请继续配置', 'success');
  }

  const tenantSelectOptions = tenants.map((tenant) => ({
    tenant,
    count: flows.filter((flow) => flow.tenantId === tenant.id).length,
  }));

  if (loading) {
    return <div className="py-10 text-center text-sm text-muted-foreground">正在从 SQLite 加载审批流...</div>;
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
              <Workflow className="h-3.5 w-3.5" /> {selectedTenant.shortName} 共 {tenantFlows.length} 个审批流
            </span>
            <span className="inline-flex items-center gap-1 rounded-md border border-border bg-secondary px-2 py-0.5 text-[11.5px] text-muted-foreground">
              修改本会话内生效（演示模式）
            </span>
          </>
        }
        actions={
          <div className="flex items-center gap-2">
            <span className="text-[11.5px] text-muted-foreground">选择租户</span>
            <select value={selectedTenantId} onChange={(event) => setSelectedTenantId(event.target.value)} className="h-9 w-[220px] rounded-md border border-border bg-background px-3 text-[12.5px] text-foreground outline-none focus:border-primary/50">
              {tenantSelectOptions.map(({ tenant, count }) => (
                <option key={tenant.id} value={tenant.id}>{tenant.shortName}（{count}）</option>
              ))}
            </select>
          </div>
        }
      />

      <div className="grid grid-cols-[260px_1fr] gap-4">
        <aside className="rounded-xl border border-border bg-card p-2">
          <div className="flex items-center justify-between px-2 pb-1.5 pt-1">
            <span className="text-[11px] uppercase tracking-wider text-muted-foreground">当前租户审批流</span>
            <button onClick={addFlow} className="inline-flex h-6 items-center gap-1 rounded-md border border-primary/30 bg-primary/10 px-1.5 text-[11.5px] text-primary hover:bg-primary/15">
              <Plus className="h-3 w-3" /> 新建
            </button>
          </div>
          {tenantFlows.length === 0 && (
            <div className="rounded-md border border-dashed border-border bg-background/30 p-3 text-center text-[11.5px] text-muted-foreground">
              该租户还未配置审批流，点击上方「新建」创建一个。
            </div>
          )}
          <ul className="space-y-1">
            {tenantFlows.map((flow) => (
              <li key={flow.id}>
                <button
                  onClick={() => setActiveId(flow.id)}
                  className={`flex w-full items-center justify-between gap-2 rounded-md px-2.5 py-2 text-left text-[12.5px] transition-colors ${flow.id === activeId ? 'bg-primary/15 text-primary' : 'hover:bg-secondary/60'}`}
                >
                  <div className="min-w-0">
                    <div className="truncate font-medium">{flow.name}</div>
                    <div className="truncate text-[11px] text-muted-foreground">{flow.nodes.length} 节点 · {flow.status === 'active' ? '启用中' : '已停用'}</div>
                  </div>
                  {flow.status === 'active' && <CheckCircle2 className="h-4 w-4 text-emerald-400" />}
                </button>
              </li>
            ))}
          </ul>
        </aside>

        {active && (
          <section className="space-y-4 rounded-xl border border-border bg-card p-4">
            <div className="flex flex-wrap items-end justify-between gap-3 border-b border-border pb-3">
              <div className="min-w-[220px] flex-1">
                <label className="text-[11.5px] text-muted-foreground">流名称</label>
                <input value={active.name} onChange={(event) => updateFlow({ name: event.target.value })} className="mt-1 w-full rounded-md border border-border bg-background px-3 py-1.5 text-[13px] outline-none focus:border-primary/50" />
                <textarea value={active.description ?? ''} onChange={(event) => updateFlow({ description: event.target.value })} rows={2} placeholder="流说明" className="mt-2 w-full rounded-md border border-border bg-background px-3 py-1.5 text-[12.5px] outline-none focus:border-primary/50" />
              </div>
              <button
                onClick={toggleActive}
                className={`inline-flex h-9 items-center gap-1 rounded-md border px-3 text-[12.5px] ${active.status === 'active' ? 'border-rose-500/40 bg-rose-500/10 text-rose-200 hover:bg-rose-500/20' : 'border-emerald-500/40 bg-emerald-500/10 text-emerald-200 hover:bg-emerald-500/20'}`}
              >
                {active.status === 'active' ? <><PowerOff className="h-3.5 w-3.5" /> 停用</> : <><Power className="h-3.5 w-3.5" /> 启用</>}
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <Field label="打回策略">
                <select value={active.returnPolicy} onChange={(event) => updateFlow({ returnPolicy: event.target.value })} className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-[12.5px]">
                  {RETURN_OPTIONS.map((option) => <option key={option.key} value={option.key}>{option.label}</option>)}
                </select>
              </Field>
              <Field label="最近更新">
                <div className="px-2 py-1.5 text-[12.5px] text-muted-foreground">{active.lastUpdated}</div>
              </Field>
            </div>

            <div className="rounded-lg border border-border">
              <div className="flex items-center justify-between gap-2 border-b border-border px-3 py-2">
                <div className="flex items-center gap-2 text-[12.5px] font-medium">
                  <span>节点（按顺序执行）</span>
                  <span className="inline-flex items-center gap-1 rounded-md border border-amber-500/30 bg-amber-500/10 px-1.5 py-0.5 text-[10.5px] font-normal text-amber-300">
                    <Lock className="h-3 w-3" /> DX 医学审核 / PX 运营审核 为系统内置不可编辑
                  </span>
                </div>
                <button onClick={addNode} className="inline-flex h-7 items-center gap-1 rounded-md border border-primary/30 bg-primary/10 px-2 text-[12px] text-primary hover:bg-primary/15">
                  <Plus className="h-3.5 w-3.5" /> 新增节点
                </button>
              </div>
              <div className="hidden grid-cols-12 items-center gap-2 border-b border-border bg-muted/10 px-3 py-1.5 text-[11px] uppercase tracking-wider text-muted-foreground md:grid">
                <span className="col-span-1">#</span>
                <span className="col-span-3">节点名称</span>
                <span className="col-span-3">角色</span>
                <span className="col-span-2">SLA（小时）</span>
                <span className="col-span-2">超时动作</span>
                <span className="col-span-1 text-right">操作</span>
              </div>
              <ul className="divide-y divide-border">
                {active.nodes.map((node, index) => (
                  <li key={node.id} className={`px-3 py-2.5 ${node.locked ? 'bg-amber-500/5' : ''}`}>
                    <div className="grid grid-cols-12 items-center gap-2">
                      <span className="col-span-1 flex items-center gap-1 text-[11.5px] tabular text-muted-foreground">
                        {index + 1}
                        {node.locked && <span title="系统内置节点，不可重命名 / 换角色 / 调顺序 / 删除" className="inline-flex h-4 w-4 items-center justify-center rounded-sm border border-amber-500/40 bg-amber-500/10 text-amber-300"><Lock className="h-2.5 w-2.5" /></span>}
                      </span>
                      <input className={`col-span-3 rounded-md border border-border bg-background px-2 py-1 text-[12.5px] outline-none focus:border-primary/50 ${node.locked ? 'cursor-not-allowed bg-muted/30 text-muted-foreground' : ''}`} value={node.name} disabled={node.locked} onChange={(event) => updateNode(node.id, { name: event.target.value })} placeholder="节点显示名" />
                      <select className={`col-span-3 rounded-md border border-border bg-background px-2 py-1 text-[12.5px] ${node.locked ? 'cursor-not-allowed bg-muted/30 text-muted-foreground' : ''}`} value={node.reviewerType} disabled={node.locked} onChange={(event) => updateNode(node.id, { reviewerType: event.target.value, name: ROLE_LABEL[event.target.value] ?? node.name })}>
                        {!NODE_ROLE_OPTIONS.includes(node.reviewerType as (typeof NODE_ROLE_OPTIONS)[number]) && <option value={node.reviewerType}>{ROLE_LABEL[node.reviewerType] ?? node.reviewerType}（旧）</option>}
                        {NODE_ROLE_OPTIONS.map((role) => <option key={role} value={role}>{ROLE_LABEL[role]}</option>)}
                      </select>
                      <div className="col-span-2 flex items-center gap-1">
                        <input type="number" min={0} className="w-16 rounded-md border border-border bg-background px-2 py-1 text-[12.5px] outline-none focus:border-primary/50" value={node.slaHours} onChange={(event) => updateNode(node.id, { slaHours: Math.max(0, Number(event.target.value) || 0) })} />
                        <span className="text-[11.5px] text-muted-foreground">小时</span>
                      </div>
                      <select className="col-span-2 rounded-md border border-border bg-background px-2 py-1 text-[12.5px]" value="remind_only" onChange={() => updateNode(node.id, { timeoutPolicy: 'remind_only' })}>
                        {TIMEOUT_ACTIONS.map((option) => <option key={option.key} value={option.key}>{option.label}</option>)}
                      </select>
                      <div className="col-span-1 flex items-center justify-end gap-1">
                        {node.locked ? (
                          <span className="inline-flex items-center gap-1 rounded-md border border-amber-500/30 bg-amber-500/10 px-1.5 py-0.5 text-[10.5px] text-amber-300"><Lock className="h-3 w-3" /> 内置</span>
                        ) : (
                          <>
                            <IconBtn onClick={() => moveNode(node.id, -1)} disabled={index === 0 || active.nodes[index - 1]?.locked}><ArrowUp className="h-3.5 w-3.5" /></IconBtn>
                            <IconBtn onClick={() => moveNode(node.id, 1)} disabled={index === active.nodes.length - 1 || active.nodes[index + 1]?.locked}><ArrowDown className="h-3.5 w-3.5" /></IconBtn>
                            <IconBtn onClick={() => removeNode(node.id)} tone="danger"><Trash2 className="h-3.5 w-3.5" /></IconBtn>
                          </>
                        )}
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            </div>

            <div className="rounded-lg border border-dashed border-border bg-background/30 p-3">
              <div className="mb-2 text-[11.5px] uppercase tracking-wider text-muted-foreground">链路预览</div>
              <div className="flex flex-wrap items-center gap-2 text-[12.5px]">
                {active.nodes.map((node, index) => (
                  <span key={node.id} className="inline-flex items-center gap-2">
                    {index > 0 && <span className="text-muted-foreground">→</span>}
                    <Pill>{node.name}<span className="ml-1 text-[10.5px] text-muted-foreground">{node.slaHours}h</span></Pill>
                  </span>
                ))}
                <span className="text-muted-foreground">→</span>
                <Pill tone="success">发布</Pill>
              </div>
            </div>
          </section>
        )}
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }): JSX.Element {
  return (
    <label className="block">
      <span className="text-[11.5px] text-muted-foreground">{label}</span>
      <div className="mt-1">{children}</div>
    </label>
  );
}

function IconBtn({ children, onClick, disabled, tone }: { children: React.ReactNode; onClick: () => void; disabled?: boolean; tone?: 'danger' }): JSX.Element {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`inline-grid h-7 w-7 place-items-center rounded-md border ${tone === 'danger' ? 'border-rose-500/30 bg-rose-500/10 text-rose-200 hover:bg-rose-500/20 disabled:opacity-40' : 'border-border bg-secondary text-muted-foreground hover:text-foreground disabled:opacity-40'}`}
    >
      {children}
    </button>
  );
}

function Pill({ children, tone = 'default' }: { children: React.ReactNode; tone?: 'default' | 'success' }): JSX.Element {
  const cls = tone === 'success' ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300' : 'border-primary/30 bg-primary/10 text-primary';
  return <span className={`inline-flex items-center rounded-md border px-2 py-0.5 ${cls}`}>{children}</span>;
}
