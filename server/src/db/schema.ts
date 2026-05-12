import { getDb } from './connection.js';
import { logger } from '../utils/logger.js';

export function initializeSchema(): void {
  const db = getDb();

  db.exec(`
    -- Projects table
    CREATE TABLE IF NOT EXISTS projects (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      disease TEXT NOT NULL,
      content_count INTEGER DEFAULT 0,
      published_count INTEGER DEFAULT 0,
      push_count INTEGER DEFAULT 0,
      read_count INTEGER DEFAULT 0,
      interaction_count INTEGER DEFAULT 0,
      status TEXT DEFAULT 'active' CHECK(status IN ('active','paused','archived')),
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    -- Content table
    CREATE TABLE IF NOT EXISTS content (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      title TEXT NOT NULL,
      type TEXT NOT NULL CHECK(type IN ('article','video','infographic','quiz')),
      status TEXT DEFAULT 'draft' CHECK(status IN ('draft','under_review','approved','published','archived')),
      author TEXT NOT NULL,
      content TEXT DEFAULT '',
      tags TEXT DEFAULT '[]',
      read_count INTEGER DEFAULT 0,
      like_count INTEGER DEFAULT 0,
      bookmark_count INTEGER DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      published_at TEXT,
      FOREIGN KEY (project_id) REFERENCES projects(id)
    );

    -- Behavior trends table
    CREATE TABLE IF NOT EXISTS behavior_trends (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      date TEXT NOT NULL,
      type TEXT NOT NULL CHECK(type IN ('reads','interactions')),
      value INTEGER NOT NULL
    );

    -- Behavior top content
    CREATE TABLE IF NOT EXISTS behavior_top_content (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      content_id TEXT NOT NULL,
      title TEXT NOT NULL,
      reads INTEGER DEFAULT 0,
      interactions INTEGER DEFAULT 0
    );

    -- Behavior by disease
    CREATE TABLE IF NOT EXISTS behavior_by_disease (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      disease TEXT NOT NULL,
      reads INTEGER DEFAULT 0,
      interactions INTEGER DEFAULT 0,
      push_count INTEGER DEFAULT 0
    );

    -- Distribution strategies
    CREATE TABLE IF NOT EXISTS distribution_strategies (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      project_id TEXT NOT NULL,
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

    -- Approval items
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

    -- Users
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      role TEXT NOT NULL CHECK(role IN ('admin','editor','viewer')),
      region TEXT NOT NULL,
      status TEXT DEFAULT 'active' CHECK(status IN ('active','inactive')),
      last_login TEXT,
      created_at TEXT NOT NULL
    );

    -- Platform settings (key-value)
    CREATE TABLE IF NOT EXISTS platform_settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    -- Overview stats (singleton row)
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
  `);

  logger.info('Database schema initialized');
}
