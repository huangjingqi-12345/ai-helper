import { DB_DRIVER } from './connection.js';
import { initializeSchema } from './schema.js';
import { logger } from '../utils/logger.js';
import { runMigrations } from './migrations.js';

/**
 * Only initialize schema and migrations.
 *
 * Only rows that already exist in the configured database, or are synchronized
 * from real upstream systems, should be analyzed by PX AI helper.
 */
export async function seedDatabase(): Promise<void> {
  await initializeSchema();
  await runMigrations();
  logger.info({ driver: DB_DRIVER }, 'Database schema initialized; automatic sample data seeding is disabled.');
}
