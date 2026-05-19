import { closeDb, DB_DRIVER } from '../db/connection.js';
import { runMigrations } from '../db/migrations.js';
import { initializeSchema } from '../db/schema.js';
import { logger } from '../utils/logger.js';

try {
  await initializeSchema();
  await runMigrations();
  logger.info({ driver: DB_DRIVER }, 'Database migration completed');
} catch (err) {
  logger.error({ err, driver: DB_DRIVER }, 'Database migration failed');
  process.exitCode = 1;
} finally {
  await closeDb();
}
