export type DistributionProjectStatus = 'intake' | 'production' | 'distribution' | 'completed' | 'archived';
export type DistributionProjectPriority = 'P0' | 'P1' | 'P2';

export interface DistributionProject {
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

export const distributionStatusLabels: Record<DistributionProjectStatus, string> = {
  intake: '受理中',
  production: '制作中',
  distribution: '分发中',
  completed: '已完成',
  archived: '已归档',
};

const topicSets: [string[], string[], string[]] = [
  ['规范治疗·6', '疾病认知·5', '康复与随访·4'],
  ['规范治疗·5', '疾病认知·4', '康复与随访·3'],
  ['规范治疗·4', '疾病认知·3', '康复与随访·2'],
];

export const distributionProjects: DistributionProject[] = [
  { id: 'PRJ-1000', title: 'ARNI 新适应症患教 · 多子项诉求', priority: 'P0', status: 'intake', brand: '诺欣妥', disease: '慢性心力衰竭', owner: 'PX 运营组', tenantId: 'T-NV', expectedDate: '2026-05-18', totalPieces: 24, cadence: '每月 6 篇', patientCap: 5000, topics: topicSets[0], formats: '长图文 14 · 海报 6 · 手册 4', approvalFlow: '诺华 · 标准审批流', progress: 0, currentNode: '未提交', contentCount: 0, publishedCount: 0 },
  { id: 'PRJ-1001', title: 'GLP-1 周制剂注射手法图文', priority: 'P1', status: 'intake', brand: '诺和泰', disease: '2型糖尿病', owner: 'PX 运营组', tenantId: 'T-PX', expectedDate: '2026-05-22', totalPieces: 21, cadence: '每周 2 篇', patientCap: 5000, topics: topicSets[1], formats: '长图文 13 · 海报 5 · 手册 3', approvalFlow: 'PX 默认审批流', progress: 0, currentNode: '未提交', contentCount: 0, publishedCount: 0 },
  { id: 'PRJ-1002', title: 'HER2+ 乳腺癌随访依从性提示', priority: 'P2', status: 'intake', brand: '赫赛汀', disease: '乳腺癌', owner: 'PX 运营组', tenantId: 'T-PX', expectedDate: '2026-05-30', totalPieces: 18, cadence: '每周 2 篇', patientCap: 5000, topics: topicSets[1], formats: '长图文 11 · 海报 5 · 手册 3', approvalFlow: 'PX 默认审批流', progress: 0, currentNode: '未提交', contentCount: 0, publishedCount: 0 },
  { id: 'PRJ-1003', title: 'SGLT2i 在心衰患者中的依从性教育', priority: 'P0', status: 'production', brand: '安达唐', disease: '慢性心力衰竭', owner: '运营 · 王雪', tenantId: 'T-AZ', expectedDate: '2026-05-15', totalPieces: 15, cadence: '每月 6 篇', patientCap: 5000, topics: topicSets[2], formats: '长图文 9 · 海报 4 · 手册 2', approvalFlow: '阿斯利康 · 标准审批流', progress: 0, currentNode: '未提交', contentCount: 0, publishedCount: 0 },
  { id: 'PRJ-1004', title: '甲氨蝶呤漏服处理 5 问', priority: 'P1', status: 'production', brand: '甲氨蝶呤', disease: '类风湿关节炎', owner: '运营 · 周琳', tenantId: 'T-PX', expectedDate: '2026-05-20', totalPieces: 24, cadence: '每周 2 篇', patientCap: 5000, topics: topicSets[0], formats: '长图文 14 · 海报 6 · 手册 4', approvalFlow: 'PX 默认审批流', progress: 0, currentNode: '未提交', contentCount: 0, publishedCount: 0 },
  { id: 'PRJ-1005', title: '胰岛素注射部位轮换信息长图升级版', priority: 'P0', status: 'production', brand: '优泌乐', disease: '2型糖尿病', owner: '运营 · 王雪', tenantId: 'T-PX', expectedDate: '2026-05-12', totalPieces: 21, cadence: '每周 2 篇', patientCap: 5000, topics: topicSets[1], formats: '长图文 13 · 海报 5 · 手册 3', approvalFlow: 'PX 默认审批流', progress: 75, currentNode: '药企医学审核', contentCount: 1, publishedCount: 0 },
  { id: 'PRJ-1006', title: 'HER2+ 乳腺癌口服剂方案问答', priority: 'P1', status: 'production', brand: '爱博新', disease: '乳腺癌', owner: '运营 · 周琳', tenantId: 'T-NV', expectedDate: '2026-05-16', totalPieces: 18, cadence: '每月 6 篇', patientCap: 5000, topics: topicSets[1], formats: '长图文 11 · 海报 5 · 手册 3', approvalFlow: '诺华 · 标准审批流', progress: 0, currentNode: '未提交', contentCount: 0, publishedCount: 0 },
  { id: 'PRJ-1007', title: '心衰利尿剂调整指引', priority: 'P1', status: 'distribution', brand: '诺欣妥', disease: '慢性心力衰竭', owner: '运营 · 王雪', tenantId: 'T-NV', expectedDate: '2026-04-28', totalPieces: 15, cadence: '每周 2 篇', patientCap: 5000, topics: topicSets[2], formats: '长图文 9 · 海报 4 · 手册 2', approvalFlow: '诺华 · 标准审批流', progress: 50, currentNode: 'PX 运营审核', contentCount: 1, publishedCount: 0 },
  { id: 'PRJ-1008', title: 'MTX 周服法术语解读', priority: 'P2', status: 'distribution', brand: '甲氨蝶呤', disease: '类风湿关节炎', owner: '运营 · 周琳', tenantId: 'T-PX', expectedDate: '2026-04-25', totalPieces: 24, cadence: '每周 2 篇', patientCap: 5000, topics: topicSets[0], formats: '长图文 14 · 海报 6 · 手册 4', approvalFlow: 'PX 默认审批流', progress: 50, currentNode: 'PX 运营审核', contentCount: 1, publishedCount: 0 },
  { id: 'PRJ-1009', title: '心衰营养与饮食', priority: 'P1', status: 'completed', brand: '—', disease: '慢性心力衰竭', owner: '运营 · 王雪', tenantId: 'T-NV', expectedDate: '2026-04-15', totalPieces: 21, cadence: '每月 6 篇', patientCap: 5000, topics: topicSets[1], formats: '长图文 13 · 海报 5 · 手册 3', approvalFlow: '诺华 · 标准审批流', progress: 0, currentNode: 'DX 小编审核', contentCount: 1, publishedCount: 0 },
  { id: 'PRJ-1010', title: '乳腺癌护理 KOL 解读', priority: 'P2', status: 'completed', brand: '赫赛汀', disease: '乳腺癌', owner: '运营 · 王雪', tenantId: 'T-PX', expectedDate: '2026-03-25', totalPieces: 18, cadence: '每周 2 篇', patientCap: 5000, topics: topicSets[1], formats: '长图文 11 · 海报 5 · 手册 3', approvalFlow: 'PX 默认审批流', progress: 0, currentNode: 'DX 小编审核', contentCount: 1, publishedCount: 0 },
  { id: 'PRJ-1011', title: '心衰新药机制对比说明', priority: 'P2', status: 'intake', brand: '—', disease: '慢性心力衰竭', owner: '运营 · 周琳', tenantId: 'T-AZ', expectedDate: '2026-04-10', totalPieces: 15, cadence: '每周 2 篇', patientCap: 5000, topics: topicSets[2], formats: '长图文 9 · 海报 4 · 手册 2', approvalFlow: '阿斯利康 · 标准审批流', progress: 0, currentNode: '未提交', contentCount: 0, publishedCount: 0 },
  { id: 'PRJ-1012', title: 'GLP-1 减重宣教', priority: 'P1', status: 'intake', brand: '—', disease: '2型糖尿病', owner: '运营 · 王雪', tenantId: 'T-PX', expectedDate: '2026-04-05', totalPieces: 24, cadence: '每月 6 篇', patientCap: 5000, topics: topicSets[0], formats: '长图文 14 · 海报 6 · 手册 4', approvalFlow: 'PX 默认审批流', progress: 0, currentNode: '未提交', contentCount: 0, publishedCount: 0 },
];

export const doctorCandidates = [
  { name: '李恒', title: '主任医师', dept: '心内科', region: '华东', specialties: '慢性心力衰竭 / 高血压', tags: ['KOL', '写作活跃'] },
  { name: '孙岚', title: '主任医师', dept: '内分泌科', region: '华南', specialties: '2型糖尿病', tags: ['KOL', '病例丰富'] },
  { name: '周宜', title: '副主任医师', dept: '肿瘤科', region: '华东', specialties: '乳腺癌 / 肺癌', tags: ['科普达人'] },
  { name: '赵明', title: '主治医师', dept: '风湿免疫科', region: '华北', specialties: '类风湿关节炎', tags: ['学术活跃'] },
];
