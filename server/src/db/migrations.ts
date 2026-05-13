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
