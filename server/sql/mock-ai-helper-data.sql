-- PX AI Helper mock data for local SQLite development.
--
-- Safe usage:
--   1) cp server/data/pxlite.db server/data/pxlite.mock.db
--   2) point DB_PATH to ./data/pxlite.mock.db in server/.env.development.local
--   3) sqlite3 server/data/pxlite.mock.db < server/sql/mock-ai-helper-data.sql
--
-- This file is intentionally idempotent for rows with the MOCK-* IDs below:
-- every run deletes the previous MOCK-* rows first, then inserts a fresh 60-day
-- mock dataset for overview / trend / monthly report / PPT / Data QA.
--
-- Do NOT run this against production data.

PRAGMA foreign_keys = ON;

BEGIN TRANSACTION;

-- Clean only the mock rows owned by this dataset, so rerunning this file is safe.
DELETE FROM behavior_daily_metrics
 WHERE tenant_id = 'MOCK-TENANT-AI'
    OR project_id LIKE 'MOCK-PROJ-%'
    OR content_id LIKE 'MOCK-CONTENT-%'
    OR disease_id LIKE 'MOCK-DISEASE-%';

DELETE FROM content
 WHERE tenant_id = 'MOCK-TENANT-AI'
    OR id LIKE 'MOCK-CONTENT-%'
    OR project_id LIKE 'MOCK-PROJ-%';

DELETE FROM projects
 WHERE tenant_id = 'MOCK-TENANT-AI'
    OR id LIKE 'MOCK-PROJ-%';

DELETE FROM tenant_scopes
 WHERE tenant_id = 'MOCK-TENANT-AI'
    OR id = 'MOCK-SCOPE-AI';

DELETE FROM brands
 WHERE tenant_id = 'MOCK-TENANT-AI'
    OR id LIKE 'MOCK-BRAND-%';

DELETE FROM tenants
 WHERE id = 'MOCK-TENANT-AI';

DELETE FROM diseases
 WHERE id LIKE 'MOCK-DISEASE-%';

-- Tenant and dimensions.
INSERT INTO tenants (
  id, name, short_name, tenant_type, status, contract_no,
  contact_name, contact_email, contact_phone, description,
  can_export, created_at, updated_at
) VALUES (
  'MOCK-TENANT-AI',
  'AI 助手 Mock 药企',
  'AI Mock',
  'pharma',
  'active',
  'MOCK-AI-2026',
  'Mock Owner',
  'mock-ai@example.com',
  '13800000000',
  '仅用于本地演示 AI 数据助手、数据概览、趋势分析、月度报告和 PPT 生成。',
  1,
  datetime('now'),
  datetime('now')
);

INSERT INTO tenant_scopes (
  id, tenant_id, disease_ids, brand_ids, region_ids,
  gray_limit_percent, k_anonymity_threshold,
  can_view_aggregate_metrics, can_export_csv,
  created_at, updated_at
) VALUES (
  'MOCK-SCOPE-AI',
  'MOCK-TENANT-AI',
  '["MOCK-DISEASE-DIABETES","MOCK-DISEASE-HYPERTENSION","MOCK-DISEASE-ONCOLOGY"]',
  '["MOCK-BRAND-GLUCO","MOCK-BRAND-CARDIO","MOCK-BRAND-ONCO"]',
  '["CN-EAST","CN-SOUTH","CN-NORTH"]',
  8,
  50,
  1,
  1,
  datetime('now'),
  datetime('now')
);

INSERT INTO diseases (id, name, code, category, created_at, updated_at) VALUES
  ('MOCK-DISEASE-DIABETES', 'Mock 糖尿病管理', 'MOCK-DM', '慢病管理', datetime('now'), datetime('now')),
  ('MOCK-DISEASE-HYPERTENSION', 'Mock 高血压管理', 'MOCK-HTN', '慢病管理', datetime('now'), datetime('now')),
  ('MOCK-DISEASE-ONCOLOGY', 'Mock 肿瘤随访', 'MOCK-ONC', '专病随访', datetime('now'), datetime('now'));

INSERT INTO brands (
  id, tenant_id, name, generic_name, disease_id, status, created_at, updated_at
) VALUES
  ('MOCK-BRAND-GLUCO', 'MOCK-TENANT-AI', 'Mock 格糖达', '二甲双胍模拟品牌', 'MOCK-DISEASE-DIABETES', 'active', datetime('now'), datetime('now')),
  ('MOCK-BRAND-CARDIO', 'MOCK-TENANT-AI', 'Mock 压稳宁', '降压药模拟品牌', 'MOCK-DISEASE-HYPERTENSION', 'active', datetime('now'), datetime('now')),
  ('MOCK-BRAND-ONCO', 'MOCK-TENANT-AI', 'Mock 安护康', '肿瘤支持模拟品牌', 'MOCK-DISEASE-ONCOLOGY', 'active', datetime('now'), datetime('now'));

-- Projects.
INSERT INTO projects (
  id, tenant_id, name, title, disease, disease_id, brand_id, brand_name,
  owner_user_id, owner_name, priority,
  content_count, published_count, push_count, read_users, read_count, interaction_count,
  status, expected_date, total_pieces, cadence, patient_cap,
  progress_percent, description, created_at, updated_at
) VALUES
  (
    'MOCK-PROJ-DIABETES',
    'MOCK-TENANT-AI',
    '糖尿病患者饮食与用药教育',
    '糖尿病患者饮食与用药教育',
    '糖尿病管理',
    'MOCK-DISEASE-DIABETES',
    'MOCK-BRAND-GLUCO',
    'Mock 格糖达',
    'MOCK-USER-AI',
    '运营负责人 A',
    'P0',
    3,
    3,
    0,
    0,
    0,
    0,
    'active',
    date('now', '+15 day'),
    12,
    '每周 2 篇',
    120000,
    82,
    '面向糖尿病患者的饮食、用药与复诊教育内容包。',
    datetime('now', '-90 day'),
    datetime('now')
  ),
  (
    'MOCK-PROJ-HYPERTENSION',
    'MOCK-TENANT-AI',
    '高血压居家监测与复诊提醒',
    '高血压居家监测与复诊提醒',
    '高血压管理',
    'MOCK-DISEASE-HYPERTENSION',
    'MOCK-BRAND-CARDIO',
    'Mock 压稳宁',
    'MOCK-USER-AI',
    '运营负责人 B',
    'P1',
    3,
    3,
    0,
    0,
    0,
    0,
    'active',
    date('now', '+21 day'),
    10,
    '每周 1 篇',
    90000,
    68,
    '提升患者血压自测、复诊依从性和风险识别能力。',
    datetime('now', '-80 day'),
    datetime('now')
  ),
  (
    'MOCK-PROJ-ONCOLOGY',
    'MOCK-TENANT-AI',
    '肿瘤治疗期副作用管理',
    '肿瘤治疗期副作用管理',
    '肿瘤随访',
    'MOCK-DISEASE-ONCOLOGY',
    'MOCK-BRAND-ONCO',
    'Mock 安护康',
    'MOCK-USER-AI',
    '运营负责人 C',
    'P1',
    2,
    2,
    0,
    0,
    0,
    0,
    'active',
    date('now', '+30 day'),
    8,
    '双周 1 篇',
    45000,
    57,
    '围绕治疗期不良反应、营养与心理支持的患者教育。',
    datetime('now', '-70 day'),
    datetime('now')
  );

-- Content inventory. The daily behavior rows below reference these content IDs.
INSERT INTO content (
  id, tenant_id, project_id, title, type, status, workflow_state, pipeline_stage,
  priority, author, author_user_id, excerpt, content, tags,
  push_count, read_users, read_count, like_count, dislike_count, bookmark_count, share_count,
  finish_rate, avg_read_sec, expected_date, created_at, updated_at, published_at
) VALUES
  (
    'MOCK-CONTENT-DIABETES-DIET',
    'MOCK-TENANT-AI',
    'MOCK-PROJ-DIABETES',
    '控糖饮食：一餐一盘法实操指南',
    'article',
    'published',
    'published',
    'published',
    'P0',
    '医学编辑 Mock',
    'MOCK-USER-AI',
    '用一餐一盘法解释主食、蛋白质和蔬菜比例，降低患者执行门槛。',
    'Mock 内容正文：控糖饮食、一餐一盘法、复诊提醒。',
    '["控糖","饮食","图文"]',
    0, 0, 0, 0, 0, 0, 0,
    0.72,
    138,
    date('now', '+5 day'),
    datetime('now', '-58 day'),
    datetime('now'),
    datetime('now', '-57 day')
  ),
  (
    'MOCK-CONTENT-DIABETES-MEDICATION',
    'MOCK-TENANT-AI',
    'MOCK-PROJ-DIABETES',
    '漏服降糖药怎么办？患者问答卡',
    'qa',
    'published',
    'published',
    'published',
    'P1',
    '医学编辑 Mock',
    'MOCK-USER-AI',
    '用问答方式说明漏服、补服和就医判断。',
    'Mock 内容正文：漏服药处理、低血糖风险提醒。',
    '["用药","问答","依从性"]',
    0, 0, 0, 0, 0, 0, 0,
    0.66,
    112,
    date('now', '+7 day'),
    datetime('now', '-52 day'),
    datetime('now'),
    datetime('now', '-51 day')
  ),
  (
    'MOCK-CONTENT-DIABETES-EXERCISE',
    'MOCK-TENANT-AI',
    'MOCK-PROJ-DIABETES',
    '餐后运动 15 分钟：安全开始清单',
    'checklist',
    'published',
    'published',
    'published',
    'P1',
    '医学编辑 Mock',
    'MOCK-USER-AI',
    '把运动建议拆成饭后、强度、禁忌和复诊提醒。',
    'Mock 内容正文：餐后运动、安全清单。',
    '["运动","清单","慢病"]',
    0, 0, 0, 0, 0, 0, 0,
    0.61,
    96,
    date('now', '+9 day'),
    datetime('now', '-46 day'),
    datetime('now'),
    datetime('now', '-45 day')
  ),
  (
    'MOCK-CONTENT-HTN-BP',
    'MOCK-TENANT-AI',
    'MOCK-PROJ-HYPERTENSION',
    '家庭血压测量的 5 个关键动作',
    'video',
    'published',
    'published',
    'published',
    'P1',
    '医学编辑 Mock',
    'MOCK-USER-AI',
    '短视频演示测量姿势、时间和记录方式。',
    'Mock 内容正文：血压测量动作。',
    '["血压","视频","居家监测"]',
    0, 0, 0, 0, 0, 0, 0,
    0.58,
    88,
    date('now', '+6 day'),
    datetime('now', '-55 day'),
    datetime('now'),
    datetime('now', '-54 day')
  ),
  (
    'MOCK-CONTENT-HTN-SALT',
    'MOCK-TENANT-AI',
    'MOCK-PROJ-HYPERTENSION',
    '少盐不等于没味道：外食点餐技巧',
    'article',
    'published',
    'published',
    'published',
    'P2',
    '医学编辑 Mock',
    'MOCK-USER-AI',
    '通过外食场景解释减盐和控压。',
    'Mock 内容正文：减盐、外食、控压。',
    '["减盐","外食","控压"]',
    0, 0, 0, 0, 0, 0, 0,
    0.53,
    104,
    date('now', '+12 day'),
    datetime('now', '-49 day'),
    datetime('now'),
    datetime('now', '-48 day')
  ),
  (
    'MOCK-CONTENT-HTN-REVISIT',
    'MOCK-TENANT-AI',
    'MOCK-PROJ-HYPERTENSION',
    '什么时候需要提前复诊？红旗信号图解',
    'infographic',
    'published',
    'published',
    'published',
    'P0',
    '医学编辑 Mock',
    'MOCK-USER-AI',
    '把头晕、胸痛、血压异常等红旗信号做成图解。',
    'Mock 内容正文：提前复诊红旗信号。',
    '["复诊","风险识别","图解"]',
    0, 0, 0, 0, 0, 0, 0,
    0.69,
    126,
    date('now', '+14 day'),
    datetime('now', '-42 day'),
    datetime('now'),
    datetime('now', '-41 day')
  ),
  (
    'MOCK-CONTENT-ONCO-SIDE-EFFECT',
    'MOCK-TENANT-AI',
    'MOCK-PROJ-ONCOLOGY',
    '治疗期恶心乏力怎么办？居家处理清单',
    'checklist',
    'published',
    'published',
    'published',
    'P1',
    '医学编辑 Mock',
    'MOCK-USER-AI',
    '解释常见副作用、危险信号和联系医生的时机。',
    'Mock 内容正文：副作用管理、危险信号。',
    '["副作用","清单","肿瘤随访"]',
    0, 0, 0, 0, 0, 0, 0,
    0.64,
    118,
    date('now', '+11 day'),
    datetime('now', '-44 day'),
    datetime('now'),
    datetime('now', '-43 day')
  ),
  (
    'MOCK-CONTENT-ONCO-NUTRITION',
    'MOCK-TENANT-AI',
    'MOCK-PROJ-ONCOLOGY',
    '治疗期间怎么吃：营养补充基础课',
    'article',
    'published',
    'published',
    'published',
    'P2',
    '医学编辑 Mock',
    'MOCK-USER-AI',
    '围绕蛋白质、少量多餐和饮水做患者可执行建议。',
    'Mock 内容正文：治疗期营养支持。',
    '["营养","患者教育","肿瘤"]',
    0, 0, 0, 0, 0, 0, 0,
    0.56,
    132,
    date('now', '+18 day'),
    datetime('now', '-38 day'),
    datetime('now'),
    datetime('now', '-37 day')
  );

-- 60 days of behavior metrics.
-- Newer days intentionally perform better, so trend/monthly analysis can find
-- growth, top content, lower-finish-rate items, and interaction opportunities.
WITH RECURSIVE
  days(n, metric_date) AS (
    SELECT 0, date('now', '-59 day')
    UNION ALL
    SELECT n + 1, date(metric_date, '+1 day')
      FROM days
     WHERE n < 59
  ),
  content_plan(
    content_id, project_id, disease_id,
    base_push, base_read, base_interaction, base_finish_rate, base_avg_read_sec,
    weekday_boost, current_boost
  ) AS (
    VALUES
      ('MOCK-CONTENT-DIABETES-DIET', 'MOCK-PROJ-DIABETES', 'MOCK-DISEASE-DIABETES', 920, 410, 42, 0.72, 138, 28, 1.42),
      ('MOCK-CONTENT-DIABETES-MEDICATION', 'MOCK-PROJ-DIABETES', 'MOCK-DISEASE-DIABETES', 760, 320, 31, 0.66, 112, 22, 1.34),
      ('MOCK-CONTENT-DIABETES-EXERCISE', 'MOCK-PROJ-DIABETES', 'MOCK-DISEASE-DIABETES', 610, 230, 18, 0.61, 96, 16, 1.22),
      ('MOCK-CONTENT-HTN-BP', 'MOCK-PROJ-HYPERTENSION', 'MOCK-DISEASE-HYPERTENSION', 700, 275, 22, 0.58, 88, 20, 1.28),
      ('MOCK-CONTENT-HTN-SALT', 'MOCK-PROJ-HYPERTENSION', 'MOCK-DISEASE-HYPERTENSION', 520, 170, 10, 0.53, 104, 13, 1.10),
      ('MOCK-CONTENT-HTN-REVISIT', 'MOCK-PROJ-HYPERTENSION', 'MOCK-DISEASE-HYPERTENSION', 670, 285, 33, 0.69, 126, 19, 1.36),
      ('MOCK-CONTENT-ONCO-SIDE-EFFECT', 'MOCK-PROJ-ONCOLOGY', 'MOCK-DISEASE-ONCOLOGY', 450, 155, 17, 0.64, 118, 11, 1.24),
      ('MOCK-CONTENT-ONCO-NUTRITION', 'MOCK-PROJ-ONCOLOGY', 'MOCK-DISEASE-ONCOLOGY', 390, 125, 9, 0.56, 132, 9, 1.14)
  )
INSERT INTO behavior_daily_metrics (
  tenant_id, project_id, content_id, disease_id, metric_date,
  push_count, delivered_count, read_users, read_count,
  like_count, dislike_count, bookmark_count, share_count, interaction_count,
  avg_read_sec, finish_rate, created_at, updated_at
)
SELECT
  'MOCK-TENANT-AI' AS tenant_id,
  c.project_id,
  c.content_id,
  c.disease_id,
  d.metric_date,
  CAST((c.base_push + (d.n % 7) * c.weekday_boost + (d.n % 5) * 11) *
       CASE WHEN d.n >= 35 THEN c.current_boost ELSE 0.92 END AS INTEGER) AS push_count,
  CAST((c.base_push + (d.n % 7) * c.weekday_boost + (d.n % 5) * 11) *
       CASE WHEN d.n >= 35 THEN c.current_boost ELSE 0.92 END * 0.94 AS INTEGER) AS delivered_count,
  CAST((c.base_read + (d.n % 7) * c.weekday_boost * 0.55 + (d.n % 3) * 9) *
       CASE WHEN d.n >= 35 THEN c.current_boost ELSE 0.90 END * 0.72 AS INTEGER) AS read_users,
  CAST((c.base_read + (d.n % 7) * c.weekday_boost * 0.55 + (d.n % 3) * 9) *
       CASE WHEN d.n >= 35 THEN c.current_boost ELSE 0.90 END AS INTEGER) AS read_count,
  CAST((c.base_interaction + (d.n % 6) * 2) *
       CASE WHEN d.n >= 35 THEN c.current_boost ELSE 0.88 END * 0.42 AS INTEGER) AS like_count,
  CASE WHEN d.n % 11 = 0 THEN 1 ELSE 0 END AS dislike_count,
  CAST((c.base_interaction + (d.n % 6) * 2) *
       CASE WHEN d.n >= 35 THEN c.current_boost ELSE 0.88 END * 0.34 AS INTEGER) AS bookmark_count,
  CAST((c.base_interaction + (d.n % 6) * 2) *
       CASE WHEN d.n >= 35 THEN c.current_boost ELSE 0.88 END * 0.24 AS INTEGER) AS share_count,
  CAST((c.base_interaction + (d.n % 6) * 2) *
       CASE WHEN d.n >= 35 THEN c.current_boost ELSE 0.88 END AS INTEGER) AS interaction_count,
  CAST(c.base_avg_read_sec + (d.n % 8) * 3 + CASE WHEN d.n >= 35 THEN 8 ELSE 0 END AS INTEGER) AS avg_read_sec,
  ROUND(c.base_finish_rate + CASE WHEN d.n >= 35 THEN 0.035 ELSE -0.015 END + ((d.n % 5) - 2) * 0.004, 3) AS finish_rate,
  datetime('now') AS created_at,
  datetime('now') AS updated_at
FROM days d
CROSS JOIN content_plan c;

-- Keep project/content denormalized counters roughly aligned for pages that read
-- directly from these inventory tables instead of behavior_daily_metrics.
UPDATE content
   SET push_count = (
         SELECT COALESCE(SUM(push_count), 0)
           FROM behavior_daily_metrics b
          WHERE b.content_id = content.id
       ),
       read_users = (
         SELECT COALESCE(SUM(read_users), 0)
           FROM behavior_daily_metrics b
          WHERE b.content_id = content.id
       ),
       read_count = (
         SELECT COALESCE(SUM(read_count), 0)
           FROM behavior_daily_metrics b
          WHERE b.content_id = content.id
       ),
       like_count = (
         SELECT COALESCE(SUM(like_count), 0)
           FROM behavior_daily_metrics b
          WHERE b.content_id = content.id
       ),
       dislike_count = (
         SELECT COALESCE(SUM(dislike_count), 0)
           FROM behavior_daily_metrics b
          WHERE b.content_id = content.id
       ),
       bookmark_count = (
         SELECT COALESCE(SUM(bookmark_count), 0)
           FROM behavior_daily_metrics b
          WHERE b.content_id = content.id
       ),
       share_count = (
         SELECT COALESCE(SUM(share_count), 0)
           FROM behavior_daily_metrics b
          WHERE b.content_id = content.id
       ),
       finish_rate = (
         SELECT CASE WHEN SUM(read_count) > 0
                     THEN ROUND(SUM(finish_rate * read_count) / SUM(read_count), 3)
                     ELSE content.finish_rate END
           FROM behavior_daily_metrics b
          WHERE b.content_id = content.id
       ),
       avg_read_sec = (
         SELECT CASE WHEN SUM(read_count) > 0
                     THEN CAST(SUM(avg_read_sec * read_count) / SUM(read_count) AS INTEGER)
                     ELSE content.avg_read_sec END
           FROM behavior_daily_metrics b
          WHERE b.content_id = content.id
       ),
       updated_at = datetime('now')
 WHERE tenant_id = 'MOCK-TENANT-AI';

UPDATE projects
   SET content_count = (
         SELECT COUNT(*)
           FROM content c
          WHERE c.project_id = projects.id
       ),
       published_count = (
         SELECT COUNT(*)
           FROM content c
          WHERE c.project_id = projects.id
            AND c.status = 'published'
       ),
       push_count = (
         SELECT COALESCE(SUM(push_count), 0)
           FROM behavior_daily_metrics b
          WHERE b.project_id = projects.id
       ),
       read_users = (
         SELECT COALESCE(SUM(read_users), 0)
           FROM behavior_daily_metrics b
          WHERE b.project_id = projects.id
       ),
       read_count = (
         SELECT COALESCE(SUM(read_count), 0)
           FROM behavior_daily_metrics b
          WHERE b.project_id = projects.id
       ),
       interaction_count = (
         SELECT COALESCE(SUM(interaction_count), 0)
           FROM behavior_daily_metrics b
          WHERE b.project_id = projects.id
       ),
       updated_at = datetime('now')
 WHERE tenant_id = 'MOCK-TENANT-AI';

COMMIT;
