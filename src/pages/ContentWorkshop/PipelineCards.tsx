import { Card } from '@/components/ui/Card';
import { PIPELINE_STAGE_MAP } from '@/utils/constants';
import type { Content, PipelineStage } from '@/types';

interface PipelineCardsProps {
  items: Content[];
  activeStage?: PipelineStage;
  onStageClick: (stage: PipelineStage | undefined) => void;
}

const stageOrder: PipelineStage[] = [
  'requirement_submitted',
  'doctor_distributing',
  'doctor_producing',
  'third_party_review',
  'internal_review',
  'published',
];

export function PipelineCards({ items, activeStage, onStageClick }: PipelineCardsProps): JSX.Element {
  const counts = stageOrder.reduce(
    (acc, stage) => {
      acc[stage] = items.filter((i) => i.pipelineStage === stage).length;
      return acc;
    },
    {} as Record<PipelineStage, number>,
  );

  return (
    <div className="grid grid-cols-6 gap-4">
      {stageOrder.map((stage) => {
        const info = PIPELINE_STAGE_MAP[stage];
        const isActive = activeStage === stage;
        return (
          <Card
            key={stage}
            className={`cursor-pointer transition-all border ${
              isActive
                ? 'border-accent-blue ring-1 ring-accent-blue/30'
                : 'border-border hover:border-accent-blue/40'
            }`}
            onClick={() => onStageClick(isActive ? undefined : stage)}
          >
            <div className="text-xs text-text-muted mb-2">{info.label}</div>
            <div className="flex items-baseline gap-1">
              <span className={`text-2xl font-bold font-mono text-accent-${info.color === 'orange' ? 'yellow' : info.color}`}>
                {counts[stage]}
              </span>
              <span className="text-xs text-text-muted">条</span>
            </div>
          </Card>
        );
      })}
    </div>
  );
}
