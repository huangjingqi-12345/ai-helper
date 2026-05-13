import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, CheckCircle, Save, ShieldCheck, SlidersHorizontal } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Modal } from '@/components/ui/Modal';
import { showToast } from '@/components/ui/Toast';
import { getDistributionProjectById } from '@/api/endpoints/distribution';
import type { DistributionProject } from '@/types/distribution';

const liveRequests: Record<string, ProjectRequest[]> = {
  'PRJ-1000': [
    { id: 'REQ-2031', date: '2026-05-07 09:42', pieces: 6, title: 'ARNI 新适应症释义 · 多子项诉求', strategy: '继承项目默认', status: '待受理', topics: ['疾病认知', '规范治疗', '康复与随访'], formats: ['长图文 × 3', '海报 × 2', '手册 × 1'], note: '等待运营受理与合规预审' },
    { id: 'REQ-2024', date: '2026-04-22 10:05', pieces: 3, title: '利尿剂调整 · 出院 30 天指引', strategy: '继承项目默认', status: '分发中', topics: ['规范治疗', '康复与随访'], formats: ['长图文 × 3'], note: '灰度 50% 推送中，第 4 天' },
    { id: 'REQ-2022', date: '2026-04-08 09:00', pieces: 3, title: '心衰营养 · 低盐调查表', strategy: '继承项目默认', status: '已完成', topics: ['生活方式'], formats: ['长图文 × 2', '海报 × 1'], note: '周期结束，KPI 达成 110%' },
  ],
};

const flowNodes = ['医生制作', '编辑审核', '编辑修改', 'Px 审核', '药企审核', '发布'];

type Tab = 'requests' | 'strategy' | 'approval';

type ProjectRequest = {
  id: string;
  date: string;
  pieces: number;
  title: string;
  strategy: string;
  status: string;
  topics: string[];
  formats: string[];
  note: string;
};

export function DistributionProjectDetail(): JSX.Element {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<Tab>('requests');
  const [project, setProject] = useState<DistributionProject | null>(null);
  const [loading, setLoading] = useState(true);
  const [configRequest, setConfigRequest] = useState<ProjectRequest | null>(null);

  useEffect(() => {
    let mounted = true;
    setLoading(true);
    getDistributionProjectById(id)
      .then((res) => { if (mounted) setProject(res.data); })
      .catch(() => { if (mounted) setProject(null); })
      .finally(() => { if (mounted) setLoading(false); });
    return () => { mounted = false; };
  }, [id]);

  const requests = useMemo(() => {
    if (liveRequests[id]) return liveRequests[id];
    if (!project) return [];
    return [
      { id: `REQ-${project.id.slice(-4)}`, date: '2026-05-07 09:42', pieces: project.totalPieces, title: `${project.brand} · ${project.disease} 患教诉求`, strategy: '继承项目默认', status: project.status === 'intake' ? '待受理' : '制作中', topics: project.topics.map((topic) => topic.split('·')[0] || topic), formats: project.formats.split(' · '), note: `当前节点：${project.currentNode}` },
    ];
  }, [id, project]);

  if (loading) return <div className="py-10 text-center text-sm text-text-muted">正在加载项目详情...</div>;

  if (!project) {
    return (
      <div className="space-y-4">
        <button onClick={() => navigate('/distribute')} className="inline-flex items-center gap-1 text-xs text-text-muted hover:text-text-primary"><ArrowLeft className="w-3.5 h-3.5" /> 返回分发策略</button>
        <Card className="py-10 text-center text-sm text-text-muted">未找到该分发项目。</Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Link to="/distribute" className="inline-flex items-center gap-1 text-xs text-text-muted hover:text-text-primary"><ArrowLeft className="w-3.5 h-3.5" /> 返回分发策略</Link>

      <div className="flex items-start justify-between gap-4">
        <div className="space-y-3">
          <Badge color="blue" className="text-[10px] uppercase tracking-wider">Project</Badge>
          <h1 className="text-2xl font-bold text-text-primary">{project.title}</h1>
          <p className="text-sm text-text-secondary">{project.disease} · {project.brand} · 负责人 {project.owner}</p>
          <div className="flex flex-wrap items-center gap-2 text-xs text-text-muted">
            <Badge color="gray">租户 {project.tenantId}</Badge>
            <span>期望上线 {project.expectedDate}</span>
            <span>{project.approvalFlow} · 进度 {project.progress}%</span>
          </div>
        </div>
        <Link to="/approvals"><Button variant="secondary" size="sm"><ShieldCheck className="h-4 w-4" />前往审批中心</Button></Link>
      </div>

      <div className="flex gap-2 border-b border-border">
        <TabButton active={activeTab === 'requests'} onClick={() => setActiveTab('requests')}>关联诉求</TabButton>
        <TabButton active={activeTab === 'strategy'} onClick={() => setActiveTab('strategy')}>项目默认策略</TabButton>
        <TabButton active={activeTab === 'approval'} onClick={() => setActiveTab('approval')}>审批节点</TabButton>
      </div>

      {activeTab === 'requests' && <RequestList requests={requests} onConfigure={setConfigRequest} />}
      {activeTab === 'strategy' && <DefaultStrategy project={project} />}
      {activeTab === 'approval' && <ApprovalNodes project={project} />}

      <Modal open={!!configRequest} onClose={() => setConfigRequest(null)} title="配置分发策略" maxWidth="max-w-2xl" footer={<><Button variant="secondary" onClick={() => setConfigRequest(null)}>Close</Button><Button onClick={() => { setConfigRequest(null); showToast('诉求分发策略已保存', 'success'); }}>保存策略</Button></>}>
        {configRequest && <div className="space-y-4"><div className="text-sm text-text-primary">{configRequest.id} · {configRequest.title}</div><div className="grid grid-cols-2 gap-3"><Info label="分配方式" value="公开抢单 + 指定 KOL" /><Info label="患者灰度" value="50% 起跑，24h 复盘" /><Info label="触达渠道" value="微信公众号 / 短信" /><Info label="SLA" value="24h 内完成首轮配置" /></div><textarea placeholder="策略备注" className="h-24 w-full rounded-lg border border-border bg-bg-tertiary px-3 py-2 text-sm text-text-primary placeholder:text-text-muted" /></div>}
      </Modal>
    </div>
  );
}

function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }): JSX.Element {
  return <button onClick={onClick} className={`px-4 py-3 text-sm ${active ? 'border-b-2 border-accent-blue text-accent-blue' : 'text-text-muted hover:text-text-primary'}`}>{children}</button>;
}

function RequestList({ requests, onConfigure }: { requests: ProjectRequest[]; onConfigure: (request: ProjectRequest) => void }): JSX.Element {
  return <div className="grid gap-4">{requests.map((request) => <Card key={request.id} className="space-y-4"><div className="flex items-start justify-between gap-4"><div><div className="text-xs text-text-muted">{request.id} · {request.date} · {request.pieces} 篇</div><h2 className="mt-1 text-base font-semibold text-text-primary">诉求 · {request.title}</h2><div className="mt-1 text-xs text-text-muted">{request.strategy}</div></div><div className="flex items-center gap-2"><Badge color={request.status === '已完成' ? 'green' : request.status === '分发中' ? 'blue' : 'yellow'}>{request.status}</Badge><Button size="sm" variant="secondary" onClick={() => onConfigure(request)}>配置分发策略</Button></div></div><div className="grid grid-cols-3 gap-3"><Info label="主题" value={`${request.topics.join(' / ')} · ${request.topics.length} 个主题`} /><Info label="形式" value={`${request.formats.join(' · ')} · 合计 ${request.pieces} 篇`} /><Info label="进展" value={request.note} /></div></Card>)}</div>;
}

function DefaultStrategy({ project }: { project: DistributionProject }): JSX.Element {
  const [cap, setCap] = useState(String(project.patientCap));
  return <div className="grid grid-cols-[1fr_340px] gap-6"><Card className="space-y-5"><h2 className="text-base font-semibold text-text-primary">项目默认策略</h2><p className="text-xs text-text-muted">未单独配置的诉求将继承以下医生与患者触达规则。</p><div className="grid grid-cols-2 gap-4"><Info label="内容主题" value={project.topics.join(' / ')} /><Info label="内容形式" value={project.formats} /><Info label="审批流" value={project.approvalFlow} /><Info label="当前节点" value={project.currentNode} /></div><div className="border-t border-border pt-4"><div className="mb-2 flex items-center gap-2 text-sm font-medium text-text-primary"><SlidersHorizontal className="h-4 w-4" />患者分发</div><div className="grid grid-cols-2 gap-3"><label className="text-xs text-text-muted">患者上限<input value={cap} onChange={(event) => setCap(event.target.value)} className="mt-1 w-full rounded-lg border border-border bg-bg-tertiary px-3 py-2 text-sm text-text-primary" /></label><Info label="灰度策略" value="30% → 50% → 100%，按阅读完成率放量" /></div></div><div className="flex justify-end"><Button onClick={() => showToast('项目默认策略已保存', 'success')}><Save className="h-4 w-4" />保存默认策略</Button></div></Card><Card><h2 className="text-base font-semibold text-text-primary">医生分发默认</h2><p className="mt-1 text-xs text-text-muted">按病种匹配科室、职称、区域和内容创作活跃度。</p><div className="mt-4 space-y-3"><Info label="科室" value="心内科 / 内分泌科 / 肿瘤科 / 风湿免疫科" /><Info label="职称" value="主任医师 / 副主任医师优先" /><Info label="标签" value="KOL / 写作活跃 / 科普达人" /><Info label="每位医生上限" value="2 篇" /></div></Card></div>;
}

function ApprovalNodes({ project }: { project: DistributionProject }): JSX.Element {
  const completed = Math.round((project.progress / 100) * (flowNodes.length - 1));
  return <Card><h2 className="text-base font-semibold text-text-primary">审批节点</h2><p className="mt-1 text-xs text-text-muted">当前流：{project.approvalFlow} · 当前节点：{project.currentNode}</p><div className="mt-5 flex flex-wrap items-center gap-3">{flowNodes.map((node, index) => { const done = index <= completed && project.progress > 0; return <div key={node} className="flex items-center gap-3"><div className={`rounded-lg border px-3 py-2 text-xs ${done ? 'border-accent-green bg-accent-green/15 text-accent-green' : 'border-border text-text-secondary'}`}>{done && <CheckCircle className="mr-1 inline h-3 w-3" />}{node}</div>{index < flowNodes.length - 1 && <span className="text-text-muted">→</span>}</div>; })}</div></Card>;
}

function Info({ label, value }: { label: string; value: React.ReactNode }): JSX.Element {
  return <div className="rounded-lg border border-border bg-bg-secondary/60 p-3"><div className="text-[10px] text-text-muted">{label}</div><div className="mt-1 text-xs text-text-secondary">{value}</div></div>;
}
