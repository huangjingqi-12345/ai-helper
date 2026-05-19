import { logger } from '../utils/logger.js';

/**
 * CX (Patient-side) Health Education Stats API Client
 *
 * Calls the pharma-access health-education stats endpoints to retrieve
 * cumulative engagement metrics (pv, uv, likes, dislikes, favorites)
 * for published content identified by DX poster_id (= CX itemId).
 *
 * Environment variables:
 *   CX_API_BASE_URL       - e.g. https://cx.senzco.com
 *   CX_PHARMA_ACCESS_TOKEN - Bearer token for pharma-access endpoints
 *   CX_API_TIMEOUT_MS     - request timeout (default 10000)
 */

export interface CxItemStats {
  itemId: string;
  likeCount: number;
  dislikeCount: number;
  favoriteCount: number;
  pvCount: number;
  uvCount: number;
}

export interface CxStatsByItemResponse {
  success: boolean;
  data: {
    items: CxItemStats[];
  };
}

export interface CxStatsByDoctorResponse {
  success: boolean;
  data: {
    doctorId: string;
    items: CxItemStats[];
    nextCursor: string | null;
  };
}

function getConfig() {
  const baseUrl = (process.env.CX_API_BASE_URL || '').replace(/\/+$/, '');
  const token = process.env.CX_PHARMA_ACCESS_TOKEN || '';
  const timeoutMs = Number(process.env.CX_API_TIMEOUT_MS || 10000);
  return { baseUrl, token, timeoutMs };
}

export function isCxStatsConfigured(): boolean {
  const { baseUrl, token } = getConfig();
  return Boolean(baseUrl && token);
}

/**
 * Fetch stats for a batch of itemIds (poster_ids).
 * CX API: GET /api/pharma-access/health-education/stats?itemIds=197,196,195
 *
 * @param itemIds - array of DX poster_id values
 * @returns array of stats per item (only items with data are returned)
 */
export async function fetchStatsByItemIds(itemIds: number[]): Promise<CxItemStats[]> {
  if (!itemIds.length) return [];
  const { baseUrl, token, timeoutMs } = getConfig();

  if (!baseUrl || !token) {
    logger.warn('CX Stats API not configured (missing CX_API_BASE_URL or CX_PHARMA_ACCESS_TOKEN)');
    return [];
  }

  const url = `${baseUrl}/api/pharma-access/health-education/stats?itemIds=${itemIds.join(',')}`;
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
      throw new Error(`CX stats API returned ${response.status}: ${text.slice(0, 200)}`);
    }

    const body = (await response.json()) as CxStatsByItemResponse;
    if (!body.success || !body.data?.items) {
      logger.warn({ body }, 'CX stats API returned unexpected shape');
      return [];
    }

    return body.data.items;
  } catch (error) {
    if ((error as Error).name === 'AbortError') {
      logger.error({ itemIds: itemIds.slice(0, 5), timeout: timeoutMs }, 'CX stats API request timed out');
    } else {
      logger.error({ err: error, itemIds: itemIds.slice(0, 5) }, 'Failed to fetch CX stats by itemIds');
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Fetch all stats for a specific doctor (paginated).
 * CX API: GET /api/pharma-access/health-education/stats/by-doctor?limit=100&cursor=0
 * Header: X-Doctor-Id: <doctorUUID>
 *
 * @param doctorUuid - DX users.uuid (UUID v4)
 * @returns all items across all pages
 */
export async function fetchStatsByDoctor(doctorUuid: string): Promise<CxItemStats[]> {
  const { baseUrl, token, timeoutMs } = getConfig();

  if (!baseUrl || !token) {
    logger.warn('CX Stats API not configured');
    return [];
  }

  const allItems: CxItemStats[] = [];
  let cursor: string | null = null;
  const limit = 100;

  // eslint-disable-next-line no-constant-condition
  while (true) {
    const params = new URLSearchParams({ limit: String(limit) });
    if (cursor) params.set('cursor', cursor);

    const url = `${baseUrl}/api/pharma-access/health-education/stats/by-doctor?${params}`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${token}`,
          'X-Doctor-Id': doctorUuid,
          Accept: 'application/json',
        },
        signal: controller.signal,
      });

      if (!response.ok) {
        const text = await response.text().catch(() => '');
        throw new Error(`CX stats by-doctor API returned ${response.status}: ${text.slice(0, 200)}`);
      }

      const body = (await response.json()) as CxStatsByDoctorResponse;
      if (!body.success || !body.data) {
        logger.warn({ body, doctorUuid }, 'CX stats by-doctor API returned unexpected shape');
        break;
      }

      if (body.data.items?.length) {
        allItems.push(...body.data.items);
      }

      if (!body.data.nextCursor) break;
      cursor = body.data.nextCursor;
    } catch (error) {
      if ((error as Error).name === 'AbortError') {
        logger.error({ doctorUuid, timeout: timeoutMs }, 'CX stats by-doctor API timed out');
      } else {
        logger.error({ err: error, doctorUuid }, 'Failed to fetch CX stats by doctor');
      }
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }

  return allItems;
}
