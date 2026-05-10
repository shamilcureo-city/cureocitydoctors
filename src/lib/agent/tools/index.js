// Unified tool dispatcher for the clinical agent.
//
// Receives a tool_use block from Anthropic Messages API, routes it to the
// correct handler, logs to tool_calls (audit trail), returns the
// tool_result block back to the agent loop.
//
// Class A tools (deterministic safety) are always available.
// Data ops require a server-side Supabase service-role client.

import { createClient } from '@supabase/supabase-js';
import { TOOL_NAMES } from './schemas.js';
import { handleSearchKb } from './searchKb.js';
import { handleDrugInteractions } from './drugInteractions.js';
import { handleDoseCheck } from './doseCheck.js';
import { calcRiskScore } from './calcRiskScore.js';

let _supabase = null;
function getSupabase() {
  if (_supabase) return _supabase;
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  _supabase = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return _supabase;
}

// Handlers are async; they may return { error } but should never throw.
const HANDLERS = {
  search_kb:           ({ args, ctx })   => handleSearchKb(args, ctx),
  drug_interactions:   ({ args, ctx })   => handleDrugInteractions(args, ctx),
  dose_check:          ({ args, ctx })   => handleDoseCheck(args, ctx),
  calc_risk_score:     ({ args })        => calcRiskScore(args),
  flag_red_flag:       ({ args, ctx })   => handleFlagRedFlag(args, ctx),
  patient_history:     ({ args, ctx })   => handlePatientHistory(args, ctx),
  save_consult_event:  ({ args, ctx })   => handleSaveConsultEvent(args, ctx),
  finalize_rx:         ({ args, ctx })   => handleFinalizeRx(args, ctx),
};

/**
 * dispatchTool — main entry called from api/agent/turn.js per tool_use.
 *
 * @param {Object} call          — { name, input, id } from Anthropic
 * @param {Object} ctx           — { consultationId, doctorId, orgId }
 * @returns {Object}             — { tool_use_id, content, is_error }
 */
export async function dispatchTool(call, ctx) {
  if (!TOOL_NAMES.includes(call.name)) {
    const err = `unknown_tool:${call.name}`;
    await logToolCall(ctx, call, { error: err }, 0, false, err);
    return wrapResult(call, { error: err }, true);
  }

  const handler = HANDLERS[call.name];
  if (!handler) {
    const err = `tool_not_implemented:${call.name}`;
    await logToolCall(ctx, call, { error: err }, 0, false, err);
    return wrapResult(call, { error: err }, true);
  }

  const startedAt = Date.now();
  let result, success = true, errorMessage = null;
  try {
    result = await handler({ args: call.input || {}, ctx });
    if (result && result.error) {
      success = false;
      errorMessage = result.error;
    }
  } catch (err) {
    success = false;
    errorMessage = err?.message || String(err);
    result = { error: errorMessage };
  }
  const latencyMs = Date.now() - startedAt;

  await logToolCall(ctx, call, result, latencyMs, success, errorMessage);

  return wrapResult(call, result, !success);
}

// Wrap into the Anthropic tool_result content block format.
function wrapResult(call, result, isError = false) {
  return {
    type: 'tool_result',
    tool_use_id: call.id,
    content: JSON.stringify(result),
    ...(isError ? { is_error: true } : {}),
  };
}

// Append-only audit log of every tool invocation.
async function logToolCall(ctx, call, result, latencyMs, success, errorMessage) {
  try {
    const sb = getSupabase();
    if (!sb || !ctx?.consultationId) return;
    await sb.from('tool_calls').insert({
      consultation_id: ctx.consultationId,
      consultation_event_id: ctx.consultationEventId || null,
      doctor_id: ctx.doctorId || null,
      tool_name: call.name,
      tool_args: call.input || {},
      tool_result: result || null,
      latency_ms: latencyMs,
      success,
      error_message: errorMessage,
    });
  } catch {
    // Logging must not break the agent loop. Sentry will catch the upstream.
  }
}

// ───────────────────────────────────────────────────────────────────────
// Data-op handlers (Class B/C)
// ───────────────────────────────────────────────────────────────────────

async function handleFlagRedFlag({ phrase, severity, category, rationale }, ctx) {
  const sb = getSupabase();
  if (!sb || !ctx?.consultationId) {
    return { logged: false, reason: 'no_supabase_or_consult' };
  }
  const { error } = await sb.from('consultation_events').insert({
    consultation_id: ctx.consultationId,
    event_type: 'agent.red_flag',
    payload: { phrase, severity, category, rationale },
  });
  return { logged: !error, error: error?.message };
}

async function handlePatientHistory({ phone_e164, patient_id, include, max_consultations = 5 }, ctx) {
  const sb = getSupabase();
  if (!sb || !ctx?.orgId) return { error: 'no_org_context' };

  const wanted = new Set(include || ['consultations', 'prescriptions', 'allergies', 'conditions']);
  let pid = patient_id;

  if (!pid && phone_e164) {
    const { data: pat } = await sb
      .from('patients')
      .select('id')
      .eq('org_id', ctx.orgId)
      .eq('phone_e164', phone_e164)
      .maybeSingle();
    pid = pat?.id;
  }
  if (!pid) return { error: 'patient_not_found' };

  const out = { patient_id: pid };

  if (wanted.has('consultations')) {
    const { data } = await sb
      .from('consultations')
      .select('id, started_at, chief_complaint, primary_diagnosis_icd10, certainty_pct')
      .eq('patient_id', pid)
      .order('started_at', { ascending: false })
      .limit(Math.min(max_consultations, 20));
    out.consultations = data || [];
  }
  if (wanted.has('prescriptions')) {
    const { data } = await sb
      .from('prescriptions')
      .select('id, created_at, drugs, follow_up_days')
      .eq('patient_id', pid)
      .order('created_at', { ascending: false })
      .limit(10);
    out.prescriptions = data || [];
  }
  if (wanted.has('allergies') || wanted.has('conditions')) {
    const { data: pat } = await sb
      .from('patients')
      .select('allergies, conditions')
      .eq('id', pid)
      .maybeSingle();
    if (wanted.has('allergies')) out.allergies = pat?.allergies || [];
    if (wanted.has('conditions')) out.conditions = pat?.conditions || [];
  }

  return out;
}

async function handleSaveConsultEvent({ event_type, payload }, ctx) {
  const sb = getSupabase();
  if (!sb || !ctx?.consultationId) return { error: 'no_consult_context' };
  const { error } = await sb.from('consultation_events').insert({
    consultation_id: ctx.consultationId,
    event_type,
    payload: payload || {},
  });
  return { saved: !error, error: error?.message };
}

// finalize_rx: validate every item before returning structured Rx.
// Even if the agent already called dose_check + drug_interactions, we
// re-run them here. This is the regulatory shield.
async function handleFinalizeRx({ items, advice, follow_up_days, referral }, ctx) {
  const validations = [];
  const drugList = items.map(i => i.drug_generic);

  // Re-check interactions across the FULL Rx (agent may have checked pairwise)
  const interResult = await handleDrugInteractions(
    { drugs: drugList, patient_context: ctx.patientContext || {} },
    ctx
  );
  validations.push({ stage: 'drug_interactions', result: interResult });

  // Re-check each dose
  for (const item of items) {
    const doseResult = await handleDoseCheck({
      drug: item.drug_generic,
      indication: item.indication,
      route: item.route,
      patient: ctx.patientContext || {},
    }, ctx);
    validations.push({ stage: 'dose_check', drug: item.drug_generic, result: doseResult });
  }

  // Determine if blocking issues exist
  const blockers = [];
  const interFindings = interResult.findings || [];
  for (const f of interFindings) {
    if (f.severity === 'contraindicated' || f.severity === 'major') {
      blockers.push({ kind: f.kind, detail: f, severity: f.severity });
    }
  }
  for (const v of validations) {
    if (v.stage === 'dose_check' && v.result?.error === 'no_safe_dose') {
      blockers.push({ kind: 'dose_check_failed', drug: v.drug, severity: 'major' });
    }
  }

  return {
    rx_status: blockers.length ? 'blocked' : 'ready_for_signature',
    items,
    advice: advice || [],
    follow_up_days: follow_up_days || null,
    referral: referral || null,
    validations,
    blockers,
  };
}
