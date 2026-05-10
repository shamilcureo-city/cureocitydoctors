/**
 * Database access layer barrel.
 * One import surface for components/hooks. RLS-gated; no service role.
 */
export {
  getMyOrgs,
  getActiveOrg,
  updateOrg,
} from './orgs';

export {
  normalisePhone,
  findPatientByPhone,
  getOrCreatePatient,
  updatePatient,
  getPatientTimeline,
} from './patients';

export {
  openConsultation,
  appendConsultationEvent,
  finalizeConsultation,
  getConsultation,
} from './consultations';

export {
  recordConsent,
  withdrawConsent,
  getConsentHistoryForPatient,
} from './consent';
