export const APP_TITLE = import.meta.env.VITE_APP_TITLE || 'Px Lite 极简版平台';
export const APP_VERSION = import.meta.env.VITE_APP_VERSION || 'V0.1';
export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001/api';
export const ENABLE_DEV_PANEL = import.meta.env.VITE_ENABLE_DEV_PANEL === 'true';

export const NAV_ITEMS = [
  { key: 'overview', label: '总览', path: '/', icon: 'LayoutDashboard' },
  { key: 'content-workshop', label: '患教内容工坊', path: '/content-workshop', icon: 'FileText' },
  { key: 'behavior-insights', label: '患者行为洞察', path: '/behavior-insights', icon: 'Eye' },
  { key: 'distribution-strategy', label: '分发策略', path: '/distribution-strategy', icon: 'Send' },
  { key: 'approval-center', label: '审批中心', path: '/approval-center', icon: 'CheckCircle' },
  { key: 'platform-management', label: '平台管理', path: '/platform-management', icon: 'Settings' },
] as const;

export const PAGE_DESCRIPTIONS: Record<string, string> = {
  overview: '查看患者教育内容运营数据总览，包括项目概况、内容发布情况和行为数据汇总。',
  'content-workshop': '管理患者教育内容，支持内容创建、编辑、审核和发布全生命周期管理。',
  'behavior-insights': '分析患者阅读、互动行为数据，了解内容触达效果和患者参与度。',
  'distribution-strategy': '配置内容分发策略，设置目标受众、推送时间和频率。',
  'approval-center': '审批待发布的患教内容，确保内容质量和合规性。',
  'platform-management': '管理平台用户、角色权限和系统设置。',
};

export const CONTENT_STATUS_MAP = {
  draft: { label: '草稿', color: 'gray' },
  under_review: { label: '审核中', color: 'yellow' },
  approved: { label: '已通过', color: 'blue' },
  published: { label: '已发布', color: 'green' },
  archived: { label: '已归档', color: 'gray' },
} as const;

export const STRATEGY_STATUS_MAP = {
  draft: { label: '草稿', color: 'gray' },
  active: { label: '执行中', color: 'green' },
  paused: { label: '已暂停', color: 'yellow' },
  completed: { label: '已完成', color: 'blue' },
} as const;

export const ROLE_MAP = {
  admin: { label: '管理员', color: 'blue' },
  editor: { label: '编辑', color: 'green' },
  viewer: { label: '查看者', color: 'gray' },
} as const;
