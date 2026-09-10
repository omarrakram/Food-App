import type { TranslationKey } from '@/i18n/locales/en';

/**
 * Application error taxonomy.
 *
 * Rule: no raw error ever reaches the user. Everything thrown inside the app is
 * normalised into an `AppError` carrying a translation key, so screens render a
 * human sentence and logs keep the technical detail.
 */
export type AppErrorCode =
  | 'offline'
  | 'timeout'
  | 'rate_limited'
  | 'unauthorized'
  | 'session_expired'
  | 'forbidden'
  | 'not_found'
  | 'validation'
  | 'ai_unavailable'
  | 'ai_invalid_output'
  | 'database'
  | 'conflict'
  | 'unknown';

type ErrorPresentation = { titleKey: TranslationKey; bodyKey: TranslationKey };

const PRESENTATION: Record<AppErrorCode, ErrorPresentation> = {
  offline: { titleKey: 'error.offlineTitle', bodyKey: 'error.offlineBody' },
  timeout: { titleKey: 'error.timeoutTitle', bodyKey: 'error.timeoutBody' },
  rate_limited: { titleKey: 'error.rateLimitTitle', bodyKey: 'error.rateLimitBody' },
  unauthorized: { titleKey: 'auth.error.invalidCredentials', bodyKey: 'error.genericBody' },
  session_expired: { titleKey: 'auth.error.sessionExpired', bodyKey: 'error.genericBody' },
  forbidden: { titleKey: 'error.genericTitle', bodyKey: 'error.genericBody' },
  not_found: { titleKey: 'error.notFoundTitle', bodyKey: 'error.notFoundBody' },
  validation: { titleKey: 'error.invalidIngredientTitle', bodyKey: 'error.invalidIngredientBody' },
  ai_unavailable: { titleKey: 'error.aiUnavailableTitle', bodyKey: 'error.aiUnavailableBody' },
  ai_invalid_output: { titleKey: 'error.aiUnavailableTitle', bodyKey: 'error.aiUnavailableBody' },
  database: { titleKey: 'error.databaseTitle', bodyKey: 'error.databaseBody' },
  conflict: { titleKey: 'error.genericTitle', bodyKey: 'error.genericBody' },
  unknown: { titleKey: 'error.genericTitle', bodyKey: 'error.genericBody' },
};

/** Codes worth retrying automatically. */
const RETRYABLE: ReadonlySet<AppErrorCode> = new Set<AppErrorCode>([
  'offline',
  'timeout',
  'database',
  'ai_unavailable',
]);

export class AppError extends Error {
  readonly code: AppErrorCode;
  /** Values interpolated into the message, e.g. `{ minutes: 5 }`. */
  readonly values: Record<string, string | number>;
  /** Original error, kept for logging. Never rendered. */
  readonly cause?: unknown;

  constructor(
    code: AppErrorCode,
    options: { message?: string; values?: Record<string, string | number>; cause?: unknown } = {},
  ) {
    super(options.message ?? code);
    this.name = 'AppError';
    this.code = code;
    this.values = options.values ?? {};
    this.cause = options.cause;
  }

  get presentation(): ErrorPresentation {
    return PRESENTATION[this.code];
  }

  get isRetryable(): boolean {
    return RETRYABLE.has(this.code);
  }
}

export function isAppError(error: unknown): error is AppError {
  return error instanceof AppError;
}

export function isRetryableError(error: unknown): boolean {
  return isAppError(error) ? error.isRetryable : false;
}

/** Presentation for any thrown value, including ones we did not create. */
export function presentError(error: unknown): ErrorPresentation & {
  values: Record<string, string | number>;
  code: AppErrorCode;
} {
  if (isAppError(error)) {
    return { ...error.presentation, values: error.values, code: error.code };
  }
  return { ...PRESENTATION.unknown, values: {}, code: 'unknown' };
}

/**
 * Normalises a Supabase / PostgREST / fetch failure into an `AppError`.
 * Keeps every screen free of provider-specific error handling.
 */
export function toAppError(error: unknown, fallback: AppErrorCode = 'unknown'): AppError {
  if (isAppError(error)) return error;

  if (error instanceof Error) {
    const message = error.message.toLowerCase();

    if (message.includes('network request failed') || message.includes('fetch failed')) {
      return new AppError('offline', { cause: error });
    }
    if (message.includes('abort') || message.includes('timeout')) {
      return new AppError('timeout', { cause: error });
    }
    if (message.includes('jwt') || message.includes('session') || message.includes('token')) {
      return new AppError('session_expired', { cause: error });
    }
  }

  // PostgREST-style error objects.
  if (typeof error === 'object' && error !== null) {
    const candidate = error as { code?: string; status?: number; message?: string };

    if (candidate.status === 401) return new AppError('session_expired', { cause: error });
    if (candidate.status === 403) return new AppError('forbidden', { cause: error });
    if (candidate.status === 404) return new AppError('not_found', { cause: error });
    if (candidate.status === 429) return new AppError('rate_limited', { cause: error });
    if (typeof candidate.status === 'number' && candidate.status >= 500) {
      return new AppError('database', { cause: error });
    }

    // Postgres error classes.
    if (candidate.code === 'PGRST116') return new AppError('not_found', { cause: error });
    if (candidate.code === '23505') return new AppError('conflict', { cause: error });
    if (candidate.code === '42501') return new AppError('forbidden', { cause: error });
  }

  return new AppError(fallback, { cause: error });
}
