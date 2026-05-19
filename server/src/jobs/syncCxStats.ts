import { dbAll, dbGet, dbRun } from '../db/connection.js';
import { fetchStatsByItemIds, isCxStatsConfigured, type CxItemStats } from '../integrations/cxStats.js';
import { logger } from '../utils/logger.js';

/**
 * Daily CX Stats Sync Job
 *
 * Strategy: "Daily Snapshot with Delta Calculation"
 *
 * 1. Get all content with a dx_poster_id from the local DB
 * 2. Batch-call CX stats API to get current cumulative values
 * 3. Store today's cumulative snapshot in cx_stats_snapshots
 * 4. Calculate delta (today - yesterday) and write to behavior_daily_metrics
 * 5. Update content table summary fields with latest cumulative values
 *
 * This job should be scheduled to run once daily (e.g., 02:00 AM).
 */

const BATCH_SIZE = 50; // max itemIds per CX API call (conservative; confirm with CX team)

interface ContentWithPoster {
  id: string;
  dx_poster_id: number;
  tenant_id: string;
  project_id: string;
  disease_id: string | null;
}

interface SnapshotRow {
  pv_count: number;
  uv_count: number;
  like_count: number;
  dislike_count: number;
  favorite_count: number;
}

/**
 * Run the full CX stats sync for today.
 * Idempotent: if run multiple times on the same day, it overwrites the snapshot.
 */
export async function runCxStatsSync(): Promise<{ synced: number; errors: number }> {
  if (!isCxStatsConfigured()) {
    logger.info('CX Stats sync skipped: not configured');
    return { synced: 0, errors: 0 };
  }

  const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  const yesterday = getYesterday(today);
  const now = new Date().toISOString();

  logger.info({ date: today }, 'Starting CX stats sync');

  // 1. Get all content with poster_id
  const contents = await dbAll<ContentWithPoster>(
    `SELECT id, dx_poster_id, tenant_id, project_id, disease_id FROM content WHERE dx_poster_id IS NOT NULL`
  );

  if (!contents.length) {
    logger.info('No content with dx_poster_id found, skipping sync');
    return { synced: 0, errors: 0 };
  }

  logger.info({ count: contents.length }, 'Found content items with dx_poster_id');

  // 2. Batch fetch from CX
  const posterIds = contents.map((c) => c.dx_poster_id);
  const batches = chunk(posterIds, BATCH_SIZE);
  const statsMap = new Map<string, CxItemStats>();
  let errors = 0;

  for (const batch of batches) {
    try {
      const results = await fetchStatsByItemIds(batch);
      for (const item of results) {
        statsMap.set(String(item.itemId), item);
      }
    } catch {
      errors++;
      logger.warn({ batch: batch.slice(0, 5) }, 'Batch CX stats fetch failed, continuing...');
    }
  }

  logger.info({ fetched: statsMap.size, errors }, 'CX stats fetched');

  // 3-5. For each content, save snapshot + compute delta + update content
  let synced = 0;

  for (const content of contents) {
    const stats = statsMap.get(String(content.dx_poster_id));
    if (!stats) continue;

    try {
      // 3. Upsert today's snapshot
      await upsertSnapshot(content.dx_poster_id, content.id, today, stats, now);

      // 4. Get yesterday's snapshot for delta
      const prevSnapshot = await getSnapshot(content.dx_poster_id, yesterday);
      const delta = computeDelta(stats, prevSnapshot);

      // Write delta to behavior_daily_metrics
      await upsertDailyMetrics(content, today, delta, now);

      // 5. Update content table with latest cumulative values
      await updateContentStats(content.id, stats);

      synced++;
    } catch (err) {
      errors++;
      logger.warn({ err, contentId: content.id, posterId: content.dx_poster_id }, 'Failed to sync stats for content');
    }
  }

  logger.info({ synced, errors, date: today }, 'CX stats sync completed');
  return { synced, errors };
}

// --- Helpers ---

function getYesterday(todayIso: string): string {
  const d = new Date(todayIso + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

function chunk<T>(arr: T[], size: number): T[][] {
  const result: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    result.push(arr.slice(i, i + size));
  }
  return result;
}

async function upsertSnapshot(
  posterId: number,
  contentId: string,
  date: string,
  stats: CxItemStats,
  now: string,
): Promise<void> {
  // Try update first, then insert if not exists
  const existing = await dbGet<{ id: number }>(
    `SELECT id FROM cx_stats_snapshots WHERE dx_poster_id = ? AND snapshot_date = ?`,
    [posterId, date],
  );

  if (existing) {
    await dbRun(
      `UPDATE cx_stats_snapshots 
       SET pv_count = ?, uv_count = ?, like_count = ?, dislike_count = ?, favorite_count = ?
       WHERE dx_poster_id = ? AND snapshot_date = ?`,
      [stats.pvCount, stats.uvCount, stats.likeCount, stats.dislikeCount, stats.favoriteCount, posterId, date],
    );
  } else {
    await dbRun(
      `INSERT INTO cx_stats_snapshots (dx_poster_id, content_id, snapshot_date, pv_count, uv_count, like_count, dislike_count, favorite_count, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [posterId, contentId, date, stats.pvCount, stats.uvCount, stats.likeCount, stats.dislikeCount, stats.favoriteCount, now],
    );
  }
}

async function getSnapshot(posterId: number, date: string): Promise<SnapshotRow | null> {
  const row = await dbGet<SnapshotRow>(
    `SELECT pv_count, uv_count, like_count, dislike_count, favorite_count 
     FROM cx_stats_snapshots WHERE dx_poster_id = ? AND snapshot_date = ?`,
    [posterId, date],
  );
  return row ?? null;
}

interface DailyDelta {
  readCount: number;
  readUsers: number;
  likeCount: number;
  dislikeCount: number;
  bookmarkCount: number;
  interactionCount: number;
}

function computeDelta(current: CxItemStats, previous: SnapshotRow | null): DailyDelta {
  const prev = previous ?? { pv_count: 0, uv_count: 0, like_count: 0, dislike_count: 0, favorite_count: 0 };

  // Delta can be negative if users un-like/un-favorite; clamp to 0 for daily metrics
  const readCount = Math.max(0, current.pvCount - prev.pv_count);
  const readUsers = Math.max(0, current.uvCount - prev.uv_count);
  const likeCount = Math.max(0, current.likeCount - prev.like_count);
  const dislikeCount = Math.max(0, current.dislikeCount - prev.dislike_count);
  const bookmarkCount = Math.max(0, current.favoriteCount - prev.favorite_count);
  const interactionCount = likeCount + bookmarkCount; // PM confirmed formula

  return { readCount, readUsers, likeCount, dislikeCount, bookmarkCount, interactionCount };
}

async function upsertDailyMetrics(
  content: ContentWithPoster,
  date: string,
  delta: DailyDelta,
  now: string,
): Promise<void> {
  // Delete existing row for this content+date, then insert
  await dbRun(
    `DELETE FROM behavior_daily_metrics 
     WHERE tenant_id = ? AND metric_date = ? AND COALESCE(content_id, '') = ?`,
    [content.tenant_id, date, content.id],
  );

  await dbRun(
    `INSERT INTO behavior_daily_metrics (
       tenant_id, project_id, content_id, disease_id, metric_date,
       push_count, delivered_count, read_users, read_count,
       like_count, dislike_count, bookmark_count, share_count,
       interaction_count, avg_read_sec, finish_rate,
       created_at, updated_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      content.tenant_id,
      content.project_id,
      content.id,
      content.disease_id,
      date,
      0,                      // push_count — from our own distribution system
      0,                      // delivered_count — from our own distribution system
      delta.readUsers,
      delta.readCount,
      delta.likeCount,
      delta.dislikeCount,
      delta.bookmarkCount,
      0,                      // share_count — not provided by CX
      delta.interactionCount,
      0,                      // avg_read_sec — not provided by CX
      0,                      // finish_rate — not provided by CX
      now,
      now,
    ],
  );
}

async function updateContentStats(contentId: string, stats: CxItemStats): Promise<void> {
  const interactionCount = stats.likeCount + stats.favoriteCount;
  await dbRun(
    `UPDATE content SET
       read_count = ?,
       read_users = ?,
       like_count = ?,
       dislike_count = ?,
       bookmark_count = ?,
       updated_at = ?
     WHERE id = ?`,
    [stats.pvCount, stats.uvCount, stats.likeCount, stats.dislikeCount, stats.favoriteCount, new Date().toISOString(), contentId],
  );

  // Also update the interaction count (computed field on content table if exists)
  // The content table doesn't have interaction_count but projects table does
  // We'll leave project-level rollup for a separate aggregation
  void interactionCount; // suppress unused
}

/**
 * Schedule the sync job using setInterval.
 * In production, consider using a proper job scheduler (e.g., node-cron, Bull).
 *
 * @param intervalMs - interval between runs (default: 24h)
 */
export function scheduleCxStatsSync(intervalMs?: number): NodeJS.Timeout {
  const interval = intervalMs ?? 24 * 60 * 60 * 1000; // default 24h
  const syncHour = Number(process.env.CX_SYNC_HOUR ?? 2); // default 2 AM

  // Run immediately if within sync window, otherwise calculate delay
  const now = new Date();
  const nextRun = new Date(now);
  nextRun.setHours(syncHour, 0, 0, 0);
  if (nextRun <= now) {
    nextRun.setDate(nextRun.getDate() + 1);
  }

  const initialDelay = nextRun.getTime() - now.getTime();

  logger.info(
    { syncHour, nextRunAt: nextRun.toISOString(), intervalMs: interval },
    'CX Stats sync job scheduled',
  );

  // First run after calculated delay
  const initialTimeout = setTimeout(async () => {
    await runCxStatsSync().catch((err) => {
      logger.error({ err }, 'CX stats sync job failed');
    });

    // Then repeat at interval
    setInterval(async () => {
      await runCxStatsSync().catch((err) => {
        logger.error({ err }, 'CX stats sync job failed');
      });
    }, interval);
  }, initialDelay);

  return initialTimeout;
}
