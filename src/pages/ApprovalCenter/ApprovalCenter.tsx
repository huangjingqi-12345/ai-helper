import { useEffect, useState } from 'react';
import { CheckCircle, XCircle, Clock, MessageSquare } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Modal } from '@/components/ui/Modal';
import { Spinner } from '@/components/ui/Spinner';
import { ErrorState } from '@/components/ui/ErrorState';
import { EmptyState } from '@/components/ui/EmptyState';
import { showToast } from '@/components/ui/Toast';
import { useApprovalStore } from '@/stores/useApprovalStore';
import { useLogger } from '@/hooks/useLogger';
import { formatDate } from '@/utils/formatters';
import type { ApprovalItem } from '@/types';

const STATUS_CONFIG = {
  pending: { label: '待审批', color: 'yellow' as const, icon: Clock },
  approved: { label: '已通过', color: 'green' as const, icon: CheckCircle },
  rejected: { label: '已驳回', color: 'red' as const, icon: XCircle },
};

type FilterStatus = 'all' | 'pending' | 'approved' | 'rejected';

export function ApprovalCenter(): JSX.Element {
  const { items, loading, error, fetchQueue, approve, reject } = useApprovalStore();
  const { log } = useLogger('ApprovalCenter');
  const [filterStatus, setFilterStatus] = useState<FilterStatus>('all');
  const [actionModal, setActionModal] = useState<{ item: ApprovalItem; type: 'approve' | 'reject' } | null>(null);
  const [comments, setComments] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    log.nav('Approval Center page loaded');
    fetchQueue();
  }, [fetchQueue, log]);

  const handleFilterChange = (status: FilterStatus) => {
    setFilterStatus(status);
    log.action('Approval filter changed', { status });
    if (status === 'all') {
      fetchQueue();
    } else {
      fetchQueue(status);
    }
  };

  const handleAction = async () => {
    if (!actionModal) return;
    setSubmitting(true);
    try {
      if (actionModal.type === 'approve') {
        await approve(actionModal.item.id, comments || '审批通过');
        showToast(`"${actionModal.item.contentTitle}" 已通过审批`, 'success');
      } else {
        if (!comments.trim()) {
          showToast('驳回时请填写原因', 'error');
          setSubmitting(false);
          return;
        }
        await reject(actionModal.item.id, comments);
        showToast(`"${actionModal.item.contentTitle}" 已驳回`, 'info');
      }
      setActionModal(null);
      setComments('');
    } catch {
      showToast('操作失败，请重试', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  if (error && !loading) {
    return <ErrorState message={error} onRetry={fetchQueue} />;
  }

  const pendingCount = items.filter(i => i.status === 'pending').length;
  const approvedCount = items.filter(i => i.status === 'approved').length;
  const rejectedCount = items.filter(i => i.status === 'rejected').length;

  const FILTERS: { key: FilterStatus; label: string; count?: number }[] = [
    { key: 'all', label: '全部', count: items.length },
    { key: 'pending', label: '待审批', count: pendingCount },
    { key: 'approved', label: '已通过', count: approvedCount },
    { key: 'rejected', label: '已驳回', count: rejectedCount },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="space-y-3">
        <Badge color="blue" className="text-[10px] uppercase tracking-wider">Approval Center</Badge>
        <h1 className="text-2xl font-bold text-text-primary">审批中心</h1>
        <p className="text-sm text-text-secondary">审批待发布的患教内容，确保内容质量和合规性。</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        <Card className="text-center">
          <Clock className="w-5 h-5 text-accent-yellow mx-auto mb-2" />
          <div className="text-2xl font-bold text-accent-yellow">{pendingCount}</div>
          <div className="text-xs text-text-muted mt-1">待审批</div>
        </Card>
        <Card className="text-center">
          <CheckCircle className="w-5 h-5 text-accent-green mx-auto mb-2" />
          <div className="text-2xl font-bold text-accent-green">{approvedCount}</div>
          <div className="text-xs text-text-muted mt-1">已通过</div>
        </Card>
        <Card className="text-center">
          <XCircle className="w-5 h-5 text-accent-red mx-auto mb-2" />
          <div className="text-2xl font-bold text-accent-red">{rejectedCount}</div>
          <div className="text-xs text-text-muted mt-1">已驳回</div>
        </Card>
      </div>

      {/* Filter Tabs */}
      <div className="flex gap-2">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            onClick={() => handleFilterChange(f.key)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              filterStatus === f.key
                ? 'bg-accent-blue text-white'
                : 'bg-bg-card text-text-secondary hover:text-text-primary border border-border'
            }`}
          >
            {f.label}
            {f.count !== undefined && (
              <span className="ml-1.5 text-xs opacity-70">({f.count})</span>
            )}
          </button>
        ))}
      </div>

      {/* Approval List */}
      {loading ? (
        <div className="flex justify-center py-12">
          <Spinner size="lg" />
        </div>
      ) : items.length === 0 ? (
        <EmptyState
          icon={<CheckCircle className="w-12 h-12" />}
          title="暂无审批项"
          description="当前没有需要审批的内容。"
        />
      ) : (
        <div className="space-y-3">
          {items.map((item) => {
            const config = STATUS_CONFIG[item.status];
            const StatusIcon = config.icon;
            return (
              <Card key={item.id} hoverable>
                <div className="flex items-center justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-1">
                      <h3 className="text-base font-semibold text-text-primary">{item.contentTitle}</h3>
                      <Badge color={config.color}>
                        <span className="flex items-center gap-1">
                          <StatusIcon className="w-3 h-3" />
                          {config.label}
                        </span>
                      </Badge>
                    </div>
                    <div className="flex items-center gap-4 text-xs text-text-muted">
                      <span>项目: {item.projectName}</span>
                      <span>提交人: {item.submittedBy}</span>
                      <span>提交时间: {formatDate(item.submittedAt)}</span>
                      {item.reviewedBy && <span>审批人: {item.reviewedBy}</span>}
                      {item.reviewedAt && <span>审批时间: {formatDate(item.reviewedAt)}</span>}
                    </div>
                    {item.comments && (
                      <div className="flex items-start gap-1.5 mt-2 text-xs text-text-secondary">
                        <MessageSquare className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
                        <span>{item.comments}</span>
                      </div>
                    )}
                  </div>
                  {item.status === 'pending' && (
                    <div className="flex gap-2 ml-4">
                      <Button
                        size="sm"
                        variant="primary"
                        onClick={() => { setActionModal({ item, type: 'approve' }); setComments(''); }}
                      >
                        <CheckCircle className="w-3.5 h-3.5" />
                        通过
                      </Button>
                      <Button
                        size="sm"
                        variant="danger"
                        onClick={() => { setActionModal({ item, type: 'reject' }); setComments(''); }}
                      >
                        <XCircle className="w-3.5 h-3.5" />
                        驳回
                      </Button>
                    </div>
                  )}
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {/* Action Modal */}
      <Modal
        open={!!actionModal}
        onClose={() => setActionModal(null)}
        title={actionModal?.type === 'approve' ? '确认通过审批' : '确认驳回'}
        footer={
          <div className="flex justify-end gap-3">
            <Button variant="secondary" onClick={() => setActionModal(null)}>取消</Button>
            <Button
              variant={actionModal?.type === 'approve' ? 'primary' : 'danger'}
              onClick={handleAction}
              disabled={submitting}
            >
              {submitting ? '处理中...' : actionModal?.type === 'approve' ? '确认通过' : '确认驳回'}
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          <p className="text-sm text-text-secondary">
            {actionModal?.type === 'approve'
              ? `您确定要通过 "${actionModal?.item.contentTitle}" 的审批吗？`
              : `您确定要驳回 "${actionModal?.item.contentTitle}" 吗？请填写驳回原因。`}
          </p>
          <div>
            <label className="block text-sm font-medium text-text-secondary mb-1.5">
              {actionModal?.type === 'approve' ? '审批意见（可选）' : '驳回原因（必填）'}
            </label>
            <textarea
              value={comments}
              onChange={(e) => setComments(e.target.value)}
              placeholder={actionModal?.type === 'approve' ? '输入审批意见...' : '请输入驳回原因...'}
              className="w-full px-3 py-2 bg-bg-tertiary border border-border rounded-lg text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-1 focus:ring-accent-blue resize-none h-24"
            />
          </div>
        </div>
      </Modal>
    </div>
  );
}
