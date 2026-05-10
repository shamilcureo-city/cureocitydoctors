import posthog from 'posthog-js';

const key = import.meta.env.VITE_POSTHOG_KEY;
const host = import.meta.env.VITE_POSTHOG_HOST || 'https://app.posthog.com';

let initialized = false;

export const analyticsEnabled = Boolean(key);

export function initAnalytics() {
  if (initialized || !analyticsEnabled) return;
  posthog.init(key, {
    api_host: host,
    capture_pageview: true,
    capture_pageleave: true,
    autocapture: false, // we'll capture explicit events only — clinical app, minimize noise
    persistence: 'localStorage+cookie',
    loaded: () => { initialized = true; },
  });
  initialized = true;
}

export function track(event, props = {}) {
  if (!initialized) return;
  posthog.capture(event, props);
}

export function identify(id, traits = {}) {
  if (!initialized || !id) return;
  posthog.identify(id, traits);
}

export function resetIdentity() {
  if (!initialized) return;
  posthog.reset();
}
