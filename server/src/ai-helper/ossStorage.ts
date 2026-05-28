import fs from 'fs';
import fsp from 'fs/promises';
import path from 'path';
import { createHmac } from 'crypto';
import { AI_HELPER_ROOT } from './paths.js';
import { dbAll, dbRun } from '../db/connection.js';
import { logger } from '../utils/logger.js';

const AI_HELPER_FILE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export type AiHelperUploadContext = {
  userId?: string;
  tenantId?: string;
  conversationId?: string;
  runId?: string;
};

type OssConfig = {
  accessKeyId: string;
  accessKeySecret: string;
  bucket: string;
  endpoint: string;
  endpointHost: string;
  protocol: 'http:' | 'https:';
  publicBaseUrl?: string;
  prefix: string;
};

type AiHelperFileRow = {
  local_path?: string;
  object_key: string;
};

function env(...keys: string[]): string {
  for (const key of keys) {
    const value = process.env[key]?.trim();
    if (value) return value;
  }
  return '';
}

function ossConfig(): OssConfig | undefined {
  const accessKeyId = env('ALI_OSS_ACCESS_KEY_ID', 'OSS_ACCESS_KEY_ID');
  const accessKeySecret = env('ALI_OSS_ACCESS_KEY_SECRET', 'OSS_ACCESS_KEY_SECRET');
  const bucket = env('ALI_OSS_BUCKET', 'OSS_BUCKET');
  const rawEndpoint = env('ALI_OSS_ENDPOINT', 'OSS_ENDPOINT');
  if (!accessKeyId || !accessKeySecret || !bucket || !rawEndpoint) return undefined;
  const withProtocol = /^https?:\/\//i.test(rawEndpoint) ? rawEndpoint : `https://${rawEndpoint}`;
  const url = new URL(withProtocol);
  const prefix = env('AI_HELPER_OSS_PREFIX', 'ALI_OSS_PREFIX', 'OSS_PREFIX') || 'ai-helper';
  return {
    accessKeyId,
    accessKeySecret,
    bucket,
    endpoint: `${url.protocol}//${url.host}`,
    endpointHost: url.host,
    protocol: url.protocol === 'http:' ? 'http:' : 'https:',
    publicBaseUrl: env('ALI_OSS_PUBLIC_BASE_URL', 'OSS_PUBLIC_BASE_URL').replace(/\/+$/, ''),
    prefix: prefix.replace(/^\/+|\/+$/g, ''),
  };
}

export function isOssStorageConfigured(): boolean {
  return Boolean(ossConfig());
}

function encodeKey(key: string): string {
  return key.split('/').map((part) => encodeURIComponent(part)).join('/');
}

function contentTypeFor(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === '.png') return 'image/png';
  if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg';
  if (ext === '.webp') return 'image/webp';
  if (ext === '.gif') return 'image/gif';
  if (ext === '.svg') return 'image/svg+xml';
  if (ext === '.pdf') return 'application/pdf';
  if (ext === '.ppt') return 'application/vnd.ms-powerpoint';
  if (ext === '.pptx') return 'application/vnd.openxmlformats-officedocument.presentationml.presentation';
  if (ext === '.html' || ext === '.htm') return 'text/html; charset=utf-8';
  if (ext === '.md' || ext === '.txt') return 'text/plain; charset=utf-8';
  if (ext === '.json') return 'application/json; charset=utf-8';
  return 'application/octet-stream';
}

function shouldUploadAiHelperFile(rel: string): boolean {
  const name = path.basename(rel).toLowerCase();
  if (/manifest|metrics|qa/.test(name)) return false;
  const allowed = new Set(['.md', '.html', '.htm', '.png', '.jpg', '.jpeg', '.webp', '.svg', '.pdf', '.ppt', '.pptx']);
  return allowed.has(path.extname(name));
}

function resolveLocalAiHelperFile(file: string): { abs: string; rel: string } | undefined {
  const raw = String(file || '').trim().replace(/\\/g, '/');
  if (!raw || /^https?:\/\//i.test(raw)) return undefined;
  let rel = raw.replace(/^\/+/, '');
  if (!rel.startsWith('generated/') && !rel.startsWith('projects/')) {
    if (!path.isAbsolute(raw)) return undefined;
    const abs = path.resolve(raw);
    const root = path.resolve(AI_HELPER_ROOT);
    if (!abs.startsWith(root + path.sep)) return undefined;
    rel = path.relative(root, abs).split(path.sep).join('/');
  }
  if (!rel.startsWith('generated/') && !rel.startsWith('projects/')) return undefined;
  const abs = path.resolve(AI_HELPER_ROOT, rel);
  const root = path.resolve(AI_HELPER_ROOT);
  if (!abs.startsWith(root + path.sep)) return undefined;
  if (!fs.existsSync(abs) || !fs.statSync(abs).isFile()) return undefined;
  return { abs, rel };
}

function objectKeyFor(rel: string, ctx: AiHelperUploadContext, config: OssConfig): string {
  const parts = [
    config.prefix,
    ctx.tenantId ? `tenant-${ctx.tenantId}` : '',
    ctx.userId ? `user-${ctx.userId}` : '',
    rel,
  ].filter(Boolean);
  return parts.join('/').replace(/\/{2,}/g, '/');
}

function publicUrlFor(objectKey: string, config: OssConfig): string {
  const encoded = encodeKey(objectKey);
  if (config.publicBaseUrl) return `${config.publicBaseUrl}/${encoded}`;
  return `${config.protocol}//${config.bucket}.${config.endpointHost}/${encoded}`;
}

async function putObjectToOss(config: OssConfig, objectKey: string, body: Buffer, contentType: string): Promise<void> {
  const date = new Date().toUTCString();
  const canonicalResource = `/${config.bucket}/${objectKey}`;
  const stringToSign = ['PUT', '', contentType, date, canonicalResource].join('\n');
  const signature = createHmac('sha1', config.accessKeySecret).update(stringToSign).digest('base64');
  const url = `${config.protocol}//${config.bucket}.${config.endpointHost}/${encodeKey(objectKey)}`;
  const resp = await fetch(url, {
    method: 'PUT',
    headers: {
      Authorization: `OSS ${config.accessKeyId}:${signature}`,
      Date: date,
      'Content-Type': contentType,
      'Content-Length': String(body.length),
    },
    body: body as unknown as BodyInit,
  });
  if (!resp.ok) {
    const detail = await resp.text().catch(() => '');
    throw new Error(`OSS 上传失败 HTTP ${resp.status}: ${detail.slice(0, 500)}`);
  }
}

async function deleteObjectFromOss(config: OssConfig, objectKey: string): Promise<void> {
  const date = new Date().toUTCString();
  const canonicalResource = `/${config.bucket}/${objectKey}`;
  const stringToSign = ['DELETE', '', '', date, canonicalResource].join('\n');
  const signature = createHmac('sha1', config.accessKeySecret).update(stringToSign).digest('base64');
  const url = `${config.protocol}//${config.bucket}.${config.endpointHost}/${encodeKey(objectKey)}`;
  const resp = await fetch(url, {
    method: 'DELETE',
    headers: {
      Authorization: `OSS ${config.accessKeyId}:${signature}`,
      Date: date,
    },
  });
  if (!resp.ok && resp.status !== 404) {
    const detail = await resp.text().catch(() => '');
    throw new Error(`OSS 删除失败 HTTP ${resp.status}: ${detail.slice(0, 500)}`);
  }
}

async function getObjectFromOss(config: OssConfig, objectKey: string): Promise<Buffer> {
  const date = new Date().toUTCString();
  const canonicalResource = `/${config.bucket}/${objectKey}`;
  const stringToSign = ['GET', '', '', date, canonicalResource].join('\n');
  const signature = createHmac('sha1', config.accessKeySecret).update(stringToSign).digest('base64');
  const url = `${config.protocol}//${config.bucket}.${config.endpointHost}/${encodeKey(objectKey)}`;
  const resp = await fetch(url, {
    method: 'GET',
    headers: {
      Authorization: `OSS ${config.accessKeyId}:${signature}`,
      Date: date,
    },
  });
  if (!resp.ok) {
    const detail = await resp.text().catch(() => '');
    throw new Error(`OSS 下载失败 HTTP ${resp.status}: ${detail.slice(0, 500)}`);
  }
  return Buffer.from(await resp.arrayBuffer());
}

async function deleteOssObjects(rows: AiHelperFileRow[]): Promise<void> {
  const config = ossConfig();
  if (!config || !rows.length) return;
  await Promise.all(rows.map(async (row) => {
    try {
      await deleteObjectFromOss(config, row.object_key);
    } catch (err) {
      logger.warn({ err, object_key: row.object_key }, 'AI helper OSS object cleanup failed');
    }
  }));
}

async function recordAiHelperFile(args: {
  ctx: AiHelperUploadContext;
  localPath: string;
  objectKey: string;
  assetUrl: string;
  bucket: string;
  contentType: string;
  sizeBytes: number;
}): Promise<void> {
  const now = new Date().toISOString();
  const expiresAt = new Date(Date.now() + AI_HELPER_FILE_TTL_MS).toISOString();
  const id = `ai-file-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  await dbRun(`
    INSERT INTO ai_helper_files (
      id, user_id, tenant_id, conversation_id, run_id, local_path,
      storage_provider, bucket, object_key, asset_url, content_type,
      size_bytes, created_at, expires_at
    )
    VALUES (?, ?, ?, ?, ?, ?, 'oss', ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(object_key) DO UPDATE SET
      asset_url = excluded.asset_url,
      content_type = excluded.content_type,
      size_bytes = excluded.size_bytes,
      expires_at = excluded.expires_at
  `, [
    id,
    args.ctx.userId || '',
    args.ctx.tenantId || '',
    args.ctx.conversationId || '',
    args.ctx.runId || '',
    args.localPath,
    args.bucket,
    args.objectKey,
    args.assetUrl,
    args.contentType,
    args.sizeBytes,
    now,
    expiresAt,
  ]);
}

export async function uploadAiHelperFiles(files: string[], ctx: AiHelperUploadContext = {}): Promise<string[]> {
  const config = ossConfig();
  if (!config) return files;
  const required = process.env.AI_HELPER_OSS_REQUIRED === 'true';
  const out: string[] = [];
  const cache = new Map<string, string>();

  for (const file of files) {
    const local = resolveLocalAiHelperFile(file);
    if (!local) {
      out.push(file);
      continue;
    }
    if (!shouldUploadAiHelperFile(local.rel)) {
      out.push(file);
      continue;
    }
    const cached = cache.get(local.rel);
    if (cached) {
      out.push(cached);
      continue;
    }
    try {
      const body = await fsp.readFile(local.abs);
      const contentType = contentTypeFor(local.abs);
      const objectKey = objectKeyFor(local.rel, ctx, config);
      const assetUrl = publicUrlFor(objectKey, config);
      await putObjectToOss(config, objectKey, body, contentType);
      await recordAiHelperFile({
        ctx,
        localPath: `/${local.rel}`,
        objectKey,
        assetUrl,
        bucket: config.bucket,
        contentType,
        sizeBytes: body.length,
      });
      cache.set(local.rel, assetUrl);
      out.push(assetUrl);
    } catch (err) {
      logger.warn({ err, file }, 'AI helper OSS upload failed');
      if (required) throw err;
      out.push(file);
    }
  }
  return out;
}

export async function cleanupExpiredAiHelperFiles(nowIso: string): Promise<void> {
  const rows = await dbAll<AiHelperFileRow>('SELECT object_key FROM ai_helper_files WHERE expires_at <= ?', [nowIso]);
  await deleteOssObjects(rows);
  await dbRun('DELETE FROM ai_helper_files WHERE expires_at <= ?', [nowIso]);
}

export async function deleteAiHelperFilesForUser(userId: string): Promise<void> {
  const rows = await dbAll<AiHelperFileRow>('SELECT object_key FROM ai_helper_files WHERE user_id = ?', [userId]);
  await deleteOssObjects(rows);
  await dbRun('DELETE FROM ai_helper_files WHERE user_id = ?', [userId]);
}

export async function restoreAiHelperProjectFromOss(projectPath: string): Promise<boolean> {
  const config = ossConfig();
  if (!config) return false;
  const project = projectPath.replace(/\\/g, '/').replace(/^\/+/, '').replace(/\/+$/, '');
  if (!project.startsWith('projects/')) return false;
  const rows = await dbAll<AiHelperFileRow & { local_path: string }>(
    'SELECT local_path, object_key FROM ai_helper_files WHERE local_path LIKE ?',
    [`/${project}/%`],
  );
  if (!rows.length) return false;
  let restored = 0;
  for (const row of rows) {
    try {
      const rel = row.local_path.replace(/^\/+/, '');
      const abs = path.resolve(AI_HELPER_ROOT, rel);
      const root = path.resolve(AI_HELPER_ROOT);
      if (!abs.startsWith(root + path.sep)) continue;
      await fsp.mkdir(path.dirname(abs), { recursive: true });
      await fsp.writeFile(abs, await getObjectFromOss(config, row.object_key));
      restored += 1;
    } catch (err) {
      logger.warn({ err, local_path: row.local_path }, 'AI helper OSS project restore failed for file');
    }
  }
  return restored > 0;
}
