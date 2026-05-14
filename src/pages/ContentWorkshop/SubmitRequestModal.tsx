import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Minus, Plus } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { Select } from '@/components/ui/Select';
import { showToast } from '@/components/ui/Toast';
import { useContentStore } from '@/stores/useContentStore';
import type { ContentPriority, ContentRequestFormat, ContentRequestMatrix } from '@/types';

interface SubmitRequestModalProps {
  open: boolean;
  onClose: () => void;
}

const THEMES = [
  { key: 'awareness', label: '疾病认知', hint: '病因、机制、分型与流行病学等基础认知' },
  { key: 'screening', label: '早筛与诊断', hint: '高危人群识别、症状预警、检查项目解读' },
  { key: 'treatment', label: '规范治疗', hint: '治疗方案、用药指导、依从性提升' },
  { key: 'adverse', label: '不良反应应对', hint: '副作用识别、应对处理与就医提示' },
  { key: 'followup', label: '康复与随访', hint: '术后/疗后康复要点、复诊与随访节点' },
  { key: 'lifestyle', label: '生活方式', hint: '饮食、运动、睡眠、戒烟限酒等日常管理' },
  { key: 'psychology', label: '心理与家属', hint: '情绪支持、心理调适与家属照护' },
  { key: 'timely', label: '节点与热点', hint: '疾病日 / 节日 / 行业热点等时令选题' },
];

const FORMATS: { key: ContentRequestFormat; label: string }[] = [
  { key: 'article', label: '长图文' },
  { key: 'poster', label: '海报' },
  { key: 'checklist', label: '手册' },
];

const defaultMatrix: ContentRequestMatrix = { treatment: { article: 2 } };

function defaultExpectedDate(): string {
  const date = new Date();
  date.setDate(date.getDate() + 21);
  return date.toISOString().slice(0, 10);
}

function totalPieces(matrix: ContentRequestMatrix): number {
  return Object.values(matrix).reduce(
    (sum, row) => sum + Object.values(row).reduce((rowSum, value) => rowSum + (value ?? 0), 0),
    0
  );
}

export function SubmitRequestModal({ open, onClose }: SubmitRequestModalProps): JSX.Element {
  const { requestProjects, fetchRequestProjects, submitRequest, loading } = useContentStore();
  const [projectId, setProjectId] = useState('');
  const [requestName, setRequestName] = useState('');
  const [priority, setPriority] = useState<ContentPriority>('P1');
  const [expectedDate, setExpectedDate] = useState(defaultExpectedDate);
  const [matrix, setMatrix] = useState<ContentRequestMatrix>(defaultMatrix);
  const [note, setNote] = useState('');

  useEffect(() => {
    if (open) void fetchRequestProjects();
  }, [open, fetchRequestProjects]);

  useEffect(() => {
    if (open && !projectId && requestProjects.length > 0) setProjectId(requestProjects[0]!.id);
  }, [open, projectId, requestProjects]);

  const selectedProject = requestProjects.find((project) => project.id === projectId);
  const enabledThemes = useMemo(() => Object.keys(matrix), [matrix]);
  const total = useMemo(() => totalPieces(matrix), [matrix]);

  const toggleTheme = (theme: string) => {
    setMatrix((current) => {
      const next = { ...current };
      if (next[theme]) {
        delete next[theme];
      } else {
        next[theme] = { article: 1 };
      }
      return next;
    });
  };

  const updateCount = (theme: string, format: ContentRequestFormat, value: number) => {
    setMatrix((current) => ({
      ...current,
      [theme]: {
        ...(current[theme] ?? {}),
        [format]: Math.max(0, Math.min(99, value)),
      },
    }));
  };

  const resetAndClose = () => {
    setProjectId('');
    setRequestName('');
    setPriority('P1');
    setExpectedDate(defaultExpectedDate());
    setMatrix(defaultMatrix);
    setNote('');
    onClose();
  };

  const handleSubmit = async () => {
    if (!projectId) return showToast('请先选择所属项目', 'error');
    if (!requestName.trim()) return showToast('请填写本次诉求名称', 'error');
    if (!expectedDate) return showToast('请选择期望上线日', 'error');
    if (enabledThemes.length === 0 || total <= 0) return showToast('请至少填写 1 篇主题 × 形式诉求', 'error');

    try {
      const content = await submitRequest({
        projectId,
        requestName: requestName.trim(),
        priority,
        expectedDate,
        themeFormatMatrix: matrix,
        note: note.trim(),
      });
      showToast(`已提交诉求：${content.title}`, 'success');
      resetAndClose();
    } catch {
      showToast('提交诉求失败，请检查后端服务', 'error');
    }
  };

  return (
    <Modal
      open={open}
      onClose={resetAndClose}
      title="发起一条选题诉求"
      maxWidth="max-w-5xl"
      footer={
        <>
          <Button variant="secondary" onClick={resetAndClose}>取消</Button>
          <Button onClick={handleSubmit} disabled={loading}>提交诉求</Button>
        </>
      }
    >
      <div className="grid gap-5 lg:grid-cols-[1fr_280px]">
        <div className="space-y-5">
          <section className="rounded-xl border border-border bg-bg-primary/40 p-4">
            <div className="mb-3 text-xs font-semibold uppercase tracking-wider text-accent-blue">01 · 项目</div>
            {requestProjects.length === 0 ? (
              <div className="flex items-start gap-2 rounded-lg border border-accent-yellow/40 bg-accent-yellow/10 p-3 text-xs text-accent-yellow">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                当前租户视角下还没有可关联的项目，请先在「平台管理 · 项目管理」创建项目。
              </div>
            ) : (
              <div className="grid gap-3 md:grid-cols-2">
                <Select
                  label="所属项目"
                  value={projectId}
                  onChange={setProjectId}
                  options={requestProjects.map((project) => ({
                    value: project.id,
                    label: project.name,
                  }))}
                />
                <label className="flex flex-col gap-1.5 text-sm text-text-secondary">
                  本次诉求名称
                  <input
                    value={requestName}
                    onChange={(event) => setRequestName(event.target.value)}
                    placeholder="例如：出院 30 天随访节点提醒"
                    className="rounded-lg border border-border bg-bg-secondary px-3 py-2 text-sm text-text-primary outline-none focus:border-accent-blue"
                  />
                </label>
              </div>
            )}
            {selectedProject && (
              <div className="mt-3 grid grid-cols-2 gap-2 rounded-lg border border-dashed border-border p-3 text-xs text-text-secondary md:grid-cols-4">
                <span>病种：{selectedProject.disease}</span>
                <span>品牌：{selectedProject.brand || '—'}</span>
                <span>负责人：{selectedProject.owner || 'PX 运营组'}</span>
                <span>内容：{selectedProject.contentCount ?? 0} 篇</span>
              </div>
            )}
            <div className="mt-3 grid gap-3 md:grid-cols-2">
              <div>
                <div className="mb-1.5 text-sm text-text-secondary">优先级</div>
                <div className="flex gap-2">
                  {(['P0', 'P1', 'P2'] as ContentPriority[]).map((item) => (
                    <Button key={item} variant={priority === item ? 'primary' : 'secondary'} className="flex-1" onClick={() => setPriority(item)}>
                      {item}
                    </Button>
                  ))}
                </div>
              </div>
              <label className="flex flex-col gap-1.5 text-sm text-text-secondary">
                期望上线日
                <input
                  type="date"
                  value={expectedDate}
                  onChange={(event) => setExpectedDate(event.target.value)}
                  className="rounded-lg border border-border bg-bg-secondary px-3 py-2 text-sm text-text-primary outline-none focus:border-accent-blue"
                />
              </label>
            </div>
          </section>

          <section className="rounded-xl border border-border bg-bg-primary/40 p-4">
            <div className="mb-3 flex items-center justify-between">
              <div className="text-xs font-semibold uppercase tracking-wider text-accent-blue">02 · 主题 × 形式</div>
              <span className="text-xs text-text-muted">合计 {total} 篇</span>
            </div>
            <div className="grid gap-2 md:grid-cols-4">
              {THEMES.map((theme) => {
                const active = Boolean(matrix[theme.key]);
                return (
                  <button
                    key={theme.key}
                    type="button"
                    onClick={() => toggleTheme(theme.key)}
                    className={`rounded-lg border p-3 text-left transition-colors ${
                      active ? 'border-accent-blue bg-accent-blue/10' : 'border-border bg-bg-secondary hover:border-accent-blue/50'
                    }`}
                  >
                    <div className="text-sm font-medium text-text-primary">{theme.label}{active ? ' ✓' : ''}</div>
                    <div className="mt-1 text-xs text-text-muted">{theme.hint}</div>
                  </button>
                );
              })}
            </div>

            <div className="mt-4 overflow-x-auto">
              <table className="w-full min-w-[640px] text-sm">
                <thead className="text-xs text-text-muted">
                  <tr>
                    <th className="py-2 text-left">主题</th>
                    {FORMATS.map((format) => <th key={format.key} className="py-2 text-center">{format.label}</th>)}
                    <th className="py-2 text-center">小计</th>
                  </tr>
                </thead>
                <tbody>
                  {enabledThemes.map((theme) => {
                    const row = matrix[theme] ?? {};
                    const subtotal = Object.values(row).reduce((sum, value) => sum + (value ?? 0), 0);
                    return (
                      <tr key={theme} className="border-t border-border">
                        <td className="py-3 text-text-primary">{THEMES.find((item) => item.key === theme)?.label ?? theme}</td>
                        {FORMATS.map((format) => {
                          const value = row[format.key] ?? 0;
                          return (
                            <td key={format.key} className="py-3">
                              <div className="flex items-center justify-center gap-2">
                                <Button variant="secondary" size="sm" onClick={() => updateCount(theme, format.key, value - 1)} aria-label={`减少${format.label}`}>
                                  <Minus className="h-3 w-3" />
                                </Button>
                                <input
                                  type="number"
                                  min={0}
                                  max={99}
                                  value={value}
                                  onChange={(event) => updateCount(theme, format.key, Number(event.target.value))}
                                  className="w-14 rounded border border-border bg-bg-secondary px-2 py-1 text-center text-text-primary"
                                />
                                <Button variant="secondary" size="sm" onClick={() => updateCount(theme, format.key, value + 1)} aria-label={`增加${format.label}`}>
                                  <Plus className="h-3 w-3" />
                                </Button>
                              </div>
                            </td>
                          );
                        })}
                        <td className="py-3 text-center font-mono text-text-primary">{subtotal}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>

          <section className="rounded-xl border border-border bg-bg-primary/40 p-4">
            <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-accent-blue">03 · 备注</div>
            <textarea
              value={note}
              onChange={(event) => setNote(event.target.value)}
              placeholder="补充合规口径、目标人群偏好、参考资料等"
              className="min-h-24 w-full rounded-lg border border-border bg-bg-secondary px-3 py-2 text-sm text-text-primary outline-none focus:border-accent-blue"
            />
          </section>
        </div>

        <aside className="space-y-3 rounded-xl border border-border bg-bg-primary/40 p-4 text-sm">
          <div className="text-xs font-semibold uppercase tracking-wider text-accent-blue">提交预览</div>
          <div>
            <div className="text-xs text-text-muted">所属项目</div>
            <div className="mt-1 text-text-primary">{selectedProject?.name ?? '—'}</div>
          </div>
          <div>
            <div className="text-xs text-text-muted">本次诉求</div>
            <div className="mt-1 text-text-primary">{requestName || '—'}</div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="rounded-lg bg-bg-tertiary p-3">
              <div className="text-xs text-text-muted">总量</div>
              <div className="mt-1 text-lg font-semibold text-text-primary">{total}</div>
            </div>
            <div className="rounded-lg bg-bg-tertiary p-3">
              <div className="text-xs text-text-muted">主题</div>
              <div className="mt-1 text-lg font-semibold text-text-primary">{enabledThemes.length}</div>
            </div>
          </div>
          <div className="rounded-lg bg-bg-tertiary p-3 text-xs leading-relaxed text-text-secondary">
            提交后流向：审批中心运营受理 → 拆单派单医生制作 → 医学审核 → 灰度分发。
          </div>
        </aside>
      </div>
    </Modal>
  );
}
