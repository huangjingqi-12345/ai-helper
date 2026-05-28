import { useEffect, useRef, useState, type ComponentType } from 'react';
import {
  ArrowRight,
  BarChart3,
  CheckCircle2,
  CalendarDays,
  FileText,
  Loader2,
  MessageSquare,
  Images,
  Presentation,
  RotateCcw,
  Send,
  Sparkles,
  Square,
  Wand2,
  type LucideProps,
} from 'lucide-react';
import { Skeleton } from '@/components/ui/Skeleton';
import { clsx } from 'clsx';
import { usePxAssistant } from '@/hooks/usePxAssistant';
import { renderMarkdownToHtml } from '@/lib/ai-helper/markdown';
import { fileNameFromUrl, resolveAiHelperAssetUrl } from '@/lib/ai-helper/deliverables';
import type { PptSvgProgress } from '@/lib/ai-helper/types';
import { PxAssistantFiles } from './PxAssistantFiles';

interface PxAssistantProps {
  loading?: boolean;
}

type AssistantAction = {
  title: string;
  desc: string;
  cmd: string;
  icon: ComponentType<LucideProps>;
  accentClass: string;
};

const REPORT_ACTIONS: AssistantAction[] = [
  {
    title: '数据概览',
    desc: '核心 KPI · Top 内容 · 项目贡献',
    cmd: '/overview',
    icon: FileText,
    accentClass: 'border-cyan-300/40 bg-cyan-300/15 text-cyan-100 shadow-[0_0_22px_rgba(34,211,238,.14)]',
  },
  {
    title: 'PPT 快速版',
    desc: '结构化生成 · 稳定快速 · 约 2-3 分钟',
    cmd: '/ppt',
    icon: Presentation,
    accentClass: 'border-sky-300/40 bg-sky-300/15 text-sky-100 shadow-[0_0_22px_rgba(56,189,248,.13)]',
  },
  {
    title: 'PPT 精美版',
    desc: '逐页精修 SVG · 视觉更强 · 约 5-10 分钟',
    cmd: '/ppt-svg',
    icon: Wand2,
    accentClass: 'border-violet-300/40 bg-violet-300/15 text-violet-100 shadow-[0_0_22px_rgba(167,139,250,.13)]',
  },
  {
    title: '月度报告',
    desc: '完整自然月 · 环比复盘 · 行动建议',
    cmd: '/monthly',
    icon: CalendarDays,
    accentClass: 'border-emerald-300/40 bg-emerald-300/15 text-emerald-100 shadow-[0_0_22px_rgba(16,185,129,.13)]',
  },
];

const QA_CHIPS = [
  '互动数怎么算？',
  '本月数据有什么变化？',
  'k-匿名是什么？',
  '如何提升完读率？',
];

function currentTime(): string {
  return new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
}

function PptSvgProgressPreview({ progress }: { progress: PptSvgProgress }): JSX.Element {
  const slides = progress.slides;
  const [activeIndex, setActiveIndex] = useState(0);
  const title = progress.title || (progress.mode === 'spec' ? 'PPT 快速版页面预览' : 'PPT 精美版生成进度');

  useEffect(() => {
    if (!slides.length) {
      setActiveIndex(0);
      return;
    }
    setActiveIndex(slides.length - 1);
  }, [slides.length]);

  const safeIndex = slides.length ? Math.min(activeIndex, slides.length - 1) : 0;
  const activeSlide = slides[safeIndex];
  const generatedRatio = progress.completed
    ? 100
    : slides.length
      ? Math.min(92, 18 + slides.length * 9)
      : 8;

  return (
    <div className="mt-3 overflow-hidden rounded-2xl border border-violet-300/25 bg-slate-950/35 shadow-[inset_0_1px_0_rgba(255,255,255,.05)]">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-violet-300/15 bg-violet-300/10 px-3.5 py-2.5">
        <div className="inline-flex items-center gap-2 text-[12px] font-semibold text-violet-50">
          {progress.completed ? <CheckCircle2 className="h-4 w-4 text-emerald-200" /> : <Images className="h-4 w-4 text-violet-200" />}
          {title}
        </div>
        <span className="rounded-full border border-violet-200/25 bg-violet-200/10 px-2 py-0.5 text-[11px] text-violet-50">
          {progress.completed ? '已导出 PPT' : slides.length ? `已生成 ${slides.length} 页` : '正在生成页面'}
        </span>
      </div>

      <div className="px-3.5 py-3">
        <div className="mb-2 h-2 overflow-hidden rounded-full bg-slate-800/80">
          <div
            className="h-full rounded-full bg-gradient-to-r from-violet-300 via-cyan-300 to-emerald-300 transition-all duration-500"
            style={{ width: `${generatedRatio}%` }}
          />
        </div>

        {activeSlide ? (
          <>
            <div className="overflow-hidden rounded-xl border border-slate-600/50 bg-white shadow-[0_14px_34px_rgba(0,0,0,.22)]">
              <img
                src={resolveAiHelperAssetUrl(activeSlide)}
                alt={`PPT SVG 第 ${safeIndex + 1} 页预览`}
                className="aspect-video w-full object-contain"
                loading="lazy"
              />
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-slate-200">
              <span className="rounded-md border border-slate-500/50 bg-slate-900/60 px-2 py-1">
                当前预览：第 {safeIndex + 1} 页
              </span>
              <span className="min-w-0 truncate text-slate-300" title={fileNameFromUrl(activeSlide)}>
                {fileNameFromUrl(activeSlide)}
              </span>
            </div>
            {slides.length > 1 && (
              <div className="mt-3 space-y-2">
                <input
                  type="range"
                  min={0}
                  max={slides.length - 1}
                  value={safeIndex}
                  onChange={(event) => setActiveIndex(Number(event.target.value))}
                  className="h-1.5 w-full cursor-pointer accent-violet-300"
                  aria-label="切换 SVG 页预览"
                />
                <div className="flex gap-2 overflow-x-auto pb-1">
                  {slides.map((slide, index) => (
                    <button
                      key={slide}
                      type="button"
                      onClick={() => setActiveIndex(index)}
                      className={clsx(
                        'shrink-0 overflow-hidden rounded-lg border bg-white/95 transition-all',
                        index === safeIndex ? 'w-24 border-violet-200 ring-2 ring-violet-300/45' : 'w-20 border-slate-500/50 opacity-70 hover:opacity-100',
                      )}
                      title={`预览第 ${index + 1} 页`}
                    >
                      <img src={resolveAiHelperAssetUrl(slide)} alt={`第 ${index + 1} 页缩略图`} className="aspect-video w-full object-contain" loading="lazy" />
                    </button>
                  ))}
                </div>
              </div>
            )}
          </>
        ) : (
          <div className="flex min-h-[140px] items-center justify-center rounded-xl border border-dashed border-violet-200/25 bg-slate-900/40 text-[12px] text-slate-200">
            正在等待第一张页面预览生成…
          </div>
        )}
      </div>
    </div>
  );
}

function isOverviewPng(path: string): boolean {
  const name = fileNameFromUrl(path).toLowerCase();
  return name.endsWith('.png') && (
    name === 'overview_kpi.png'
    || name === 'overview_canvas.png'
    || /^overview_.*(?:kpi|canvas).*\.png$/.test(name)
  );
}

function OverviewPngPreview({ files }: { files?: string[] }): JSX.Element | null {
  const previews = [...new Set((files || []).filter(isOverviewPng))];
  if (!previews.length) return null;

  return (
    <div className="mt-3 space-y-2">
      <div className="inline-flex items-center gap-2 rounded-full border border-cyan-200/25 bg-cyan-300/10 px-2.5 py-1 text-[11px] font-medium text-cyan-50">
        <Images className="h-3.5 w-3.5 text-cyan-200" />
        数据概览图片预览
      </div>
      {previews.map((file) => {
        const href = resolveAiHelperAssetUrl(file);
        const name = fileNameFromUrl(file);
        return (
          <figure
            key={file}
            className="overflow-hidden rounded-2xl border border-cyan-200/20 bg-slate-950/35 shadow-[0_16px_36px_rgba(0,0,0,.20),inset_0_1px_0_rgba(255,255,255,.05)]"
          >
            <a href={href} target="_blank" rel="noopener noreferrer" title="点击查看大图">
              <img
                src={href}
                alt="数据概览 PNG 预览"
                className="max-h-[620px] w-full bg-white object-contain"
                loading="lazy"
              />
            </a>
            <figcaption className="flex flex-wrap items-center justify-between gap-2 border-t border-cyan-200/15 bg-slate-900/70 px-3 py-2 text-[11px] text-slate-200">
              <span className="min-w-0 truncate" title={name}>{name}</span>
              <a
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                className="shrink-0 rounded-md border border-cyan-200/25 bg-cyan-300/10 px-2 py-1 text-cyan-50 hover:bg-cyan-300/18"
              >
                查看大图
              </a>
            </figcaption>
          </figure>
        );
      })}
    </div>
  );
}

export function PxAssistant({ loading = false }: PxAssistantProps): JSX.Element {
  const {
    messages,
    streaming,
    serviceReady,
    resetConversation,
    sendMessage,
    stopGeneration,
    runShortcut,
  } = usePxAssistant();

  const [draft, setDraft] = useState('');
  const chatScrollRef = useRef<HTMLDivElement>(null);
  const greetingTimeRef = useRef(currentTime());
  const previousScrollStateRef = useRef({ messageCount: messages.length, streaming });

  const scrollChatToBottom = () => {
    const el = chatScrollRef.current;
    if (!el) return;
    window.requestAnimationFrame(() => {
      el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
    });
  };

  useEffect(() => {
    const previous = previousScrollStateRef.current;
    const lastMessage = messages[messages.length - 1];
    const sentNewRequest = messages.length > previous.messageCount && lastMessage?.role === 'assistant';
    const generationCompleted = previous.streaming && !streaming;

    if (sentNewRequest || generationCompleted) {
      scrollChatToBottom();
    }

    previousScrollStateRef.current = { messageCount: messages.length, streaming };
  }, [messages.length, streaming]);

  if (loading) {
    return (
      <div className="overflow-hidden rounded-2xl border border-cyan-500/20 bg-card">
        <Skeleton className="h-[560px] rounded-none" />
      </div>
    );
  }

  const handleSend = () => {
    if (streaming) {
      stopGeneration();
      return;
    }
    const txt = draft.trim();
    if (!txt) return;
    void sendMessage(txt);
    setDraft('');
  };

  const handleAction = (cmd: string) => {
    const typed = draft.trim();
    if (cmd.startsWith('/')) {
      runShortcut(cmd, typed || undefined);
    } else {
      void sendMessage(typed || cmd);
    }
    setDraft('');
  };

  const handleQaChip = (question: string) => {
    void sendMessage(question);
  };

  return (
    <section
      className="relative overflow-hidden rounded-[28px] border border-cyan-300/25 bg-card shadow-[0_0_0_1px_rgba(34,211,238,.07),0_22px_68px_rgba(2,8,23,.22),0_0_64px_rgba(8,145,178,.08)]"
      aria-label="AI 数据助手"
    >
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_5%_6%,rgba(34,211,238,.16),transparent_22%),radial-gradient(circle_at_96%_2%,rgba(56,189,248,.12),transparent_24%),radial-gradient(circle_at_8%_98%,rgba(124,58,237,.09),transparent_28%),linear-gradient(135deg,rgba(30,41,59,.52),rgba(15,23,42,.64)_58%,rgba(8,47,73,.48))]" />
      <div className="pointer-events-none absolute inset-0 opacity-[0.05] [background-image:linear-gradient(rgba(255,255,255,.72)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.72)_1px,transparent_1px)] [background-size:32px_32px]" />
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-cyan-300/60 to-transparent" />

      <div className="relative p-4">
        <header className="mb-3 flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="relative grid h-11 w-11 shrink-0 place-items-center rounded-xl border border-cyan-200/30 bg-cyan-300/15 text-cyan-100 shadow-[inset_0_1px_0_rgba(255,255,255,.10),0_0_30px_rgba(34,211,238,.16)] before:absolute before:inset-1.5 before:rounded-lg before:bg-cyan-300/10">
              <Sparkles className="relative h-5 w-5" />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-[20px] font-semibold tracking-tight text-foreground">AI 数据助手</h3>
                <span className="rounded-full border border-cyan-200/30 bg-cyan-300/15 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-cyan-100">
                  Beta
                </span>
                {serviceReady === false && (
                  <span className="rounded-full border border-amber-400/25 bg-amber-400/10 px-2 py-0.5 text-[10px] text-amber-200">
                    服务未连接
                  </span>
                )}
              </div>
              <p className="mt-1 text-[13px] leading-relaxed text-slate-200">
                基于药企视图当前数据范围，一键生成近 7 天概览、月报，以及 PPT 快速版/精美版；也可向我提问数据口径或合规约束。
              </p>
            </div>
          </div>
          <div className="inline-flex items-center gap-2 rounded-xl border border-cyan-200/25 bg-slate-800/50 px-3 py-2 text-[12px] font-medium text-slate-100 shadow-[inset_0_1px_0_rgba(255,255,255,.06)] backdrop-blur">
            <BarChart3 className="h-3.5 w-3.5 text-cyan-200" />
            快捷范围：概览近 7 天 · 全部项目
          </div>
        </header>

        <div className="grid w-full grid-cols-4 gap-2">
          {REPORT_ACTIONS.map((action) => {
            const Icon = action.icon;
            return (
              <button
                key={action.title}
                type="button"
                disabled={streaming}
                onClick={() => handleAction(action.cmd)}
                className="group relative min-h-[58px] w-full min-w-0 overflow-hidden rounded-xl border border-slate-600/50 bg-slate-800/60 p-2 text-left shadow-[inset_0_1px_0_rgba(255,255,255,.06),0_10px_24px_rgba(0,0,0,.10)] transition-all duration-200 before:absolute before:inset-x-0 before:top-0 before:h-px before:bg-gradient-to-r before:from-transparent before:via-cyan-200/25 before:to-transparent hover:-translate-y-0.5 hover:border-cyan-200/30 hover:bg-slate-800/75 hover:shadow-[inset_0_1px_0_rgba(255,255,255,.08),0_14px_32px_rgba(8,145,178,.09)] disabled:opacity-60"
              >
                <div className="relative flex min-w-0 items-center gap-2">
                  <div className={clsx('grid h-8 w-8 shrink-0 place-items-center rounded-lg border', action.accentClass)}>
                    <Icon className="h-4 w-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="flex min-w-0 items-center gap-1 text-[13.5px] font-semibold text-foreground">
                      <span className="truncate whitespace-nowrap">{action.title}</span>
                      <ArrowRight className="h-3 w-3 shrink-0 text-slate-300 transition-transform group-hover:translate-x-0.5 group-hover:text-cyan-100" />
                    </p>
                    <p className="mt-0.5 truncate whitespace-nowrap text-[11px] leading-snug text-slate-200">{action.desc}</p>
                  </div>
                  <span className="ml-auto hidden shrink-0 items-center gap-1 rounded-full border border-cyan-200/25 bg-cyan-300/10 px-1.5 py-0.5 text-[10px] font-medium text-cyan-100 xl:inline-flex">
                    <Wand2 className="h-3 w-3" /> 生成
                  </span>
                </div>
              </button>
            );
          })}
        </div>

        <div className="mt-3 overflow-hidden rounded-2xl border border-slate-600/50 bg-slate-900/40 shadow-[inset_0_1px_0_rgba(255,255,255,.05)] backdrop-blur">
          <div className="flex items-center gap-2 border-b border-slate-600/50 bg-slate-800/50 px-4 py-2.5 text-[13px] font-medium text-slate-100">
            <MessageSquare className="h-4 w-4 text-cyan-200" />
            与 AI 助手对话 · 仅在本租户数据范围内回答
            <button
              type="button"
              onClick={resetConversation}
              disabled={streaming}
              className="ml-auto inline-flex items-center gap-1.5 rounded-lg border border-slate-500/50 bg-slate-800/60 px-2.5 py-1 text-[11px] text-slate-100 transition-colors hover:border-cyan-300/50 hover:bg-cyan-300/10 hover:text-white disabled:opacity-50"
            >
              <RotateCcw className="h-3 w-3" /> 新对话
            </button>
          </div>

          {serviceReady === false && (
            <div className="border-b border-amber-500/20 bg-amber-500/10 px-5 py-2 text-[11.5px] text-amber-100/90">
              请确认 Px 后端已启动，并在 <code className="text-[10.5px]">server/.env.*</code> 配置 <code className="text-[10.5px]">POE_API_KEY</code> 或 <code className="text-[10.5px]">OPENAI_API_KEY</code>。
            </div>
          )}

          <div
            ref={chatScrollRef}
            className="min-h-[360px] max-h-[520px] overflow-y-auto bg-[radial-gradient(circle_at_66%_42%,rgba(34,211,238,.07),transparent_30%),linear-gradient(180deg,rgba(15,23,42,.34),rgba(15,23,42,.18))] px-4 py-3"
          >
            {messages.length === 0 && (
              <div className="mb-3 flex justify-start">
                <div className="max-w-[78%] rounded-2xl rounded-tl-md border border-slate-500/50 bg-slate-800/80 px-3.5 py-2.5 text-[13px] leading-relaxed text-slate-100 shadow-[0_10px_24px_rgba(0,0,0,.12)]">
                  <p>
                    我是 <span className="font-semibold text-white">Px AI 数据助手</span>，可以帮你一键生成周度 / 月度数据分析报告、PPT 快速版或精美版，也可以回答常见数据口径问题。试试问：「互动数怎么算？」 「k-匿名是什么？」
                  </p>
                  <p className="mt-2 text-[11px] text-slate-300">{greetingTimeRef.current}</p>
                </div>
              </div>
            )}

            <div className="space-y-3">
              {messages.map((msg) => (
                <div
                  key={msg.id}
                  className={clsx(
                    'flex items-end',
                    msg.role === 'user' ? 'justify-end gap-2.5' : 'justify-start',
                  )}
                >
                  {msg.role === 'user' ? (
                    <>
                      <div className="max-w-[58%] rounded-2xl rounded-br-[6px] border border-cyan-200/30 bg-[rgba(13,116,128,.34)] px-3.5 py-2.5 text-[13px] font-medium leading-relaxed text-cyan-50 shadow-[0_10px_24px_rgba(0,0,0,.11),inset_0_1px_0_rgba(255,255,255,.07)] backdrop-blur-sm">
                        <p className="whitespace-pre-wrap break-words">{msg.text}</p>
                        <p className="mt-2 text-right text-[11px] text-cyan-100/75">{currentTime()}</p>
                      </div>
                      <div className="grid h-7 w-7 shrink-0 place-items-center rounded-full border border-cyan-200/25 bg-cyan-300/15 text-[11px] font-semibold text-cyan-100 shadow-[inset_0_1px_0_rgba(255,255,255,.06)]">
                        你
                      </div>
                    </>
                  ) : (
                    <div className="max-w-[78%]">
                      <div
                        className={clsx(
                          'rounded-2xl rounded-tl-md border border-slate-500/50 bg-slate-800/80 px-3.5 py-2.5 text-[13px] leading-relaxed text-slate-100 shadow-[0_10px_24px_rgba(0,0,0,.12)]',
                          msg.loading && 'opacity-95',
                        )}
                      >
                        {msg.loading && !msg.text.trim() ? (
                          <div className="space-y-1.5 text-slate-100">
                            <span className="inline-flex items-center gap-2 text-[12.5px]">
                              <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-cyan-200" />
                              <span className="assistant-loading-dots" aria-hidden="true">
                                <span />
                                <span />
                                <span />
                              </span>
                            </span>
                            <div className="space-y-0.5">
                              <p className="text-[12px] leading-snug">{msg.loadingStatus || '等待后端响应…'}</p>
                              {msg.loadingElapsed && (
                                <p className="text-[11px] text-slate-300">已等待 {msg.loadingElapsed}</p>
                              )}
                            </div>
                          </div>
                        ) : (
                          <>
                            <div
                              className="assistant-md"
                              dangerouslySetInnerHTML={{
                                __html: renderMarkdownToHtml(msg.text || (msg.loading ? '' : '已完成。')),
                              }}
                            />
                            {msg.loadingStatus && (
                              <p className="mt-2 inline-flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[11px] text-slate-200">
                                <Loader2 className="h-3 w-3 animate-spin" />
                                <span>{msg.loadingStatus}</span>
                                {msg.loadingElapsed && <span className="text-slate-300">· 已等待 {msg.loadingElapsed}</span>}
                              </p>
                            )}
                          </>
                        )}
                        <p className="mt-2 text-[11px] text-slate-300">{currentTime()}</p>
                      </div>
                      <OverviewPngPreview files={msg.files} />
                      {msg.pptSvgProgress && <PptSvgProgressPreview progress={msg.pptSvgProgress} />}
                      {msg.files && msg.files.length > 0 && <PxAssistantFiles files={msg.files} />}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          <div className="border-t border-slate-600/50 bg-slate-800/50 px-4 py-2.5">
            <div className="mb-2 flex flex-wrap gap-1.5">
              {QA_CHIPS.map((chip) => (
                <button
                  key={chip}
                  type="button"
                  disabled={streaming}
                  onClick={() => handleQaChip(chip)}
                  className="rounded-full border border-slate-500/50 bg-slate-900/40 px-2.5 py-1 text-[12px] text-slate-100 shadow-[inset_0_1px_0_rgba(255,255,255,.04)] transition-colors hover:border-cyan-300/50 hover:bg-cyan-300/10 hover:text-cyan-50 disabled:opacity-50"
                >
                  {chip}
                </button>
              ))}
            </div>

            <div className="flex items-end gap-2.5 rounded-xl border border-slate-500/60 bg-slate-900/40 p-1.5 pl-3.5 shadow-[inset_0_1px_0_rgba(255,255,255,.05)] transition-colors focus-within:border-cyan-300/50">
              <textarea
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                rows={1}
                disabled={streaming}
                placeholder="向 AI 提问（Enter 发送 · Shift + Enter 换行）"
                className="min-h-[32px] max-h-28 flex-1 resize-none bg-transparent py-1.5 text-[13px] text-white placeholder:text-slate-300 focus:outline-none disabled:opacity-60"
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleSend();
                  }
                }}
              />
              <button
                type="button"
                disabled={!streaming && !draft.trim()}
                onClick={handleSend}
                className={clsx(
                  'inline-flex h-9 shrink-0 items-center gap-1.5 rounded-xl border px-3.5 text-[13px] font-medium shadow-[0_0_24px_rgba(34,211,238,.10)] transition-colors disabled:opacity-40',
                  streaming
                    ? 'border-rose-200/30 bg-rose-400/18 text-rose-50 hover:bg-rose-400/28'
                    : 'border-cyan-200/30 bg-cyan-300/20 text-cyan-50 hover:bg-cyan-300/30',
                )}
                aria-label={streaming ? '暂停生成' : '发送'}
              >
                {streaming ? <Square className="h-4 w-4 fill-current" /> : <Send className="h-4 w-4" />}
                {streaming ? '暂停' : '发送'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
