/**
 * Audit log v2 — structured event taxonomy.
 *
 * Wraps the existing logEvent() machinery (src/utils/auditLog.js) with
 * named constructors that enforce the standard payload shape. Every
 * AI call, every consult lifecycle event, every Rx send goes through
 * one of these — that way the audit_log table has a queryable, regular
 * structure for the medico-legal review and CDSCO reporting.
 *
 * All helpers are fire-and-forget; failures never block the consult.
 */
import { logEvent } from '../utils/auditLog';
import { KB_VERSION } from '../engine/index.js';

// ── Standardized event types (the only valid values for audit_log.type) ──
export const AUDIT_EVENT_TYPES = Object.freeze({
  // Auth
  AUTH_SIGNIN: 'auth.signin',
  AUTH_SIGNOUT: 'auth.signout',

  // Consult lifecycle
  CONSULT_START:    'consult.start',
  CONSULT_END:      'consult.end',
  CONSULT_FINALIZE: 'consult.finalize',
  CONSULT_REOPEN:   'consult.reopen',

  // Patient
  PATIENT_LOOKUP:   'patient.lookup',
  PATIENT_CREATE:   'patient.create',
  PATIENT_UPDATE:   'patient.update',

  // Engine actions
  ENGINE_INTAKE_ANALYZE: 'engine.intake.analyze',
  ENGINE_GAP_FILL:       'engine.gap.fill',
  ENGINE_LAB_UPDATE:     'engine.lab.update',
  ENGINE_EXAM_TOGGLE:    'engine.exam.toggle',
  ENGINE_DRUG_ADD:       'engine.drug.add',
  ENGINE_DRUG_REMOVE:    'engine.drug.remove',
  ENGINE_RESET:          'engine.reset',

  // AI calls (one-shot or streaming)
  AI_INTAKE_EXTRACT:  'ai.intake.extract',
  AI_LIVE_TRANSCRIBE: 'ai.live.transcribe',
  AI_REASONING:       'ai.reasoning',
  AI_CALL_ERROR:      'ai.call.error',
  AI_BUDGET_NEAR_CAP: 'ai.budget.near_cap',
  AI_BUDGET_BLOCKED:  'ai.budget.blocked',

  // Prescription / referral
  RX_DRAFT:    'rx.draft',
  RX_FINALIZE: 'rx.finalize',
  RX_DELIVER:  'rx.deliver',
  REFERRAL_DRAFT:    'referral.draft',
  REFERRAL_DELIVER:  'referral.deliver',

  // Consent
  CONSENT_RECORD:   'consent.record',
  CONSENT_WITHDRAW: 'consent.withdraw',

  // Critical-value / safety
  ALERT_CRITICAL_LAB:     'alert.critical_lab',
  ALERT_DRUG_INTERACTION: 'alert.drug_interaction',
  ALERT_PAEDIATRIC:       'alert.paediatric',
  ALERT_ALLERGY_CONFLICT: 'alert.allergy_conflict',
});

/**
 * Internal: enrich a payload with the standard envelope fields that should
 * appear on every audit event.
 */
function envelope(payload, opts = {}) {
  return {
    kb_version: KB_VERSION,
    consultation_id: opts.consultationId ?? null,
    org_id: opts.orgId ?? null,
    patient_id: opts.patientId ?? null,
    ...payload,
  };
}

// ── Consult lifecycle ────────────────────────────────────────────

export function auditConsultStart({ consultationId, orgId, patientId, modality }) {
  logEvent(AUDIT_EVENT_TYPES.CONSULT_START, envelope(
    { modality },
    { consultationId, orgId, patientId }
  ));
}

export function auditConsultFinalize({ consultationId, orgId, patientId, primaryDx, certainty }) {
  logEvent(AUDIT_EVENT_TYPES.CONSULT_FINALIZE, envelope(
    { primary_diagnosis: primaryDx, certainty_pct: certainty },
    { consultationId, orgId, patientId }
  ));
}

// ── AI call telemetry (mirrors ai_calls table; this audit row is for
// timeline reconstruction, the ai_calls row is for cost analytics) ──

export function auditAiCall({
  task,                  // 'ai.intake.extract' / 'ai.live.transcribe' / 'ai.reasoning'
  consultationId,
  orgId,
  modelProvider,         // 'gemini' | 'anthropic'
  modelVersion,          // e.g. 'gemini-2.5-flash' or 'claude-opus-4-7'
  tokensIn,
  tokensOut,
  costInr,
  latencyMs,
  success = true,
  errorMessage = null,
}) {
  const type = success ? task : AUDIT_EVENT_TYPES.AI_CALL_ERROR;
  logEvent(type, envelope(
    {
      task,
      provider: modelProvider,
      model_version: modelVersion,
      tokens_in: tokensIn ?? null,
      tokens_out: tokensOut ?? null,
      cost_inr: costInr ?? null,
      latency_ms: latencyMs ?? null,
      error_message: errorMessage,
    },
    { consultationId, orgId }
  ));
}

export function auditBudgetEvent({ orgId, type, todaySpendInr, capInr }) {
  logEvent(type, envelope(
    { today_spend_inr: todaySpendInr, cap_inr: capInr },
    { orgId }
  ));
}

// ── Prescription / referral ──────────────────────────────────────

export function auditRxFinalize({ consultationId, orgId, patientId, rxNumber, drugCount, deliveredVia }) {
  logEvent(AUDIT_EVENT_TYPES.RX_FINALIZE, envelope(
    { rx_number: rxNumber, drug_count: drugCount, delivered_via: deliveredVia || [] },
    { consultationId, orgId, patientId }
  ));
}

export function auditReferralDraft({ consultationId, orgId, patientId, specialistType, isUrgent }) {
  logEvent(AUDIT_EVENT_TYPES.REFERRAL_DRAFT, envelope(
    { specialist_type: specialistType, is_urgent: !!isUrgent },
    { consultationId, orgId, patientId }
  ));
}

// ── Critical-value / safety alerts the doctor saw ────────────────

export function auditCriticalLabAlert({ consultationId, orgId, patientId, ruleName, value, acknowledged }) {
  logEvent(AUDIT_EVENT_TYPES.ALERT_CRITICAL_LAB, envelope(
    { rule_name: ruleName, value, acknowledged: !!acknowledged },
    { consultationId, orgId, patientId }
  ));
}

export function auditDrugInteractionAlert({ consultationId, orgId, patientId, drugs, severity }) {
  logEvent(AUDIT_EVENT_TYPES.ALERT_DRUG_INTERACTION, envelope(
    { drugs, severity },
    { consultationId, orgId, patientId }
  ));
}

// ── Consent records ───────────────────────────────────────────────

export function auditConsentRecord({ patientId, consultConsent, aiAssistConsent, audioRetentionConsent, whatsappDeliveryConsent }) {
  logEvent(AUDIT_EVENT_TYPES.CONSENT_RECORD, envelope(
    {
      consult_consent: !!consultConsent,
      ai_assist_consent: !!aiAssistConsent,
      audio_retention_consent: !!audioRetentionConsent,
      whatsapp_delivery_consent: !!whatsappDeliveryConsent,
    },
    { patientId }
  ));
}
