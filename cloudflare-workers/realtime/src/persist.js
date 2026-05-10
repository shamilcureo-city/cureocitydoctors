// Supabase REST writes (Workers can't easily use the supabase-js client
// because it pulls Node-specific deps; the REST API is plenty).
//
// All inserts use the SERVICE_ROLE_KEY so they bypass RLS for system-
// driven writes (transcript persistence, cost telemetry).

async function sbInsert(env, table, row) {
  const url = `${env.SUPABASE_URL}/rest/v1/${table}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: env.SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
      Prefer: 'return=minimal',
    },
    body: JSON.stringify(row),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`supabase ${table} insert ${res.status}: ${text}`);
  }
}

export async function persistTranscriptEvent(env, { consultationId, speaker, text, t_start, t_end, eventType, payload }) {
  if (!consultationId) return;
  await sbInsert(env, 'consultation_events', {
    consultation_id: consultationId,
    event_type: eventType || 'transcript.chunk',
    payload: payload ?? {
      speaker: speaker ?? 'unknown',
      text: text ?? '',
      t_start: t_start ?? null,
      t_end: t_end ?? null,
    },
  });
}

export async function persistAiCall(env, { consultationId, doctorId, orgId, provider, model, tokensIn, tokensOut, costInr, latencyMs }) {
  if (!consultationId) return;
  await sbInsert(env, 'ai_calls', {
    consultation_id: consultationId,
    doctor_id: doctorId,
    org_id: orgId,
    provider,
    model,
    tokens_in: tokensIn,
    tokens_out: tokensOut,
    cost_inr: costInr,
    latency_ms: latencyMs,
  });
}
