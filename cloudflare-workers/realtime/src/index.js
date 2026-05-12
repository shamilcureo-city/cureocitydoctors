// Cureocity realtime WebSocket bridge — Worker entry.
//
// Routes:
//   GET  /healthz           → "ok" (uptime check)
//   GET  /v1/session        → WebSocket upgrade, hands off to SessionDO
//   *                       → 404
//
// The Worker itself is stateless. All session state lives in the
// SessionDO Durable Object — one DO per consultation_id, so a single
// consult can survive Worker restarts and is geographically pinned
// once created.

import { SessionDO } from './session.js';
import { authenticateRequest } from './auth.js';

export { SessionDO };

function corsHeaders(origin, allowed) {
  if (!origin) return {};
  if (allowed.includes(origin) || allowed.includes('*')) {
    return {
      'access-control-allow-origin': origin,
      'access-control-allow-headers': 'authorization, content-type',
      'access-control-allow-methods': 'GET, POST, OPTIONS',
      'access-control-max-age': '86400',
      'vary': 'origin',
    };
  }
  return {};
}

export default {
  async fetch(req, env, ctx) {
    const url = new URL(req.url);
    const origin = req.headers.get('origin') || '';
    const allowed = (env.ALLOWED_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean);
    const cors = corsHeaders(origin, allowed);

    // Preflight
    if (req.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: cors });
    }

    // Health check
    if (url.pathname === '/healthz') {
      return new Response('ok', { status: 200, headers: cors });
    }

    // WebSocket session
    if (url.pathname === '/v1/session') {
      if (req.headers.get('upgrade') !== 'websocket') {
        return new Response('Expected WebSocket upgrade', { status: 426, headers: cors });
      }

      // Auth — Supabase JWT in `?token=...` query (browsers can't set
      // headers on WS upgrade) or `Authorization: Bearer ...` header.
      const auth = await authenticateRequest(req, env);
      if (!auth.ok) {
        return new Response(JSON.stringify({ error: auth.reason }), {
          status: 401,
          headers: { 'content-type': 'application/json', ...cors },
        });
      }

      // consultationId pins the DO instance — the same consult always
      // routes to the same DO, even across reconnects.
      const consultationId = url.searchParams.get('consultationId');
      if (!consultationId) {
        return new Response(JSON.stringify({ error: 'consultationId query param required' }), {
          status: 400,
          headers: { 'content-type': 'application/json', ...cors },
        });
      }

      const id = env.SESSION.idFromName(consultationId);
      const stub = env.SESSION.get(id);

      // Pass authenticated user info via internal request header so the
      // DO doesn't have to re-verify the JWT.
      const headers = new Headers(req.headers);
      headers.set('x-cureocity-user-id', auth.userId);
      headers.set('x-cureocity-org-id', url.searchParams.get('orgId') || '');
      headers.set('x-cureocity-consultation-id', consultationId);

      // Forward the upgrade to the DO. The DO completes the handshake.
      return stub.fetch(req.url, { headers, body: req.body, method: req.method });
    }

    return new Response('Not found', { status: 404, headers: cors });
  },
};
