import * as Sentry from '@sentry/react-native';

const reportedOnce = new Set<string>();

// Reports a handled error to Sentry (scrubbed by the beforeSend hook in App.tsx)
// and logs it. `context` names where it happened and becomes a Sentry tag.
// Background work that retries on a timer passes { once: true }, so a failure
// that persists is reported once per session rather than every few seconds.
export function reportError(context: string, error: unknown, options?: { once?: boolean }): void {
  const message = describeError(error);
  console.error(`[${context}]`, message);

  if (options?.once) {
    if (reportedOnce.has(context)) return;
    reportedOnce.add(context);
  }

  const exception = error instanceof Error ? error : new Error(message);
  Sentry.captureException(exception, { tags: { context } });
}

// Supabase returns errors as plain objects ({ code, message }), not Error instances
function describeError(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (error && typeof error === 'object') {
    const { code, message } = error as { code?: unknown; message?: unknown };
    if (typeof message === 'string') {
      return typeof code === 'string' && code ? `${code}: ${message}` : message;
    }
  }
  return String(error);
}
