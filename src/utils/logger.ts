export type LogLevel = 'DEBUG' | 'INFO' | 'WARN' | 'ERROR';
export type LogCategory = 'NAV' | 'UI' | 'API' | 'ACTION' | 'AUTH' | 'FEATURE' | 'PERF' | 'ERROR';

export interface LogEntry {
  timestamp: string;
  level: LogLevel;
  category: LogCategory;
  message: string;
  data?: Record<string, unknown>;
  page?: string;
}

const LOG_LEVEL_PRIORITY: Record<LogLevel, number> = {
  DEBUG: 0,
  INFO: 1,
  WARN: 2,
  ERROR: 3,
};

const CATEGORY_COLORS: Record<LogCategory, string> = {
  NAV: '#7773FD',
  UI: '#720DD7',
  API: '#34D399',
  ACTION: '#FBBF24',
  AUTH: '#FB7185',
  FEATURE: '#06b6d4',
  PERF: '#ec4899',
  ERROR: '#FB7185',
};

const MAX_ENTRIES = 1000;

class Logger {
  private entries: LogEntry[] = [];
  private minLevel: LogLevel;
  private page: string;

  constructor(page = 'global') {
    this.page = page;
    this.minLevel = (import.meta.env.VITE_LOG_LEVEL as LogLevel) || 'DEBUG';
  }

  private shouldLog(level: LogLevel): boolean {
    return LOG_LEVEL_PRIORITY[level] >= LOG_LEVEL_PRIORITY[this.minLevel];
  }

  private addEntry(level: LogLevel, category: LogCategory, message: string, data?: Record<string, unknown>): void {
    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      category,
      message,
      data,
      page: this.page,
    };

    this.entries.push(entry);
    if (this.entries.length > MAX_ENTRIES) {
      this.entries = this.entries.slice(-MAX_ENTRIES);
    }

    if (this.shouldLog(level)) {
      const color = CATEGORY_COLORS[category];
      const prefix = `%c[${category}]`;
      const style = `color: ${color}; font-weight: bold;`;

      switch (level) {
        case 'ERROR':
          console.error(prefix, style, message, data || '');
          break;
        case 'WARN':
          console.warn(prefix, style, message, data || '');
          break;
        default:
          console.log(prefix, style, message, data || '');
      }
    }
  }

  nav(message: string, data?: Record<string, unknown>): void {
    this.addEntry('INFO', 'NAV', message, data);
  }

  ui(message: string, data?: Record<string, unknown>): void {
    this.addEntry('DEBUG', 'UI', message, data);
  }

  api(method: string, url: string, data?: Record<string, unknown>): void {
    this.addEntry('INFO', 'API', `${method} ${url}`, data);
  }

  action(message: string, data?: Record<string, unknown>): void {
    this.addEntry('INFO', 'ACTION', message, data);
  }

  auth(message: string, data?: Record<string, unknown>): void {
    this.addEntry('INFO', 'AUTH', message, data);
  }

  feature(message: string, data?: Record<string, unknown>): void {
    this.addEntry('INFO', 'FEATURE', message, data);
  }

  perf(message: string, data?: Record<string, unknown>): void {
    this.addEntry('DEBUG', 'PERF', message, data);
  }

  error(message: string, error?: unknown, data?: Record<string, unknown>): void {
    const errorData = {
      ...data,
      ...(error instanceof Error ? { errorMessage: error.message, stack: error.stack } : { error }),
    };
    this.addEntry('ERROR', 'ERROR', message, errorData);
  }

  getEntries(filter?: { category?: LogCategory; level?: LogLevel }): LogEntry[] {
    let result = [...this.entries];
    if (filter?.category) {
      result = result.filter((e) => e.category === filter.category);
    }
    if (filter?.level) {
      result = result.filter(
        (e) => LOG_LEVEL_PRIORITY[e.level] >= LOG_LEVEL_PRIORITY[filter.level!]
      );
    }
    return result;
  }

  clear(): void {
    this.entries = [];
  }

  setPage(page: string): void {
    this.page = page;
  }
}

export const logger = new Logger();

export function createLogger(page: string): Logger {
  return new Logger(page);
}
