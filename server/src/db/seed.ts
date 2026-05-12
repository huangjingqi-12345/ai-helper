import { getDb } from './connection.js';
import { initializeSchema } from './schema.js';
import { logger } from '../utils/logger.js';

export function seedDatabase(): void {
  const db = getDb();

  // Initialize schema first
  initializeSchema();

  // Check if already seeded
  const count = db.prepare('SELECT COUNT(*) as cnt FROM projects').get() as { cnt: number };
  if (count.cnt > 0) {
    logger.info('Database already seeded, skipping');
    return;
  }

  logger.info('Seeding database...');

  const insertMany = db.transaction(() => {
    // === Overview Stats ===
    db.prepare(`
      INSERT INTO overview_stats (id, project_count, published_content, push_count, read_users, read_count, interaction_count, last_updated)
      VALUES (1, 6, '4/14', 12800, 8942, 24531, 3876, ?)
    `).run(new Date().toISOString());

    // === Projects ===
    const insertProject = db.prepare(`
      INSERT INTO projects (id, name, disease, content_count, published_count, push_count, read_count, interaction_count, status, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const projects = [
      ['proj-001', '乳腺癌患教项目', '乳腺癌', 5, 2, 3200, 8500, 1200, 'active', '2026-01-15T08:00:00Z', '2026-05-10T10:00:00Z'],
      ['proj-002', '肺癌患教项目', '肺癌', 3, 1, 2800, 6200, 890, 'active', '2026-02-01T08:00:00Z', '2026-05-09T14:00:00Z'],
      ['proj-003', '糖尿病患教项目', '糖尿病', 4, 1, 4500, 5800, 1050, 'active', '2026-01-20T08:00:00Z', '2026-05-08T16:00:00Z'],
      ['proj-004', '高血压患教项目', '高血压', 2, 0, 2300, 4031, 736, 'paused', '2026-03-01T08:00:00Z', '2026-04-20T12:00:00Z'],
      ['proj-005', '冠心病患教项目', '冠心病', 0, 0, 0, 0, 0, 'active', '2026-04-15T08:00:00Z', '2026-04-15T08:00:00Z'],
      ['proj-006', '哮喘患教项目', '哮喘', 0, 0, 0, 0, 0, 'archived', '2025-11-01T08:00:00Z', '2026-03-01T08:00:00Z'],
    ];
    for (const p of projects) insertProject.run(...p);

    // === Content ===
    const insertContent = db.prepare(`
      INSERT INTO content (id, project_id, title, type, status, author, content, tags, read_count, like_count, bookmark_count, created_at, updated_at, published_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const contentItems = [
      ['cnt-001', 'proj-001', '乳腺癌早期筛查指南', 'article', 'published', '张医生', '乳腺癌早期筛查对于提高生存率至关重要...', '["乳腺癌","筛查","预防"]', 3200, 450, 280, '2026-01-20T08:00:00Z', '2026-03-15T10:00:00Z', '2026-02-01T08:00:00Z'],
      ['cnt-002', 'proj-001', '乳腺癌术后康复指导', 'article', 'published', '李护士', '术后康复是乳腺癌治疗的重要环节...', '["乳腺癌","康复","护理"]', 2800, 380, 220, '2026-02-10T08:00:00Z', '2026-03-20T10:00:00Z', '2026-03-01T08:00:00Z'],
      ['cnt-003', 'proj-001', '乳腺癌患者饮食建议', 'infographic', 'under_review', '王营养师', '合理的饮食对乳腺癌患者的康复有重要作用...', '["乳腺癌","饮食","营养"]', 0, 0, 0, '2026-04-01T08:00:00Z', '2026-04-15T10:00:00Z', null],
      ['cnt-004', 'proj-001', '乳腺癌心理疏导', 'video', 'draft', '陈心理师', '面对乳腺癌诊断，患者常常会经历...', '["乳腺癌","心理","支持"]', 0, 0, 0, '2026-04-20T08:00:00Z', '2026-04-20T08:00:00Z', null],
      ['cnt-005', 'proj-001', '乳腺癌治疗方案解读', 'article', 'draft', '张医生', '目前乳腺癌的治疗方案包括...', '["乳腺癌","治疗","方案"]', 0, 0, 0, '2026-05-01T08:00:00Z', '2026-05-01T08:00:00Z', null],
      ['cnt-006', 'proj-002', '肺癌预防与早期发现', 'article', 'published', '刘医生', '肺癌是全球发病率最高的恶性肿瘤之一...', '["肺癌","预防","筛查"]', 4100, 520, 310, '2026-02-15T08:00:00Z', '2026-03-25T10:00:00Z', '2026-03-01T08:00:00Z'],
      ['cnt-007', 'proj-002', '肺癌靶向治疗科普', 'video', 'under_review', '刘医生', '靶向治疗是肺癌治疗的重要进展...', '["肺癌","靶向治疗","科普"]', 0, 0, 0, '2026-04-10T08:00:00Z', '2026-04-25T10:00:00Z', null],
      ['cnt-008', 'proj-002', '肺癌患者运动建议', 'infographic', 'draft', '赵康复师', '适当的运动有助于肺癌患者的康复...', '["肺癌","运动","康复"]', 0, 0, 0, '2026-05-05T08:00:00Z', '2026-05-05T08:00:00Z', null],
      ['cnt-009', 'proj-003', '糖尿病日常管理手册', 'article', 'published', '周医生', '糖尿病的日常管理是控制血糖的关键...', '["糖尿病","管理","血糖"]', 5200, 680, 420, '2026-01-25T08:00:00Z', '2026-02-28T10:00:00Z', '2026-02-15T08:00:00Z'],
      ['cnt-010', 'proj-003', '糖尿病饮食指南', 'infographic', 'under_review', '王营养师', '科学的饮食控制是糖尿病治疗的基础...', '["糖尿病","饮食","控制"]', 0, 0, 0, '2026-03-15T08:00:00Z', '2026-04-10T10:00:00Z', null],
      ['cnt-011', 'proj-003', '胰岛素使用教程', 'video', 'draft', '周医生', '正确使用胰岛素是糖尿病治疗的重要环节...', '["糖尿病","胰岛素","教程"]', 0, 0, 0, '2026-04-20T08:00:00Z', '2026-04-20T08:00:00Z', null],
      ['cnt-012', 'proj-003', '糖尿病并发症预防', 'quiz', 'draft', '周医生', '了解糖尿病并发症的预防知识...', '["糖尿病","并发症","预防"]', 0, 0, 0, '2026-05-08T08:00:00Z', '2026-05-08T08:00:00Z', null],
      ['cnt-013', 'proj-004', '高血压用药指导', 'article', 'under_review', '吴医生', '高血压的药物治疗需要长期坚持...', '["高血压","用药","指导"]', 0, 0, 0, '2026-03-10T08:00:00Z', '2026-04-05T10:00:00Z', null],
      ['cnt-014', 'proj-004', '高血压生活方式干预', 'article', 'draft', '吴医生', '生活方式的改变是高血压治疗的基础...', '["高血压","生活方式","干预"]', 0, 0, 0, '2026-04-15T08:00:00Z', '2026-04-15T08:00:00Z', null],
    ];
    for (const c of contentItems) insertContent.run(...c);

    // === Behavior Trends (reads) ===
    const insertTrend = db.prepare('INSERT INTO behavior_trends (date, type, value) VALUES (?, ?, ?)');
    const readTrends = [
      ['2026-04-13', 320], ['2026-04-14', 410], ['2026-04-15', 380], ['2026-04-16', 520],
      ['2026-04-17', 490], ['2026-04-18', 350], ['2026-04-19', 280], ['2026-04-20', 450],
      ['2026-04-21', 510], ['2026-04-22', 620], ['2026-04-23', 580], ['2026-04-24', 490],
      ['2026-04-25', 420], ['2026-04-26', 350], ['2026-04-27', 530], ['2026-04-28', 610],
      ['2026-04-29', 680], ['2026-04-30', 720], ['2026-05-01', 550], ['2026-05-02', 480],
      ['2026-05-03', 590], ['2026-05-04', 640], ['2026-05-05', 710], ['2026-05-06', 680],
      ['2026-05-07', 750], ['2026-05-08', 820], ['2026-05-09', 790], ['2026-05-10', 850],
      ['2026-05-11', 910], ['2026-05-12', 880],
    ];
    for (const [d, v] of readTrends) insertTrend.run(d, 'reads', v);

    const interactionTrends = [
      ['2026-04-13', 45], ['2026-04-14', 62], ['2026-04-15', 58], ['2026-04-16', 78],
      ['2026-04-17', 72], ['2026-04-18', 48], ['2026-04-19', 38], ['2026-04-20', 65],
      ['2026-04-21', 75], ['2026-04-22', 92], ['2026-04-23', 85], ['2026-04-24', 70],
      ['2026-04-25', 60], ['2026-04-26', 50], ['2026-04-27', 78], ['2026-04-28', 88],
      ['2026-04-29', 98], ['2026-04-30', 105], ['2026-05-01', 80], ['2026-05-02', 68],
      ['2026-05-03', 85], ['2026-05-04', 95], ['2026-05-05', 102], ['2026-05-06', 98],
      ['2026-05-07', 110], ['2026-05-08', 120], ['2026-05-09', 115], ['2026-05-10', 125],
      ['2026-05-11', 132], ['2026-05-12', 128],
    ];
    for (const [d, v] of interactionTrends) insertTrend.run(d, 'interactions', v);

    // === Behavior Top Content ===
    const insertTopContent = db.prepare('INSERT INTO behavior_top_content (content_id, title, reads, interactions) VALUES (?, ?, ?, ?)');
    const topContent = [
      ['cnt-009', '糖尿病日常管理手册', 5200, 680],
      ['cnt-006', '肺癌预防与早期发现', 4100, 520],
      ['cnt-001', '乳腺癌早期筛查指南', 3200, 450],
      ['cnt-002', '乳腺癌术后康复指导', 2800, 380],
    ];
    for (const tc of topContent) insertTopContent.run(...tc);

    // === Behavior By Disease ===
    const insertByDisease = db.prepare('INSERT INTO behavior_by_disease (disease, reads, interactions, push_count) VALUES (?, ?, ?, ?)');
    const byDisease = [
      ['乳腺癌', 6000, 830, 3200],
      ['肺癌', 4100, 520, 2800],
      ['糖尿病', 5200, 680, 4500],
      ['高血压', 4031, 736, 2300],
    ];
    for (const bd of byDisease) insertByDisease.run(...bd);

    // === Distribution Strategies ===
    const insertStrategy = db.prepare(`
      INSERT INTO distribution_strategies (id, name, project_id, target_regions, target_diseases, target_patient_count, content_ids, schedule_type, schedule_start_date, schedule_end_date, schedule_frequency, status, metrics_pushed, metrics_delivered, metrics_opened, metrics_read, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const strategies = [
      ['str-001', '乳腺癌春季推送计划', 'proj-001', '["华东","华南"]', '["乳腺癌"]', 3200, '["cnt-001","cnt-002"]', 'recurring', '2026-03-01T00:00:00Z', '2026-05-31T23:59:59Z', 'weekly', 'active', 3200, 3050, 2100, 1800, '2026-02-20T08:00:00Z', '2026-05-10T10:00:00Z'],
      ['str-002', '肺癌科普专项推送', 'proj-002', '["华北","西南"]', '["肺癌"]', 2800, '["cnt-006"]', 'scheduled', '2026-04-01T00:00:00Z', '2026-06-30T23:59:59Z', null, 'active', 2800, 2650, 1800, 1500, '2026-03-15T08:00:00Z', '2026-05-09T14:00:00Z'],
      ['str-003', '糖尿病管理推送', 'proj-003', '["全国"]', '["糖尿病"]', 4500, '["cnt-009"]', 'recurring', '2026-02-01T00:00:00Z', '2026-07-31T23:59:59Z', 'monthly', 'active', 4500, 4200, 3100, 2600, '2026-01-25T08:00:00Z', '2026-05-08T16:00:00Z'],
      ['str-004', '高血压患者关怀', 'proj-004', '["华中"]', '["高血压"]', 2300, '["cnt-013"]', 'immediate', null, null, null, 'paused', 2300, 2100, 1400, 1100, '2026-03-10T08:00:00Z', '2026-04-20T12:00:00Z'],
      ['str-005', '多病种综合推送', 'proj-001', '["华东"]', '["乳腺癌","肺癌"]', 1500, '["cnt-001","cnt-006"]', 'scheduled', '2026-05-15T00:00:00Z', '2026-08-15T23:59:59Z', null, 'draft', 0, 0, 0, 0, '2026-05-01T08:00:00Z', '2026-05-01T08:00:00Z'],
      ['str-006', '新内容测试推送', 'proj-003', '["华南"]', '["糖尿病"]', 500, '["cnt-010"]', 'immediate', null, null, null, 'completed', 500, 480, 350, 290, '2026-04-15T08:00:00Z', '2026-04-25T10:00:00Z'],
    ];
    for (const s of strategies) insertStrategy.run(...s);

    // === Approval Items ===
    const insertApproval = db.prepare(`
      INSERT INTO approval_items (id, content_id, content_title, submitted_by, submitted_at, status, reviewed_by, reviewed_at, comments, project_name)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const approvalItems = [
      ['apr-001', 'cnt-003', '乳腺癌患者饮食建议', '王营养师', '2026-04-15T10:00:00Z', 'pending', null, null, null, '乳腺癌患教项目'],
      ['apr-002', 'cnt-007', '肺癌靶向治疗科普', '刘医生', '2026-04-25T10:00:00Z', 'pending', null, null, null, '肺癌患教项目'],
      ['apr-003', 'cnt-010', '糖尿病饮食指南', '王营养师', '2026-04-10T10:00:00Z', 'pending', null, null, null, '糖尿病患教项目'],
      ['apr-004', 'cnt-013', '高血压用药指导', '吴医生', '2026-04-05T10:00:00Z', 'pending', null, null, null, '高血压患教项目'],
      ['apr-005', 'cnt-001', '乳腺癌早期筛查指南', '张医生', '2026-01-25T10:00:00Z', 'approved', '管理员', '2026-01-28T14:00:00Z', '内容准确，可以发布', '乳腺癌患教项目'],
      ['apr-006', 'cnt-002', '乳腺癌术后康复指导', '李护士', '2026-02-20T10:00:00Z', 'approved', '管理员', '2026-02-25T14:00:00Z', '审核通过', '乳腺癌患教项目'],
      ['apr-007', 'cnt-006', '肺癌预防与早期发现', '刘医生', '2026-02-25T10:00:00Z', 'rejected', '管理员', '2026-02-28T14:00:00Z', '部分数据需要更新，请修改后重新提交', '肺癌患教项目'],
    ];
    for (const a of approvalItems) insertApproval.run(...a);

    // === Users ===
    const insertUser = db.prepare(`
      INSERT INTO users (id, name, email, role, region, status, last_login, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const usersData = [
      ['usr-001', '张三', 'zhangsan@pharma.com', 'admin', '华东', 'active', '2026-05-12T08:30:00Z', '2025-06-01T08:00:00Z'],
      ['usr-002', '李四', 'lisi@pharma.com', 'editor', '华南', 'active', '2026-05-11T14:20:00Z', '2025-08-15T08:00:00Z'],
      ['usr-003', '王五', 'wangwu@pharma.com', 'editor', '华北', 'active', '2026-05-10T09:15:00Z', '2025-09-01T08:00:00Z'],
      ['usr-004', '赵六', 'zhaoliu@pharma.com', 'viewer', '西南', 'active', '2026-05-09T16:45:00Z', '2025-10-15T08:00:00Z'],
      ['usr-005', '孙七', 'sunqi@pharma.com', 'viewer', '华中', 'active', '2026-05-08T11:00:00Z', '2025-11-01T08:00:00Z'],
      ['usr-006', '周八', 'zhouba@pharma.com', 'editor', '华东', 'inactive', '2026-03-15T10:00:00Z', '2025-07-01T08:00:00Z'],
      ['usr-007', '吴九', 'wujiu@pharma.com', 'viewer', '华南', 'active', '2026-05-12T07:00:00Z', '2026-01-15T08:00:00Z'],
      ['usr-008', '郑十', 'zhengshi@pharma.com', 'admin', '全国', 'active', '2026-05-12T09:00:00Z', '2025-06-01T08:00:00Z'],
    ];
    for (const u of usersData) insertUser.run(...u);

    // === Platform Settings ===
    const insertSetting = db.prepare('INSERT INTO platform_settings (key, value) VALUES (?, ?)');
    const settings = {
      siteName: 'Px Lite 极简版平台',
      version: 'V0.1 · DEMO',
      region: '中国',
      features: JSON.stringify({
        contentWorkshop: true,
        behaviorInsights: true,
        distributionStrategy: true,
        approvalCenter: true,
      }),
    };
    for (const [k, v] of Object.entries(settings)) insertSetting.run(k, v);
  });

  insertMany();
  logger.info('Database seeded successfully');
}
