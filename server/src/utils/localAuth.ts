import { createHmac, pbkdf2Sync, randomBytes, timingSafeEqual } from 'crypto';

const passwordIterations = 120_000;
const passwordKeyLength = 32;
const passwordDigest = 'sha256';
const sessionTtlMs = 1000 * 60 * 60 * 24 * 7;

interface LocalTokenPayload {
  sub: string;
  iat: number;
  exp: number;
}

function authSecret(): string {
  return process.env.LOCAL_AUTH_SECRET || process.env.BREAK_GLASS_ADMIN_TOKEN || 'px-lite-local-auth-development-secret';
}

function encode(value: unknown): string {
  return Buffer.from(JSON.stringify(value)).toString('base64url');
}

function decodePayload(value: string): LocalTokenPayload | null {
  try {
    const decoded = JSON.parse(Buffer.from(value, 'base64url').toString('utf8')) as Partial<LocalTokenPayload>;
    if (typeof decoded.sub !== 'string' || typeof decoded.iat !== 'number' || typeof decoded.exp !== 'number') return null;
    return { sub: decoded.sub, iat: decoded.iat, exp: decoded.exp };
  } catch {
    return null;
  }
}

function sign(payload: string): string {
  return createHmac('sha256', authSecret()).update(payload).digest('base64url');
}

function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

export function hashPassword(password: string, salt = randomBytes(16).toString('hex')): { salt: string; hash: string } {
  const hash = pbkdf2Sync(password, salt, passwordIterations, passwordKeyLength, passwordDigest).toString('hex');
  return { salt, hash };
}

export function verifyPassword(password: string, salt: string, expectedHash: string): boolean {
  const { hash } = hashPassword(password, salt);
  return safeEqual(hash, expectedHash);
}

export function createLocalSessionToken(userId: string): string {
  const now = Date.now();
  const payload = encode({ sub: userId, iat: now, exp: now + sessionTtlMs });
  return `local.${payload}.${sign(payload)}`;
}

export function verifyLocalSessionToken(token: string): { userId: string } | null {
  const [prefix, payload, signature] = token.split('.');
  if (prefix !== 'local' || !payload || !signature) return null;
  if (!safeEqual(sign(payload), signature)) return null;
  const decoded = decodePayload(payload);
  if (!decoded || decoded.exp < Date.now()) return null;
  return { userId: decoded.sub };
}
