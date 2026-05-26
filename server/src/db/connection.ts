import '../config/env.js';
import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { Pool, type PoolConfig } from 'pg';
import { logger } from '../utils/logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export type DatabaseDriver = 'sqlite' | 'postgres';

export const DB_PATH = process.env.DB_PATH || path.join(__dirname, '../../data/pxlite.db');

let sqliteDb: Database.Database | undefined;
let pgPool: Pool | undefined;

function resolveDriver(): DatabaseDriver {
  const explicit = (process.env.DB_CLIENT || process.env.DATABASE_CLIENT || '').toLowerCase();
  if (explicit === 'postgres' || explicit === 'postgresql' || explicit === 'pg') return 'postgres';
  if (explicit === 'sqlite' || explicit === 'sqlite3') return 'sqlite';
  if (process.env.NODE_ENV === 'production' && process.env.DATABASE_URL) return 'postgres';
  return 'sqlite';
}

export const DB_DRIVER: DatabaseDriver = resolveDriver();

export function isPostgres(): boolean {
  return DB_DRIVER === 'postgres';
}

export function getDb(): Database.Database {
  if (DB_DRIVER !== 'sqlite') {
    throw new Error('getDb() is only available for the SQLite driver. Use dbGet/dbAll/dbRun for portable queries.');
  }
  if (!sqliteDb) {
    const dir = path.dirname(DB_PATH);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    sqliteDb = new Database(DB_PATH);
    sqliteDb.pragma('journal_mode = WAL');
    sqliteDb.pragma('foreign_keys = ON');
    logger.info({ driver: DB_DRIVER, path: DB_PATH }, 'Database connected');
  }
  return sqliteDb;
}

export function getPgPool(): Pool {
  if (DB_DRIVER !== 'postgres') {
    throw new Error('getPgPool() is only available for the PostgreSQL driver.');
  }
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is required when DB_CLIENT=postgres or NODE_ENV=production.');
  }
  if (!pgPool) {
    const config: PoolConfig = {
      connectionString: process.env.DATABASE_URL,
      max: Number(process.env.PG_POOL_MAX || 10),
      idleTimeoutMillis: Number(process.env.PG_IDLE_TIMEOUT_MS || 30_000),
      connectionTimeoutMillis: Number(process.env.PG_CONNECTION_TIMEOUT_MS || 10_000),
    };

    if (process.env.DATABASE_SSL === 'true' || process.env.PGSSLMODE === 'require') {
      config.ssl = { rejectUnauthorized: process.env.DATABASE_SSL_REJECT_UNAUTHORIZED === 'true' };
    }

    pgPool = new Pool(config);
    pgPool.on('error', (err) => logger.error({ err }, 'Unexpected PostgreSQL pool error'));
    logger.info({ driver: DB_DRIVER }, 'Database connected');
  }
  return pgPool;
}

function toPostgresSql(sql: string): string {
  let index = 0;
  return sql.replace(/\?/g, () => `$${++index}`);
}

export async function dbExec(sql: string): Promise<void> {
  if (DB_DRIVER === 'sqlite') {
    getDb().exec(sql);
    return;
  }
  await getPgPool().query(sql);
}

export async function dbGet<T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T | undefined> {
  if (DB_DRIVER === 'sqlite') {
    return getDb().prepare(sql).get(...params) as T | undefined;
  }
  const result = await getPgPool().query(toPostgresSql(sql), params);
  return result.rows[0] as T | undefined;
}

export async function dbAll<T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T[]> {
  if (DB_DRIVER === 'sqlite') {
    return getDb().prepare(sql).all(...params) as T[];
  }
  const result = await getPgPool().query(toPostgresSql(sql), params);
  return result.rows as T[];
}

export async function dbRun(sql: string, params: unknown[] = []): Promise<{ changes: number; lastInsertRowid?: number | bigint }> {
  if (DB_DRIVER === 'sqlite') {
    const result = getDb().prepare(sql).run(...params);
    return { changes: result.changes, lastInsertRowid: result.lastInsertRowid };
  }
  const result = await getPgPool().query(toPostgresSql(sql), params);
  return { changes: result.rowCount ?? 0 };
}

export async function closeDb(): Promise<void> {
  if (sqliteDb) {
    sqliteDb.close();
    sqliteDb = undefined;
    logger.info('SQLite connection closed');
  }
  if (pgPool) {
    await pgPool.end();
    pgPool = undefined;
    logger.info('PostgreSQL pool closed');
  }
}
