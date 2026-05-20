import { dbAll, dbExec, dbGet, dbRun, DB_DRIVER } from './connection.js';
import { logger } from '../utils/logger.js';

const migrations = [
  {
    id: '20260513-production-readiness-foundation',
    sql: `
      CREATE TABLE IF NOT EXISTS schema_migrations (
        id TEXT PRIMARY KEY,
        applied_at TEXT NOT NULL
      );
    `,
  },
  {
    id: '20260513-aggregate-only-no-patient-events',
    sql: `
      DROP TABLE IF EXISTS behavior_events;
    `,
  },
  {
    id: '20260514-content-request-workflow',
    sql: `
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
    `,
  },
  {
    id: '20260519-cx-stats-integration',
    sql: `
      SELECT 1;
    `,
  },
  {
    id: '20260514-request-distribution-configs',
    sql: `
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

      CREATE INDEX IF NOT EXISTS idx_request_distribution_batches_request ON request_distribution_batches(request_id);
    `,
  },
  {
    id: '20260519-project-display-names',
    sql: `
      SELECT 1;
    `,
  },
  {
    id: '20260520-dx-task-dispatch',
    sql: `
      SELECT 1;
    `,
  },
];

export async function runMigrations(): Promise<void> {
  await dbExec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id TEXT PRIMARY KEY,
      applied_at TEXT NOT NULL
    );
  `);

  for (const migration of migrations) {
    const existing = await dbGet('SELECT id FROM schema_migrations WHERE id = ?', [migration.id]);
    if (existing) continue;
    if (migration.id === '20260519-cx-stats-integration') {
      await ensureCxStatsIntegration();
    }
    if (migration.id === '20260519-project-display-names') {
      await ensureProjectDisplayNameColumns();
    }
    if (migration.id === '20260520-dx-task-dispatch') {
      await ensureDxTaskDispatchSchema();
    }
    await dbExec(migration.sql);
    await dbRun('INSERT INTO schema_migrations (id, applied_at) VALUES (?, ?) ON CONFLICT(id) DO NOTHING', [
      migration.id,
      new Date().toISOString(),
    ]);
  }

  logger.info({ count: migrations.length }, 'Database migrations checked');
}

async function ensureDxTaskDispatchSchema(): Promise<void> {
  if (DB_DRIVER === 'postgres') {
    await dbExec(`
      ALTER TABLE request_distribution_batches ADD COLUMN IF NOT EXISTS dispatch_success_count INTEGER DEFAULT 0;
      ALTER TABLE request_distribution_batches ADD COLUMN IF NOT EXISTS dispatch_failed_count INTEGER DEFAULT 0;
      ALTER TABLE request_distribution_batches ADD COLUMN IF NOT EXISTS dispatch_status TEXT DEFAULT 'pending';

      CREATE TABLE IF NOT EXISTS doctor_tasks (
        px_task_id TEXT PRIMARY KEY,
        batch_id TEXT NOT NULL REFERENCES request_distribution_batches(id),
        request_id TEXT NOT NULL REFERENCES content_requests(id),
        project_id TEXT NOT NULL,
        tenant_id TEXT NOT NULL,
        doctor_id TEXT,
        doctor_phone TEXT,
        title TEXT NOT NULL,
        content_format TEXT,
        theme TEXT,
        status TEXT DEFAULT 'pending_dispatch' CHECK(status IN ('pending_dispatch','assigned','dispatch_failed')),
        dx_task_id TEXT,
        dx_status TEXT,
        assigned_at TEXT,
        submitted_at TEXT,
        reviewed_at TEXT,
        dx_updated_at TEXT,
        dx_last_synced_at TEXT,
        latest_submission JSONB DEFAULT '{}'::jsonb,
        latest_review JSONB DEFAULT '{}'::jsonb,
        dx_idempotent BOOLEAN DEFAULT FALSE,
        dispatch_error TEXT,
        retry_count INTEGER DEFAULT 0,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_doctor_tasks_batch ON doctor_tasks(batch_id);
      CREATE INDEX IF NOT EXISTS idx_doctor_tasks_request ON doctor_tasks(request_id);
      ALTER TABLE doctor_tasks ADD COLUMN IF NOT EXISTS dx_idempotent BOOLEAN DEFAULT FALSE;
      ALTER TABLE doctor_tasks ADD COLUMN IF NOT EXISTS submitted_at TEXT;
      ALTER TABLE doctor_tasks ADD COLUMN IF NOT EXISTS reviewed_at TEXT;
      ALTER TABLE doctor_tasks ADD COLUMN IF NOT EXISTS dx_updated_at TEXT;
      ALTER TABLE doctor_tasks ADD COLUMN IF NOT EXISTS dx_last_synced_at TEXT;
      ALTER TABLE doctor_tasks ADD COLUMN IF NOT EXISTS latest_submission JSONB DEFAULT '{}'::jsonb;
      ALTER TABLE doctor_tasks ADD COLUMN IF NOT EXISTS latest_review JSONB DEFAULT '{}'::jsonb;
    `);
    return;
  }

  const batchColumns = await dbAll<{ name: string }>('PRAGMA table_info(request_distribution_batches)');
  if (!batchColumns.some((row) => row.name === 'dispatch_success_count')) {
    await dbRun('ALTER TABLE request_distribution_batches ADD COLUMN dispatch_success_count INTEGER DEFAULT 0');
  }
  if (!batchColumns.some((row) => row.name === 'dispatch_failed_count')) {
    await dbRun('ALTER TABLE request_distribution_batches ADD COLUMN dispatch_failed_count INTEGER DEFAULT 0');
  }
  if (!batchColumns.some((row) => row.name === 'dispatch_status')) {
    await dbRun("ALTER TABLE request_distribution_batches ADD COLUMN dispatch_status TEXT DEFAULT 'pending'");
  }

  await dbExec(`
    CREATE TABLE IF NOT EXISTS doctor_tasks (
      px_task_id TEXT PRIMARY KEY,
      batch_id TEXT NOT NULL,
      request_id TEXT NOT NULL,
      project_id TEXT NOT NULL,
      tenant_id TEXT NOT NULL,
      doctor_id TEXT,
      doctor_phone TEXT,
      title TEXT NOT NULL,
      content_format TEXT,
      theme TEXT,
      status TEXT DEFAULT 'pending_dispatch' CHECK(status IN ('pending_dispatch','assigned','dispatch_failed')),
      dx_task_id TEXT,
      dx_status TEXT,
      assigned_at TEXT,
      submitted_at TEXT,
      reviewed_at TEXT,
      dx_updated_at TEXT,
      dx_last_synced_at TEXT,
      latest_submission TEXT DEFAULT '{}',
      latest_review TEXT DEFAULT '{}',
      dx_idempotent INTEGER DEFAULT 0,
      dispatch_error TEXT,
      retry_count INTEGER DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (batch_id) REFERENCES request_distribution_batches(id),
      FOREIGN KEY (request_id) REFERENCES content_requests(id)
    );

    CREATE INDEX IF NOT EXISTS idx_doctor_tasks_batch ON doctor_tasks(batch_id);
    CREATE INDEX IF NOT EXISTS idx_doctor_tasks_request ON doctor_tasks(request_id);
  `);

  const taskColumns = await dbAll<{ name: string }>('PRAGMA table_info(doctor_tasks)');
  if (taskColumns.length > 0 && !taskColumns.some((row) => row.name === 'dx_idempotent')) {
    await dbRun('ALTER TABLE doctor_tasks ADD COLUMN dx_idempotent INTEGER DEFAULT 0');
  }
  for (const column of [
    ['submitted_at', 'TEXT'],
    ['reviewed_at', 'TEXT'],
    ['dx_updated_at', 'TEXT'],
    ['dx_last_synced_at', 'TEXT'],
    ['latest_submission', "TEXT DEFAULT '{}'"],
    ['latest_review', "TEXT DEFAULT '{}'"],
  ] as const) {
    if (taskColumns.length > 0 && !taskColumns.some((row) => row.name === column[0])) {
      await dbRun(`ALTER TABLE doctor_tasks ADD COLUMN ${column[0]} ${column[1]}`);
    }
  }
}

async function ensureCxStatsIntegration(): Promise<void> {
  if (DB_DRIVER === 'postgres') {
    await dbExec(`
      ALTER TABLE content ADD COLUMN IF NOT EXISTS dx_poster_id INTEGER;
      CREATE INDEX IF NOT EXISTS idx_content_dx_poster_id ON content(dx_poster_id);

      CREATE TABLE IF NOT EXISTS cx_stats_snapshots (
        id BIGSERIAL PRIMARY KEY,
        dx_poster_id INTEGER NOT NULL,
        content_id TEXT,
        snapshot_date TEXT NOT NULL,
        pv_count INTEGER DEFAULT 0,
        uv_count INTEGER DEFAULT 0,
        like_count INTEGER DEFAULT 0,
        dislike_count INTEGER DEFAULT 0,
        favorite_count INTEGER DEFAULT 0,
        created_at TEXT NOT NULL
      );

      CREATE UNIQUE INDEX IF NOT EXISTS idx_cx_snapshot_poster_date
        ON cx_stats_snapshots(dx_poster_id, snapshot_date);
    `);
    return;
  }

  const rows = await dbAll<{ name: string }>('PRAGMA table_info(content)');
  if (!rows.some((row) => row.name === 'dx_poster_id')) {
    await dbRun('ALTER TABLE content ADD COLUMN dx_poster_id INTEGER');
  }
  await dbExec(`
    CREATE INDEX IF NOT EXISTS idx_content_dx_poster_id ON content(dx_poster_id);

    CREATE TABLE IF NOT EXISTS cx_stats_snapshots (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      dx_poster_id INTEGER NOT NULL,
      content_id TEXT,
      snapshot_date TEXT NOT NULL,
      pv_count INTEGER DEFAULT 0,
      uv_count INTEGER DEFAULT 0,
      like_count INTEGER DEFAULT 0,
      dislike_count INTEGER DEFAULT 0,
      favorite_count INTEGER DEFAULT 0,
      created_at TEXT NOT NULL
    );

    CREATE UNIQUE INDEX IF NOT EXISTS idx_cx_snapshot_poster_date
      ON cx_stats_snapshots(dx_poster_id, snapshot_date);
  `);
}

async function ensureProjectDisplayNameColumns(): Promise<void> {
  if (DB_DRIVER === 'postgres') {
    await dbExec(`
      ALTER TABLE projects ADD COLUMN IF NOT EXISTS brand_name TEXT;
      ALTER TABLE projects ADD COLUMN IF NOT EXISTS owner_name TEXT;
    `);
    return;
  }

  const rows = await dbAll<{ name: string }>('PRAGMA table_info(projects)');
  if (!rows.some((row) => row.name === 'brand_name')) {
    await dbRun('ALTER TABLE projects ADD COLUMN brand_name TEXT');
  }
  if (!rows.some((row) => row.name === 'owner_name')) {
    await dbRun('ALTER TABLE projects ADD COLUMN owner_name TEXT');
  }
}
