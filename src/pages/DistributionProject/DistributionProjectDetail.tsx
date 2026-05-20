import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Building2, Calendar, FileText, Inbox, Layers, Settings as SettingsIcon, ShieldCheck } from 'lucide-react';
import { PageHeader } from '@/components/PageHeader';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { getDistributionProjectById } from '@/api/endpoints/distribution';
import { getContentRequests } from '@/api/endpoints/content';
import type { DistributionProject } from '@/types/distribution';
import type { ContentRequestRecord } from '@/types/content';

type ProjectRequestStatus = 'pending' | 'in_progress' | 'in_review' | 'distributing' | 'completed' | 'rejected';

type ProjectRequest = {
  id: string;
  date: string;
  pieces: number;
  title: string;
  strategy: string;
  status: ProjectRequestStatus;
  topics: string[];
  formats: string[];
  note: string;
  routeId?: string;
};

const THEME_LABELS: Record<string, string> = {
  awareness: '疾病认知',
  screening: '早筛与诊断',
  treatment: '规范治疗',
  adverse: '不良反应应对',
  followup: '康复与随访',
  lifestyle: '生活方式',
  psychology: '心理与家属',
  timely: '节点与热点',
};

const FORMAT_LABELS: Record<string, string> = {
  article: '长图文',
  longtext: '长图文',
  poster: '海报',
  checklist: '手册',
  manual: '手册',
};

const PROJECT_TENANT_OVERRIDE: Record<string, string> = {
  'PRJ-1001': 'T-AZ',
};

const PROJECT_FLOW_OVERRIDE: Record<string, string> = {
  'PRJ-1001': '阿斯利康 · 标准审批流',
};

const REQUEST_STATUS_LABEL: Record<ProjectRequestStatus, { text: string; color: 'yellow' | 'blue' | 'green' | 'red' | 'purple' | 'gray'; className: string }> = {
  pending: { text: '待受理', color: 'yellow', className: 'border-amber-500/40 bg-amber-500/10 text-amber-200' },
  in_progress: { text: '制作中', color: 'blue', className: 'border-sky-500/40 bg-sky-500/10 text-sky-200' },
  in_review: { text: '审核中', color: 'blue', className: 'border-cyan-500/40 bg-cyan-500/10 text-cyan-200' },
  distributing: { text: '分发中', color: 'purple', className: 'border-violet-500/40 bg-violet-500/10 text-violet-200' },
  completed: { text: '已完成', color: 'green', className: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300' },
  rejected: { text: '已驳回', color: 'red', className: 'border-rose-500/40 bg-rose-500/10 text-rose-300' },
};

function matrixTopics(request: ContentRequestRecord): string[] {
  return Object.keys(request.themeFormatMatrix ?? {}).map((theme) => THEME_LABELS[theme] ?? theme);
}

function matrixFormats(request: ContentRequestRecord): string[] {
  const totals: Record<string, number> = {};
  Object.values(request.themeFormatMatrix ?? {}).forEach((row) => {
    Object.entries(row ?? {}).forEach(([format, count]) => {
      totals[format] = (totals[format] ?? 0) + (Number(count) || 0);
    });
  });
  return Object.entries(totals)
    .filter(([, count]) => count > 0)
    .map(([format, count]) => `${FORMAT_LABELS[format] ?? format} × ${count}`);
}

function requestStatus(status: ContentRequestRecord['status']): ProjectRequestStatus {
  if (status === 'accepted') return 'in_progress';
  if (status === 'converted') return 'completed';
  if (status === 'rejected') return 'rejected';
  return 'pending';
}

function mapRequest(request: ContentRequestRecord): ProjectRequest {
  return {
    id: request.id,
    date: request.submittedAt,
    pieces: request.totalCount,
    title: request.requestName || request.title,
    strategy: '继承项目默认',
    status: requestStatus(request.status),
    topics: matrixTopics(request),
    formats: matrixFormats(request),
    note: request.note ?? '',
  };
}

export function DistributionProjectDetail(): JSX.Element {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const [project, setProject] = useState<DistributionProject | null>(null);
  const [requests, setRequests] = useState<ProjectRequest[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    setLoading(true);

    getDistributionProjectById(id)
      .then(async (projectRes) => {
        if (!mounted) return;
        setProject(projectRes.data);
        try {
          const requestRes = await getContentRequests({ projectId: id, pageSize: 100 });
          if (mounted) setRequests(requestRes.data.map(mapRequest));
        } catch {
          if (mounted) setRequests([]);
        }
      })
      .catch(() => {
        if (!mounted) return;
        setProject(null);
        setRequests([]);
      })
      .finally(() => { if (mounted) setLoading(false); });
    return () => { mounted = false; };
  }, [id]);

  if (loading) return <div className="py-10 text-center text-sm text-muted-foreground">正在加载项目详情...</div>;

  if (!project) {
    return (
      <div className="space-y-4">
        <button onClick={() => navigate('/distribute')} className="inline-flex items-center gap-1 text-[12px] text-muted-foreground hover:text-foreground"><ArrowLeft className="h-3.5 w-3.5" /> 返回分发策略</button>
        <Card className="py-10 text-center text-sm text-muted-foreground">未找到该分发项目。</Card>
      </div>
    );
  }

  const tenantId = PROJECT_TENANT_OVERRIDE[project.id] ?? project.tenantId;
  const approvalFlow = PROJECT_FLOW_OVERRIDE[project.id] ?? project.approvalFlow;
  const progress = project.id === 'PRJ-1001' ? 0 : project.progress;

  return (
    <div className="space-y-6">
      <Link to="/distribute" className="inline-flex items-center gap-1 text-[12px] text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-3.5 w-3.5" /> 返回分发策略
      </Link>

      <PageHeader
        eyebrow="PROJECT"
        title={project.title}
        subtitle={`${project.disease}${project.brand ? ` · ${project.brand}` : ''} · 负责人 ${project.owner}`}
        meta={
          <div className="flex flex-wrap items-center gap-2 text-[12px] text-muted-foreground">
            <Tag><Building2 className="mr-1 inline h-3 w-3" />租户 {tenantId}</Tag>
            <Tag><Calendar className="mr-1 inline h-3 w-3" />期望上线 {project.expectedDate}</Tag>
            <span className="rounded border border-primary/30 bg-primary/10 px-2 py-0.5 text-primary">{approvalFlow} · 进度 {progress}%</span>
          </div>
        }
        actions={
          <Link to="/approvals">
            <Button variant="secondary" size="sm"><ShieldCheck className="h-4 w-4" />前往审批中心</Button>
          </Link>
        }
      />

      <RequestPanel requests={requests} />
    </div>
  );
}

function RequestPanel({ requests }: { requests: ProjectRequest[] }): JSX.Element {
  if (requests.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-border/60 bg-card/30 p-10 text-center text-[12.5px] text-muted-foreground">
        <Inbox className="mx-auto mb-2 h-6 w-6 opacity-50" />
        本项目下尚无诉求；可前往「患教内容工坊」发起。
      </div>
    );
  }

  return <div className="space-y-3">{requests.map((request) => <RequestRow key={request.id} request={request} />)}</div>;
}

function RequestRow({ request }: { request: ProjectRequest }): JSX.Element {
  const status = REQUEST_STATUS_LABEL[request.status];
  return (
    <div className="rounded-lg border border-border/70 bg-card/60 p-4 transition-colors hover:border-primary/40">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 text-[11.5px] text-muted-foreground">
            <span className="tabular-nums">{request.id}</span>
            <span>·</span>
            <span>{request.date}</span>
            <span>·</span>
            <span className="tabular-nums text-foreground/80">{request.pieces} 篇</span>
          </div>
          <div className="mt-0.5 flex items-center gap-2">
            <h4 className="truncate text-[13.5px] font-semibold text-foreground">诉求 · {request.title}</h4>
            <Badge color="gray" className="border-border/60 bg-secondary/40 text-[10.5px] text-muted-foreground">{request.strategy}</Badge>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <span className={`inline-flex h-[22px] items-center rounded border px-2 text-[11px] ${status.className}`}>{status.text}</span>
          <Link to={`/distribute/request/${request.routeId ?? request.id}`}>
            <Button variant="secondary" size="sm"><SettingsIcon className="h-3.5 w-3.5" />配置分发策略</Button>
          </Link>
        </div>
      </div>

      <div className="mt-3 grid grid-cols-[80px_1fr_120px] items-center gap-2 text-[11.5px]">
        <div className="flex items-center gap-1 text-muted-foreground"><Layers className="h-3.5 w-3.5 text-primary" /> 主题</div>
        <div className="flex flex-wrap gap-1">
          {request.topics.map((topic) => <Badge key={topic} color="gray" className="border-border/60 px-1.5 py-0 text-[10.5px]">{topic}</Badge>)}
        </div>
        <div className="text-right text-[10.5px] text-muted-foreground">{request.topics.length} 个主题</div>
      </div>
      <div className="mt-1 grid grid-cols-[80px_1fr_120px] items-center gap-2 text-[11.5px]">
        <div className="flex items-center gap-1 text-muted-foreground"><FileText className="h-3.5 w-3.5 text-primary" /> 形式</div>
        <div className="flex flex-wrap gap-1">
          {request.formats.map((format) => <Badge key={format} color="gray" className="border-border/60 px-1.5 py-0 text-[10.5px]">{format}</Badge>)}
        </div>
        <div className="text-right text-[10.5px] text-muted-foreground">合计 {request.pieces} 篇</div>
      </div>
      {request.note && (
        <div className="mt-3 text-[11.5px] leading-relaxed text-muted-foreground">
          {request.note}
        </div>
      )}
    </div>
  );
}

function Tag({ children }: { children: React.ReactNode }): JSX.Element {
  return <span className="rounded border border-border bg-muted/30 px-2 py-0.5">{children}</span>;
}
