import { dbAll, dbExec, dbGet, dbRun, DB_DRIVER } from './connection.js';
import { logger } from '../utils/logger.js';

const sqliteSchema = `
  PRAGMA foreign_keys = ON;

  CREATE TABLE IF NOT EXISTS tenants (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    short_name TEXT NOT NULL,
    tenant_type TEXT NOT NULL DEFAULT 'pharma' CHECK(tenant_type IN ('ops','pharma')),
    status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','inactive','draft')),
    contract_no TEXT,
    contact_name TEXT,
    contact_email TEXT,
    contact_phone TEXT,
    description TEXT DEFAULT '',
    can_export INTEGER DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS tenant_scopes (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    disease_ids TEXT DEFAULT '[]',
    brand_ids TEXT DEFAULT '[]',
    region_ids TEXT DEFAULT '[]',
    gray_limit_percent INTEGER DEFAULT 0,
    k_anonymity_threshold INTEGER DEFAULT 50,
    can_view_aggregate_metrics INTEGER DEFAULT 1,
    can_export_csv INTEGER DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY (tenant_id) REFERENCES tenants(id)
  );

  CREATE TABLE IF NOT EXISTS projects (
    id TEXT PRIMARY KEY,
    tenant_id TEXT DEFAULT 'T-PX',
    name TEXT NOT NULL,
    title TEXT,
    disease TEXT NOT NULL,
    disease_id TEXT,
    brand_id TEXT,
    brand_name TEXT,
    owner_user_id TEXT,
    owner_name TEXT,
    priority TEXT DEFAULT 'P2' CHECK(priority IN ('P0','P1','P2')),
    content_count INTEGER DEFAULT 0,
    published_count INTEGER DEFAULT 0,
    push_count INTEGER DEFAULT 0,
    read_users INTEGER DEFAULT 0,
    read_count INTEGER DEFAULT 0,
    interaction_count INTEGER DEFAULT 0,
    status TEXT DEFAULT 'active' CHECK(status IN ('active','paused','archived','intake','production','distribution','completed')),
    expected_date TEXT,
    total_pieces INTEGER DEFAULT 0,
    cadence TEXT,
    patient_cap INTEGER DEFAULT 0,
    approval_flow_id TEXT,
    current_approval_node_id TEXT,
    progress_percent INTEGER DEFAULT 0,
    description TEXT DEFAULT '',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS diseases (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    code TEXT,
    category TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS brands (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    name TEXT NOT NULL,
    generic_name TEXT,
    disease_id TEXT,
    status TEXT DEFAULT 'active',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY (tenant_id) REFERENCES tenants(id),
    FOREIGN KEY (disease_id) REFERENCES diseases(id)
  );

  CREATE TABLE IF NOT EXISTS project_topics (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id TEXT NOT NULL,
    topic_name TEXT NOT NULL,
    target_count INTEGER DEFAULT 0,
    created_at TEXT NOT NULL,
    FOREIGN KEY (project_id) REFERENCES projects(id)
  );

  CREATE TABLE IF NOT EXISTS project_formats (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id TEXT NOT NULL,
    format_type TEXT NOT NULL,
    target_count INTEGER DEFAULT 0,
    created_at TEXT NOT NULL,
    FOREIGN KEY (project_id) REFERENCES projects(id)
  );

  CREATE TABLE IF NOT EXISTS content (
    id TEXT PRIMARY KEY,
    tenant_id TEXT DEFAULT 'T-PX',
    project_id TEXT NOT NULL,
    title TEXT NOT NULL,
    type TEXT NOT NULL CHECK(type IN ('article','video','infographic','quiz','qa','checklist','poster')),
    status TEXT DEFAULT 'requirement_submitted' CHECK(status IN ('requirement_submitted','doctor_distributing','doctor_producing','third_party_review','internal_review','published','draft','offline')),
    workflow_state TEXT DEFAULT 'requirement_submitted',
    pipeline_stage TEXT DEFAULT 'requirement_submitted' CHECK(pipeline_stage IN ('requirement_submitted','doctor_distributing','doctor_producing','third_party_review','internal_review','published')),
    priority TEXT DEFAULT 'P2' CHECK(priority IN ('P0','P1','P2')),
    author TEXT NOT NULL,
    author_user_id TEXT,
    excerpt TEXT,
    content TEXT DEFAULT '',
    tags TEXT DEFAULT '[]',
    push_count INTEGER DEFAULT 0,
    read_users INTEGER DEFAULT 0,
    read_count INTEGER DEFAULT 0,
    like_count INTEGER DEFAULT 0,
    dislike_count INTEGER DEFAULT 0,
    bookmark_count INTEGER DEFAULT 0,
    share_count INTEGER DEFAULT 0,
    finish_rate REAL,
    avg_read_sec INTEGER,
    expected_date TEXT,
    rejection_note TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    published_at TEXT,
    FOREIGN KEY (project_id) REFERENCES projects(id)
  );

  CREATE TABLE IF NOT EXISTS content_requests (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    project_id TEXT NOT NULL,
    content_id TEXT,
    request_name TEXT NOT NULL,
    title TEXT NOT NULL,
    priority TEXT DEFAULT 'P1' CHECK(priority IN ('P0','P1','P2')),
    expected_date TEXT,
    theme_format_matrix TEXT DEFAULT '{}',
    total_count INTEGER DEFAULT 0,
    note TEXT DEFAULT '',
    status TEXT DEFAULT 'pending' CHECK(status IN ('pending','accepted','rejected','converted')),
    submitted_by TEXT,
    submitted_at TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY (project_id) REFERENCES projects(id),
    FOREIGN KEY (content_id) REFERENCES content(id)
  );

  CREATE TABLE IF NOT EXISTS content_versions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    content_id TEXT NOT NULL,
    version_no INTEGER NOT NULL,
    title TEXT NOT NULL,
    body TEXT DEFAULT '',
    excerpt TEXT,
    editor_user_id TEXT,
    change_note TEXT,
    workflow_state TEXT DEFAULT 'draft',
    compliance_checklist TEXT DEFAULT '{}',
    immutable_hash TEXT,
    approved_by TEXT,
    approved_at TEXT,
    created_at TEXT NOT NULL,
    FOREIGN KEY (content_id) REFERENCES content(id)
  );

  CREATE TABLE IF NOT EXISTS tags (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    type TEXT DEFAULT 'custom' CHECK(type IN ('disease','topic','format','custom')),
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS content_tags (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    content_id TEXT NOT NULL,
    tag_id TEXT NOT NULL,
    created_at TEXT NOT NULL,
    FOREIGN KEY (content_id) REFERENCES content(id),
    FOREIGN KEY (tag_id) REFERENCES tags(id)
  );

  CREATE TABLE IF NOT EXISTS content_assets (
    id TEXT PRIMARY KEY,
    content_id TEXT NOT NULL,
    asset_type TEXT NOT NULL CHECK(asset_type IN ('image','video','pdf','poster')),
    url TEXT NOT NULL,
    file_name TEXT,
    mime_type TEXT,
    file_size INTEGER,
    created_at TEXT NOT NULL,
    FOREIGN KEY (content_id) REFERENCES content(id)
  );

  CREATE TABLE IF NOT EXISTS behavior_trends (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    date TEXT NOT NULL,
    type TEXT NOT NULL CHECK(type IN ('reads','interactions')),
    value INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS behavior_top_content (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    content_id TEXT NOT NULL,
    title TEXT NOT NULL,
    reads INTEGER DEFAULT 0,
    interactions INTEGER DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS behavior_by_disease (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    disease TEXT NOT NULL,
    reads INTEGER DEFAULT 0,
    interactions INTEGER DEFAULT 0,
    push_count INTEGER DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS behavior_daily_metrics (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    tenant_id TEXT NOT NULL,
    project_id TEXT,
    content_id TEXT,
    disease_id TEXT,
    metric_date TEXT NOT NULL,
    push_count INTEGER DEFAULT 0,
    delivered_count INTEGER DEFAULT 0,
    read_users INTEGER DEFAULT 0,
    read_count INTEGER DEFAULT 0,
    like_count INTEGER DEFAULT 0,
    dislike_count INTEGER DEFAULT 0,
    bookmark_count INTEGER DEFAULT 0,
    share_count INTEGER DEFAULT 0,
    interaction_count INTEGER DEFAULT 0,
    avg_read_sec INTEGER DEFAULT 0,
    finish_rate REAL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS behavior_export_jobs (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    requested_by TEXT NOT NULL,
    scope TEXT NOT NULL CHECK(scope IN ('all','push','read','interaction')),
    range_days INTEGER NOT NULL,
    project_id TEXT,
    disease_id TEXT,
    status TEXT DEFAULT 'pending' CHECK(status IN ('pending','running','completed','failed')),
    file_url TEXT,
    record_count INTEGER DEFAULT 0,
    created_at TEXT NOT NULL,
    completed_at TEXT
  );

  CREATE TABLE IF NOT EXISTS distribution_strategies (
    id TEXT PRIMARY KEY,
    tenant_id TEXT DEFAULT 'T-PX',
    name TEXT NOT NULL,
    project_id TEXT NOT NULL,
    assignment_mode TEXT DEFAULT 'public_claim' CHECK(assignment_mode IN ('public_claim','assigned','mixed')),
    per_doctor_limit INTEGER DEFAULT 2,
    patient_cap INTEGER DEFAULT 0,
    target_regions TEXT DEFAULT '[]',
    target_diseases TEXT DEFAULT '[]',
    target_patient_count INTEGER DEFAULT 0,
    content_ids TEXT DEFAULT '[]',
    schedule_type TEXT DEFAULT 'immediate' CHECK(schedule_type IN ('immediate','scheduled','recurring')),
    schedule_start_date TEXT,
    schedule_end_date TEXT,
    schedule_frequency TEXT CHECK(schedule_frequency IN ('daily','weekly','monthly') OR schedule_frequency IS NULL),
    status TEXT DEFAULT 'draft' CHECK(status IN ('draft','active','paused','completed')),
    metrics_pushed INTEGER DEFAULT 0,
    metrics_delivered INTEGER DEFAULT 0,
    metrics_opened INTEGER DEFAULT 0,
    metrics_read INTEGER DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS distribution_projects (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL DEFAULT 'T-PX',
    title TEXT NOT NULL,
    priority TEXT DEFAULT 'P2' CHECK(priority IN ('P0','P1','P2')),
    status TEXT DEFAULT 'intake' CHECK(status IN ('intake','production','distribution','completed','archived')),
    brand TEXT DEFAULT '—',
    disease TEXT NOT NULL,
    owner TEXT NOT NULL,
    expected_date TEXT,
    total_pieces INTEGER DEFAULT 0,
    cadence TEXT,
    patient_cap INTEGER DEFAULT 0,
    topics TEXT DEFAULT '[]',
    formats TEXT DEFAULT '',
    approval_flow TEXT DEFAULT '',
    progress INTEGER DEFAULT 0,
    current_node TEXT DEFAULT '未提交',
    content_count INTEGER DEFAULT 0,
    published_count INTEGER DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY (tenant_id) REFERENCES tenants(id)
  );

  CREATE TABLE IF NOT EXISTS distribution_strategy_filters (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    strategy_id TEXT NOT NULL,
    filter_group TEXT NOT NULL CHECK(filter_group IN ('department','title','region','tag')),
    filter_value TEXT NOT NULL,
    created_at TEXT NOT NULL,
    FOREIGN KEY (strategy_id) REFERENCES distribution_strategies(id)
  );

  CREATE TABLE IF NOT EXISTS doctors (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    title TEXT,
    department TEXT,
    region TEXT,
    hospital TEXT,
    status TEXT DEFAULT 'active',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS doctor_specialties (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    doctor_id TEXT NOT NULL,
    disease_id TEXT NOT NULL,
    created_at TEXT NOT NULL,
    FOREIGN KEY (doctor_id) REFERENCES doctors(id)
  );

  CREATE TABLE IF NOT EXISTS doctor_tags (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    doctor_id TEXT NOT NULL,
    tag TEXT NOT NULL,
    created_at TEXT NOT NULL,
    FOREIGN KEY (doctor_id) REFERENCES doctors(id)
  );

  CREATE TABLE IF NOT EXISTS distribution_candidates (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    strategy_id TEXT NOT NULL,
    doctor_id TEXT NOT NULL,
    match_score REAL DEFAULT 0,
    match_reason TEXT,
    created_at TEXT NOT NULL,
    FOREIGN KEY (strategy_id) REFERENCES distribution_strategies(id),
    FOREIGN KEY (doctor_id) REFERENCES doctors(id)
  );

  CREATE TABLE IF NOT EXISTS distribution_records (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    project_id TEXT NOT NULL,
    content_id TEXT NOT NULL,
    strategy_id TEXT,
    target_type TEXT NOT NULL CHECK(target_type IN ('doctor','patient_segment')),
    target_label TEXT NOT NULL,
    channel TEXT,
    planned_count INTEGER DEFAULT 0,
    actual_count INTEGER DEFAULT 0,
    gray_percent INTEGER DEFAULT 0,
    operator_user_id TEXT,
    distributed_at TEXT NOT NULL,
    note TEXT,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS request_distribution_configs (
    request_id TEXT PRIMARY KEY,
    assignment_mode TEXT DEFAULT 'mixed' CHECK(assignment_mode IN ('mixed','whitelist','strategy')),
    whitelist_enabled INTEGER DEFAULT 1,
    strategy_enabled INTEGER DEFAULT 1,
    department_filters TEXT DEFAULT '[]',
    title_filters TEXT DEFAULT '[]',
    region_filters TEXT DEFAULT '[]',
    tag_filters TEXT DEFAULT '[]',
    whitelist_doctor_ids TEXT DEFAULT '[]',
    whitelist_doctor_quota TEXT DEFAULT '{}',
    patient_channels TEXT DEFAULT '[]',
    patient_regions TEXT DEFAULT '[]',
    patient_tags TEXT DEFAULT '[]',
    patient_gray_percent INTEGER DEFAULT 30,
    patient_cap INTEGER DEFAULT 5000,
    note TEXT DEFAULT '',
    updated_by TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY (request_id) REFERENCES content_requests(id)
  );

  CREATE TABLE IF NOT EXISTS request_distribution_batches (
    id TEXT PRIMARY KEY,
    request_id TEXT NOT NULL,
    batch_matrix TEXT DEFAULT '{}',
    total_count INTEGER DEFAULT 0,
    whitelist_total INTEGER DEFAULT 0,
    strategy_total INTEGER DEFAULT 0,
    operator TEXT,
    submitted_at TEXT NOT NULL,
    created_at TEXT NOT NULL,
    FOREIGN KEY (request_id) REFERENCES content_requests(id)
  );

  CREATE TABLE IF NOT EXISTS approval_items (
    id TEXT PRIMARY KEY,
    content_id TEXT NOT NULL,
    content_title TEXT NOT NULL,
    submitted_by TEXT NOT NULL,
    submitted_at TEXT NOT NULL,
    status TEXT DEFAULT 'pending' CHECK(status IN ('pending','approved','rejected')),
    reviewed_by TEXT,
    reviewed_at TEXT,
    comments TEXT,
    project_name TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS approval_flows (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    name TEXT NOT NULL,
    description TEXT,
    status TEXT DEFAULT 'active' CHECK(status IN ('active','inactive')),
    return_policy TEXT DEFAULT 'submitter' CHECK(return_policy IN ('submitter','previous','first')),
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS approval_flow_nodes (
    id TEXT PRIMARY KEY,
    flow_id TEXT NOT NULL,
    sort_order INTEGER NOT NULL,
    node_name TEXT NOT NULL,
    reviewer_type TEXT NOT NULL CHECK(reviewer_type IN ('dx_editor','system_precheck','px_ops','pharma_med','pharma_mkt')),
    sla_hours INTEGER DEFAULT 24,
    timeout_policy TEXT DEFAULT 'remind_only' CHECK(timeout_policy IN ('remind_only','auto_pass','escalate')),
    required_role_id TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY (flow_id) REFERENCES approval_flows(id)
  );

  CREATE TABLE IF NOT EXISTS approval_tasks (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    content_id TEXT NOT NULL,
    project_id TEXT NOT NULL,
    flow_id TEXT NOT NULL,
    current_node_id TEXT,
    status TEXT DEFAULT 'pending' CHECK(status IN ('pending','approved','rejected','cancelled')),
    progress_text TEXT,
    sla_due_at TEXT,
    submitted_by TEXT NOT NULL,
    submitted_at TEXT NOT NULL,
    completed_at TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS approval_task_actions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    task_id TEXT NOT NULL,
    node_id TEXT,
    action TEXT NOT NULL CHECK(action IN ('submit','approve','reject','comment','auto_pass')),
    actor_user_id TEXT,
    actor_name TEXT,
    reject_reason TEXT,
    comment TEXT,
    created_at TEXT NOT NULL,
    FOREIGN KEY (task_id) REFERENCES approval_tasks(id)
  );

  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    tenant_id TEXT DEFAULT 'T-PX',
    name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    phone TEXT,
    role TEXT NOT NULL DEFAULT 'viewer' CHECK(role IN ('admin','editor','viewer')),
    role_labels TEXT DEFAULT '[]',
    view_type TEXT DEFAULT 'ops' CHECK(view_type IN ('ops','pharma')),
    region TEXT NOT NULL,
    status TEXT DEFAULT 'active' CHECK(status IN ('active','inactive','frozen','invited')),
    has_2fa INTEGER DEFAULT 0,
    password_hash TEXT,
    password_salt TEXT,
    last_login TEXT,
    note TEXT DEFAULT '',
    created_at TEXT NOT NULL,
    updated_at TEXT
  );

  CREATE TABLE IF NOT EXISTS roles (
    id TEXT PRIMARY KEY,
    tenant_id TEXT,
    name TEXT NOT NULL,
    code TEXT NOT NULL UNIQUE,
    view_type TEXT NOT NULL CHECK(view_type IN ('ops','pharma')),
    description TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS user_roles (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL,
    role_id TEXT NOT NULL,
    created_at TEXT NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id),
    FOREIGN KEY (role_id) REFERENCES roles(id)
  );

  CREATE TABLE IF NOT EXISTS permissions (
    id TEXT PRIMARY KEY,
    code TEXT NOT NULL UNIQUE,
    group_name TEXT NOT NULL,
    field_name TEXT NOT NULL,
    description TEXT
  );

  CREATE TABLE IF NOT EXISTS role_permissions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    role_id TEXT NOT NULL,
    permission_id TEXT NOT NULL,
    access_level TEXT NOT NULL CHECK(access_level IN ('none','masked','aggregate','plaintext')),
    created_at TEXT NOT NULL,
    FOREIGN KEY (role_id) REFERENCES roles(id),
    FOREIGN KEY (permission_id) REFERENCES permissions(id)
  );

  CREATE TABLE IF NOT EXISTS platform_settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS overview_stats (
    id INTEGER PRIMARY KEY CHECK(id = 1),
    project_count INTEGER DEFAULT 0,
    published_content TEXT DEFAULT '0/0',
    push_count INTEGER DEFAULT 0,
    read_users INTEGER DEFAULT 0,
    read_count INTEGER DEFAULT 0,
    interaction_count INTEGER DEFAULT 0,
    last_updated TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS audit_logs (
    id TEXT PRIMARY KEY,
    tenant_id TEXT,
    actor_user_id TEXT,
    actor_name TEXT,
    action TEXT NOT NULL,
    resource_type TEXT,
    resource_id TEXT,
    description TEXT,
    ip_address TEXT,
    user_agent TEXT,
    metadata TEXT DEFAULT '{}',
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS notifications (
    id TEXT PRIMARY KEY,
    tenant_id TEXT,
    user_id TEXT,
    type TEXT NOT NULL CHECK(type IN ('approval','sla','export','system')),
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    is_read INTEGER DEFAULT 0,
    link_url TEXT,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS team_settings (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    site_name TEXT,
    default_region TEXT,
    feature_flags TEXT DEFAULT '{}',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_content_project ON content(project_id);
  CREATE INDEX IF NOT EXISTS idx_behavior_daily_tenant_date ON behavior_daily_metrics(tenant_id, metric_date);
  CREATE INDEX IF NOT EXISTS idx_distribution_project ON distribution_strategies(project_id);
  CREATE INDEX IF NOT EXISTS idx_distribution_projects_status ON distribution_projects(status);
  CREATE INDEX IF NOT EXISTS idx_request_distribution_batches_request ON request_distribution_batches(request_id);
  CREATE INDEX IF NOT EXISTS idx_approval_tasks_tenant_status ON approval_tasks(tenant_id, status);
  CREATE INDEX IF NOT EXISTS idx_audit_logs_tenant_time ON audit_logs(tenant_id, created_at);
`;

const postgresSchema = `
  CREATE TABLE IF NOT EXISTS tenants (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    short_name TEXT NOT NULL,
    tenant_type TEXT NOT NULL DEFAULT 'pharma' CHECK(tenant_type IN ('ops','pharma')),
    status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','inactive','draft')),
    contract_no TEXT,
    contact_name TEXT,
    contact_email TEXT,
    contact_phone TEXT,
    description TEXT DEFAULT '',
    can_export BOOLEAN DEFAULT FALSE,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS tenant_scopes (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL REFERENCES tenants(id),
    disease_ids JSONB DEFAULT '[]'::jsonb,
    brand_ids JSONB DEFAULT '[]'::jsonb,
    region_ids JSONB DEFAULT '[]'::jsonb,
    gray_limit_percent INTEGER DEFAULT 0,
    k_anonymity_threshold INTEGER DEFAULT 50,
    can_view_aggregate_metrics BOOLEAN DEFAULT TRUE,
    can_export_csv BOOLEAN DEFAULT FALSE,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS projects (
    id TEXT PRIMARY KEY,
    tenant_id TEXT DEFAULT 'T-PX' REFERENCES tenants(id),
    name TEXT NOT NULL,
    title TEXT,
    disease TEXT NOT NULL,
    disease_id TEXT,
    brand_id TEXT,
    brand_name TEXT,
    owner_user_id TEXT,
    owner_name TEXT,
    priority TEXT DEFAULT 'P2' CHECK(priority IN ('P0','P1','P2')),
    content_count INTEGER DEFAULT 0,
    published_count INTEGER DEFAULT 0,
    push_count INTEGER DEFAULT 0,
    read_users INTEGER DEFAULT 0,
    read_count INTEGER DEFAULT 0,
    interaction_count INTEGER DEFAULT 0,
    status TEXT DEFAULT 'active' CHECK(status IN ('active','paused','archived','intake','production','distribution','completed')),
    expected_date TEXT,
    total_pieces INTEGER DEFAULT 0,
    cadence TEXT,
    patient_cap INTEGER DEFAULT 0,
    approval_flow_id TEXT,
    current_approval_node_id TEXT,
    progress_percent INTEGER DEFAULT 0,
    description TEXT DEFAULT '',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS diseases (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    code TEXT,
    category TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS brands (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL REFERENCES tenants(id),
    name TEXT NOT NULL,
    generic_name TEXT,
    disease_id TEXT REFERENCES diseases(id),
    status TEXT DEFAULT 'active',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS project_topics (id BIGSERIAL PRIMARY KEY, project_id TEXT NOT NULL REFERENCES projects(id), topic_name TEXT NOT NULL, target_count INTEGER DEFAULT 0, created_at TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS project_formats (id BIGSERIAL PRIMARY KEY, project_id TEXT NOT NULL REFERENCES projects(id), format_type TEXT NOT NULL, target_count INTEGER DEFAULT 0, created_at TEXT NOT NULL);

  CREATE TABLE IF NOT EXISTS content (
    id TEXT PRIMARY KEY,
    tenant_id TEXT DEFAULT 'T-PX' REFERENCES tenants(id),
    project_id TEXT NOT NULL REFERENCES projects(id),
    title TEXT NOT NULL,
    type TEXT NOT NULL CHECK(type IN ('article','video','infographic','quiz','qa','checklist','poster')),
    status TEXT DEFAULT 'requirement_submitted' CHECK(status IN ('requirement_submitted','doctor_distributing','doctor_producing','third_party_review','internal_review','published','draft','offline')),
    workflow_state TEXT DEFAULT 'requirement_submitted',
    pipeline_stage TEXT DEFAULT 'requirement_submitted' CHECK(pipeline_stage IN ('requirement_submitted','doctor_distributing','doctor_producing','third_party_review','internal_review','published')),
    priority TEXT DEFAULT 'P2' CHECK(priority IN ('P0','P1','P2')),
    author TEXT NOT NULL,
    author_user_id TEXT,
    excerpt TEXT,
    content TEXT DEFAULT '',
    tags JSONB DEFAULT '[]'::jsonb,
    push_count INTEGER DEFAULT 0,
    read_users INTEGER DEFAULT 0,
    read_count INTEGER DEFAULT 0,
    like_count INTEGER DEFAULT 0,
    dislike_count INTEGER DEFAULT 0,
    bookmark_count INTEGER DEFAULT 0,
    share_count INTEGER DEFAULT 0,
    finish_rate REAL,
    avg_read_sec INTEGER,
    expected_date TEXT,
    rejection_note TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    published_at TEXT
  );

  CREATE TABLE IF NOT EXISTS content_versions (id BIGSERIAL PRIMARY KEY, content_id TEXT NOT NULL REFERENCES content(id), version_no INTEGER NOT NULL, title TEXT NOT NULL, body TEXT DEFAULT '', excerpt TEXT, editor_user_id TEXT, change_note TEXT, workflow_state TEXT DEFAULT 'draft', compliance_checklist JSONB DEFAULT '{}'::jsonb, immutable_hash TEXT, approved_by TEXT, approved_at TEXT, created_at TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS tags (id TEXT PRIMARY KEY, name TEXT NOT NULL UNIQUE, type TEXT DEFAULT 'custom' CHECK(type IN ('disease','topic','format','custom')), created_at TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS content_tags (id BIGSERIAL PRIMARY KEY, content_id TEXT NOT NULL REFERENCES content(id), tag_id TEXT NOT NULL REFERENCES tags(id), created_at TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS content_assets (id TEXT PRIMARY KEY, content_id TEXT NOT NULL REFERENCES content(id), asset_type TEXT NOT NULL CHECK(asset_type IN ('image','video','pdf','poster')), url TEXT NOT NULL, file_name TEXT, mime_type TEXT, file_size INTEGER, created_at TEXT NOT NULL);

  CREATE TABLE IF NOT EXISTS behavior_trends (id BIGSERIAL PRIMARY KEY, date TEXT NOT NULL, type TEXT NOT NULL CHECK(type IN ('reads','interactions')), value INTEGER NOT NULL);
  CREATE TABLE IF NOT EXISTS behavior_top_content (id BIGSERIAL PRIMARY KEY, content_id TEXT NOT NULL, title TEXT NOT NULL, reads INTEGER DEFAULT 0, interactions INTEGER DEFAULT 0);
  CREATE TABLE IF NOT EXISTS behavior_by_disease (id BIGSERIAL PRIMARY KEY, disease TEXT NOT NULL, reads INTEGER DEFAULT 0, interactions INTEGER DEFAULT 0, push_count INTEGER DEFAULT 0);

  CREATE TABLE IF NOT EXISTS behavior_daily_metrics (
    id BIGSERIAL PRIMARY KEY,
    tenant_id TEXT NOT NULL REFERENCES tenants(id),
    project_id TEXT,
    content_id TEXT,
    disease_id TEXT,
    metric_date TEXT NOT NULL,
    push_count INTEGER DEFAULT 0,
    delivered_count INTEGER DEFAULT 0,
    read_users INTEGER DEFAULT 0,
    read_count INTEGER DEFAULT 0,
    like_count INTEGER DEFAULT 0,
    dislike_count INTEGER DEFAULT 0,
    bookmark_count INTEGER DEFAULT 0,
    share_count INTEGER DEFAULT 0,
    interaction_count INTEGER DEFAULT 0,
    avg_read_sec INTEGER DEFAULT 0,
    finish_rate REAL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS behavior_export_jobs (id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL REFERENCES tenants(id), requested_by TEXT NOT NULL, scope TEXT NOT NULL CHECK(scope IN ('all','push','read','interaction')), range_days INTEGER NOT NULL, project_id TEXT, disease_id TEXT, status TEXT DEFAULT 'pending' CHECK(status IN ('pending','running','completed','failed')), file_url TEXT, record_count INTEGER DEFAULT 0, created_at TEXT NOT NULL, completed_at TEXT);

  CREATE TABLE IF NOT EXISTS distribution_strategies (
    id TEXT PRIMARY KEY,
    tenant_id TEXT DEFAULT 'T-PX' REFERENCES tenants(id),
    name TEXT NOT NULL,
    project_id TEXT NOT NULL,
    assignment_mode TEXT DEFAULT 'public_claim' CHECK(assignment_mode IN ('public_claim','assigned','mixed')),
    per_doctor_limit INTEGER DEFAULT 2,
    patient_cap INTEGER DEFAULT 0,
    target_regions JSONB DEFAULT '[]'::jsonb,
    target_diseases JSONB DEFAULT '[]'::jsonb,
    target_patient_count INTEGER DEFAULT 0,
    content_ids JSONB DEFAULT '[]'::jsonb,
    schedule_type TEXT DEFAULT 'immediate' CHECK(schedule_type IN ('immediate','scheduled','recurring')),
    schedule_start_date TEXT,
    schedule_end_date TEXT,
    schedule_frequency TEXT CHECK(schedule_frequency IN ('daily','weekly','monthly') OR schedule_frequency IS NULL),
    status TEXT DEFAULT 'draft' CHECK(status IN ('draft','active','paused','completed')),
    metrics_pushed INTEGER DEFAULT 0,
    metrics_delivered INTEGER DEFAULT 0,
    metrics_opened INTEGER DEFAULT 0,
    metrics_read INTEGER DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS distribution_projects (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL DEFAULT 'T-PX' REFERENCES tenants(id),
    title TEXT NOT NULL,
    priority TEXT DEFAULT 'P2' CHECK(priority IN ('P0','P1','P2')),
    status TEXT DEFAULT 'intake' CHECK(status IN ('intake','production','distribution','completed','archived')),
    brand TEXT DEFAULT '—',
    disease TEXT NOT NULL,
    owner TEXT NOT NULL,
    expected_date TEXT,
    total_pieces INTEGER DEFAULT 0,
    cadence TEXT,
    patient_cap INTEGER DEFAULT 0,
    topics JSONB DEFAULT '[]'::jsonb,
    formats TEXT DEFAULT '',
    approval_flow TEXT DEFAULT '',
    progress INTEGER DEFAULT 0,
    current_node TEXT DEFAULT '未提交',
    content_count INTEGER DEFAULT 0,
    published_count INTEGER DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS distribution_strategy_filters (id BIGSERIAL PRIMARY KEY, strategy_id TEXT NOT NULL REFERENCES distribution_strategies(id), filter_group TEXT NOT NULL CHECK(filter_group IN ('department','title','region','tag')), filter_value TEXT NOT NULL, created_at TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS doctors (id TEXT PRIMARY KEY, name TEXT NOT NULL, title TEXT, department TEXT, region TEXT, hospital TEXT, status TEXT DEFAULT 'active', created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS doctor_specialties (id BIGSERIAL PRIMARY KEY, doctor_id TEXT NOT NULL REFERENCES doctors(id), disease_id TEXT NOT NULL, created_at TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS doctor_tags (id BIGSERIAL PRIMARY KEY, doctor_id TEXT NOT NULL REFERENCES doctors(id), tag TEXT NOT NULL, created_at TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS distribution_candidates (id BIGSERIAL PRIMARY KEY, strategy_id TEXT NOT NULL REFERENCES distribution_strategies(id), doctor_id TEXT NOT NULL REFERENCES doctors(id), match_score REAL DEFAULT 0, match_reason TEXT, created_at TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS distribution_records (id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL REFERENCES tenants(id), project_id TEXT NOT NULL, content_id TEXT NOT NULL, strategy_id TEXT, target_type TEXT NOT NULL CHECK(target_type IN ('doctor','patient_segment')), target_label TEXT NOT NULL, channel TEXT, planned_count INTEGER DEFAULT 0, actual_count INTEGER DEFAULT 0, gray_percent INTEGER DEFAULT 0, operator_user_id TEXT, distributed_at TEXT NOT NULL, note TEXT, created_at TEXT NOT NULL);

  CREATE TABLE IF NOT EXISTS content_requests (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    project_id TEXT NOT NULL REFERENCES projects(id),
    content_id TEXT REFERENCES content(id),
    request_name TEXT NOT NULL,
    title TEXT NOT NULL,
    priority TEXT DEFAULT 'P1' CHECK(priority IN ('P0','P1','P2')),
    expected_date TEXT,
    theme_format_matrix JSONB DEFAULT '{}'::jsonb,
    total_count INTEGER DEFAULT 0,
    note TEXT DEFAULT '',
    status TEXT DEFAULT 'pending' CHECK(status IN ('pending','accepted','rejected','converted')),
    submitted_by TEXT,
    submitted_at TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS request_distribution_configs (
    request_id TEXT PRIMARY KEY REFERENCES content_requests(id),
    assignment_mode TEXT DEFAULT 'mixed' CHECK(assignment_mode IN ('mixed','whitelist','strategy')),
    whitelist_enabled BOOLEAN DEFAULT TRUE,
    strategy_enabled BOOLEAN DEFAULT TRUE,
    department_filters JSONB DEFAULT '[]'::jsonb,
    title_filters JSONB DEFAULT '[]'::jsonb,
    region_filters JSONB DEFAULT '[]'::jsonb,
    tag_filters JSONB DEFAULT '[]'::jsonb,
    whitelist_doctor_ids JSONB DEFAULT '[]'::jsonb,
    whitelist_doctor_quota JSONB DEFAULT '{}'::jsonb,
    patient_channels JSONB DEFAULT '[]'::jsonb,
    patient_regions JSONB DEFAULT '[]'::jsonb,
    patient_tags JSONB DEFAULT '[]'::jsonb,
    patient_gray_percent INTEGER DEFAULT 30,
    patient_cap INTEGER DEFAULT 5000,
    note TEXT DEFAULT '',
    updated_by TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS request_distribution_batches (id TEXT PRIMARY KEY, request_id TEXT NOT NULL REFERENCES content_requests(id), batch_matrix JSONB DEFAULT '{}'::jsonb, total_count INTEGER DEFAULT 0, whitelist_total INTEGER DEFAULT 0, strategy_total INTEGER DEFAULT 0, operator TEXT, submitted_at TEXT NOT NULL, created_at TEXT NOT NULL);

  CREATE TABLE IF NOT EXISTS approval_items (id TEXT PRIMARY KEY, content_id TEXT NOT NULL, content_title TEXT NOT NULL, submitted_by TEXT NOT NULL, submitted_at TEXT NOT NULL, status TEXT DEFAULT 'pending' CHECK(status IN ('pending','approved','rejected')), reviewed_by TEXT, reviewed_at TEXT, comments TEXT, project_name TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS approval_flows (id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL REFERENCES tenants(id), name TEXT NOT NULL, description TEXT, status TEXT DEFAULT 'active' CHECK(status IN ('active','inactive')), return_policy TEXT DEFAULT 'submitter' CHECK(return_policy IN ('submitter','previous','first')), created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS approval_flow_nodes (id TEXT PRIMARY KEY, flow_id TEXT NOT NULL REFERENCES approval_flows(id), sort_order INTEGER NOT NULL, node_name TEXT NOT NULL, reviewer_type TEXT NOT NULL CHECK(reviewer_type IN ('dx_editor','system_precheck','px_ops','pharma_med','pharma_mkt')), sla_hours INTEGER DEFAULT 24, timeout_policy TEXT DEFAULT 'remind_only' CHECK(timeout_policy IN ('remind_only','auto_pass','escalate')), required_role_id TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS approval_tasks (id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL REFERENCES tenants(id), content_id TEXT NOT NULL, project_id TEXT NOT NULL, flow_id TEXT NOT NULL, current_node_id TEXT, status TEXT DEFAULT 'pending' CHECK(status IN ('pending','approved','rejected','cancelled')), progress_text TEXT, sla_due_at TEXT, submitted_by TEXT NOT NULL, submitted_at TEXT NOT NULL, completed_at TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS approval_task_actions (id BIGSERIAL PRIMARY KEY, task_id TEXT NOT NULL REFERENCES approval_tasks(id), node_id TEXT, action TEXT NOT NULL CHECK(action IN ('submit','approve','reject','comment','auto_pass')), actor_user_id TEXT, actor_name TEXT, reject_reason TEXT, comment TEXT, created_at TEXT NOT NULL);

  CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, tenant_id TEXT DEFAULT 'T-PX' REFERENCES tenants(id), name TEXT NOT NULL, email TEXT NOT NULL UNIQUE, phone TEXT, role TEXT NOT NULL DEFAULT 'viewer' CHECK(role IN ('admin','editor','viewer')), role_labels JSONB DEFAULT '[]'::jsonb, view_type TEXT DEFAULT 'ops' CHECK(view_type IN ('ops','pharma')), region TEXT NOT NULL, status TEXT DEFAULT 'active' CHECK(status IN ('active','inactive','frozen','invited')), has_2fa BOOLEAN DEFAULT FALSE, password_hash TEXT, password_salt TEXT, last_login TEXT, note TEXT DEFAULT '', created_at TEXT NOT NULL, updated_at TEXT);
  CREATE TABLE IF NOT EXISTS roles (id TEXT PRIMARY KEY, tenant_id TEXT REFERENCES tenants(id), name TEXT NOT NULL, code TEXT NOT NULL UNIQUE, view_type TEXT NOT NULL CHECK(view_type IN ('ops','pharma')), description TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS user_roles (id BIGSERIAL PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), role_id TEXT NOT NULL REFERENCES roles(id), created_at TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS permissions (id TEXT PRIMARY KEY, code TEXT NOT NULL UNIQUE, group_name TEXT NOT NULL, field_name TEXT NOT NULL, description TEXT);
  CREATE TABLE IF NOT EXISTS role_permissions (id BIGSERIAL PRIMARY KEY, role_id TEXT NOT NULL REFERENCES roles(id), permission_id TEXT NOT NULL REFERENCES permissions(id), access_level TEXT NOT NULL CHECK(access_level IN ('none','masked','aggregate','plaintext')), created_at TEXT NOT NULL);

  CREATE TABLE IF NOT EXISTS platform_settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS overview_stats (id INTEGER PRIMARY KEY CHECK(id = 1), project_count INTEGER DEFAULT 0, published_content TEXT DEFAULT '0/0', push_count INTEGER DEFAULT 0, read_users INTEGER DEFAULT 0, read_count INTEGER DEFAULT 0, interaction_count INTEGER DEFAULT 0, last_updated TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS audit_logs (id TEXT PRIMARY KEY, tenant_id TEXT REFERENCES tenants(id), actor_user_id TEXT, actor_name TEXT, action TEXT NOT NULL, resource_type TEXT, resource_id TEXT, description TEXT, ip_address TEXT, user_agent TEXT, metadata JSONB DEFAULT '{}'::jsonb, created_at TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS notifications (id TEXT PRIMARY KEY, tenant_id TEXT REFERENCES tenants(id), user_id TEXT, type TEXT NOT NULL CHECK(type IN ('approval','sla','export','system')), title TEXT NOT NULL, message TEXT NOT NULL, is_read BOOLEAN DEFAULT FALSE, link_url TEXT, created_at TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS team_settings (id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL REFERENCES tenants(id), site_name TEXT, default_region TEXT, feature_flags JSONB DEFAULT '{}'::jsonb, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);

  CREATE INDEX IF NOT EXISTS idx_projects_tenant ON projects(tenant_id);
  CREATE INDEX IF NOT EXISTS idx_content_project ON content(project_id);
  CREATE INDEX IF NOT EXISTS idx_content_tenant_status ON content(tenant_id, status);
  CREATE INDEX IF NOT EXISTS idx_behavior_daily_tenant_date ON behavior_daily_metrics(tenant_id, metric_date);
  CREATE INDEX IF NOT EXISTS idx_distribution_project ON distribution_strategies(project_id);
  CREATE INDEX IF NOT EXISTS idx_distribution_projects_status ON distribution_projects(status);
  CREATE INDEX IF NOT EXISTS idx_request_distribution_batches_request ON request_distribution_batches(request_id);
  CREATE INDEX IF NOT EXISTS idx_approval_tasks_tenant_status ON approval_tasks(tenant_id, status);
  CREATE INDEX IF NOT EXISTS idx_users_tenant ON users(tenant_id);
  CREATE INDEX IF NOT EXISTS idx_audit_logs_tenant_time ON audit_logs(tenant_id, created_at);
`;



async function resetLegacySqliteSchemaIfNeeded(): Promise<void> {
  if (DB_DRIVER !== 'sqlite') return;
  const forceReset = process.env.FORCE_SQLITE_SCHEMA_RESET === 'true';
  const contentTable = await dbGet<{ sql: string }>("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'content'");
  const usersTable = await dbGet<{ sql: string }>("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'users'");
  const isLegacy = Boolean(
    contentTable?.sql && (!contentTable.sql.includes("'poster'") || !contentTable.sql.includes('pipeline_stage') || contentTable.sql.includes('doctor_creating') || contentTable.sql.includes('external_review'))
  ) || Boolean(
    usersTable?.sql && (!usersTable.sql.includes("'frozen'") || !usersTable.sql.includes('role_labels'))
  ) || Boolean(
    (await dbGet<{ sql: string }>("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'approval_flow_nodes'"))?.sql?.includes("'" + "a" + "i" + "_review" + "'")
  );

  if (!forceReset && !isLegacy) return;

  logger.warn({ forceReset, isLegacy }, 'Resetting legacy SQLite demo schema so fake DB data can use current columns and checks');
  const tables = [
    'role_permissions',
    'user_roles',
    'permissions',
    'roles',
    'approval_task_actions',
    'approval_tasks',
    'approval_flow_nodes',
    'approval_flows',
    'approval_items',
    'distribution_records',
    'distribution_candidates',
    'doctor_tags',
    'doctor_specialties',
    'doctors',
    'request_distribution_batches',
    'request_distribution_configs',
    'distribution_strategy_filters',
    'distribution_strategies',
    'distribution_projects',
    'behavior_export_jobs',
    'behavior_daily_metrics',
    'behavior_events',
    'behavior_by_disease',
    'behavior_top_content',
    'behavior_trends',
    'content_assets',
    'content_tags',
    'tags',
    'content_versions',
    'content_requests',
    'content',
    'project_formats',
    'project_topics',
    'brands',
    'diseases',
    'projects',
    'notifications',
    'audit_logs',
    'team_settings',
    'platform_settings',
    'tenant_scopes',
    'tenants',
    'users',
  ];

  await dbRun('PRAGMA foreign_keys = OFF');
  for (const table of tables) {
    await dbRun(`DROP TABLE IF EXISTS ${table}`);
  }
  await dbRun('PRAGMA foreign_keys = ON');
}

type SqliteColumnSpec = { table: string; name: string; definition: string };

const sqliteColumnSpecs: SqliteColumnSpec[] = [
  { table: 'projects', name: 'tenant_id', definition: "TEXT DEFAULT 'T-PX'" },
  { table: 'projects', name: 'title', definition: 'TEXT' },
  { table: 'projects', name: 'disease_id', definition: 'TEXT' },
  { table: 'projects', name: 'brand_id', definition: 'TEXT' },
  { table: 'projects', name: 'brand_name', definition: 'TEXT' },
  { table: 'projects', name: 'owner_user_id', definition: 'TEXT' },
  { table: 'projects', name: 'owner_name', definition: 'TEXT' },
  { table: 'projects', name: 'priority', definition: "TEXT DEFAULT 'P2'" },
  { table: 'projects', name: 'read_users', definition: 'INTEGER DEFAULT 0' },
  { table: 'projects', name: 'expected_date', definition: 'TEXT' },
  { table: 'projects', name: 'total_pieces', definition: 'INTEGER DEFAULT 0' },
  { table: 'projects', name: 'cadence', definition: 'TEXT' },
  { table: 'projects', name: 'patient_cap', definition: 'INTEGER DEFAULT 0' },
  { table: 'projects', name: 'approval_flow_id', definition: 'TEXT' },
  { table: 'projects', name: 'current_approval_node_id', definition: 'TEXT' },
  { table: 'projects', name: 'progress_percent', definition: 'INTEGER DEFAULT 0' },
  { table: 'projects', name: 'description', definition: "TEXT DEFAULT ''" },
  { table: 'projects', name: 'topics', definition: "TEXT DEFAULT '[]'" },
  { table: 'projects', name: 'formats', definition: "TEXT DEFAULT ''" },
  { table: 'projects', name: 'current_node', definition: "TEXT DEFAULT '未提交'" },
  { table: 'content', name: 'tenant_id', definition: "TEXT DEFAULT 'T-PX'" },
  { table: 'content', name: 'workflow_state', definition: "TEXT DEFAULT 'draft'" },
  { table: 'content', name: 'pipeline_stage', definition: "TEXT DEFAULT 'requirement_submitted'" },
  { table: 'content', name: 'priority', definition: "TEXT DEFAULT 'P2'" },
  { table: 'content', name: 'author_user_id', definition: 'TEXT' },
  { table: 'content', name: 'excerpt', definition: 'TEXT' },
  { table: 'content', name: 'push_count', definition: 'INTEGER DEFAULT 0' },
  { table: 'content', name: 'read_users', definition: 'INTEGER DEFAULT 0' },
  { table: 'content', name: 'dislike_count', definition: 'INTEGER DEFAULT 0' },
  { table: 'content', name: 'share_count', definition: 'INTEGER DEFAULT 0' },
  { table: 'content', name: 'finish_rate', definition: 'REAL' },
  { table: 'content', name: 'avg_read_sec', definition: 'INTEGER' },
  { table: 'content', name: 'expected_date', definition: 'TEXT' },
  { table: 'content', name: 'rejection_note', definition: 'TEXT' },
  { table: 'content_versions', name: 'workflow_state', definition: "TEXT DEFAULT 'draft'" },
  { table: 'content_versions', name: 'compliance_checklist', definition: "TEXT DEFAULT '{}'" },
  { table: 'content_versions', name: 'immutable_hash', definition: 'TEXT' },
  { table: 'content_versions', name: 'approved_by', definition: 'TEXT' },
  { table: 'content_versions', name: 'approved_at', definition: 'TEXT' },
  { table: 'distribution_strategies', name: 'tenant_id', definition: "TEXT DEFAULT 'T-PX'" },
  { table: 'distribution_strategies', name: 'assignment_mode', definition: "TEXT DEFAULT 'public_claim'" },
  { table: 'distribution_strategies', name: 'per_doctor_limit', definition: 'INTEGER DEFAULT 2' },
  { table: 'distribution_strategies', name: 'patient_cap', definition: 'INTEGER DEFAULT 0' },
  { table: 'users', name: 'tenant_id', definition: "TEXT DEFAULT 'T-PX'" },
  { table: 'users', name: 'phone', definition: 'TEXT' },
  { table: 'users', name: 'role_labels', definition: "TEXT DEFAULT '[]'" },
  { table: 'users', name: 'view_type', definition: "TEXT DEFAULT 'ops'" },
  { table: 'users', name: 'has_2fa', definition: 'INTEGER DEFAULT 0' },
  { table: 'users', name: 'password_hash', definition: 'TEXT' },
  { table: 'users', name: 'password_salt', definition: 'TEXT' },
  { table: 'users', name: 'note', definition: "TEXT DEFAULT ''" },
  { table: 'users', name: 'updated_at', definition: 'TEXT' },
];

async function ensureSqliteColumns(): Promise<void> {
  if (DB_DRIVER !== 'sqlite') return;

  for (const spec of sqliteColumnSpecs) {
    const rows = await dbAll<{ name: string }>(`PRAGMA table_info(${spec.table})`);
    if (rows.length === 0) continue;
    if (rows.some((row) => row.name === spec.name)) continue;
    await dbRun(`ALTER TABLE ${spec.table} ADD COLUMN ${spec.name} ${spec.definition}`);
    logger.info({ table: spec.table, column: spec.name }, 'SQLite schema column added');
  }
}

async function ensurePostgresColumns(): Promise<void> {
  if (DB_DRIVER !== 'postgres') return;
  await dbExec(`
    ALTER TABLE users ADD COLUMN IF NOT EXISTS role_labels JSONB DEFAULT '[]'::jsonb;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS note TEXT DEFAULT '';
    ALTER TABLE users ADD COLUMN IF NOT EXISTS password_hash TEXT;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS password_salt TEXT;
    ALTER TABLE projects ADD COLUMN IF NOT EXISTS brand_name TEXT;
    ALTER TABLE projects ADD COLUMN IF NOT EXISTS owner_name TEXT;
  `);
}

export async function initializeSchema(): Promise<void> {
  await resetLegacySqliteSchemaIfNeeded();
  await dbExec(DB_DRIVER === 'postgres' ? postgresSchema : sqliteSchema);
  await ensureSqliteColumns();
  await ensurePostgresColumns();
  logger.info({ driver: DB_DRIVER }, 'Database schema initialized');
}
