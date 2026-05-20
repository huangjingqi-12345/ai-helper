import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchDxTaskStatuses } from '../integrations/dxTaskStatus.js';

const OLD_ENV = { ...process.env };

afterEach(() => {
  process.env = { ...OLD_ENV };
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('DX task status integration', () => {
  it('fetches task statuses from the configured DX endpoint', async () => {
    process.env.DX_API_BASE_URL = 'https://dx.example.com/api';
    process.env.DX_API_TOKEN = 'token-1';
    process.env.DX_API_KEY = 'key-1';
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      text: async () => JSON.stringify({
        items: [{
          px_task_id: 'PX-REQ-1-BATCH-1-001',
          dx_task_id: 'tk_1',
          status: 'dx_review',
          updated_at: '2026-05-20T14:00:00+08:00',
          latest_submission: { submission_id: 451 },
        }],
        total: 1,
        has_more: false,
      }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await fetchDxTaskStatuses({ since: '2026-05-20T13:00:00+08:00', limit: 200 });

    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toMatchObject({ px_task_id: 'PX-REQ-1-BATCH-1-001', status: 'dx_review' });
    expect(fetchMock).toHaveBeenCalledWith(
      'https://dx.example.com/api/px/tasks?since=2026-05-20T13%3A00%3A00%2B08%3A00&limit=200',
      expect.objectContaining({
        method: 'GET',
        headers: expect.objectContaining({
          Authorization: 'Bearer token-1',
          'X-API-Key': 'key-1',
          'X-PX-Integration': 'task-status-sync',
        }),
      })
    );
  });

  it('surfaces DX API errors', async () => {
    process.env.DX_API_BASE_URL = 'https://dx.example.com';
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      text: async () => JSON.stringify({ detail: '缺少 Bearer token' }),
    }));

    await expect(fetchDxTaskStatuses()).rejects.toThrow('DX task status API returned 401');
  });
});
