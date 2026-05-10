import * as Sentry from '@sentry/react';

const dsn = import.meta.env.VITE_SENTRY_DSN;
const release = import.meta.env.VITE_GIT_SHA;

let initialized = false;

export const errorReportingEnabled = Boolean(dsn);

// Free-text fields that may contain clinical narratives — strip before send
const PII_KEYS_TO_DROP = new Set([
  'rawInput', 'corpus', 'narrative', 'transcript', 'transcript_delta',
  'caseSummary', 'patientName', 'name', 'phone', 'phone_e164',
  'email', 'comorbid', 'history', 'examFindings',
  // Audit log payloads can carry transcripts — drop the whole payload
  'payload', 'audio', 'audio_chunk_b64',
]);

function scrubObject(obj, depth = 0) {
  if (depth > 6 || obj === null || typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) return obj.map(v => scrubObject(v, depth + 1));
  const out = {};
  for (const [k, v] of Object.entries(obj)) {
    if (PII_KEYS_TO_DROP.has(k)) {
      out[k] = '[redacted]';
    } else {
      out[k] = scrubObject(v, depth + 1);
    }
  }
  return out;
}

export function initErrorReporting() {
  if (initialized || !errorReportingEnabled) return;
  Sentry.init({
    dsn,
    release,
    environment: import.meta.env.MODE,
    tracesSampleRate: 0.1,
    replaysSessionSampleRate: 0,
    replaysOnErrorSampleRate: 0.1,
    // Default PII filter — clinical data must not leak to Sentry
    sendDefaultPii: false,
    // Most useful when a crash happens during a consult: see the trail of
    // breadcrumbs (intake.analyze, lab.update, etc.) leading up to it.
    maxBreadcrumbs: 100,
    beforeSend(event) {
      try {
        if (event.request?.data) delete event.request.data;
        if (event.extra) event.extra = scrubObject(event.extra);
        if (event.contexts) event.contexts = scrubObject(event.contexts);
        if (event.breadcrumbs) {
          event.breadcrumbs = event.breadcrumbs.map(b => ({
            ...b,
            data: b.data ? scrubObject(b.data) : b.data,
          }));
        }
      } catch {
        // never block error reporting on a scrub failure
      }
      return event;
    },
    beforeBreadcrumb(crumb) {
      if (crumb.data) crumb.data = scrubObject(crumb.data);
      return crumb;
    },
  });
  initialized = true;
}

/**
 * Log an exception with optional metadata. Safe to call before init —
 * falls back to console.error in dev, no-op in prod when DSN absent.
 *
 * @param {Error|string} err
 * @param {object} [context]   non-PII metadata. Free-text fields with
 *                              names matching the PII allowlist are
 *                              automatically redacted by beforeSend.
 * @param {object} [options]
 * @param {Record<string,string>} [options.tags]   short categorical labels
 *                              (e.g. { area: 'ai.intake', provider: 'gemini' })
 *                              — these create filter facets in Sentry.
 * @param {'fatal'|'error'|'warning'|'info'|'debug'} [options.level='error']
 */
export function reportError(err, context, options = {}) {
  if (!initialized) {
    if (import.meta.env.DEV) console.error('[error]', err, context);
    return;
  }
  Sentry.captureException(err, scope => {
    if (context) scope.setExtras(scrubObject(context));
    if (options.tags) for (const [k, v] of Object.entries(options.tags)) scope.setTag(k, String(v));
    if (options.level) scope.setLevel(options.level);
    return scope;
  });
}

/**
 * Set the current authenticated user. Only the opaque UUID is stored —
 * never email, name, or any other PII. Used by Sentry to group issues
 * by impact ("how many users hit this").
 */
export function setUserContext(user) {
  if (!initialized) return;
  Sentry.setUser(user ? { id: user.id } : null);
}

/**
 * Set the current org context. Stored as a Sentry tag so we can filter
 * issues by clinic ("how many issues are happening at clinic X").
 */
export function setOrgContext(org) {
  if (!initialized) return;
  Sentry.setTag('org_id', org?.id || 'none');
  Sentry.setTag('org_type', org?.type || 'unknown');
}

/**
 * Add a breadcrumb to the running session. Used to capture the doctor's
 * trail of actions before a crash — without those, an "engine threw" error
 * is unactionable.
 *
 * Free-text payload fields named in PII_KEYS_TO_DROP are auto-redacted.
 */
export function addBreadcrumb({ category, message, data, level = 'info' }) {
  if (!initialized) return;
  Sentry.addBreadcrumb({
    category: category || 'app',
    message: message || category || 'event',
    data,
    level,
  });
}
