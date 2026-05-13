import type { Request, Response, NextFunction } from 'express';

export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ValidationError';
  }
}

export function asObject(value: unknown, label = 'body'): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new ValidationError(`${label} must be an object`);
  }
  return value as Record<string, unknown>;
}

export function requiredString(value: unknown, field: string, maxLength = 500): string {
  if (typeof value !== 'string' || !value.trim()) throw new ValidationError(`${field} is required`);
  const trimmed = value.trim();
  if (trimmed.length > maxLength) throw new ValidationError(`${field} must be <= ${maxLength} characters`);
  return trimmed;
}

export function optionalString(value: unknown, field: string, maxLength = 500): string | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  return requiredString(value, field, maxLength);
}

export function optionalNumber(value: unknown, field: string, min = 0, max = Number.MAX_SAFE_INTEGER): number | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < min || parsed > max) {
    throw new ValidationError(`${field} must be a number between ${min} and ${max}`);
  }
  return Math.round(parsed);
}

export function enumValue<T extends string>(value: unknown, field: string, allowed: readonly T[]): T {
  if (typeof value !== 'string' || !allowed.includes(value as T)) {
    throw new ValidationError(`${field} must be one of: ${allowed.join(', ')}`);
  }
  return value as T;
}

export function stringArray(value: unknown, field: string, maxItems = 50): string[] {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) throw new ValidationError(`${field} must be an array`);
  if (value.length > maxItems) throw new ValidationError(`${field} must contain <= ${maxItems} items`);
  return value.map((item, index) => requiredString(item, `${field}[${index}]`, 120));
}

export function validationErrorHandler(err: unknown, _req: Request, res: Response, next: NextFunction): void {
  if (err instanceof ValidationError) {
    res.status(400).json({ success: false, data: null, message: err.message, timestamp: new Date().toISOString() });
    return;
  }
  next(err);
}

