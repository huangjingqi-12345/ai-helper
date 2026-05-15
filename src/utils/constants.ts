export const APP_TITLE = import.meta.env.VITE_APP_TITLE || 'Px Lite · 药企患教内容运营与行为洞察平台';
export const APP_VERSION = import.meta.env.VITE_APP_VERSION || 'V0.1 · DEMO';
export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/api';
export const ENABLE_DEV_PANEL = import.meta.env.VITE_ENABLE_DEV_PANEL === 'true';

export const NAV_ITEMS = [
  { key: 'overview', label: '总览', path: '/', icon: 'LayoutDashboard' },
  { key: 'content-workshop', label: '患教内容工坊', path: '/content', icon: 'FileText' },
  { key: 'behavior-insights', label: '患者行为洞察', path: '/audience', icon: 'Eye' },
  { key: 'distribution-strategy', label: '分发策略', path: '/distribute', icon: 'Send' },
  { key: 'approval-center', label: '审批中心', path: '/approvals', icon: 'CheckCircle' },
  { key: 'platform-management', label: '平台管理', path: '/admin', icon: 'Settings' },
  { key: 'finance-management', label: '财务管理', path: '/finance', icon: 'Wallet' },
] as const;

export const PAGE_DESCRIPTIONS: Record<string, string> = {
  overview: '查看患者教育内容运营数据总览，包括项目概况、内容发布情况和行为数据汇总。',
  'content-workshop': '管理患者教育内容，支持内容创建、编辑、审核和发布全生命周期管理。',
  'behavior-insights': '分析患者阅读、互动行为数据，了解内容触达效果和患者参与度。',
  'distribution-strategy': '配置内容分发策略，设置目标受众、推送时间和频率。',
  'approval-center': '审批待发布的患教内容，确保内容质量和合规性。',
  'platform-management': '管理平台用户、角色权限和系统设置。',
  'admin-projects': '按租户与病种组织患教项目，登记项目基础信息与关联诉求。',
  'finance-management': '串联合同、订阅、账单、对账、价值报告与开票的业财链路。',
  'finance-overview': '业财总览：收入、回款、预算占用与待办速览。',
  'finance-contracts': '合同与订阅：客户主数据、合同条款与订阅版本。',
  'finance-billing': '账单引擎：月度固定费排期、对账、催款和状态跟踪。',
  'finance-invoicing': '价值交付与开票：交付报告自动转开票指令。',
};

/**
 * PM 确认的 6 态内容状态映射（2026-05-15 产品确定）
 * 替代旧的 CONTENT_STATUS_MAP（draft/under_review/approved/published/archived/offline）
 */
export const CONTENT_STATUS_MAP = {
  requirement_submitted: { label: '需求已提交', color: 'gray' },
  doctor_distributing: { label: '医生分发中', color: 'blue' },
  doctor_producing: { label: '医生制作中', color: 'purple' },
  third_party_review: { label: '三方审核中', color: 'yellow' },
  internal_review: { label: '内部审核中', color: 'orange' },
  published: { label: '已发布', color: 'green' },
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

/**
 * PM 确认的 6 态流水线映射（2026-05-15 产品确定）
 * 与 CONTENT_STATUS_MAP 保持一致（6 桶即独立存储状态）
 */
export const PIPELINE_STAGE_MAP = {
  requirement_submitted: { label: '需求已提交', color: 'gray', order: 1 },
  doctor_distributing: { label: '医生分发中', color: 'blue', order: 2 },
  doctor_producing: { label: '医生制作中', color: 'purple', order: 3 },
  third_party_review: { label: '三方审核中', color: 'yellow', order: 4 },
  internal_review: { label: '内部审核中', color: 'orange', order: 5 },
  published: { label: '已发布', color: 'green', order: 6 },
} as const;

export const PRIORITY_MAP = {
  P0: { label: 'P0', color: 'red' },
  P1: { label: 'P1', color: 'yellow' },
  P2: { label: 'P2', color: 'gray' },
} as const;

export const PROJECT_COLOR_MAP: Record<string, string> = {
  'proj-001': 'purple',
  'proj-002': 'blue',
  'proj-003': 'green',
  'proj-004': 'yellow',
  'proj-005': 'red',
  'proj-006': 'cyan',
};

export const CONTENT_TYPE_LABELS: Record<string, string> = {
  article: '长图文',
  video: '短视频',
  infographic: '海报',
  quiz: '测验',
  qa: '长图文',
  checklist: '手册',
  poster: '海报',
};
