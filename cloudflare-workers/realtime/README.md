# Cureocity Realtime — Cloudflare Workers WebSocket Bridge

Live-consult transcription bridge for the Cureocity AI-first stack.
Browser → Cloudflare Worker (this) → Gemini Live API → back to browser.
Replaces the broken 8-second chunked Vercel pipeline.

## Why a separate Worker instead of Vercel

Vercel Node serverless functions cannot host long-lived WebSocket
upgrades (60s hard timeout, no `socket.upgrade` API). Cloudflare
Workers + Durable Objects are purpose-built for this:

- **Bidirectional WebSockets** survive the entire consultation
- **Durable Objects** keep per-session state (one DO per
  `consultationId`) so reconnects rejoin cleanly
- **Edge deployment** keeps latency to the browser low
- **Free tier** covers >100k WS messages/day — comfortable through
  Sprint 7 pilot scale (5–25 doctors)

## Quick deploy (15 min)

### Prereqs

- Cloudflare account (free is fine)
- Node 20+ locally
- Gemini API key with Gemini Live API access enabled
- Supabase URL + anon + service-role keys

### Steps

```bash
cd cloudflare-workers/realtime
npm install
npx wrangler login                  # opens browser for auth
npx wrangler deploy                  # creates the worker + DO
```

`wrangler deploy` prints your Worker URL, e.g.
`https://cureocity-realtime.<your-subdomain>.workers.dev`.

### Set secrets (server-side, never logged)

```bash
npx wrangler secret put GEMINI_API_KEY
npx wrangler secret put SUPABASE_URL
npx wrangler secret put SUPABASE_ANON_KEY
npx wrangler secret put SUPABASE_SERVICE_ROLE_KEY
```

Each prompts for the value. Paste and press Enter.

### Wire to the SPA

In the **Vercel** project env vars, add:

```
VITE_REALTIME_URL=wss://cureocity-realtime.<your-subdomain>.workers.dev/v1/session
```

Note the `wss://` (secure WebSocket) and the `/v1/session` path.

Redeploy Vercel once so the SPA picks up the new var.

## Local dev

```bash
cd cloudflare-workers/realtime
npx wrangler dev
```

Worker runs at `http://localhost:8787`. WebSocket endpoint:
`ws://localhost:8787/v1/session`.

For local dev, set secrets in `.dev.vars` (gitignored):

```
GEMINI_API_KEY=AIza...
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...
```

Then your local SPA's `VITE_REALTIME_URL=ws://localhost:8787/v1/session`.

## Health check

```bash
curl https://cureocity-realtime.<your-subdomain>.workers.dev/healthz
# → ok
```

## Logs

Live tail:

```bash
npx wrangler tail
```

Production logs ship to Cloudflare's dashboard automatically; PII (raw
audio, transcripts) is never logged — only metadata (session ms,
audio bytes, transcript length, cost).

## Protocol

See `src/protocol.js` and `/api/realtime/session.js` in the main
project for the full event contract.

**Client → Server:**

| Event             | Payload |
|-------------------|---------|
| `session.start`   | `{ audio: { sampleRate, encoding?, language? } }` |
| `audio.chunk`     | `{ sequence, b64 }` (PCM16 LE @ 16kHz mono recommended) |
| `session.commit`  | (no payload) — graceful close |
| `session.cancel`  | (no payload) — discard |

**Server → Client:**

| Event                  | Payload |
|------------------------|---------|
| `session.ready`        | `{ protocol }` |
| `transcript.delta`     | `{ id, text, speaker, t_start, t_end }` (partial) |
| `transcript.committed` | `{ id, text, speaker, t_start, t_end }` (final) |
| `red_flag.detected`    | `{ phrase, severity, category, recommended_action }` |
| `error`                | `{ message, code? }` |
| `session.closed`       | `{ _meta: { session_ms, audio_bytes_in, transcript_chars, cost_inr, ... } }` |

## Connection URL

The browser opens:

```
wss://<worker-host>/v1/session
  ?consultationId=<uuid>
  &orgId=<uuid>
  &token=<supabase_jwt>
```

`consultationId` pins the Durable Object instance so a reconnect during
the same consult routes to the same DO with the buffered audio still
intact.

`token` is the Supabase JWT for the authenticated doctor. The Worker
verifies it via `/auth/v1/user` before accepting the upgrade.

## Cost

Per Cloudflare's pricing (2025/26):

| Item | Free tier | Paid (Workers Paid plan, $5/mo) |
|---|---|---|
| Worker invocations | 100k/day | 10M/mo, then $0.50/M |
| WebSocket messages | counted as invocations | same |
| Durable Object requests | 1M/mo (free) | 1M/mo + $0.15/M |
| DO duration | 400k GB-s | 400k GB-s + $12.50/M |

For the Kerala 5-doctor pilot (~50 consults/day × 600 messages/consult ≈ 30k
messages/day): well within free tier.

For 25-doctor scale: ~150k/day — needs paid Workers plan, ~$10/mo total.

Add-ons:
- Gemini Live audio input: $0.10/M tokens (~₹0.16 per 10-min consult)
- Supabase REST writes: free on Pro tier

## Troubleshooting

**Worker returns 401 on WS upgrade**

JWT not being sent or invalid. Check the SPA is appending `?token=...`
to the WS URL. The token must be a valid Supabase access token, not the
anon key.

**WS closes immediately with code 1011**

Usually a Gemini Live setup error. `wrangler tail` to see the
underlying error. Common cause: `GEMINI_API_KEY` not set or doesn't
have Live API access enabled in Google AI Studio.

**Transcript appears but is delayed >2 seconds**

Check the audio encoding. Gemini Live expects PCM16 LE at 16kHz mono.
If the browser is sending Opus or a different sample rate, transcoding
adds latency. The SPA's `useLiveStream.js` should be capturing PCM16
@ 16kHz directly.

**Red flags not firing**

Check `public.red_flag_phrases.is_active` is true for the phrases you
expect. Worker caches the list for 60s — wait or redeploy to refresh.

## Architecture invariants

- One Durable Object per `consultationId` — parallel WS connections to
  the same consult share state.
- Audio is **never persisted** by the Worker — only transcripts and
  metadata.
- All Supabase writes use `SUPABASE_SERVICE_ROLE_KEY` (bypasses RLS) —
  only the Worker has that key, never the browser.
- The Worker is stateless across deploys; DOs persist between deploys
  unless the migration tag is bumped (which would orphan in-flight
  sessions). Treat DO migrations as production-impacting.
