import { Skeleton } from '@/components/ui/Skeleton';
import { Activity, BookOpen, FolderKanban, Heart, Users, Zap } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { OverviewStats } from '@/types';

interface KpiCardsProps {
  stats: OverviewStats | null;
  loading: boolean;
}

export function KpiCards({ stats, loading }: KpiCardsProps): JSX.Element {
  if (loading || !stats) {
    return (
      <div className="grid grid-cols-6 gap-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-[120px]" />
        ))}
      </div>
    );
  }

  const cards = [
    { label: '项目数', value: stats.projectCount, icon: FolderKanban, accent: 'oklch(72% .17 195)' },
    { label: '已发布内容', value: stats.publishedContent, icon: BookOpen, formatValue: false, accent: 'oklch(78% .15 70)' },
    { label: '推送人数', value: stats.pushCount, icon: Users, accent: 'oklch(70% .15 200)' },
    { label: '阅读人数', value: stats.readUsers, icon: Activity, accent: 'oklch(82% .15 165)' },
    { label: '阅读次数', value: stats.readCount, icon: Zap, accent: 'oklch(82% .16 300)' },
    { label: '互动数', value: stats.interactionCount, icon: Heart, accent: 'oklch(78% .15 30)' },
  ];

  return (
    <div className="grid grid-cols-2 gap-3 rounded-xl border border-border bg-card p-4 md:grid-cols-6">
      {cards.map((card) => (
        <SummaryCell
          key={card.label}
          label={card.label}
          value={card.formatValue === false || typeof card.value !== 'number'
            ? card.value
            : new Intl.NumberFormat('zh-CN').format(card.value)}
          icon={card.icon}
          accent={card.accent}
        />
      ))}
    </div>
  );
}

function SummaryCell({
  label,
  value,
  icon: Icon,
  accent,
}: {
  label: string;
  value: string | number;
  icon: LucideIcon;
  accent: string;
}): JSX.Element {
  return (
    <div className="flex items-center gap-3">
      <div
        className="grid h-9 w-9 shrink-0 place-items-center rounded-lg"
        style={{ background: `${accent.replace(')', ' / .15)')}`, color: accent }}
      >
        <Icon className="h-4 w-4" />
      </div>
      <div className="min-w-0">
        <div className="text-[11px] text-muted-foreground">{label}</div>
        <div className="tabular text-[15.5px] font-semibold" style={{ color: accent }}>
          {value}
        </div>
      </div>
    </div>
  );
}
