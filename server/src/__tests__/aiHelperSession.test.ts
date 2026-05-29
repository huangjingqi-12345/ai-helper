import type { NextFunction, Request, Response } from 'express';
import { beforeEach, describe, expect, it, vi } from 'vitest';

type SessionRow = {
  user_id: string;
  tenant_id: string;
  conversation_id: string;
  messages: string;
  created_at: string;
  updated_at: string;
  expires_at: string;
};

const store = vi.hoisted(() => new Map<string, SessionRow>());

const dbGetMock = vi.hoisted(() => vi.fn(async (_sql: string, params: unknown[] = []) => {
  return store.get(String(params[0]));
}));

const dbRunMock = vi.hoisted(() => vi.fn(async (sql: string, params: unknown[] = []) => {
  if (/DELETE FROM ai_helper_sessions WHERE expires_at <= \?/i.test(sql)) {
    const cutoff = String(params[0]);
    for (const [userId, row] of store.entries()) {
      if (row.expires_at <= cutoff) store.delete(userId);
    }
    return { changes: 1 };
  }

  if (/DELETE FROM ai_helper_sessions WHERE user_id = \?/i.test(sql)) {
    store.delete(String(params[0]));
    return { changes: 1 };
  }

  if (/INSERT INTO ai_helper_sessions/i.test(sql)) {
    const [userId, tenantId, conversationId, messages, createdAt, updatedAt, expiresAt] = params.map(String);
    const previous = store.get(userId);
    store.set(userId, {
      user_id: userId,
      tenant_id: tenantId,
      conversation_id: conversationId,
      messages,
      created_at: previous?.created_at || createdAt,
      updated_at: updatedAt,
      expires_at: expiresAt,
    });
    return { changes: 1 };
  }

  return { changes: 0 };
}));

const dbAllMock = vi.hoisted(() => vi.fn(async () => []));

vi.mock('../db/connection.js', () => ({
  DB_DRIVER: 'sqlite',
  dbAll: dbAllMock,
  dbGet: dbGetMock,
  dbRun: dbRunMock,
}));

const {
  deleteAiHelperSession,
  getAiHelperSession,
  putAiHelperSession,
} = await import('../routes/aiHelper.js');

function reqFor(userId: string, body: unknown = {}): Request {
  return {
    body,
    user: {
      id: userId,
      email: `${userId}@example.test`,
      name: userId,
      tenantId: userId === 'user-b' ? 'T-B' : 'T-A',
      tenantType: 'ops',
      roles: ['px_super_admin'],
      permissions: ['*'],
      authProvider: 'dev',
      mfa: true,
    },
  } as Request;
}

function resFor() {
  const res = {
    statusCode: 200,
    body: undefined as unknown,
    status: vi.fn((code: number) => {
      res.statusCode = code;
      return res;
    }),
    json: vi.fn((body: unknown) => {
      res.body = body;
      return res;
    }),
  };
  return res as unknown as Response & { statusCode: number; body: unknown };
}

async function call(
  handler: (req: Request, res: Response, next: NextFunction) => Promise<void>,
  req: Request,
) {
  const res = resFor();
  const next = vi.fn();
  await handler(req, res, next);
  expect(next).not.toHaveBeenCalled();
  return res;
}

beforeEach(() => {
  store.clear();
  dbGetMock.mockClear();
  dbRunMock.mockClear();
});

describe('AI helper current session persistence', () => {
  it('saves and restores one current conversation with files per user', async () => {
    const messages = [
      { id: 'm1', role: 'user', text: '生成数据概览' },
      {
        id: 'm2',
        role: 'assistant',
        text: '已生成',
        runId: 'run-1',
        files: ['/generated/conv-1/run-1/overview_report.md'],
        activePptContext: {
          projectPath: 'projects/ppt-1',
          slideCount: 1,
          slides: [{ slideNo: 1, title: '封面', svgPath: '/projects/ppt-1/svg_output/01_cover.svg' }],
        },
      },
    ];

    const saveRes = await call(putAiHelperSession, reqFor('user-a', { conversation_id: 'conv-1', messages }));

    expect(saveRes.statusCode).toBe(200);
    expect((saveRes.body as { data: { conversationId: string; messages: typeof messages } }).data.conversationId).toBe('conv-1');
    expect((saveRes.body as { data: { messages: typeof messages } }).data.messages[1].files).toEqual(['/generated/conv-1/run-1/overview_report.md']);

    const restoreRes = await call(getAiHelperSession, reqFor('user-a'));

    expect(restoreRes.statusCode).toBe(200);
    expect((restoreRes.body as { data: { conversationId: string } }).data.conversationId).toBe('conv-1');
    expect((restoreRes.body as { data: { messages: typeof messages } }).data.messages).toEqual(messages);
  });

  it('does not expose PPT project internals as downloadable session files', async () => {
    const messages = [
      { id: 'm1', role: 'user', text: '生成 PPT' },
      {
        id: 'm2',
        role: 'assistant',
        text: '已生成',
        runId: 'run-1',
        files: [
          'https://dev-px-agent.example/ai-helper/tenant/user/projects/ppt-demo/design_spec.md',
          'https://dev-px-agent.example/ai-helper/tenant/user/projects/ppt-demo/spec_lock.md',
          'https://dev-px-agent.example/ai-helper/tenant/user/projects/ppt-demo/notes/total.md',
          'https://dev-px-agent.example/ai-helper/tenant/user/projects/ppt-demo/svg_output/01_slide.svg',
          '/generated/conv-1/run-1/ppt_20260529120000.pptx',
          '/generated/conv-1/run-1/overview_metrics.json',
        ],
        activePptContext: {
          projectPath: 'projects/ppt-demo',
          slideCount: 1,
          slides: [{
            slideNo: 1,
            title: '封面',
            svgPath: '/projects/ppt-demo/svg_output/01_slide.svg',
            assetUrl: 'https://dev-px-agent.example/ai-helper/tenant/user/projects/ppt-demo/svg_output/01_slide.svg',
          }],
        },
      },
    ];

    await call(putAiHelperSession, reqFor('user-a', { conversation_id: 'conv-1', messages }));
    const restoreRes = await call(getAiHelperSession, reqFor('user-a'));
    const restored = (restoreRes.body as { data: { messages: Array<{ files?: string[]; activePptContext?: unknown }> } }).data.messages[1];

    expect(restored.files).toEqual(['/generated/conv-1/run-1/ppt_20260529120000.pptx']);
    expect(restored.activePptContext).toEqual(messages[1].activePptContext);
  });

  it('keeps only the authenticated user session and delete clears only that user', async () => {
    await call(putAiHelperSession, reqFor('user-a', {
      conversation_id: 'conv-a',
      messages: [{ id: 'a1', role: 'user', text: 'A' }],
    }));
    await call(putAiHelperSession, reqFor('user-b', {
      conversation_id: 'conv-b',
      messages: [{ id: 'b1', role: 'user', text: 'B' }],
    }));

    await call(deleteAiHelperSession, reqFor('user-a'));

    expect((await call(getAiHelperSession, reqFor('user-a'))).body).toMatchObject({ data: null });
    expect(((await call(getAiHelperSession, reqFor('user-b'))).body as { data: { conversationId: string } }).data.conversationId).toBe('conv-b');
  });

  it('cleans expired sessions before returning data', async () => {
    store.set('user-a', {
      user_id: 'user-a',
      tenant_id: 'T-A',
      conversation_id: 'conv-old',
      messages: JSON.stringify([{ id: 'old', role: 'user', text: '旧对话' }]),
      created_at: '2026-05-01T00:00:00.000Z',
      updated_at: '2026-05-01T00:00:00.000Z',
      expires_at: '2026-05-08T00:00:00.000Z',
    });

    const res = await call(getAiHelperSession, reqFor('user-a'));

    expect(res.statusCode).toBe(200);
    expect((res.body as { data: unknown }).data).toBeNull();
    expect(store.has('user-a')).toBe(false);
  });
});
