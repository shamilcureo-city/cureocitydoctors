import * as Sentry from '@sentry/react';

const dsn = import.meta.env.VITE_SENTRY_DSN;
const release = import.meta.env.VITE_GIT_SHA;

let initialized = false;

export const errorReportingEnabled = Boolean(dsn);

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
    beforeSend(event) {
      // Strip anything that might contain free-text patient data
      if (event.request?.data) delete event.request.data;
      if (event.extra?.payload) delete event.extra.payload;
      return event;
    },
  });
  initialized = true;
}

export function reportError(err, context) {
  if (!initialized) {
    if (import.meta.env.DEV) console.error('[error]', err, context);
    return;
  }
  Sentry.captureException(err, context ? { extra: context } : undefined);
}

export function setUserContext(user) {
  if (!initialized) return;
  Sentry.setUser(user ? { id: user.id } : null);
}
