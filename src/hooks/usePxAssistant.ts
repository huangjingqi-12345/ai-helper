import { useCallback, useEffect, useRef, useState } from 'react';
import { filterVisibleDeliverables, normalizeDeliverableUrl } from '@/lib/ai-helper/deliverables';
import { buildShortcutUserContent, checkAiHelperHealth, fetchShortcutPrompts, shortcutRunOptions } from '@/lib/ai-helper/shortcuts';
import {
  formatElapsed,
  statusFromStreamEvent,
} from '@/lib/ai-helper/loadingStatus';
import { attachAiHelperRunStream, cancelAiHelperRun, postAiHelperStream, readNdjsonStream } from '@/lib/ai-helper/stream';
import { deleteAiHelperSession, fetchAiHelperSession, saveAiHelperSession } from '@/lib/ai-helper/session';
import type { ActivePptContext, AiShortcut, ChatMessage, PptSvgProgress, ShortcutPrompts, ShortcutRunOptions } from '@/lib/ai-helper/types';

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

function slideNoFromPath(path: string): number | undefined {
  const name = path.replace(/\\/g, '/').split('/').pop() || '';
  const match = name.match(/^(\d{1,2})[_-]/);
  const value = match ? Number(match[1]) : NaN;
  return Number.isInteger(value) && value > 0 ? value : undefined;
}

function extractActivePptContext(done: { files?: string[]; trace?: unknown; activePptContext?: ActivePptContext }): ActivePptContext | undefined {
  if (done.activePptContext?.projectPath && done.activePptContext.slides?.length) return done.activePptContext;
  const trace = Array.isArray(done.trace) ? done.trace : [];
  const renderEntry = trace.find((entry) => {
    const call = entry && typeof entry === 'object' ? (entry as { call?: { action?: unknown } }).call : undefined;
    return call?.action === 'render_ppt_from_specs';
  }) as { call?: { params?: Record<string, unknown> } } | undefined;
  const deck = renderEntry?.call?.params;
  const projectPath = String(deck?.project_path || '').replace(/^\/+/, '');
  const rawSlides = Array.isArray(deck?.slides) ? deck.slides.filter((slide): slide is Record<string, unknown> => Boolean(slide) && typeof slide === 'object') : [];
  if (!projectPath || !rawSlides.length) return undefined;

  const files = sortedUnique(done.files || []);
  const svgByNo = new Map<number, string>();
  for (const file of files.filter(isPptSvgSlidePath)) {
    const no = slideNoFromPath(file);
    if (no && file.includes(projectPath)) svgByNo.set(no, normalizeDeliverableUrl(file));
  }
  const exportedPptx = extractPptxFiles(files)[0];
  const slides = rawSlides.map((slide, index) => {
    const slideNo = Number(slide.slide_no || slide.slideNo || index + 1);
    return {
      slideNo,
      title: typeof slide.title === 'string' ? slide.title : undefined,
      slideType: typeof slide.slide_type === 'string' ? slide.slide_type : undefined,
      svgPath: svgByNo.get(slideNo),
      deckSpec: slide,
    };
  });
  return {
    projectPath,
    exportedPptx,
    slideCount: slides.length,
    deckSpec: deck,
    slides,
  };
}

function activePptContextFromProgress(msg: ChatMessage): ActivePptContext | undefined {
  const slides = sortedUnique(msg.pptSvgProgress?.slides || []);
  if (!slides.length) return undefined;
  const first = slides[0] || '';
  const projectPath = first.replace(/^\/+/, '').split('/svg_output/')[0] || '';
  if (!projectPath.startsWith('projects/')) return undefined;
  return {
    projectPath,
    exportedPptx: msg.pptSvgProgress?.exportedPpt || (msg.activePptContext?.projectPath === projectPath ? extractPptxFiles(msg.files || [])[0] : undefined),
    slideCount: slides.length,
    slides: slides.map((svgPath, index) => ({
      slideNo: slideNoFromPath(svgPath) || index + 1,
      svgPath,
      source: 'generated',
      title: svgPath.split('/').pop()?.replace(/^\d{1,2}[_-]/, '').replace(/\.svg$/i, ''),
    })),
  };
}

function activePptContextForMessage(msg: ChatMessage): ActivePptContext | undefined {
  const progressContext = activePptContextFromProgress(msg);
  if (!msg.activePptContext) return progressContext;
  if (!progressContext) return msg.activePptContext;
  if (progressContext.projectPath !== msg.activePptContext.projectPath) {
    const byNo = new Map(msg.activePptContext.slides.map((slide) => [slide.slideNo, slide]));
    return {
      ...progressContext,
      slides: progressContext.slides.map((slide) => {
        const previous = byNo.get(slide.slideNo);
        return {
          ...slide,
          title: previous?.title || slide.title,
          slideType: previous?.slideType,
          deckSpec: previous?.deckSpec,
        };
      }),
    };
  }
  return msg.activePptContext;
}

function persistedMessagesForModel(messages: ChatMessage[]): Array<Pick<ChatMessage, 'role' | 'text' | 'files' | 'activePptContext'>> {
  return messages
    .filter((msg) => msg.text.trim() || (msg.files?.length || 0) > 0 || Boolean(activePptContextForMessage(msg)))
    .slice(-10)
    .map((msg) => ({ role: msg.role, text: msg.text.slice(0, 8000), files: msg.files?.slice(0, 12), activePptContext: activePptContextForMessage(msg) }));
}

function normalizePersistedMessages(messages: ChatMessage[]): ChatMessage[] {
  return messages.map((msg) => {
    const rawFiles = msg.files || [];
    const slides = extractPptSvgSlides(rawFiles);
    const exportedPpt = extractPptxFiles(rawFiles)[0];
    const progress = msg.pptSvgProgress || slides.length
      ? {
          mode: 'spec' as const,
          title: 'PPT 快速版页面预览',
          ...msg.pptSvgProgress,
          slides: msg.pptSvgProgress?.slides?.length ? msg.pptSvgProgress.slides : slides,
          completed: Boolean(msg.pptSvgProgress?.completed) || Boolean(exportedPpt),
          exportedPpt: msg.pptSvgProgress?.exportedPpt || exportedPpt,
        }
      : undefined;
    return {
      ...msg,
      files: filterVisibleDeliverables(rawFiles),
      pptSvgProgress: progress,
      loading: Boolean(msg.loading),
      loadingStatus: msg.loading ? msg.loadingStatus : undefined,
      modelProgressStatus: msg.loading ? msg.modelProgressStatus : undefined,
      hasModelProgress: msg.loading ? Boolean(msg.hasModelProgress) : false,
      loadingElapsed: msg.loading ? msg.loadingElapsed : undefined,
      loadingStep: undefined,
      loadingStartedAt: msg.loading ? (msg.loadingStartedAt || Date.now()) : undefined,
    };
  });
}

function isPptShortcut(shortcut?: AiShortcut): boolean {
  return shortcut === 'ppt' || shortcut === 'ppt_svg';
}

function pptProgressForShortcut(shortcut?: AiShortcut): PptSvgProgress | undefined {
  if (shortcut === 'ppt_svg') return { slides: [], completed: false, mode: 'svg', title: 'PPT 精美版生成进度' };
  if (shortcut === 'ppt') return { slides: [], completed: false, mode: 'spec', title: 'PPT 快速版页面预览' };
  return undefined;
}

export function usePxAssistant() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [streaming, setStreaming] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [shortcutPrompts, setShortcutPrompts] = useState<ShortcutPrompts>({});
  const [serviceReady, setServiceReady] = useState<boolean | null>(null);
  const conversationIdRef = useRef(newId('conv'));
  const activeRunRef = useRef<{ controller: AbortController; assistantId: string; conversationId: string; runId: string } | null>(null);
  const messagesRef = useRef<ChatMessage[]>([]);
  const sessionLoadedRef = useRef(false);
  const skipNextPersistRef = useRef(false);
  const localSessionTouchedRef = useRef(false);
  const saveAbortRef = useRef<AbortController | null>(null);
  const resumedRunKeysRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  const persistSessionSnapshot = useCallback((conversationId: string, snapshot: ChatMessage[]) => {
    const normalized = normalizePersistedMessages(snapshot);
    if (normalized.length === 0) return;
    saveAbortRef.current?.abort();
    const controller = new AbortController();
    saveAbortRef.current = controller;
    void saveAiHelperSession(conversationId, normalized, controller.signal)
      .catch(() => undefined)
      .finally(() => {
        if (saveAbortRef.current === controller) saveAbortRef.current = null;
      });
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [prompts, ok, session] = await Promise.all([
        fetchShortcutPrompts(),
        checkAiHelperHealth(),
        fetchAiHelperSession().catch(() => null),
      ]);
      if (cancelled) return;
      if (session && !localSessionTouchedRef.current && messagesRef.current.length === 0 && !activeRunRef.current) {
        const restored = normalizePersistedMessages(session.messages || []);
        conversationIdRef.current = session.conversationId || conversationIdRef.current;
        skipNextPersistRef.current = true;
        messagesRef.current = restored;
        setMessages(restored);
        setStreaming(restored.some((message) => message.loading && message.runId));
      }
      sessionLoadedRef.current = true;
      setShortcutPrompts(prompts);
      setServiceReady(ok);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!sessionLoadedRef.current) return;
    if (skipNextPersistRef.current) {
      skipNextPersistRef.current = false;
      return;
    }
    if (messages.length === 0) return;
    const timeout = window.setTimeout(() => {
      persistSessionSnapshot(conversationIdRef.current, messages);
    }, streaming ? 1200 : 350);
    return () => window.clearTimeout(timeout);
  }, [messages, streaming, persistSessionSnapshot]);


  const resetConversation = useCallback(() => {
    localSessionTouchedRef.current = true;
    saveAbortRef.current?.abort();
    saveAbortRef.current = null;
    activeRunRef.current?.controller.abort();
    activeRunRef.current = null;
    conversationIdRef.current = newId('conv');
    messagesRef.current = [];
    setMessages([]);
    setStreaming(false);
    void deleteAiHelperSession();
  }, []);

  const updateAssistant = useCallback((id: string, patch: Partial<ChatMessage>) => {
    setMessages((prev) => {
      const next = prev.map((m) => (m.id === id ? { ...m, ...patch } : m));
      messagesRef.current = next;
      return next;
    });
  }, []);

  const stopGeneration = useCallback(() => {
    const active = activeRunRef.current;
    const fallback = messagesRef.current.find((message) => message.loading && message.runId);
    const target = active || (fallback?.runId ? { assistantId: fallback.id, conversationId: conversationIdRef.current, runId: fallback.runId, controller: undefined as AbortController | undefined } : undefined);
    if (!target) return;
    void cancelAiHelperRun(target.conversationId, target.runId);
    target.controller?.abort();
    setMessages((prev) => {
      const next = prev.map((m) =>
        m.id === target.assistantId
          ? {
              ...m,
              loadingStatus: '正在暂停生成…',
              loadingStep: undefined,
            }
          : m,
      );
      messagesRef.current = next;
      return next;
    });
  }, []);

  useEffect(() => {
    if (!sessionLoadedRef.current) return;
    const running = messages.find((message) => message.role === 'assistant' && message.loading && message.runId);
    if (!running?.runId) return;
    const conversationId = conversationIdRef.current;
    const runKey = `${conversationId}::${running.runId}`;
    if (resumedRunKeysRef.current.has(runKey)) return;
    if (activeRunRef.current?.runId === running.runId) return;

    resumedRunKeysRef.current.add(runKey);
    const assistantId = running.id;
    const startedAt = running.loadingStartedAt || Date.now();
    const abortController = new AbortController();
    activeRunRef.current = { controller: abortController, assistantId, conversationId, runId: running.runId };
    setStreaming(true);
    updateAssistant(assistantId, {
      loadingElapsed: formatElapsed(Math.floor(Math.max(0, Date.now() - startedAt) / 1000)),
      loadingStartedAt: startedAt,
    });

    void (async () => {
      let assistantText = '';
      let turnFiles = filterVisibleDeliverables(running.files || []);
      let pptSvgProgress = running.pptSvgProgress;
      let isPptPreviewShortcut = Boolean(pptSvgProgress);
      let activeShortcut: AiShortcut | undefined = pptSvgProgress?.mode === 'svg' ? 'ppt_svg' : pptSvgProgress ? 'ppt' : undefined;
      let latestLoadingStatus = running.loadingStatus || '';
      let sawDone = false;
      const elapsedTimerId = window.setInterval(() => {
        updateAssistant(assistantId, {
          loadingElapsed: formatElapsed(Math.floor(Math.max(0, Date.now() - startedAt) / 1000)),
          loadingStartedAt: startedAt,
        });
      }, 1000);

      const pushLoadingStatus = (line: string, step?: number) => {
        latestLoadingStatus = line;
        updateAssistant(assistantId, {
          loadingStatus: line,
          loadingStep: step,
          loadingStartedAt: startedAt,
        });
      };

      const updatePptSvgProgress = (patch: Partial<PptSvgProgress>) => {
        if (!isPptPreviewShortcut) return;
        const base = pptSvgProgress || pptProgressForShortcut(activeShortcut);
        if (!base) return;
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
        if (action === 'write_ppt_svg_slide') return `正在生成第 ${(pptSvgProgress?.slides.length || 0) + 1} 页`;
        if (action === 'write_project_file' || action === 'write_project_files') return '正在整理 PPT 结构与备注';
        if (action === 'render_ppt_from_specs') return '正在批量生成 PPT 页面预览';
        if (action === 'ppt_master_export' || /export/i.test(detail)) return '正在导出 PPT 文件';
        return undefined;
      };

      const applyStreamEvent = (evt: { type: string; data: unknown }) => {
        if (evt.type === 'model_progress') {
          const mapped = statusFromStreamEvent(evt);
          if (mapped?.text) {
            updateAssistant(assistantId, {
              modelProgressStatus: mapped.text,
              hasModelProgress: true,
              loadingStartedAt: startedAt,
            });
          }
          return;
        }
        if (evt.type === 'route' && evt.data && typeof evt.data === 'object') {
          const payload = evt.data as { shortcut?: AiShortcut; label?: string; note?: string };
          if (isPptShortcut(payload.shortcut)) {
            activeShortcut = payload.shortcut;
            isPptPreviewShortcut = true;
            const nextProgress = pptSvgProgress || pptProgressForShortcut(activeShortcut);
            if (nextProgress) {
              pptSvgProgress = nextProgress;
              updateAssistant(assistantId, { pptSvgProgress });
            }
            pushLoadingStatus(payload.note || `已选择${payload.label || 'PPT 生成模式'}，正在准备数据`);
          }
        }
        const pptStatus = pptSpecificStatus(evt);
        if (pptStatus) {
          pushLoadingStatus(pptStatus);
          return;
        }
        const mapped = statusFromStreamEvent(evt);
        if (mapped?.text) pushLoadingStatus(mapped.text, mapped.step);
      };

      try {
        const resp = await attachAiHelperRunStream(conversationId, running.runId!, abortController.signal);
        if (!resp.ok || !resp.body) return;
        for await (const evt of readNdjsonStream(resp.body)) {
          if (abortController.signal.aborted) break;
          if (evt.type === 'text') {
            assistantText += String(evt.data ?? '');
            updateAssistant(assistantId, { text: assistantText, loading: true, loadingStartedAt: startedAt });
            continue;
          }
          applyStreamEvent(evt);
          if (isPptPreviewShortcut && evt.type === 'skill_result') {
            const newSlides = extractPptSvgSlides(evt.data);
            if (newSlides.length) {
              const slides = sortedUnique([...(pptSvgProgress?.slides || []), ...newSlides]);
              updatePptSvgProgress({ slides, completed: false });
              pushLoadingStatus(
                activeShortcut === 'ppt_svg'
                  ? `精美版第 ${slides.length} 页已生成，正在继续生成`
                  : `已生成 ${slides.length} 页预览，正在继续处理`,
              );
            }
            const exported = extractPptxFiles(evt.data)[0];
            if (exported) {
              updatePptSvgProgress({ completed: true, exportedPpt: exported });
              pushLoadingStatus('PPT 已导出，正在整理结果');
            }
          }
          if (evt.type === 'active_ppt_context' && evt.data && typeof evt.data === 'object') {
            const activePptContext = evt.data as ActivePptContext;
            activeShortcut = activeShortcut || 'ppt_svg';
            isPptPreviewShortcut = true;
            const contextSlides = sortedUnique((activePptContext.slides || []).flatMap((slide) => [slide.assetUrl, slide.svgPath].filter((x): x is string => Boolean(x))));
            if (contextSlides.length) updatePptSvgProgress({ slides: sortedUnique([...(pptSvgProgress?.slides || []), ...contextSlides]), completed: Boolean(activePptContext.exportedPptx), exportedPpt: activePptContext.exportedPptx });
            updateAssistant(assistantId, { activePptContext });
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
            const done = (evt.data || {}) as { files?: string[]; text?: string; trace?: unknown; activePptContext?: ActivePptContext };
            const activePptContext = extractActivePptContext(done);
            if (Array.isArray(done.files) && done.files.length) {
              turnFiles = filterVisibleDeliverables(done.files);
              const slides = isPptPreviewShortcut ? extractPptSvgSlides(done.files) : [];
              if (slides.length) updatePptSvgProgress({ slides: sortedUnique([...(pptSvgProgress?.slides || []), ...slides]) });
              const exported = isPptPreviewShortcut ? extractPptxFiles(done.files)[0] : undefined;
              if (exported) updatePptSvgProgress({ completed: true, exportedPpt: exported });
            }
            if (typeof done.text === 'string' && done.text.trim()) assistantText = done.text;
            updateAssistant(assistantId, {
              text: assistantText || running.text,
              files: turnFiles,
              activePptContext,
              loading: false,
              loadingStatus: undefined,
              modelProgressStatus: undefined,
              loadingElapsed: formatElapsed(Math.floor((Date.now() - startedAt) / 1000)),
              loadingStartedAt: startedAt,
            });
          }
        }
        if (!sawDone && !abortController.signal.aborted) {
          updateAssistant(assistantId, {
            text: assistantText || running.text,
            files: turnFiles,
            loading: true,
            loadingStatus: latestLoadingStatus || running.loadingStatus,
            modelProgressStatus: undefined,
            loadingStartedAt: startedAt,
          });
        }
      } catch (err) {
        if (!(abortController.signal.aborted || (err instanceof DOMException && err.name === 'AbortError'))) {
          updateAssistant(assistantId, {
            text: assistantText || running.text,
            files: turnFiles,
            loading: true,
            loadingStatus: latestLoadingStatus || running.loadingStatus,
            loadingStartedAt: startedAt,
          });
        }
      } finally {
        window.clearInterval(elapsedTimerId);
        if (abortController.signal.aborted) {
          updateAssistant(assistantId, {
            loading: false,
            text: assistantText.trim() ? `${assistantText}\n\n已暂停生成。` : '已暂停生成。',
            files: turnFiles,
            loadingStatus: undefined,
            modelProgressStatus: undefined,
            loadingElapsed: undefined,
            loadingStep: undefined,
          });
        }
        if (activeRunRef.current?.assistantId === assistantId) activeRunRef.current = null;
        if (conversationIdRef.current === conversationId && messagesRef.current.length > 0) {
          persistSessionSnapshot(conversationId, messagesRef.current);
        }
        setStreaming(!sawDone && !abortController.signal.aborted);
      }
    })();
  }, [messages, updateAssistant, persistSessionSnapshot]);

  const sendMessage = useCallback(
    async (rawMessage: string, options: ShortcutRunOptions = {}) => {
      const text = rawMessage.trim();
      if (!text || streaming) return;
      localSessionTouchedRef.current = true;

      if (serviceReady === false) {
        setMessages((prev) => {
          const errMsg: ChatMessage = {
            id: newId('err'),
            role: 'assistant',
            text: 'AI 助手服务未就绪。请确认 Px 后端已启动，并在后端环境变量中配置 `POE_API_KEY` 或 `OPENAI_API_KEY`。',
          };
          const next = [
            ...prev,
            errMsg,
          ];
          messagesRef.current = next;
          return next;
        });
        return;
      }

      const userMsg: ChatMessage = { id: newId('user'), role: 'user', text };
      const assistantId = newId('assistant');
      const startedAt = Date.now();
      const conversationId = conversationIdRef.current;
      const runId = newId('run');
      let activeShortcut = options.shortcut;
      let isPptPreviewShortcut = isPptShortcut(activeShortcut);
      const initialPptSvgProgress = pptProgressForShortcut(activeShortcut);
      const assistantMsg: ChatMessage = {
        id: assistantId,
        role: 'assistant',
        text: '',
        runId,
        files: [],
        loading: true,
        loadingStatus: undefined,
        loadingElapsed: '0 秒',
        loadingStartedAt: startedAt,
        pptSvgProgress: initialPptSvgProgress,
      };

      const initialMessagesForRun = [...messagesRef.current, userMsg, assistantMsg];
      messagesRef.current = initialMessagesForRun;
      setMessages(initialMessagesForRun);
      persistSessionSnapshot(conversationId, initialMessagesForRun);
      setStreaming(true);

      const abortController = new AbortController();
      activeRunRef.current = { controller: abortController, assistantId, conversationId, runId };
      let assistantText = '';
      let turnFiles: string[] = [];
      let sawDone = false;
      let backgroundContinues = false;
      let pptSvgProgress = initialPptSvgProgress;
      let latestLoadingStatus = assistantMsg.loadingStatus || '';
      let modelWaitingTimerId: number | undefined;

      const clearModelWaitingTimer = () => {
        if (modelWaitingTimerId !== undefined) {
          window.clearTimeout(modelWaitingTimerId);
          modelWaitingTimerId = undefined;
        }
      };

      const scheduleModelWaitingStatus = () => {
        clearModelWaitingTimer();
        modelWaitingTimerId = window.setTimeout(() => {
          if (latestLoadingStatus !== '正在调用 AI 模型…') return;
          latestLoadingStatus = '已调用模型，正在等待模型生成…';
          updateAssistant(assistantId, {
            loadingStatus: latestLoadingStatus,
            loadingStartedAt: startedAt,
          });
          modelWaitingTimerId = undefined;
        }, 1800);
      };

      const pushLoadingStatus = (line: string, step?: number) => {
        latestLoadingStatus = line;
        if (line === '正在调用 AI 模型…') {
          scheduleModelWaitingStatus();
        } else {
          clearModelWaitingTimer();
        }
        updateAssistant(assistantId, {
          loadingStatus: line,
          loadingStep: step,
          loadingStartedAt: startedAt,
        });
      };

      const updatePptSvgProgress = (patch: Partial<PptSvgProgress>) => {
        if (!isPptPreviewShortcut) return;
        const base = pptSvgProgress || pptProgressForShortcut(activeShortcut);
        if (!base) return;
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
        if (evt.type === 'model_progress') {
          const mapped = statusFromStreamEvent(evt);
          if (mapped?.text) {
            updateAssistant(assistantId, {
              modelProgressStatus: mapped.text,
              hasModelProgress: true,
              loadingStartedAt: startedAt,
            });
          }
          return;
        }
        if (evt.type === 'route' && evt.data && typeof evt.data === 'object') {
          const payload = evt.data as { shortcut?: AiShortcut; label?: string; note?: string };
          if (isPptShortcut(payload.shortcut)) {
            activeShortcut = payload.shortcut;
            isPptPreviewShortcut = true;
            const nextProgress = pptSvgProgress || pptProgressForShortcut(activeShortcut);
            if (nextProgress) {
              pptSvgProgress = nextProgress;
              updateAssistant(assistantId, { pptSvgProgress });
            }
            pushLoadingStatus(payload.note || `已选择${payload.label || 'PPT 生成模式'}，正在准备数据`);
          }
        }
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
          if (abortController.signal.aborted) return;
          assistantText += chars.slice(index, index + chunkSize).join('');
          updateAssistant(assistantId, {
            text: assistantText,
            loading: true,
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
        const resp = await postAiHelperStream(
          text,
          conversationId,
          runId,
          options,
          abortController.signal,
          persistedMessagesForModel(messagesRef.current),
        );
        if (!resp.ok || !resp.body) {
          const errText = '请求失败，请确认 Px 后端 AI 助手已启用，且数据库连接与模型 Key 已配置。';
          updateAssistant(assistantId, { loading: false, text: errText, loadingStatus: undefined, loadingElapsed: undefined, loadingStep: undefined });
          return;
        }

        for await (const evt of readNdjsonStream(resp.body)) {
          if (abortController.signal.aborted) break;
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
                  activeShortcut === 'ppt_svg'
                    ? `精美版第 ${slides.length} 页已生成，正在继续生成`
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
            if (evt.type === 'active_ppt_context' && evt.data && typeof evt.data === 'object') {
              const activePptContext = evt.data as ActivePptContext;
              activeShortcut = activeShortcut || 'ppt_svg';
              isPptPreviewShortcut = true;
              const contextSlides = sortedUnique((activePptContext.slides || []).flatMap((slide) => [slide.assetUrl, slide.svgPath].filter((x): x is string => Boolean(x))));
              if (contextSlides.length) updatePptSvgProgress({ slides: sortedUnique([...(pptSvgProgress?.slides || []), ...contextSlides]), completed: Boolean(activePptContext.exportedPptx), exportedPpt: activePptContext.exportedPptx });
              updateAssistant(assistantId, { activePptContext });
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
              const done = (evt.data || {}) as { files?: string[]; text?: string; trace?: unknown; activePptContext?: ActivePptContext };
              const activePptContext = extractActivePptContext(done);
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
                  activePptContext,
                  loadingElapsed: formatElapsed(Math.floor((Date.now() - startedAt) / 1000)),
                  loadingStartedAt: startedAt,
                });
              } else if (activePptContext) {
                updateAssistant(assistantId, { activePptContext });
              }
            }
          }
        }

        if (abortController.signal.aborted) {
          updateAssistant(assistantId, {
            loading: false,
            text: assistantText.trim() ? `${assistantText}\n\n已暂停生成。` : '已暂停生成。',
            files: turnFiles,
            loadingStatus: undefined,
            loadingElapsed: undefined,
            loadingStep: undefined,
          });
          return;
        }

        if (!sawDone) {
          backgroundContinues = true;
          updateAssistant(assistantId, {
            text: assistantText,
            files: turnFiles,
            loading: true,
            loadingStatus: latestLoadingStatus || assistantMsg.loadingStatus,
            modelProgressStatus: undefined,
            loadingElapsed: formatElapsed(Math.floor((Date.now() - startedAt) / 1000)),
            loadingStartedAt: startedAt,
          });
          return;
        }

        if (!assistantText.trim()) {
          assistantText = '已完成。';
        }

        updateAssistant(assistantId, {
          text: assistantText,
          files: turnFiles,
          loading: false,
          loadingStatus: undefined,
          loadingElapsed: undefined,
          loadingStep: undefined,
        });
      } catch (err) {
        if (abortController.signal.aborted || (err instanceof DOMException && err.name === 'AbortError')) {
          updateAssistant(assistantId, {
            loading: false,
            text: assistantText.trim() ? `${assistantText}\n\n已暂停生成。` : '已暂停生成。',
            files: turnFiles,
            loadingStatus: undefined,
            loadingElapsed: undefined,
            loadingStep: undefined,
          });
          return;
        }
        updateAssistant(assistantId, {
          loading: false,
          text: assistantText.trim() || '连接已中断，请稍后重试。',
          loadingStatus: undefined,
          loadingElapsed: undefined,
          loadingStep: undefined,
        });
      } finally {
        clearModelWaitingTimer();
        window.clearInterval(elapsedTimerId);
        if (!backgroundContinues && activeRunRef.current?.assistantId === assistantId) {
          activeRunRef.current = null;
        }
        if (conversationIdRef.current === conversationId && messagesRef.current.length > 0) {
          persistSessionSnapshot(conversationId, messagesRef.current);
        }
        setStreaming(backgroundContinues);
      }
    },
    [streaming, serviceReady, updateAssistant, persistSessionSnapshot],
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
    stopGeneration,
    runShortcut,
  };
}
