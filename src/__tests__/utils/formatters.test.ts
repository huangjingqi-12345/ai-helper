import { describe, it, expect } from 'vitest';
import { formatNumber, formatDate, formatDateOnly, formatDuration } from '@/utils/formatters';

describe('formatNumber', () => {
  it('formats numbers with comma separators', () => {
    expect(formatNumber(1000)).toBe('1,000');
    expect(formatNumber(1234567)).toBe('1,234,567');
  });

  it('handles zero', () => {
    expect(formatNumber(0)).toBe('0');
  });

  it('handles small numbers without commas', () => {
    expect(formatNumber(999)).toBe('999');
    expect(formatNumber(1)).toBe('1');
  });

  it('handles negative numbers', () => {
    expect(formatNumber(-1000)).toBe('-1,000');
  });
});

describe('formatDate', () => {
  it('formats a date string to readable format', () => {
    const result = formatDate('2026-05-12T18:00:00Z');
    expect(result).toBeTruthy();
    expect(typeof result).toBe('string');
  });

  it('handles ISO date strings', () => {
    const result = formatDate('2026-01-15T16:00:00.000Z');
    expect(result).toContain('2026');
  });
});

describe('formatDateOnly', () => {
  it('formats a date string to date only', () => {
    const result = formatDateOnly('2026-05-12T18:00:00Z');
    expect(result).toBeTruthy();
    expect(typeof result).toBe('string');
    expect(result).toContain('2026');
  });
});

describe('formatDuration', () => {
  it('formats seconds to minutes and seconds', () => {
    const result = formatDuration(186);
    expect(result).toContain('3');
    expect(result).toContain('06');
  });

  it('handles zero seconds', () => {
    const result = formatDuration(0);
    expect(result).toContain('0');
  });

  it('handles seconds less than a minute', () => {
    const result = formatDuration(45);
    expect(result).toContain('45');
  });
});
