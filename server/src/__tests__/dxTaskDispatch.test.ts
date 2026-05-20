import { afterEach, describe, expect, it, vi } from 'vitest';
import { dispatchDxTask, isDxTaskDispatchConfigured, type DxTaskDispatchRequest } from '../integrations/dxTaskDispatch.js';

const OLD_ENV = { ...process.env };

function payload(): DxTaskDispatchRequest {
  return {
    px_task_id: 'PX-REQ-1-BATCH-1-001',
    title: '雷替曲塞肝功能监测患教',
    drug: '雷替曲塞',
    brief: '面向 mCRC 患者',
    task_type: '患教内容创作',
    content_format: '图文',
    priority: 'high',
    count: 1,
    unit_price: 0,
    deadline: '2026-06-01T18:00:00+08:00',
    doctor_assignment: { doctor_id: 5, doctor_phone: '18060940209' },
  };
}

afterEach(() => {
  process.env = { ...OLD_ENV };
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('DX task dispatch integration', () => {
  it('posts PX doctor tasks to the configured DX endpoint', async () => {
    process.env.DX_API_BASE_URL = 'https://dx.example.com/api';
    process.env.DX_API_TOKEN = 'token-1';
    process.env.DX_API_KEY = 'key-1';
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      text: async () => JSON.stringify({
        dx_task_id: 'tk_8f3a2b1c5e92',
        px_task_id: 'PX-REQ-1-BATCH-1-001',
        status: 'assigned',
        assigned_at: '2026-05-19T10:00:00+08:00',
        idempotent: false,
      }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await dispatchDxTask(payload());

    expect(result.dx_task_id).toBe('tk_8f3a2b1c5e92');
    expect(result.idempotent).toBe(false);
    expect(fetchMock).toHaveBeenCalledWith('https://dx.example.com/api/px/tasks', expect.objectContaining({
      method: 'POST',
      headers: expect.objectContaining({
        Authorization: 'Bearer token-1',
        'X-API-Key': 'key-1',
        'X-PX-Integration': 'task-dispatch',
      }),
      body: JSON.stringify(payload()),
    }));
  });

  it('normalizes idempotent DX responses as successful dispatches', async () => {
    process.env.DX_API_BASE_URL = 'https://dx.example.com';
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      text: async () => JSON.stringify({
        dx_task_id: 'tk_existing',
        px_task_id: 'PX-REQ-1-BATCH-1-001',
        status: 'dx_review',
        assigned_at: '2026-05-19T10:00:00+08:00',
        idempotent: true,
      }),
    }));

    const result = await dispatchDxTask(payload());

    expect(result.status).toBe('dx_review');
    expect(result.idempotent).toBe(true);
  });

  it('uses the SIT DX endpoint when DX_API_BASE_URL is not configured', async () => {
    delete process.env.DX_API_BASE_URL;
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      text: async () => JSON.stringify({
        dx_task_id: 'tk_sit_default',
        px_task_id: 'PX-REQ-1-BATCH-1-001',
        status: 'assigned',
        assigned_at: '2026-05-19T10:00:00+08:00',
        idempotent: false,
      }),
    });
    vi.stubGlobal('fetch', fetchMock);

    expect(isDxTaskDispatchConfigured()).toBe(true);
    await expect(dispatchDxTask(payload())).resolves.toMatchObject({ dx_task_id: 'tk_sit_default' });
    expect(fetchMock).toHaveBeenCalledWith('https://sit-dx.senzco.com/api/px/tasks', expect.any(Object));
  });
});
