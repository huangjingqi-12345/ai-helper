import { render, screen, waitFor, cleanup } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { usePxAssistant } from '@/hooks/usePxAssistant';
import { fetchAiHelperSession, saveAiHelperSession } from '@/lib/ai-helper/session';

vi.mock('@/lib/ai-helper/session', () => ({
  fetchAiHelperSession: vi.fn(),
  saveAiHelperSession: vi.fn(),
  deleteAiHelperSession: vi.fn(),
}));

vi.mock('@/lib/ai-helper/shortcuts', () => ({
  fetchShortcutPrompts: vi.fn(() => Promise.resolve({})),
  checkAiHelperHealth: vi.fn(() => Promise.resolve(true)),
  buildShortcutUserContent: vi.fn((cmd: string) => cmd),
  shortcutRunOptions: vi.fn(() => ({})),
}));

vi.mock('@/lib/ai-helper/stream', () => ({
  attachAiHelperRunStream: vi.fn(() => Promise.resolve({ ok: true, body: new ReadableStream({ start(controller) { controller.close(); } }) })),
  cancelAiHelperRun: vi.fn(() => Promise.resolve()),
  postAiHelperStream: vi.fn(),
  readNdjsonStream: vi.fn(),
}));

const fetchAiHelperSessionMock = vi.mocked(fetchAiHelperSession);
const saveAiHelperSessionMock = vi.mocked(saveAiHelperSession);

function HookHarness(): JSX.Element {
  const { messages, streaming } = usePxAssistant();
  return (
    <div>
      <span data-testid="message-count">{messages.length}</span>
      <span data-testid="streaming">{String(streaming)}</span>
      <span data-testid="status">{messages[0]?.loadingStatus || ''}</span>
      <span data-testid="files">{(messages[0]?.files || []).join('|')}</span>
      <span data-testid="slide-count">{messages[0]?.pptSvgProgress?.slides.length || 0}</span>
    </div>
  );
}

describe('usePxAssistant background polling', () => {
  beforeEach(() => {
    fetchAiHelperSessionMock.mockResolvedValue({
      conversationId: 'conv-restored',
      updatedAt: '2026-05-29T00:00:00.000Z',
      expiresAt: '2026-06-05T00:00:00.000Z',
      messages: [
        {
          id: 'assistant-1',
          role: 'assistant',
          text: '',
          runId: 'run-1',
          loading: true,
          loadingStatus: '正在调用 AI 模型…',
          files: [
            '/projects/ppt-demo/svg_output/01_cover.svg',
            '/projects/ppt-demo/svg_output/02_summary.svg',
            '/projects/ppt-demo/design_spec.md',
            '/generated/conv-restored/run-1/ppt.pptx',
          ],
        },
      ],
    });
    saveAiHelperSessionMock.mockResolvedValue(undefined);
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('restores running message once without polling and keeps SVG slides as preview data', async () => {
    render(<HookHarness />);

    await waitFor(() => expect(screen.getByTestId('streaming')).toHaveTextContent('true'));
    await waitFor(() => expect(fetchAiHelperSessionMock).toHaveBeenCalledTimes(1));

    await new Promise((resolve) => window.setTimeout(resolve, 80));

    expect(fetchAiHelperSessionMock).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('status')).toHaveTextContent('正在调用 AI 模型…');
    expect(screen.getByTestId('status')).not.toHaveTextContent('后台');
    expect(screen.getByTestId('files')).toHaveTextContent('/generated/conv-restored/run-1/ppt.pptx');
    expect(screen.getByTestId('files')).not.toHaveTextContent('/projects/ppt-demo/svg_output/01_cover.svg');
    expect(screen.getByTestId('slide-count')).toHaveTextContent('2');
  });
});
