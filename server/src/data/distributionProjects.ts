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
  createdAt?: string;
  updatedAt?: string;
}

export const distributionProjects: DistributionProjectSeed[] = [
  {
    id: 'PRJ-1000',
    title: '赫赛汀 · HER2+ 术后辅助随访计划',
    priority: 'P0',
    status: 'intake',
    brand: '赫赛汀',
    disease: '乳腺癌',
    owner: 'PX 运营组',
    tenantId: 'T-RC',
    expectedDate: '2026-05-18',
    totalPieces: 12,
    cadence: '4 主题 · 3 形式',
    patientCap: 5000,
    topics: ['规范治疗·4', '康复与随访·4', '疾病认知·3'],
    formats: '长图文 6 · 海报 5 · 手册 1',
    approvalFlow: 'PX 默认审批流',
    progress: 50,
    currentNode: 'PX 运营审核',
    contentCount: 1,
    publishedCount: 0,
    createdAt: '2026-05-07 09:42',
  },
  {
    id: 'PRJ-1001',
    title: '优赫得 · HER2 ADC 重点随访',
    priority: 'P1',
    status: 'intake',
    brand: '优赫得',
    disease: '乳腺癌',
    owner: 'PX 运营组',
    tenantId: 'T-AZ',
    expectedDate: '2026-05-22',
    totalPieces: 6,
    cadence: '3 主题 · 3 形式',
    patientCap: 5000,
    topics: ['规范治疗·3', '疾病认知·2', '不良反应应对·1'],
    formats: '长图文 4 · 海报 1 · 手册 1',
    approvalFlow: '阿斯利康 · 标准审批流',
    progress: 0,
    currentNode: 'DX 医学审核',
    contentCount: 1,
    publishedCount: 0,
    createdAt: '2026-05-07 14:10',
  },
];

export const doctorCandidates = [
  { id: 'doc_1001', name: '黄依楹', title: '主任医师', dept: '乳腺外科', region: '华东', hospital: '华东肿瘤医院', specialties: ['乳腺癌'], tags: ['KOL', '术后管理', '患教经验丰富'] },
  { id: 'doc_1002', name: '蒋雨莘', title: '副主任医师', dept: '肿瘤内科', region: '华南', hospital: '华南肿瘤中心', specialties: ['乳腺癌'], tags: ['HER2 靶向', '临床试验', '药动力学'] },
  { id: 'doc_1003', name: '陆玄昕', title: '主任医师', dept: '肿瘤内科', region: '华东', hospital: '华东肿瘤医院', specialties: ['乳腺癌'], tags: ['CDK4/6 专家', '内分泌辅助'] },
  { id: 'doc_1004', name: '孙依萝', title: '副主任医师', dept: '乳腺外科', region: '华北', hospital: '华北乳腺中心', specialties: ['乳腺癌'], tags: ['术后随访', '淋巴水肿康复'] },
  { id: 'doc_1005', name: '陈莉莉', title: '主治医师', dept: '放射治疗科', region: '西南', hospital: '西南肿瘤中心', specialties: ['乳腺癌'], tags: ['质子治疗', '辅助放疗'] },
  { id: 'doc_1006', name: '邹一航', title: '副主任医师', dept: '乳腺外科', region: '华南', hospital: '华南肿瘤中心', specialties: ['乳腺癌'], tags: ['BRCA 遗传咨询', '预防手术'] },
  { id: 'doc_1007', name: '于智佳', title: '主治医师', dept: '临床心理科', region: '华东', hospital: '华东医科大学附属医院', specialties: ['乳腺癌'], tags: ['术后心理', '伴侣沟通'] },
  { id: 'doc_1008', name: '文志超', title: '副主任医师', dept: '中医康复科', region: '华东', hospital: '华东中医药大学附属医院', specialties: ['乳腺癌'], tags: ['中医调理', '服药依从'] },
];
