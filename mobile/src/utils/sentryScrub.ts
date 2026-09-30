// Scrubs personal data from everything sent to Sentry: breadcrumbs, error
// events, transactions and spans. Supabase request URLs carry user IDs in their
// query strings (PostgREST filters such as ?sender_id=eq.<uuid>), and span
// descriptions are those full URLs, so URLs lose their query string and every
// UUID, email address, token and code is replaced wherever it appears.

const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;
const EMAIL_RE = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const JWT_RE = /eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g;
const URL_QUERY_RE = /(https?:\/\/[^\s"'?#]+)[?#][^\s"']*/gi;
// Phone numbers: 7+ digits with the usual separators, optionally +country
const PHONE_RE = /\+?\d[\d\s().-]{6,}\d/g;
// Standalone 6-digit numbers: one-time codes
const CODE_RE = /\b\d{6}\b/g;

const MAX_DEPTH = 6;

export function scrubString(value: string): string {
  return value
    .replace(URL_QUERY_RE, '$1')
    .replace(JWT_RE, '<token>')
    .replace(EMAIL_RE, '<email>')
    .replace(UUID_RE, '<uuid>')
    .replace(PHONE_RE, '<phone>')
    .replace(CODE_RE, '<code>');
}

// Recursively scrubs every string in a value. Objects and arrays are copied.
export function scrubValue<T>(value: T, depth = 0): T {
  if (typeof value === 'string') {
    return scrubString(value) as unknown as T;
  }
  if (depth >= MAX_DEPTH || value === null || typeof value !== 'object') {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map(item => scrubValue(item, depth + 1)) as unknown as T;
  }
  const out: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    out[key] = scrubValue(item, depth + 1);
  }
  return out as T;
}

type Scrubbable = Record<string, any>;

// Query strings and fragments recorded as separate attributes (http.query etc.)
const QUERY_KEYS = ['http.query', 'http.fragment', 'url.query', 'url.fragment', 'query'];

function dropQueryKeys(data: Scrubbable | undefined) {
  if (!data) return;
  for (const key of QUERY_KEYS) {
    delete data[key];
  }
}

export function scrubBreadcrumb<T extends Scrubbable>(breadcrumb: T): T {
  const scrubbed = scrubValue(breadcrumb);
  // Query attributes and request/response bodies never go to Sentry
  dropQueryKeys(scrubbed.data);
  if (scrubbed.data) {
    delete scrubbed.data.body;
    delete scrubbed.data.request_body;
    delete scrubbed.data.response_body;
  }
  return scrubbed;
}

export function scrubEvent<T extends Scrubbable>(event: T): T {
  // The stack trace (file names, line numbers) is kept: it's code, not user
  // data, and scrubbing digits would break it. Everything else is scrubbed.
  const { exception, ...rest } = event;
  const scrubbed: Scrubbable = scrubValue(rest);
  if (exception?.values) {
    scrubbed.exception = {
      ...exception,
      values: exception.values.map((ex: Scrubbable) => ({
        ...ex,
        value: typeof ex.value === 'string' ? scrubString(ex.value) : ex.value,
      })),
    };
  }
  if (scrubbed.request) {
    delete scrubbed.request.query_string;
    delete scrubbed.request.data;
    delete scrubbed.request.cookies;
  }
  // No user identity beyond what the SDK needs to group events
  delete scrubbed.user;
  return scrubbed as T;
}

export function scrubSpan<T extends Scrubbable>(span: T): T {
  const scrubbed = scrubValue(span);
  dropQueryKeys(scrubbed.data);
  return scrubbed;
}

// A transaction carries its spans inline
export function scrubTransaction<T extends Scrubbable>(event: T): T {
  const scrubbed: Scrubbable = scrubEvent(event);
  if (Array.isArray(scrubbed.spans)) {
    scrubbed.spans = scrubbed.spans.map((span: Scrubbable) => scrubSpan(span));
  }
  dropQueryKeys(scrubbed.contexts?.trace?.data);
  return scrubbed as T;
}
