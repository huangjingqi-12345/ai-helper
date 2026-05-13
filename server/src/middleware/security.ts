import type { Request, Response, NextFunction } from 'express';

const buckets = new Map<string, { count: number; resetAt: number }>();

export function securityHeaders(_req: Request, res: Response, next: NextFunction): void {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  res.setHeader('Cache-Control', 'no-store');
  next();
}

export function rateLimit(req: Request, res: Response, next: NextFunction): void {
  const windowMs = Number(process.env.RATE_LIMIT_WINDOW_MS || 60_000);
  const max = Number(process.env.RATE_LIMIT_MAX || 600);
  const key = req.ip || 'unknown';
  const now = Date.now();
  const bucket = buckets.get(key);

  if (!bucket || bucket.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    next();
    return;
  }

  if (bucket.count >= max) {
    res.status(429).json({ success: false, data: null, message: 'Too many requests', timestamp: new Date().toISOString() });
    return;
  }

  bucket.count += 1;
  next();
}

