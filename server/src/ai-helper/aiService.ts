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

  async chatDetailed(messages: ChatMessage[], signal?: AbortSignal): Promise<ChatResult> {
    if (!this.apiKey) {
      throw new AIServiceError('未配置 POE_API_KEY 或 OPENAI_API_KEY');
    }
    if (signal?.aborted) throw abortError();
    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.apiKey}`,
      'Content-Type': 'application/json',
    };
    if (this.referer) headers['HTTP-Referer'] = this.referer;
    if (this.appTitle) headers['X-Title'] = this.appTitle;

    const request = {
      baseUrl: this.baseUrl,
      model: this.model,
      temperature: 0.3,
      messageCount: messages.length,
      timeoutMs: this.timeoutMs,
    };

    let resp: Response;
    const controller = new AbortController();
    let timedOut = false;
    const abortFromCaller = () => controller.abort(signal?.reason);
    if (signal) signal.addEventListener('abort', abortFromCaller, { once: true });
    const timeout = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, this.timeoutMs);
    try {
      resp = await fetch(`${this.baseUrl}/chat/completions`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ model: this.model, messages, temperature: request.temperature }),
        signal: controller.signal,
      });
    } catch (err) {
      if (controller.signal.aborted) {
        if (!timedOut) throw abortError();
        throw new AIServiceError(`模型调用超时（>${this.timeoutMs}ms）：模型服务未在限定时间内返回`, { request });
      }
      throw new AIServiceError(`模型调用失败（网络异常）: ${err instanceof Error ? err.message : String(err)}`, { request });
    } finally {
      clearTimeout(timeout);
      if (signal) signal.removeEventListener('abort', abortFromCaller);
    }

    if (!resp.ok) {
      const detail = await resp.text().catch(() => '');
      throw new AIServiceError(`模型调用失败（HTTP ${resp.status}）: ${detail}`, { status: resp.status, detail, request });
    }
    let data: {
      choices?: Array<{ finish_reason?: string; message?: { content?: string; reasoning_content?: string; role?: string } }>;
      usage?: { prompt_tokens_details?: { cached_tokens?: number }; cache_creation_input_tokens?: number; cache_read_input_tokens?: number };
    };
    try {
      data = (await resp.json()) as typeof data;
    } catch (err) {
      throw new AIServiceError(`模型响应不是合法 JSON: ${err instanceof Error ? err.message : String(err)}`, { request });
    }
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
    const cacheUsage: CacheUsage | undefined = data.usage
      ? {
          cached_tokens: data.usage.prompt_tokens_details?.cached_tokens ?? data.usage.cache_read_input_tokens ?? 0,
          cache_creation_input_tokens: data.usage.cache_creation_input_tokens ?? 0,
        }
      : undefined;
    return { text, rawResponse: data, request, cacheUsage, recoveredFromReasoningContent: Boolean(recoveredText) };
  }

  async chat(messages: ChatMessage[], signal?: AbortSignal): Promise<string> {
    return (await this.chatDetailed(messages, signal)).text;
  }
}
