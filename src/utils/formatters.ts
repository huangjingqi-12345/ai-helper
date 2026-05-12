/**
 * Format a number with thousands separator
 * e.g., 56322 → "56,322"
 */
export function formatNumber(value: number): string {
  return value.toLocaleString('en-US');
}

/**
 * Format a date string to a readable format
 * e.g., "2026-05-12T10:00:00Z" → "2026-05-12 10:00"
 */
export function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${year}-${month}-${day} ${hours}:${minutes}`;
}

/**
 * Format a date string to date only
 * e.g., "2026-05-12T10:00:00Z" → "2026-05-12"
 */
export function formatDateOnly(dateStr: string): string {
  const date = new Date(dateStr);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Format seconds to human readable duration
 * e.g., 125 → "2分05秒"
 */
export function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  if (mins > 0) {
    return `${mins}分${String(Math.round(secs)).padStart(2, '0')}秒`;
  }
  return `${Math.round(secs)}秒`;
}
