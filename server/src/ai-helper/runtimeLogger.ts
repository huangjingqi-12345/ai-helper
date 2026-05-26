import fs from 'fs';
import path from 'path';
import { LOG_DIR, ensureAiHelperDirs } from './paths.js';

export type RuntimeLogPayload = Record<string, unknown>;

export const RUNTIME_LOG_PATH = path.join(LOG_DIR, 'assistant_runtime.jsonl');
export const MODEL_IO_LOG_PATH = path.join(LOG_DIR, 'model_io.jsonl');

function jsonSafe(value: unknown): unknown {
  if (value instanceof Error) {
    return {
      name: value.name,
      message: value.message,
      stack: value.stack,
    };
  }
  return value;
}

export function runtimeLog(event: string, payload: RuntimeLogPayload = {}): void {
  try {
    ensureAiHelperDirs();
    const line = JSON.stringify(
      {
        ts: new Date().toISOString(),
        event,
        runtime: 'node-ts',
        ...Object.fromEntries(Object.entries(payload).map(([key, value]) => [key, jsonSafe(value)])),
      },
      (_key, value) => (typeof value === 'bigint' ? value.toString() : value),
    );
    fs.appendFileSync(RUNTIME_LOG_PATH, `${line}\n`, 'utf8');
  } catch {
    // Runtime logging must never break report generation.
  }
}

function stringifyJson(value: unknown): string {
  return JSON.stringify(value, (_key, item) => (typeof item === 'bigint' ? item.toString() : item), 2);
}

function fenced(value: unknown, lang = 'text'): string {
  const text = typeof value === 'string' ? value : stringifyJson(value);
  const fence = text.includes('````') ? '`````' : '````';
  return `${fence}${lang}\n${text}\n${fence}`;
}

function appendJsonl(filePath: string, payload: RuntimeLogPayload): void {
  const line = JSON.stringify(
    {
      ts: new Date().toISOString(),
      runtime: 'node-ts',
      ...Object.fromEntries(Object.entries(payload).map(([key, value]) => [key, jsonSafe(value)])),
    },
    (_key, value) => (typeof value === 'bigint' ? value.toString() : value),
  );
  fs.appendFileSync(filePath, `${line}\n`, 'utf8');
}

export interface ModelIoMessage {
  role: string;
  content: string | unknown[];
}

export interface ModelIoLogEntry {
  step: number;
  rootDir: string;
  model: string;
  duration_ms?: number;
  messages: ModelIoMessage[];
  output?: string;
  error?: unknown;
  request?: unknown;
  meta?: RuntimeLogPayload;
  cache_usage?: { cached_tokens: number; cache_creation_input_tokens: number };
  recovered_from_reasoning_content?: boolean;
}

export function modelIoLog(entry: ModelIoLogEntry): void {
  try {
    ensureAiHelperDirs();
    const ts = new Date().toISOString();
    const payload = { ts, event: 'model_io', ...entry };

    appendJsonl(MODEL_IO_LOG_PATH, payload);

    fs.mkdirSync(entry.rootDir, { recursive: true });
    appendJsonl(path.join(entry.rootDir, 'model_io.jsonl'), payload);

    const mdPath = path.join(entry.rootDir, 'model_io.md');
    if (!fs.existsSync(mdPath)) {
      fs.writeFileSync(
        mdPath,
        [
          '# Model I/O Log',
          '',
          '按模型调用轮次记录完整输入 messages、模型输出、耗时和请求元信息。',
          '',
        ].join('\n'),
        'utf8',
      );
    }

    const sections: string[] = [];
    sections.push(`\n## Step ${entry.step} · ${ts}`);
    sections.push('');
    sections.push(`- Model: \`${entry.model}\``);
    if (typeof entry.duration_ms === 'number') sections.push(`- Duration: \`${entry.duration_ms}ms\``);
    if (entry.cache_usage) {
      const cu = entry.cache_usage;
      sections.push(`- Cache: hit=\`${cu.cached_tokens}\` tokens, creation=\`${cu.cache_creation_input_tokens}\` tokens`);
    }
    if (entry.recovered_from_reasoning_content) sections.push('- Recovered from reasoning_content: `true`');
    if (entry.meta && Object.keys(entry.meta).length) {
      sections.push('- Meta:');
      sections.push(fenced(entry.meta, 'json'));
    }
    if (entry.request) {
      sections.push('### Request Info');
      sections.push(fenced(entry.request, 'json'));
    }
    sections.push('### Input Messages');
    entry.messages.forEach((message, index) => {
      const hasCache = Array.isArray(message.content) && (message.content as Array<{cache_control?: unknown}>).some(b => b.cache_control);
      sections.push(`#### ${index + 1}. ${message.role}${hasCache ? ' 🗄️cached' : ''}`);
      const displayContent = Array.isArray(message.content)
        ? (message.content as Array<{text?: string}>).map(b => b.text || '').join('')
        : message.content;
      sections.push(fenced(displayContent, 'text'));
    });
    if (entry.output !== undefined) {
      sections.push('### Model Output');
      sections.push(fenced(entry.output, 'json'));
    }
    if (entry.error !== undefined) {
      sections.push('### Model Error');
      sections.push(fenced(entry.error, 'json'));
    }
    sections.push('');
    fs.appendFileSync(mdPath, `${sections.join('\n')}\n`, 'utf8');
  } catch {
    // Model I/O logging must never break report generation.
  }
}
