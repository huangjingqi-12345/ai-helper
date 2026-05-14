import { dbExec, dbGet, dbRun } from './connection.js';
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
    await dbExec(migration.sql);
    await dbRun('INSERT INTO schema_migrations (id, applied_at) VALUES (?, ?) ON CONFLICT(id) DO NOTHING', [
      migration.id,
      new Date().toISOString(),
    ]);
  }

  logger.info({ count: migrations.length }, 'Database migrations checked');
}
