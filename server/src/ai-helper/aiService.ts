import '../config/env.js';

export interface ContentBlock {
  type: 'text';
  text: string;
  cache_control?: { type: 'ephemeral' };
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string | ContentBlock[];
}

export interface CacheUsage {
  cached_tokens: number;
  cache_creation_input_tokens: number;
}

export interface ChatRequestInfo {
    baseUrl: string;
    model: string;
    temperature: number;
    messageCount: number;
    timeoutMs: number;
    stream?: boolean;
}

export interface ChatStreamProgress {
  chunkCount: number;
  contentChars: number;
  reasoningChars: number;
  totalChars: number;
  elapsedMs: number;
  firstChunkMs?: number;
  finishReason?: string;
  done?: boolean;
  action?: string;
  responseType?: string;
  slideNo?: number;
  slideTitle?: string;
  coreConclusion?: string;
}

export interface ChatDetailedOptions {
  stream?: boolean;
  progressIntervalMs?: number;
  onProgress?: (progress: ChatStreamProgress) => void;
}

export class AIServiceError extends Error {
  status?: number;
  detail?: unknown;
  rawResponse?: unknown;
  request?: ChatRequestInfo;

  constructor(message: string, extra: { status?: number; detail?: unknown; rawResponse?: unknown; request?: ChatRequestInfo } = {}) {
    super(message);
    this.name = 'AIServiceError';
    Object.assign(this, extra);
  }
}

export interface ChatResult {
  text: string;
  rawResponse: unknown;
  request: ChatRequestInfo;
  cacheUsage?: CacheUsage;
  recoveredFromReasoningContent?: boolean;
  streamProgress?: ChatStreamProgress;
}

function abortError(message = '模型调用已取消'): AIServiceError {
  const err = new AIServiceError(message);
  err.name = 'AbortError';
  return err;
}

function parseProtocolJson(raw: string): Record<string, unknown> | undefined {
  let text = raw.trim();
  if (!text) return undefined;
  if (text.startsWith('```')) text = text.replace(/^```(?:json)?\s*/i, '').replace(/```$/i, '').trim();

  const parse = (value: string): Record<string, unknown> | undefined => {
    try {
      const obj = JSON.parse(value) as unknown;
      return obj && typeof obj === 'object' && !Array.isArray(obj) ? obj as Record<string, unknown> : undefined;
    } catch {
      return undefined;
    }
  };

  const direct = parse(text);
  if (direct) return direct;

  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start < 0 || end <= start) return undefined;
  return parse(text.slice(start, end + 1));
}

function isAssistantProtocolObject(obj: Record<string, unknown> | undefined): boolean {
  if (!obj) return false;
  if (obj.type === 'skill_call') return typeof obj.skill_id === 'string' && typeof obj.action === 'string';
  if (obj.type === 'final') return typeof obj.answer === 'string' && Array.isArray(obj.deliverable_files);
  return false;
}

function recoverProtocolJsonFromReasoningContent(reasoningContent: string | undefined): string | undefined {
  const reasoning = reasoningContent?.trim();
  if (!reasoning) return undefined;
  const parsed = parseProtocolJson(reasoning);
  return isAssistantProtocolObject(parsed) ? JSON.stringify(parsed) : undefined;
}

function cacheUsageFromUsage(usage: { prompt_tokens_details?: { cached_tokens?: number }; cache_creation_input_tokens?: number; cache_read_input_tokens?: number } | undefined): CacheUsage | undefined {
  return usage
    ? {
        cached_tokens: usage.prompt_tokens_details?.cached_tokens ?? usage.cache_read_input_tokens ?? 0,
        cache_creation_input_tokens: usage.cache_creation_input_tokens ?? 0,
      }
    : undefined;
}

function decodeJsonStringLiteral(value: string | undefined): string | undefined {
  if (value === undefined) return undefined;
  try {
    return JSON.parse(`"${value}"`) as string;
  } catch {
    return value
      .replace(/\\"/g, '"')
      .replace(/\\n/g, ' ')
      .replace(/\\t/g, ' ')
      .replace(/\\\\/g, '\\');
  }
}

function matchJsonStringField(text: string, key: string): string | undefined {
  const match = text.match(new RegExp(`"${key}"\\s*:\\s*"((?:\\\\.|[^"\\\\])*)"`, 's'));
  const value = decodeJsonStringLiteral(match?.[1]);
  return value?.replace(/\s+/g, ' ').trim() || undefined;
}

function inferStreamProgressFields(content: string): Pick<ChatStreamProgress, 'action' | 'responseType' | 'slideNo' | 'slideTitle' | 'coreConclusion'> {
  const responseType = matchJsonStringField(content, 'type');
  const action = matchJsonStringField(content, 'action');
  const slideNoMatch = content.match(/"slide_no"\s*:\s*(\d{1,3})/);
  const slideNo = slideNoMatch ? Number(slideNoMatch[1]) : undefined;
  const slideTitle = matchJsonStringField(content, 'title')?.slice(0, 80);
  const coreConclusion = matchJsonStringField(content, 'core_conclusion')?.slice(0, 120);
  return {
    responseType,
    action,
    slideNo: Number.isInteger(slideNo) ? slideNo : undefined,
    slideTitle,
    coreConclusion,
  };
}

export class AIService {
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly model: string;
  private readonly referer: string;
  private readonly appTitle: string;
  private readonly timeoutMs: number;

  constructor(options: { model?: string; timeoutMs?: number } = {}) {
    this.apiKey = (process.env.POE_API_KEY || process.env.OPENAI_API_KEY || '').trim();
    this.baseUrl = (process.env.OPENAI_BASE_URL || 'https://api.poe.com/v1').replace(/\/$/, '');
    this.model = options.model || process.env.TEXT_MODEL || 'GPT-5.4';
    this.referer = (process.env.APP_REFERER || '').trim();
    this.appTitle = (process.env.APP_TITLE || '').trim();
    this.timeoutMs = Math.max(10_000, Number(options.timeoutMs || process.env.AI_HELPER_MODEL_TIMEOUT_MS || 120_000));
  }

  configured(): boolean {
    return Boolean(this.apiKey);
  }

  modelName(): string {
    return this.model;
  }

  private buildHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.apiKey}`,
      'Content-Type': 'application/json',
    };
    if (this.referer) headers['HTTP-Referer'] = this.referer;
    if (this.appTitle) headers['X-Title'] = this.appTitle;
    return headers;
  }

  private parseCompletionJson(data: {
    choices?: Array<{ finish_reason?: string; message?: { content?: string; reasoning_content?: string; role?: string } }>;
    usage?: { prompt_tokens_details?: { cached_tokens?: number }; cache_creation_input_tokens?: number; cache_read_input_tokens?: number };
  }, request: ChatRequestInfo): ChatResult {
    const choice = data.choices?.[0];
    const message = choice?.message || {};
    const contentText = message.content?.trim();
    const recoveredText = contentText ? undefined : recoverProtocolJsonFromReasoningContent(message.reasoning_content);
    const text = contentText || recoveredText;
    if (!text) {
      const keys = Object.keys(message);
      throw new AIServiceError(
        `模型返回为空（finish_reason=${choice?.finish_reason || 'unknown'}，message_keys=${keys.join(',') || 'none'}，content_chars=${message.content?.length || 0}，reasoning_chars=${message.reasoning_content?.length || 0}）`,
        { rawResponse: data, request },
      );
    }
    return { text, rawResponse: data, request, cacheUsage: cacheUsageFromUsage(data.usage), recoveredFromReasoningContent: Boolean(recoveredText) };
  }

  private async parseNonStreamingResponse(resp: Response, request: ChatRequestInfo): Promise<ChatResult> {
    let data: {
      choices?: Array<{ finish_reason?: string; message?: { content?: string; reasoning_content?: string; role?: string } }>;
      usage?: { prompt_tokens_details?: { cached_tokens?: number }; cache_creation_input_tokens?: number; cache_read_input_tokens?: number };
    };
    try {
      data = (await resp.json()) as typeof data;
    } catch (err) {
      throw new AIServiceError(`模型响应不是合法 JSON: ${err instanceof Error ? err.message : String(err)}`, { request });
    }
    return this.parseCompletionJson(data, request);
  }

  private async parseStreamingTextFallback(raw: string, request: ChatRequestInfo): Promise<ChatResult> {
    const text = raw.trim();
    if (!text) throw new AIServiceError('模型流式响应为空', { request });
    if (!text.startsWith('data:')) {
      try {
        const data = JSON.parse(text) as {
          choices?: Array<{ finish_reason?: string; message?: { content?: string; reasoning_content?: string; role?: string } }>;
          usage?: { prompt_tokens_details?: { cached_tokens?: number }; cache_creation_input_tokens?: number; cache_read_input_tokens?: number };
        };
        return this.parseCompletionJson(data, request);
      } catch {
        throw new AIServiceError('模型响应不是合法 SSE 或 JSON', { detail: text.slice(0, 1000), request });
      }
    }
    throw new AIServiceError('模型流式响应未能读取到有效内容', { detail: text.slice(0, 1000), request });
  }

  private async parseStreamingResponse(resp: Response, request: ChatRequestInfo, options: ChatDetailedOptions, startedAt: number): Promise<ChatResult> {
    if (!resp.body) return this.parseNonStreamingResponse(resp, { ...request, stream: false });

    const reader = resp.body.getReader();
    const decoder = new TextDecoder('utf-8');
    let buffer = '';
    let rawText = '';
    let content = '';
    let reasoningContent = '';
    let chunkCount = 0;
    let firstChunkMs: number | undefined;
    let lastProgressAt = 0;
    let finishReason: string | undefined;
    let usage: { prompt_tokens_details?: { cached_tokens?: number }; cache_creation_input_tokens?: number; cache_read_input_tokens?: number } | undefined;
    let seenDone = false;
    const progressIntervalMs = Math.max(250, Number(options.progressIntervalMs || process.env.AI_HELPER_MODEL_PROGRESS_INTERVAL_MS || 1500) || 1500);

    const progress = (force = false) => {
      if (!options.onProgress) return;
      const now = Date.now();
      if (!force && now - lastProgressAt < progressIntervalMs) return;
      lastProgressAt = now;
      options.onProgress({
        chunkCount,
        contentChars: content.length,
        reasoningChars: reasoningContent.length,
        totalChars: content.length + reasoningContent.length,
        elapsedMs: now - startedAt,
        firstChunkMs,
        finishReason,
        ...inferStreamProgressFields(content),
      });
    };

    const handleData = (payload: string): boolean => {
      const trimmed = payload.trim();
      if (!trimmed) return false;
      if (trimmed === '[DONE]') return true;
      let data: {
        choices?: Array<{
          finish_reason?: string;
          delta?: { content?: string; reasoning_content?: string; role?: string };
          message?: { content?: string; reasoning_content?: string; role?: string };
        }>;
        usage?: typeof usage;
      };
      try {
        data = JSON.parse(trimmed) as typeof data;
      } catch {
        return false;
      }
      if (data.usage) usage = data.usage;
      const choice = data.choices?.[0];
      if (choice?.finish_reason) finishReason = choice.finish_reason;
      const delta = choice?.delta || {};
      const message = choice?.message || {};
      const piece = delta.content ?? message.content ?? '';
      const reasoningPiece = delta.reasoning_content ?? message.reasoning_content ?? '';
      if (piece || reasoningPiece) {
        chunkCount += 1;
        if (firstChunkMs === undefined) firstChunkMs = Date.now() - startedAt;
        content += piece;
        reasoningContent += reasoningPiece;
        progress(false);
      }
      return false;
    };

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      const decoded = decoder.decode(value, { stream: true });
      if (rawText.length < 1_000_000) rawText += decoded.slice(0, 1_000_000 - rawText.length);
      buffer += decoded;
      const lines = buffer.split(/\r?\n/);
      buffer = lines.pop() || '';
      for (const line of lines) {
        const trimmedLine = line.trimEnd();
        if (!trimmedLine || trimmedLine.startsWith(':')) continue;
        if (!trimmedLine.startsWith('data:')) continue;
        if (handleData(trimmedLine.slice(5))) {
          seenDone = true;
          progress(true);
          buffer = '';
          break;
        }
      }
      if (seenDone) {
        await reader.cancel().catch(() => undefined);
        break;
      }
    }
    const tail = decoder.decode();
    if (tail) buffer += tail;
    if (buffer.trim()) {
      for (const part of buffer.split(/\r?\n/)) {
        const line = part.trimEnd();
        if (line.startsWith('data:')) handleData(line.slice(5));
      }
    }

    const contentText = content.trim();
    const recoveredText = contentText ? undefined : recoverProtocolJsonFromReasoningContent(reasoningContent);
    const text = contentText || recoveredText;
    const finalProgress: ChatStreamProgress = {
      chunkCount,
      contentChars: content.length,
      reasoningChars: reasoningContent.length,
      totalChars: content.length + reasoningContent.length,
      elapsedMs: Date.now() - startedAt,
      firstChunkMs,
      finishReason,
      done: true,
      ...inferStreamProgressFields(content),
    };
    options.onProgress?.(finalProgress);

    if (!text) {
      if (rawText.trim() && !rawText.trim().startsWith('data:')) return this.parseStreamingTextFallback(rawText, request);
      throw new AIServiceError(
        `模型返回为空（finish_reason=${finishReason || 'unknown'}，stream_chunks=${chunkCount}，content_chars=${content.length}，reasoning_chars=${reasoningContent.length}）`,
        { rawResponse: { streamed: true, chunk_count: chunkCount, finish_reason: finishReason }, request },
      );
    }

    return {
      text,
      rawResponse: { streamed: true, chunk_count: chunkCount, finish_reason: finishReason, usage },
      request,
      cacheUsage: cacheUsageFromUsage(usage),
      recoveredFromReasoningContent: Boolean(recoveredText),
      streamProgress: finalProgress,
    };
  }

  async chatDetailed(messages: ChatMessage[], signal?: AbortSignal, options: ChatDetailedOptions = {}): Promise<ChatResult> {
    if (!this.apiKey) {
      throw new AIServiceError('未配置 POE_API_KEY 或 OPENAI_API_KEY');
    }
    if (signal?.aborted) throw abortError();
    const useStream = options.stream ?? (process.env.AI_HELPER_MODEL_STREAM !== 'false');
    const request = {
      baseUrl: this.baseUrl,
      model: this.model,
      temperature: 0.3,
      messageCount: messages.length,
      timeoutMs: this.timeoutMs,
      stream: useStream,
    };

    const controller = new AbortController();
    let timedOut = false;
    const abortFromCaller = () => controller.abort(signal?.reason);
    if (signal) signal.addEventListener('abort', abortFromCaller, { once: true });
    const timeout = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, this.timeoutMs);
    try {
      const startedAt = Date.now();
      const resp = await fetch(`${this.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: this.buildHeaders(),
        body: JSON.stringify({ model: this.model, messages, temperature: request.temperature, ...(useStream ? { stream: true } : {}) }),
        signal: controller.signal,
      });

      if (!resp.ok) {
        const detail = await resp.text().catch(() => '');
        throw new AIServiceError(`模型调用失败（HTTP ${resp.status}）: ${detail}`, { status: resp.status, detail, request });
      }
      return useStream
        ? await this.parseStreamingResponse(resp, request, options, startedAt)
        : await this.parseNonStreamingResponse(resp, request);
    } catch (err) {
      if (err instanceof AIServiceError) throw err;
      if (controller.signal.aborted) {
        if (!timedOut) throw abortError();
        throw new AIServiceError(`模型调用超时（>${this.timeoutMs}ms）：模型服务未在限定时间内返回`, { request });
      }
      throw new AIServiceError(`模型调用失败（网络异常）: ${err instanceof Error ? err.message : String(err)}`, { request });
    } finally {
      clearTimeout(timeout);
      if (signal) signal.removeEventListener('abort', abortFromCaller);
    }
  }

  async chat(messages: ChatMessage[], signal?: AbortSignal): Promise<string> {
    return (await this.chatDetailed(messages, signal)).text;
  }
}
