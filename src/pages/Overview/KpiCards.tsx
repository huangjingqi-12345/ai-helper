import { StatCard } from '@/components/ui/StatCard';
import { Skeleton } from '@/components/ui/Skeleton';
import { FolderOpen, FileCheck, Send, Users, BookOpen, Heart } from 'lucide-react';
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
    { label: '项目数', value: stats.projectCount, icon: <FolderOpen size={16} /> },
    { label: '已发布内容', value: stats.publishedContent, icon: <FileCheck size={16} />, formatValue: false },
    { label: '推送人数', value: stats.pushCount, icon: <Send size={16} /> },
    { label: '阅读人数', value: stats.readUsers, icon: <Users size={16} /> },
    { label: '阅读次数', value: stats.readCount, icon: <BookOpen size={16} /> },
    { label: '互动数', value: stats.interactionCount, icon: <Heart size={16} /> },
  ];

  return (
    <div className="grid grid-cols-6 gap-4">
      {cards.map((card) => (
        <StatCard
          key={card.label}
          label={card.label}
          value={card.value}
          icon={card.icon}
          formatValue={card.formatValue !== false}
        />
      ))}
    </div>
  );
}
