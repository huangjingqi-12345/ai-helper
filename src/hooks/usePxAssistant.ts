import { useCallback, useEffect, useRef, useState } from 'react';
import { filterVisibleDeliverables, normalizeDeliverableUrl } from '@/lib/ai-helper/deliverables';
import { buildShortcutUserContent, checkAiHelperHealth, fetchShortcutPrompts, shortcutRunOptions } from '@/lib/ai-helper/shortcuts';
import {
  formatElapsed,
  statusFromStreamEvent,
} from '@/lib/ai-helper/loadingStatus';
import { postAiHelperStream, readNdjsonStream } from '@/lib/ai-helper/stream';
import type { ChatMessage, PptSvgProgress, ShortcutPrompts, ShortcutRunOptions } from '@/lib/ai-helper/types';

function newId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function collectStringFiles(value: unknown, out: string[] = []): string[] {
  if (typeof value === 'string') {
    out.push(value);
    return out;
  }
  if (Array.isArray(value)) {
    value.forEach((item) => collectStringFiles(item, out));
    return out;
  }
  if (value && typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    for (const key of ['file', 'path', 'pptx', 'pdf', 'html']) collectStringFiles(obj[key], out);
    collectStringFiles(obj.files, out);
  }
  return out;
}

function isPptSvgSlidePath(path: string): boolean {
  const normalized = normalizeDeliverableUrl(path).toLowerCase();
  return normalized.endsWith('.svg') && normalized.includes('/svg_output/');
}

function isPptxPath(path: string): boolean {
  return normalizeDeliverableUrl(path).toLowerCase().endsWith('.pptx');
}

function sortedUnique(paths: string[]): string[] {
  return [...new Set(paths.map(normalizeDeliverableUrl).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }));
}

function extractPptSvgSlides(data: unknown): string[] {
  return sortedUnique(collectStringFiles(data).filter(isPptSvgSlidePath));
}

function extractPptxFiles(data: unknown): string[] {
  return sortedUnique(collectStringFiles(data).filter(isPptxPath));
}

export function usePxAssistant() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [streaming, setStreaming] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [shortcutPrompts, setShortcutPrompts] = useState<ShortcutPrompts>({});
  const [serviceReady, setServiceReady] = useState<boolean | null>(null);
  const conversationIdRef = useRef(newId('conv'));

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [prompts, ok] = await Promise.all([
        fetchShortcutPrompts(),
        checkAiHelperHealth(),
      ]);
      if (cancelled) return;
      setShortcutPrompts(prompts);
      setServiceReady(ok);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const resetConversation = useCallback(() => {
    conversationIdRef.current = newId('conv');
    setMessages([]);
    setStreaming(false);
  }, []);

  const updateAssistant = useCallback((id: string, patch: Partial<ChatMessage>) => {
    setMessages((prev) =>
      prev.map((m) => (m.id === id ? { ...m, ...patch } : m)),
    );
  }, []);

  const sendMessage = useCallback(
    async (rawMessage: string, options: ShortcutRunOptions = {}) => {
      const text = rawMessage.trim();
      if (!text || streaming) return;

      if (serviceReady === false) {
        setMessages((prev) => [
          ...prev,
          {
            id: newId('err'),
            role: 'assistant',
            text: 'AI 助手服务未就绪。请确认 Px 后端已启动，并在后端环境变量中配置 `POE_API_KEY` 或 `OPENAI_API_KEY`。',
          },
        ]);
        return;
      }

      const userMsg: ChatMessage = { id: newId('user'), role: 'user', text };
      const assistantId = newId('assistant');
      const startedAt = Date.now();
      const isPptPreviewShortcut = options.shortcut === 'ppt_svg' || options.shortcut === 'ppt';
      const initialPptSvgProgress: PptSvgProgress | undefined = isPptPreviewShortcut
        ? options.shortcut === 'ppt_svg'
          ? { slides: [], completed: false, mode: 'svg', title: 'SVG 直出进度' }
          : { slides: [], completed: false, mode: 'spec', title: '趋势分析 PPT 页面预览' }
        : undefined;
      const assistantMsg: ChatMessage = {
        id: assistantId,
        role: 'assistant',
        text: '',
        files: [],
        loading: true,
        loadingStatus: '等待后端响应…',
        loadingElapsed: '0 秒',
        loadingStartedAt: startedAt,
        pptSvgProgress: initialPptSvgProgress,
      };

      setMessages((prev) => [...prev, userMsg, assistantMsg]);
      setStreaming(true);

      const conversationId = conversationIdRef.current;
      const runId = newId('run');
      let assistantText = '';
      let turnFiles: string[] = [];
      let sawDone = false;
      let pptSvgProgress = initialPptSvgProgress;

      const pushLoadingStatus = (line: string, step?: number) => {
        updateAssistant(assistantId, {
          loadingStatus: line,
          loadingStep: step,
          loadingStartedAt: startedAt,
        });
      };

      const updatePptSvgProgress = (patch: Partial<PptSvgProgress>) => {
        if (!isPptPreviewShortcut) return;
        const base = pptSvgProgress || (
          options.shortcut === 'ppt_svg'
            ? { slides: [], completed: false, mode: 'svg' as const, title: 'SVG 直出进度' }
            : { slides: [], completed: false, mode: 'spec' as const, title: '趋势分析 PPT 页面预览' }
        );
        pptSvgProgress = {
          ...base,
          ...patch,
          slides: patch.slides ? sortedUnique(patch.slides) : base.slides,
        };
        updateAssistant(assistantId, { pptSvgProgress });
      };

      const pptSpecificStatus = (evt: { type: string; data: unknown }): string | undefined => {
        if (!isPptPreviewShortcut || evt.type !== 'progress' || !evt.data || typeof evt.data !== 'object') return undefined;
        const payload = evt.data as { phase?: string; action?: string; detail?: string };
        if (payload.phase !== 'skill_call') return undefined;
        const action = String(payload.action || '');
        const detail = String(payload.detail || '');
        if (action === 'write_ppt_svg_slide') {
          return `正在生成第 ${(pptSvgProgress?.slides.length || 0) + 1} 页`;
        }
        if (action === 'write_project_file' || action === 'write_project_files') {
          return '正在整理 PPT 结构与备注';
        }
        if (action === 'render_ppt_from_specs') {
          return '正在批量生成 PPT 页面预览';
        }
        if (action === 'ppt_master_export' || /export/i.test(detail)) {
          return '正在导出 PPT 文件';
        }
        return undefined;
      };

      const applyStreamEvent = (evt: { type: string; data: unknown }) => {
        const pptStatus = pptSpecificStatus(evt);
        if (pptStatus) {
          pushLoadingStatus(pptStatus);
          return;
        }
        const mapped = statusFromStreamEvent(evt);
        if (mapped?.text) {
          pushLoadingStatus(mapped.text, mapped.step);
          return;
        }
      };

      const appendTextStreaming = async (piece: string) => {
        const chars = Array.from(piece);
        const chunkSize = Math.max(2, Math.ceil(chars.length / 240));
        for (let index = 0; index < chars.length; index += chunkSize) {
          assistantText += chars.slice(index, index + chunkSize).join('');
          updateAssistant(assistantId, {
            text: assistantText,
            loading: true,
            loadingStatus: '正在输出',
            loadingStartedAt: startedAt,
          });
          await sleep(12);
        }
      };

      const elapsedTimerId = window.setInterval(() => {
        updateAssistant(assistantId, {
          loadingElapsed: formatElapsed(Math.floor((Date.now() - startedAt) / 1000)),
          loadingStartedAt: startedAt,
        });
      }, 1000);

      try {
        const resp = await postAiHelperStream(text, conversationId, runId, options);
        if (!resp.ok || !resp.body) {
          const errText = '请求失败，请确认 Px 后端 AI 助手已启用，且数据库连接与模型 Key 已配置。';
          updateAssistant(assistantId, { loading: false, text: errText, loadingStatus: undefined, loadingElapsed: undefined, loadingStep: undefined });
          return;
        }

        for await (const evt of readNdjsonStream(resp.body)) {
          if (evt.type === 'text') {
            const piece = String(evt.data ?? '');
            if (!piece) continue;
            await appendTextStreaming(piece);
          } else {
            applyStreamEvent(evt);
            if (isPptPreviewShortcut && evt.type === 'skill_result') {
              const newSlides = extractPptSvgSlides(evt.data);
              if (newSlides.length) {
                const slides = sortedUnique([...(pptSvgProgress?.slides || []), ...newSlides]);
                updatePptSvgProgress({ slides, completed: false });
                pushLoadingStatus(
                  options.shortcut === 'ppt_svg'
                    ? `第 ${slides.length} 页已生成，正在继续生成`
                    : `已生成 ${slides.length} 页预览，正在继续处理`,
                  undefined,
                );
              }
              const exported = extractPptxFiles(evt.data)[0];
              if (exported) {
                updatePptSvgProgress({ completed: true, exportedPpt: exported });
                pushLoadingStatus('PPT 已导出，正在整理结果', undefined);
              }
            }
            if (evt.type === 'files') {
              const files = Array.isArray(evt.data) ? (evt.data as string[]) : [];
              turnFiles = filterVisibleDeliverables([...turnFiles, ...files]);
              const slides = isPptPreviewShortcut ? extractPptSvgSlides(files) : [];
              if (slides.length) updatePptSvgProgress({ slides: sortedUnique([...(pptSvgProgress?.slides || []), ...slides]) });
              const exported = isPptPreviewShortcut ? extractPptxFiles(files)[0] : undefined;
              if (exported) updatePptSvgProgress({ completed: true, exportedPpt: exported });
              updateAssistant(assistantId, { files: turnFiles });
            } else if (evt.type === 'done') {
              sawDone = true;
              const done = (evt.data || {}) as { files?: string[]; text?: string };
              if (Array.isArray(done.files) && done.files.length) {
                turnFiles = filterVisibleDeliverables(done.files);
                const slides = isPptPreviewShortcut ? extractPptSvgSlides(done.files) : [];
                if (slides.length) updatePptSvgProgress({ slides: sortedUnique([...(pptSvgProgress?.slides || []), ...slides]) });
                const exported = isPptPreviewShortcut ? extractPptxFiles(done.files)[0] : undefined;
                if (exported) updatePptSvgProgress({ completed: true, exportedPpt: exported });
              }
              if (done.text) {
                const doneText = String(done.text);
                if (!assistantText.trim()) {
                  await appendTextStreaming(doneText);
                } else if (doneText.startsWith(assistantText) && doneText.length > assistantText.length) {
                  await appendTextStreaming(doneText.slice(assistantText.length));
                }
                updateAssistant(assistantId, {
                  text: assistantText,
                  files: turnFiles,
                  loadingElapsed: formatElapsed(Math.floor((Date.now() - startedAt) / 1000)),
                  loadingStartedAt: startedAt,
                });
              }
            }
          }
        }

        if (!assistantText.trim()) {
          assistantText = sawDone ? '已完成。' : '连接已结束，但未收到完整结果，请稍后重试。';
        }

        updateAssistant(assistantId, {
          text: assistantText,
          files: turnFiles,
          loading: false,
          loadingStatus: undefined,
          loadingElapsed: undefined,
          loadingStep: undefined,
        });
      } catch {
        updateAssistant(assistantId, {
          loading: false,
          text: assistantText.trim() || '已结束。',
          loadingStatus: undefined,
          loadingElapsed: undefined,
          loadingStep: undefined,
        });
      } finally {
        window.clearInterval(elapsedTimerId);
        setStreaming(false);
      }
    },
    [streaming, serviceReady, updateAssistant],
  );

  const runShortcut = useCallback(
    (cmd: string, typedDraft?: string) => {
      const typed = typedDraft?.trim();
      const prompt = typed || buildShortcutUserContent(cmd, shortcutPrompts);
      void sendMessage(prompt, shortcutRunOptions(cmd));
    },
    [sendMessage, shortcutPrompts],
  );

  return {
    messages,
    streaming,
    expanded,
    setExpanded,
    serviceReady,
    resetConversation,
    sendMessage,
    runShortcut,
  };
}
