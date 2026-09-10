import { env } from '@/lib/config/env';

/**
 * Minimal logging façade.
 *
 * PRIVACY: never pass user content (emails, ingredient text, free-text notes)
 * into `context`. Only pass identifiers and enum-like values. In production the
 * console sink is silenced; wiring a real crash reporter (Sentry, Bugsnag) is a
 * single change in `sink` — see PROJECT_STATUS.md § Remaining work.
 */

export type LogContext = Record<string, string | number | boolean | undefined>;

/** Keys we refuse to log even if a caller passes them by mistake. */
const REDACTED_KEYS = new Set([
  'email',
  'password',
  'token',
  'access_token',
  'refresh_token',
  'apikey',
  'api_key',
  'authorization',
  'query',
  'note',
  'displayname',
]);

function sanitise(context: LogContext | undefined): LogContext {
  if (!context) return {};
  const output: LogContext = {};
  for (const [key, value] of Object.entries(context)) {
    output[key] = REDACTED_KEYS.has(key.toLowerCase()) ? '[redacted]' : value;
  }
  return output;
}

function sink(level: 'info' | 'warn' | 'error', event: string, context: LogContext) {
  if (env.isProduction) {
    // TODO(observability): forward to a crash reporter. Deliberately silent for
    // now rather than leaking anything to the device console in production.
    return;
  }
  const payload = { event, ...context };
  if (level === 'error') console.error('[akla]', payload);
  else if (level === 'warn') console.warn('[akla]', payload);
  else console.warn('[akla]', payload);
}

export function logInfo(event: string, context?: LogContext) {
  sink('info', event, sanitise(context));
}

export function logWarn(event: string, context?: LogContext) {
  sink('warn', event, sanitise(context));
}

export function logError(event: string, error: unknown, context?: LogContext) {
  const detail =
    error instanceof Error
      ? { errorName: error.name, errorMessage: error.message }
      : { errorMessage: String(error) };
  sink('error', event, { ...sanitise(context), ...detail });
}
