import { useCallback, useState } from 'react';
import {
  openConsultation,
  finalizeConsultation,
  recordConsent,
} from '../lib/db';
import { KB_VERSION, getSessionSnapshot } from '../engine/index.js';
import { auditConsultStart, auditConsultFinalize, auditConsentRecord } from '../lib/audit';
import { reportError } from '../lib/errorReporting';

/**
 * useConsultation — owns the consultation lifecycle.
 *
 * The flow:
 *   1. Patient identified (PatientStartCard)
 *   2. Doctor confirms patient consent (live consult banner OR type mode click)
 *      → recordConsent() writes consent_records row, returns consent_record_id
 *   3. openConsultation() with consent_record_id, kb_version stamped, modality
 *      → returns the consultation row that becomes the audit anchor for this case
 *   4. (during consult) audit log + ai_calls reference consultation_id
 *   5. finalizeConsultation() at the end stamps primary diagnosis +
 *      certainty + engine_snapshot for replay
 *
 * Returns:
 *   {
 *     consultation,       // current consultation row, or null
 *     consent,            // current consent record, or null
 *     status,             // 'idle' | 'starting' | 'open' | 'finalizing' | 'finalized' | 'error'
 *     error,
 *     start({ orgId, patientId, doctorId, modality, consents }),
 *     finalize({ primaryDiagnosis, certainty }),
 *     reset(),
 *   }
 */
export function useConsultation() {
  const [consultation, setConsultation] = useState(null);
  const [consent, setConsent] = useState(null);
  const [status, setStatus] = useState('idle');
  const [error, setError] = useState(null);

  const start = useCallback(async ({
    orgId,
    patientId,
    doctorId,
    modality = 'in_person',
    consents,
  }) => {
    if (!orgId || !patientId || !doctorId) {
      const e = new Error('orgId, patientId, doctorId all required to open consultation');
      setError(e);
      setStatus('error');
      throw e;
    }
    setStatus('starting');
    setError(null);
    try {
      // 1. Capture consent FIRST. The consultation references it.
      const consentRow = await recordConsent({
        patientId,
        consultConsent: consents?.consult ?? true,
        aiAssistConsent: consents?.aiAssist ?? true,
        audioRetentionConsent: consents?.audioRetention ?? false,
        whatsappDeliveryConsent: consents?.whatsappDelivery ?? false,
      });
      setConsent(consentRow);
      auditConsentRecord({
        patientId,
        consultConsent: consentRow.consult_consent,
        aiAssistConsent: consentRow.ai_assist_consent,
        audioRetentionConsent: consentRow.audio_retention_consent,
        whatsappDeliveryConsent: consentRow.whatsapp_delivery_consent,
      });

      // 2. Open the consultation. kb_version comes from the engine module
      //    so every saved row references the exact KB content used.
      const consult = await openConsultation({
        orgId,
        patientId,
        doctorId,
        kbVersion: KB_VERSION,
        modality,
        consentRecordId: consentRow.id,
        audioRetentionConsented: consentRow.audio_retention_consent,
      });
      setConsultation(consult);
      setStatus('open');

      auditConsultStart({
        consultationId: consult.id,
        orgId,
        patientId,
        modality,
      });

      return consult;
    } catch (e) {
      reportError(e, { stage: 'open' }, { tags: { area: 'consult.lifecycle', op: 'open' } });
      setError(e);
      setStatus('error');
      throw e;
    }
  }, []);

  const finalize = useCallback(async ({ primaryDiagnosisIcd10, primaryDiagnosisName, certaintyPct } = {}) => {
    if (!consultation) return null;
    setStatus('finalizing');
    setError(null);
    try {
      const snapshot = getSessionSnapshot();
      const updated = await finalizeConsultation(consultation.id, {
        primaryDiagnosisIcd10: primaryDiagnosisIcd10 ?? null,
        primaryDiagnosisName: primaryDiagnosisName ?? null,
        certaintyPct: certaintyPct ?? null,
        engineSnapshot: snapshot,
      });
      setConsultation(updated);
      setStatus('finalized');

      auditConsultFinalize({
        consultationId: updated.id,
        orgId: updated.org_id,
        patientId: updated.patient_id,
        primaryDx: primaryDiagnosisName,
        certainty: certaintyPct,
      });

      return updated;
    } catch (e) {
      reportError(e, { stage: 'finalize', consultationId: consultation.id }, {
        tags: { area: 'consult.lifecycle', op: 'finalize' },
      });
      setError(e);
      setStatus('error');
      throw e;
    }
  }, [consultation]);

  const reset = useCallback(() => {
    setConsultation(null);
    setConsent(null);
    setStatus('idle');
    setError(null);
  }, []);

  return {
    consultation,
    consent,
    status,
    error,
    start,
    finalize,
    reset,
  };
}
