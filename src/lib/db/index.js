/**
 * Database access layer barrel.
 * One import surface for components/hooks. RLS-gated; no service role.
 */
export {
  getMyOrgs,
  getActiveOrg,
  updateOrg,
  ensureUserBootstrapped,
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

export {
  savePrescription,
  markPrescriptionDelivered,
  saveReferral,
  generateRxNumber,
} from './prescriptions';

export {
  reportClinicalConcern,
  CONCERN_CATEGORIES,
  CONCERN_SEVERITIES,
} from './concerns';
