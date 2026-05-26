import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const SERVER_ROOT = path.resolve(__dirname, '../..');
export const AI_HELPER_ROOT = path.join(SERVER_ROOT, 'ai-helper');
export const GENERATED_DIR = path.join(AI_HELPER_ROOT, 'generated');
export const PROJECTS_DIR = path.join(AI_HELPER_ROOT, 'projects');
export const LOG_DIR = path.join(AI_HELPER_ROOT, 'logs');

export function ensureAiHelperDirs(): void {
  for (const dir of [AI_HELPER_ROOT, GENERATED_DIR, PROJECTS_DIR, LOG_DIR]) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

export function toAssetPath(absPath: string): string {
  const rel = path.relative(AI_HELPER_ROOT, absPath).split(path.sep).join('/');
  return `/${rel}`;
}

export function safeGeneratedPath(rootDir: string, fileName: string): string {
  const normalized = fileName.replace(/\\/g, '/').split('/').pop() || fileName;
  const target = path.resolve(rootDir, normalized);
  if (!target.startsWith(path.resolve(rootDir))) {
    throw new Error('invalid generated file path');
  }
  return target;
}

export function createRunDirectory(conversationId = '', runId = ''): { rootDir: string; relRoot: string } {
  ensureAiHelperDirs();
  const clean = (value: string, fallback: string) =>
    (value || fallback).replace(/[^a-zA-Z0-9_-]+/g, '_').slice(0, 80) || fallback;
  const conv = clean(conversationId, `conv_${Date.now().toString(36)}`);
  const run = clean(runId, `run_${Date.now().toString(36)}`);
  const rootDir = path.join(GENERATED_DIR, conv, run);
  fs.mkdirSync(rootDir, { recursive: true });
  return { rootDir, relRoot: `/generated/${conv}/${run}` };
}
