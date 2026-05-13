import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, CheckCircle, RotateCcw, Save, ShieldCheck } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { showToast } from '@/components/ui/Toast';
import { getDistributionProjectById, getDistributionProjectDoctors } from '@/api/endpoints/distribution';
import type { DistributionProject, DoctorCandidate } from '@/types/distribution';

const filterGroups = {
  科室: ['心内科', '内分泌科', '肿瘤科', '呼吸科', '风湿免疫科', '消化内科', '神经内科', '全科'],
  职称: ['主任医师', '副主任医师', '主治医师', '住院医师'],
  区域: ['华东', '华南', '华北', '华中', '西南', '西北', '东北'],
  标签: ['KOL', '写作活跃', '病例丰富', '科普达人', '学术活跃', '新晋'],
};

const flowNodes = ['DX 小编审核', 'AI 预审', 'PX 运营审核', '药企医学审核', '药企市场部审核'];
const defaultFilters = Object.fromEntries(Object.entries(filterGroups).map(([label, values]) => [label, [values[0]]])) as Record<string, string[]>;

export function DistributionProjectDetail(): JSX.Element {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<'doctor' | 'approval'>('doctor');
  const [activeFilters, setActiveFilters] = useState<Record<string, string[]>>(defaultFilters);
  const [project, setProject] = useState<DistributionProject | null>(null);
  const [doctorCandidates, setDoctorCandidates] = useState<DoctorCandidate[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    setLoading(true);
    Promise.all([getDistributionProjectById(id), getDistributionProjectDoctors(id)])
      .then(([projectRes, doctorsRes]) => {
        if (!mounted) return;
        setProject(projectRes.data);
        setDoctorCandidates(doctorsRes.data);
      })
      .catch(() => {
        if (mounted) setProject(null);
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });
    return () => { mounted = false; };
  }, [id]);

  const candidates = useMemo(
    () => project ? doctorCandidates
      .filter((doctor) => doctor.specialties.includes(project.disease) || doctor.dept.includes(project.disease.slice(0, 2)))
      .filter((doctor) => {
        const deptFilters = activeFilters['科室'] ?? [];
        const regionFilters = activeFilters['区域'] ?? [];
        const tagFilters = activeFilters['标签'] ?? [];
        const titleFilters = activeFilters['职称'] ?? [];
        if (deptFilters.length && !deptFilters.includes(doctor.dept)) return false;
        if (regionFilters.length && !regionFilters.includes(doctor.region)) return false;
        if (tagFilters.length && !tagFilters.some((tag) => doctor.tags.includes(tag))) return false;
        if (titleFilters.length && !titleFilters.includes(doctor.title)) return false;
        return true;
      })
      .slice(0, 4) : [],
    [activeFilters, doctorCandidates, project],
  );
  const visibleCandidates = candidates.length > 0 ? candidates : doctorCandidates.slice(0, 1);
  const toggleFilter = (label: string, value: string): void => {
    setActiveFilters((current) => {
      const selected = current[label] ?? [];
      return {
        ...current,
        [label]: selected.includes(value)
          ? selected.filter((item) => item !== value)
          : [...selected, value],
      };
    });
  };

  if (loading) {
    return <div className="py-10 text-center text-sm text-text-muted">正在从 SQLite 加载项目详情...</div>;
  }

  if (!project) {
    return (
      <div className="space-y-4">
        <button onClick={() => navigate('/distribute')} className="inline-flex items-center gap-1 text-xs text-text-muted hover:text-text-primary">
          <ArrowLeft className="w-3.5 h-3.5" /> 返回项目清单
        </button>
        <Card className="py-10 text-center text-sm text-text-muted">未找到该分发项目。</Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <button onClick={() => navigate('/distribute')} className="inline-flex items-center gap-1 text-xs text-text-muted hover:text-text-primary">
        <ArrowLeft className="w-3.5 h-3.5" /> 返回项目清单
      </button>

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
        <Link to="/approvals">
          <Button variant="secondary" size="sm"><ShieldCheck className="w-4 h-4" />前往审批中心</Button>
        </Link>
      </div>

      <div className="flex gap-2 border-b border-border">
        <button onClick={() => setActiveTab('doctor')} className={`px-4 py-3 text-sm ${activeTab === 'doctor' ? 'border-b-2 border-accent-blue text-accent-blue' : 'text-text-muted'}`}>医生分发策略</button>
        <button onClick={() => setActiveTab('approval')} className={`px-4 py-3 text-sm ${activeTab === 'approval' ? 'border-b-2 border-accent-blue text-accent-blue' : 'text-text-muted'}`}>审批节点</button>
      </div>

      {activeTab === 'doctor' ? (
        <div className="grid grid-cols-[1fr_320px] gap-6">
          <Card className="space-y-5">
            <h2 className="text-base font-semibold text-text-primary">筛选范围</h2>
            {Object.entries(filterGroups).map(([label, values]) => (
              <div key={label}>
                <div className="mb-2 text-xs text-text-muted">{label}</div>
                <div className="flex flex-wrap gap-2">
                  {values.map((value) => (
                    <button
                      key={value}
                      onClick={() => toggleFilter(label, value)}
                      className={`rounded-full border px-3 py-1 text-xs transition-colors ${
                        activeFilters[label]?.includes(value)
                          ? 'border-accent-blue bg-accent-blue/15 text-accent-blue'
                          : 'border-border text-text-secondary hover:border-border-light'
                      }`}
                    >
                      {value}
                    </button>
                  ))}
                </div>
              </div>
            ))}
            <div className="grid grid-cols-2 gap-4 border-t border-border pt-4">
              <div>
                <label className="mb-1 block text-xs text-text-muted">分配方式</label>
                <div className="rounded-lg border border-border bg-bg-tertiary px-3 py-2 text-sm text-text-primary">公开抢单</div>
              </div>
              <div>
                <label className="mb-1 block text-xs text-text-muted">每位医生上限（篇）</label>
                <input defaultValue="2" className="w-full rounded-lg border border-border bg-bg-tertiary px-3 py-2 text-sm text-text-primary" />
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => {
                  setActiveFilters(defaultFilters);
                  showToast('已恢复默认医生筛选策略', 'info');
                }}
              >
                <RotateCcw className="w-3.5 h-3.5" />恢复默认
              </Button>
              <Button
                size="sm"
                onClick={() => showToast('医生分发策略已保存（演示模式）', 'success')}
              >
                <Save className="w-3.5 h-3.5" />保存策略
              </Button>
            </div>
          </Card>

          <Card>
            <h2 className="text-base font-semibold text-text-primary">命中候选医生</h2>
            <p className="mt-1 text-xs text-text-muted">{visibleCandidates.length} 位 · 根据上述筛选与项目病种交叉得到，可作为派单参考。</p>
            <div className="mt-4 space-y-3">
              {visibleCandidates.map((doctor) => (
                <div key={doctor.name} className="rounded-lg border border-border bg-bg-secondary/60 p-3">
                  <div className="flex items-center gap-3">
                    <div className="flex h-9 w-9 items-center justify-center rounded-full bg-accent-blue/20 text-sm font-bold text-accent-blue">{doctor.name[0]}</div>
                    <div><div className="text-sm font-medium text-text-primary">{doctor.name}</div><div className="text-xs text-text-muted">· {doctor.title}</div></div>
                  </div>
                  <div className="mt-2 text-xs text-text-secondary">{doctor.dept} · {doctor.region} · {doctor.specialties}</div>
                  <div className="mt-2 flex gap-1">{doctor.tags.map((tag) => <Badge key={tag} color="blue">{tag}</Badge>)}</div>
                </div>
              ))}
            </div>
          </Card>
        </div>
      ) : (
        <Card>
          <h2 className="text-base font-semibold text-text-primary">审批节点</h2>
          <div className="mt-5 flex flex-wrap items-center gap-3">
            {flowNodes.map((node, index) => {
              const done = index < Math.round((project.progress / 100) * flowNodes.length);
              return (
                <div key={node} className="flex items-center gap-3">
                  <div className={`rounded-lg border px-3 py-2 text-xs ${done ? 'border-accent-green bg-accent-green/15 text-accent-green' : 'border-border text-text-secondary'}`}>
                    {done && <CheckCircle className="mr-1 inline h-3 w-3" />}{node}
                  </div>
                  {index < flowNodes.length - 1 && <span className="text-text-muted">→</span>}
                </div>
              );
            })}
            <div className="rounded-lg border border-accent-blue/40 bg-accent-blue/10 px-3 py-2 text-xs text-accent-blue">发布</div>
          </div>
        </Card>
      )}
    </div>
  );
}
