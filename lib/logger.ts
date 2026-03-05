/**
 * ARCH-04: Structured logging utility.
 *
 * Provides consistent JSON-structured logging across the application.
 * In production (Cloudflare Workers), logs are captured by Workers Logpush.
 * In development, logs are pretty-printed to console.
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface LogEntry {
  level: LogLevel;
  message: string;
  timestamp: string;
  /** Module/component that produced the log */
  source: string;
  /** Additional structured data */
  data?: Record<string, unknown>;
  /** Error details if applicable */
  error?: {
    name: string;
    message: string;
    stack?: string;
  };
}

const LOG_LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

/** Minimum log level — configurable via LOG_LEVEL env var */
function getMinLevel(): LogLevel {
  const envLevel = (typeof process !== 'undefined' && process.env?.LOG_LEVEL) || 'info';
  return (envLevel as LogLevel) in LOG_LEVELS ? (envLevel as LogLevel) : 'info';
}

function shouldLog(level: LogLevel): boolean {
  return LOG_LEVELS[level] >= LOG_LEVELS[getMinLevel()];
}

function formatError(err: unknown): LogEntry['error'] | undefined {
  if (!err) return undefined;
  if (err instanceof Error) {
    return {
      name: err.name,
      message: err.message,
      stack: err.stack,
    };
  }
  return { name: 'UnknownError', message: String(err) };
}

function emit(entry: LogEntry): void {
  const output = JSON.stringify(entry);
  switch (entry.level) {
    case 'debug':
      console.debug(output);
      break;
    case 'info':
      console.info(output);
      break;
    case 'warn':
      console.warn(output);
      break;
    case 'error':
      console.error(output);
      break;
  }
}

/**
 * Create a scoped logger for a specific module/component.
 *
 * Usage:
 *   const log = createLogger('chat-route');
 *   log.info('Request received', { sessionId, model });
 *   log.error('LLM call failed', { model }, err);
 */
export function createLogger(source: string) {
  function log(level: LogLevel, message: string, data?: Record<string, unknown>, err?: unknown) {
    if (!shouldLog(level)) return;
    const entry: LogEntry = {
      level,
      message,
      timestamp: new Date().toISOString(),
      source,
      ...(data && Object.keys(data).length > 0 ? { data } : {}),
      ...(err ? { error: formatError(err) } : {}),
    };
    emit(entry);
  }

  return {
    debug: (message: string, data?: Record<string, unknown>) => log('debug', message, data),
    info: (message: string, data?: Record<string, unknown>) => log('info', message, data),
    warn: (message: string, data?: Record<string, unknown>, err?: unknown) => log('warn', message, data, err),
    error: (message: string, data?: Record<string, unknown>, err?: unknown) => log('error', message, data, err),
  };
}

/** Pre-configured loggers for common modules */
export const loggers = {
  chat: createLogger('chat-route'),
  evaluate: createLogger('evaluate-route'),
  fix: createLogger('fix-route'),
  deploy: createLogger('deploy-route'),
  auth: createLogger('auth'),
  db: createLogger('d1-database'),
  pipeline: createLogger('pipeline'),
  middleware: createLogger('middleware'),
} as const;
