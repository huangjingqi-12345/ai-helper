import { afterEach, describe, expect, it, vi } from 'vitest';
import { reviewDxTask, type DxTaskReviewRequest } from '../integrations/dxTaskReview.js';

const OLD_ENV = { ...process.env };

const payload: DxTaskReviewRequest = {
  reviewer_node: 3,
  reviewer_type: '药企',
  reviewer_label: '药企审核-林筱',
  verdict: 'reject',
  suggestion: 'P2 区块剂量需补充妊娠期注意',
  reviewed_at: '2026-05-20T15:23:00+08:00',
  submission_id: 451,
};

afterEach(() => {
  process.env = { ...OLD_ENV };
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('DX task review integration', () => {
  it('posts PX review result to the DX task review endpoint', async () => {
    process.env.DX_API_BASE_URL = 'https://dx.example.com/api';
    process.env.DX_API_TOKEN = 'token-1';
    process.env.DX_API_KEY = 'key-1';
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      text: async () => JSON.stringify({
        ok: true,
        dx_task_id: 'tk_8f3a2b1c5e92',
        new_status: 'dx_revising',
      }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await reviewDxTask('PX-REQ-1-BATCH-1-001', payload);

    expect(result).toMatchObject({ ok: true, dx_task_id: 'tk_8f3a2b1c5e92', new_status: 'dx_revising' });
    expect(fetchMock).toHaveBeenCalledWith('https://dx.example.com/api/px/tasks/PX-REQ-1-BATCH-1-001/review', expect.objectContaining({
      method: 'POST',
      headers: expect.objectContaining({
        Authorization: 'Bearer token-1',
        'X-API-Key': 'key-1',
        'X-PX-Integration': 'task-review',
      }),
      body: JSON.stringify(payload),
    }));
  });
});
