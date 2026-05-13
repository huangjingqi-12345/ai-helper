export type DistributionProjectStatus = 'intake' | 'production' | 'distribution' | 'completed' | 'archived';
export type DistributionProjectPriority = 'P0' | 'P1' | 'P2';

export interface DistributionProjectSeed {
  id: string;
  title: string;
  priority: DistributionProjectPriority;
  status: DistributionProjectStatus;
  brand: string;
  disease: string;
  owner: string;
  tenantId: string;
  expectedDate: string;
  totalPieces: number;
  cadence: string;
  patientCap: number;
  topics: string[];
  formats: string;
  approvalFlow: string;
  progress: number;
  currentNode: string;
  contentCount: number;
  publishedCount: number;
}

const topicSets = {
  hfStandard: ['规范治疗·4', '疾病认知·3', '生活方式·3'],
  diabetesLaunch: ['规范治疗·3', '生活方式·2', '不良反应应对·1'],
  breastCare: ['康复与随访·4', '节点与热点·1', '心理与家属·1'],
  hfSglt2: ['规范治疗·3', '疾病认知·2', '康复与随访·1'],
  raMtx: ['规范治疗·4', '不良反应应对·1'],
  insulin: ['规范治疗·3'],
  breastCdk: ['规范治疗·2', '不良反应应对·2'],
};

export const distributionProjects: DistributionProjectSeed[] = [
  {
    id: 'PRJ-1000',
    title: '诺欣妥 · 慢性心衰患教计划',
    priority: 'P0',
    status: 'intake',
    brand: '诺欣妥',
    disease: '慢性心力衰竭',
    owner: 'PX 运营组',
    tenantId: 'T-NV',
    expectedDate: '2026-05-18',
    totalPieces: 12,
    cadence: '4 主题 · 3 形式',
    patientCap: 5000,
    topics: topicSets.hfStandard,
    formats: '长图文 8 · 海报 3 · 手册 1',
    approvalFlow: '诺华 · 标准审批流',
    progress: 25,
    currentNode: '编辑审核',
    contentCount: 2,
    publishedCount: 0,
  },
  {
    id: 'PRJ-1001',
    title: '诺和泰 · 新启用患者陈述',
    priority: 'P1',
    status: 'intake',
    brand: '诺和泰',
    disease: '2型糖尿病',
    owner: 'PX 运营组',
    tenantId: 'T-PX',
    expectedDate: '2026-05-22',
    totalPieces: 6,
    cadence: '3 主题 · 3 形式',
    patientCap: 5000,
    topics: topicSets.diabetesLaunch,
    formats: '长图文 2 · 海报 3 · 手册 1',
    approvalFlow: 'PX 默认审批流',
    progress: 0,
    currentNode: '未提交',
    contentCount: 0,
    publishedCount: 0,
  },
  {
    id: 'PRJ-1002',
    title: '赫赛汀 · HER2+ 术后随访教育',
    priority: 'P2',
    status: 'intake',
    brand: '赫赛汀',
    disease: '乳腺癌',
    owner: 'PX 运营组',
    tenantId: 'T-RC',
    expectedDate: '2026-05-30',
    totalPieces: 6,
    cadence: '3 主题 · 1 形式',
    patientCap: 5000,
    topics: topicSets.breastCare,
    formats: '海报 6',
    approvalFlow: 'PX 默认审批流',
    progress: 0,
    currentNode: '医生制作',
    contentCount: 1,
    publishedCount: 0,
  },
  {
    id: 'PRJ-1003',
    title: '安达唐 · 心衰 SGLT2i 依从性',
    priority: 'P0',
    status: 'production',
    brand: '安达唐',
    disease: '慢性心力衰竭',
    owner: '运营 · 王雪',
    tenantId: 'T-AZ',
    expectedDate: '2026-05-15',
    totalPieces: 6,
    cadence: '3 主题 · 1 形式',
    patientCap: 5000,
    topics: topicSets.hfSglt2,
    formats: '长图文 6',
    approvalFlow: '阿斯利康 · 标准审批流',
    progress: 0,
    currentNode: '未提交',
    contentCount: 0,
    publishedCount: 0,
  },
  {
    id: 'PRJ-1004',
    title: '甲氨蝶呤 · RA 用药依从性',
    priority: 'P1',
    status: 'production',
    brand: '甲氨蝶呤',
    disease: '类风湿关节炎',
    owner: '运营 · 周琳',
    tenantId: 'T-PX',
    expectedDate: '2026-05-20',
    totalPieces: 5,
    cadence: '2 主题 · 2 形式',
    patientCap: 5000,
    topics: topicSets.raMtx,
    formats: '海报 3 · 手册 2',
    approvalFlow: 'PX 默认审批流',
    progress: 50,
    currentNode: '编辑修改',
    contentCount: 1,
    publishedCount: 0,
  },
  {
    id: 'PRJ-1005',
    title: '优泌乐 · 胰岛素手法规范',
    priority: 'P0',
    status: 'production',
    brand: '优泌乐',
    disease: '2型糖尿病',
    owner: '运营 · 王雪',
    tenantId: 'T-PX',
    expectedDate: '2026-05-12',
    totalPieces: 3,
    cadence: '1 主题 · 1 形式',
    patientCap: 5000,
    topics: topicSets.insulin,
    formats: '海报 3',
    approvalFlow: 'PX 默认审批流',
    progress: 75,
    currentNode: 'Px 审核',
    contentCount: 1,
    publishedCount: 0,
  },
  {
    id: 'PRJ-1006',
    title: '爱博新 · CDK4/6 口服依从性',
    priority: 'P1',
    status: 'production',
    brand: '爱博新',
    disease: '乳腺癌',
    owner: '运营 · 周琳',
    tenantId: 'T-NV',
    expectedDate: '2026-05-16',
    totalPieces: 4,
    cadence: '2 主题 · 2 形式',
    patientCap: 5000,
    topics: topicSets.breastCdk,
    formats: '长图文 2 · 海报 2',
    approvalFlow: '诺华 · 标准审批流',
    progress: 0,
    currentNode: '未提交',
    contentCount: 0,
    publishedCount: 0,
  },
];

export const doctorCandidates = [
  { id: 'DOC-001', name: '李恒', title: '主任医师', dept: '心内科', region: '华东', hospital: '上海瑞金医院', specialties: ['慢性心力衰竭', '高血压'], tags: ['KOL', '写作活跃'] },
  { id: 'DOC-002', name: '孙岚', title: '主任医师', dept: '内分泌科', region: '华南', hospital: '中山大学附属第一医院', specialties: ['2型糖尿病'], tags: ['KOL', '病例丰富'] },
  { id: 'DOC-003', name: '周宜', title: '副主任医师', dept: '肿瘤科', region: '华东', hospital: '复旦大学附属肿瘤医院', specialties: ['乳腺癌', '肺癌(NSCLC)'], tags: ['科普达人'] },
  { id: 'DOC-004', name: '赵明', title: '主治医师', dept: '风湿免疫科', region: '华北', hospital: '北京协和医院', specialties: ['类风湿关节炎'], tags: ['学术活跃'] },
];
