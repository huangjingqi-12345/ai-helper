import { dbAll, dbGet, dbRun } from '../db/connection.js';
import { logger } from '../utils/logger.js';

const DEFAULT_DX_API_BASE_URL = 'https://sit-dx.senzco.com';

/**
 * DX Content Sync Integration
 *
 * Pulls published content from DX's /api/cx-access/contents endpoint
 * and maps poster_id back to PX content records.
 *
 * This ensures PX has the dx_poster_id stored for each content item,
 * which is needed to query CX stats (CX uses poster_id as itemId).
 *
 * Environment variables:
 *   DX_API_BASE_URL         - e.g. https://dx.senzco.com
 *   DOCTOR_SERVER_TOKEN     - shared secret for DX API auth
 *   DX_API_TIMEOUT_MS       - request timeout (default 10000)
 */

export interface DxContentItem {
  poster_id: number;
  task_id: string;
  version: number;
  title: string;
  drug?: string;
  content_format?: string;
  task_type?: string;
  published_at?: string;
  doctor?: {
    doctor_id: string;
    name: string;
    title?: string;
    hospital?: string;
    department?: string;
    avatar_url?: string;
  };
  content?: {
    title: string;
    subtitle?: string;
    rendered_image_url?: string;
    renderedImageUrl?: string;
    sections?: Array<{
      title: string;
      bullets?: Array<{ text: string }>;
      markdown_body?: string;
      illustration_url?: string;
    }>;
  };
  rendered_image_url?: string;
  renderedImageUrl?: string;
  cover_image_url?: string;
  body_text?: string;
  preview_text?: string;
  tags?: string[];
}

export type DxContentDetail = DxContentItem;

interface DxContentListResponse {
  items: DxContentItem[];
  next_cursor: number | null;
}

function getConfig() {
  const baseUrl = (process.env.DX_API_BASE_URL || DEFAULT_DX_API_BASE_URL).replace(/\/+$/, '');
  const token = process.env.DOCTOR_SERVER_TOKEN || process.env.DX_API_TOKEN || '';
  const timeoutMs = Number(process.env.DX_API_TIMEOUT_MS || 10000);
  return { baseUrl, token, timeoutMs };
}

export function isDxContentSyncConfigured(): boolean {
  const { baseUrl, token } = getConfig();
  return Boolean(baseUrl && token);
}

/**
 * Fetch content list from DX, optionally filtered by doctor_id.
 * Handles pagination automatically.
 *
 * DX API: GET /api/cx-access/contents?doctor_id=&limit=&cursor=
 */
export async function fetchDxContentList(doctorId?: string): Promise<DxContentItem[]> {
  const { baseUrl, token, timeoutMs } = getConfig();

  if (!baseUrl || !token) {
    logger.warn('DX Content Sync not configured (missing DX_API_BASE_URL or DOCTOR_SERVER_TOKEN)');
    return [];
  }

  const allItems: DxContentItem[] = [];
  let cursor: number | null = null;
  const limit = 100;

  // eslint-disable-next-line no-constant-condition
  while (true) {
    const params = new URLSearchParams({ limit: String(limit) });
    if (doctorId) params.set('doctor_id', doctorId);
    if (cursor !== null) params.set('cursor', String(cursor));

    const url = `${baseUrl}/api/cx-access/contents?${params}`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/json',
        },
        signal: controller.signal,
      });

      if (!response.ok) {
        const text = await response.text().catch(() => '');
        throw new Error(`DX content list API returned ${response.status}: ${text.slice(0, 200)}`);
      }

      const body = (await response.json()) as DxContentListResponse;

      if (body.items?.length) {
        allItems.push(...body.items);
      }

      if (!body.next_cursor) break;
      cursor = body.next_cursor;
    } catch (error) {
      if ((error as Error).name === 'AbortError') {
        logger.error({ doctorId, timeout: timeoutMs }, 'DX content list API timed out');
      } else {
        logger.error({ err: error, doctorId }, 'Failed to fetch DX content list');
      }
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }

  return allItems;
}

/**
 * Fetch a single DX poster detail.
 *
 * DX API: GET /api/cx-access/contents/{poster_id}
 */
export async function fetchDxContentDetail(posterId: number): Promise<DxContentDetail | null> {
  const { baseUrl, token, timeoutMs } = getConfig();

  if (!baseUrl || !token) {
    logger.warn('DX Content detail not configured (missing DX_API_BASE_URL or DOCTOR_SERVER_TOKEN/DX_API_TOKEN)');
    return null;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  const url = `${baseUrl}/api/cx-access/contents/${encodeURIComponent(String(posterId))}`;

  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/json',
      },
      signal: controller.signal,
    });

    if (response.status === 404) return null;
    if (!response.ok) {
      const text = await response.text().catch(() => '');
      throw new Error(`DX content detail API returned ${response.status}: ${text.slice(0, 200)}`);
    }

    return (await response.json()) as DxContentDetail;
  } catch (error) {
    if ((error as Error).name === 'AbortError') {
      logger.error({ posterId, timeout: timeoutMs }, 'DX content detail API timed out');
    } else {
      logger.error({ err: error, posterId }, 'Failed to fetch DX content detail');
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Sync DX poster_id mappings to local content table.
 *
 * Strategy: Match by px_task_id relationship or by title+author.
 * The DX response includes `task_id` which maps to px_task_id used during dispatch.
 *
 * For content created via PX dispatch (POST /api/px/tasks), the flow is:
 *   PX content.id → px_task_id → DX task → DX poster → poster_id
 *
 * This function fetches all DX content and updates local content records
 * that don't yet have a dx_poster_id set.
 */
export async function syncDxPosterIds(): Promise<{ updated: number; notMatched: number }> {
  if (!isDxContentSyncConfigured()) {
    logger.info('DX Content Sync skipped: not configured');
    return { updated: 0, notMatched: 0 };
  }

  logger.info('Starting DX poster_id sync');

  // Fetch all content from DX
  const dxItems = await fetchDxContentList();
  logger.info({ count: dxItems.length }, 'Fetched DX content items');

  let updated = 0;
  let notMatched = 0;

  for (const item of dxItems) {
    if (!item.poster_id) continue;

    // Strategy 1: Match by task_id (PX uses content.id as px_task_id when dispatching)
    // The DX task_id field corresponds to our internal task/content tracking
    let matched = false;

    if (item.task_id) {
      // Check if we have a content record that was dispatched with this task relationship
      // Look for content where id matches the px_task_id pattern
      const content = await dbGet<{ id: string; dx_poster_id: number | null }>(
        `SELECT id, dx_poster_id FROM content WHERE id = ? OR title = ?`,
        [item.task_id, item.title],
      );

      if (content && !content.dx_poster_id) {
        await dbRun(
          `UPDATE content SET dx_poster_id = ?, updated_at = ? WHERE id = ?`,
          [item.poster_id, new Date().toISOString(), content.id],
        );
        updated++;
        matched = true;
      } else if (content?.dx_poster_id === item.poster_id) {
        matched = true; // Already mapped
      }
    }

    // Strategy 2: Match by title (fallback)
    if (!matched && item.title) {
      const content = await dbGet<{ id: string; dx_poster_id: number | null }>(
        `SELECT id, dx_poster_id FROM content WHERE title = ? AND dx_poster_id IS NULL`,
        [item.title],
      );

      if (content) {
        await dbRun(
          `UPDATE content SET dx_poster_id = ?, updated_at = ? WHERE id = ?`,
          [item.poster_id, new Date().toISOString(), content.id],
        );
        updated++;
        matched = true;
      }
    }

    if (!matched) {
      notMatched++;
    }
  }

  logger.info({ updated, notMatched, total: dxItems.length }, 'DX poster_id sync completed');
  return { updated, notMatched };
}

/**
 * Get all known DX poster_ids from local DB (for batch CX stats queries).
 */
export async function getAllPosterIds(): Promise<Array<{ contentId: string; posterId: number }>> {
  const rows = await dbAll<{ id: string; dx_poster_id: number }>(
    `SELECT id, dx_poster_id FROM content WHERE dx_poster_id IS NOT NULL`,
  );
  return rows.map((r) => ({ contentId: r.id, posterId: r.dx_poster_id }));
}
