import { useEffect } from 'react';
import { Send, Play, Pause, CheckCircle, FileEdit, Users, Mail, Eye, BookOpen } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Spinner } from '@/components/ui/Spinner';
import { ErrorState } from '@/components/ui/ErrorState';
import { EmptyState } from '@/components/ui/EmptyState';
import { useDistributionStore } from '@/stores/useDistributionStore';
import { useLogger } from '@/hooks/useLogger';
import { STRATEGY_STATUS_MAP } from '@/utils/constants';
import { formatNumber, formatDateOnly } from '@/utils/formatters';
import type { DistributionStrategy as StrategyType } from '@/types';

const SCHEDULE_TYPE_LABELS: Record<string, string> = {
  immediate: '立即推送',
  scheduled: '定时推送',
  recurring: '周期推送',
};

const FREQUENCY_LABELS: Record<string, string> = {
  daily: '每日',
  weekly: '每周',
  monthly: '每月',
};

export function DistributionStrategy(): JSX.Element {
  const { strategies, loading, error, fetchStrategies } = useDistributionStore();
  const { log } = useLogger('DistributionStrategy');

  useEffect(() => {
    log.nav('Distribution Strategy page loaded');
    fetchStrategies();
  }, [fetchStrategies, log]);

  if (error && !loading) {
    return <ErrorState message={error} onRetry={fetchStrategies} />;
  }

  if (loading) {
    return (
      <div className="flex justify-center py-24">
        <Spinner size="lg" />
      </div>
    );
  }

  const activeCount = strategies.filter(s => s.status === 'active').length;
  const totalPushed = strategies.reduce((sum, s) => sum + s.metrics.pushed, 0);
  const totalDelivered = strategies.reduce((sum, s) => sum + s.metrics.delivered, 0);
  const totalRead = strategies.reduce((sum, s) => sum + s.metrics.read, 0);

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'active': return <Play className="w-3.5 h-3.5" />;
      case 'paused': return <Pause className="w-3.5 h-3.5" />;
      case 'completed': return <CheckCircle className="w-3.5 h-3.5" />;
      default: return <FileEdit className="w-3.5 h-3.5" />;
    }
  };

  const renderMetricBar = (strategy: StrategyType) => {
    const { pushed, delivered, opened, read } = strategy.metrics;
    if (pushed === 0) return <span className="text-text-muted text-xs">暂无数据</span>;
    const deliveryRate = (delivered / pushed * 100).toFixed(0);
    const openRate = (opened / pushed * 100).toFixed(0);
    const readRate = (read / pushed * 100).toFixed(0);

    return (
      <div className="space-y-1.5">
        <div className="flex items-center gap-2 text-xs">
          <span className="text-text-muted w-12">送达</span>
          <div className="flex-1 bg-bg-tertiary rounded-full h-1.5">
            <div className="bg-accent-blue rounded-full h-1.5" style={{ width: `${deliveryRate}%` }} />
          </div>
          <span className="text-text-secondary w-10 text-right">{deliveryRate}%</span>
        </div>
        <div className="flex items-center gap-2 text-xs">
          <span className="text-text-muted w-12">打开</span>
          <div className="flex-1 bg-bg-tertiary rounded-full h-1.5">
            <div className="bg-accent-yellow rounded-full h-1.5" style={{ width: `${openRate}%` }} />
          </div>
          <span className="text-text-secondary w-10 text-right">{openRate}%</span>
        </div>
        <div className="flex items-center gap-2 text-xs">
          <span className="text-text-muted w-12">阅读</span>
          <div className="flex-1 bg-bg-tertiary rounded-full h-1.5">
            <div className="bg-accent-green rounded-full h-1.5" style={{ width: `${readRate}%` }} />
          </div>
          <span className="text-text-secondary w-10 text-right">{readRate}%</span>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="space-y-3">
        <Badge color="blue" className="text-[10px] uppercase tracking-wider">Distribution Strategy</Badge>
        <h1 className="text-2xl font-bold text-text-primary">分发策略</h1>
        <p className="text-sm text-text-secondary">配置内容分发策略，设置目标受众、推送时间和频率。</p>
      </div>

      {/* Summary KPIs */}
      <div className="grid grid-cols-4 gap-4">
        <Card className="text-center">
          <Send className="w-5 h-5 text-accent-blue mx-auto mb-2" />
          <div className="text-2xl font-bold text-text-primary">{strategies.length}</div>
          <div className="text-xs text-text-muted mt-1">总策略数</div>
        </Card>
        <Card className="text-center">
          <Play className="w-5 h-5 text-accent-green mx-auto mb-2" />
          <div className="text-2xl font-bold text-accent-green">{activeCount}</div>
          <div className="text-xs text-text-muted mt-1">执行中</div>
        </Card>
        <Card className="text-center">
          <Users className="w-5 h-5 text-accent-purple mx-auto mb-2" />
          <div className="text-2xl font-bold text-text-primary">{formatNumber(totalPushed)}</div>
          <div className="text-xs text-text-muted mt-1">总推送</div>
        </Card>
        <Card className="text-center">
          <BookOpen className="w-5 h-5 text-accent-yellow mx-auto mb-2" />
          <div className="text-2xl font-bold text-text-primary">{totalPushed > 0 ? `${(totalRead / totalPushed * 100).toFixed(1)}%` : '0%'}</div>
          <div className="text-xs text-text-muted mt-1">整体阅读率</div>
        </Card>
      </div>

      {/* Strategy Cards */}
      {strategies.length === 0 ? (
        <EmptyState
          icon={<Send className="w-12 h-12" />}
          title="暂无分发策略"
          description="创建您的第一个内容分发策略，开始向目标患者推送患教内容。"
          action={<Button size="sm">创建策略</Button>}
        />
      ) : (
        <div className="grid grid-cols-2 gap-4">
          {strategies.map((strategy) => {
            const statusInfo = STRATEGY_STATUS_MAP[strategy.status];
            return (
              <Card key={strategy.id} hoverable>
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <h3 className="text-base font-semibold text-text-primary">{strategy.name}</h3>
                    <p className="text-xs text-text-muted mt-0.5">
                      {SCHEDULE_TYPE_LABELS[strategy.schedule.type]}
                      {strategy.schedule.frequency && ` · ${FREQUENCY_LABELS[strategy.schedule.frequency]}`}
                    </p>
                  </div>
                  <Badge color={statusInfo.color as 'gray' | 'green' | 'yellow' | 'blue'}>
                    <span className="flex items-center gap-1">
                      {getStatusIcon(strategy.status)}
                      {statusInfo.label}
                    </span>
                  </Badge>
                </div>

                {/* Audience */}
                <div className="flex items-center gap-4 text-xs text-text-secondary mb-3">
                  <span className="flex items-center gap-1">
                    <Users className="w-3.5 h-3.5" />
                    {formatNumber(strategy.targetAudience.patientCount)} 人
                  </span>
                  <span>区域: {strategy.targetAudience.regions.join('、')}</span>
                  <span>疾病: {strategy.targetAudience.diseases.join('、')}</span>
                </div>

                {/* Schedule */}
                {strategy.schedule.startDate && (
                  <div className="text-xs text-text-muted mb-3">
                    {formatDateOnly(strategy.schedule.startDate)} ~ {strategy.schedule.endDate ? formatDateOnly(strategy.schedule.endDate) : '持续中'}
                  </div>
                )}

                {/* Metrics */}
                <div className="pt-3 border-t border-border/50">
                  <div className="flex items-center justify-between text-xs mb-2">
                    <span className="text-text-muted">推送效果</span>
                    <span className="text-text-secondary font-mono">{formatNumber(strategy.metrics.pushed)} 推送</span>
                  </div>
                  {renderMetricBar(strategy)}
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
