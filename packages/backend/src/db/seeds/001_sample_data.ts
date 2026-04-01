import type { Knex } from 'knex';

// ── Hardcoded UUIDs for predictable seed data ───────────────────────────────
const CLINIC_1   = 'c0000000-0000-0000-0000-000000000001';
const DOCTOR_1   = 'd0000000-0000-0000-0000-000000000001';

const PATIENT_1  = 'p0000000-0000-0000-0000-000000000001';
const PATIENT_2  = 'p0000000-0000-0000-0000-000000000002';
const PATIENT_3  = 'p0000000-0000-0000-0000-000000000003';
const PATIENT_4  = 'p0000000-0000-0000-0000-000000000004';
const PATIENT_5  = 'p0000000-0000-0000-0000-000000000005';

const CONSULT_1  = 'a0000000-0000-0000-0000-000000000001';
const CONSULT_2  = 'a0000000-0000-0000-0000-000000000002';
const CONSULT_3  = 'a0000000-0000-0000-0000-000000000003';

const VITALS_1   = 'v0000000-0000-0000-0000-000000000001';
const VITALS_2   = 'v0000000-0000-0000-0000-000000000002';
const VITALS_3   = 'v0000000-0000-0000-0000-000000000003';

const DIAG_1     = 'x0000000-0000-0000-0000-000000000001';
const DIAG_3     = 'x0000000-0000-0000-0000-000000000003';

const PRESC_1    = 'r0000000-0000-0000-0000-000000000001';
const PRESC_3    = 'r0000000-0000-0000-0000-000000000003';

const LAB_1A     = 'l0000000-0000-0000-0000-000000000001';
const LAB_1B     = 'l0000000-0000-0000-0000-000000000002';
const LAB_1C     = 'l0000000-0000-0000-0000-000000000003';
const LAB_3A     = 'l0000000-0000-0000-0000-000000000004';
const LAB_3B     = 'l0000000-0000-0000-0000-000000000005';
const LAB_3C     = 'l0000000-0000-0000-0000-000000000006';
const LAB_3D     = 'l0000000-0000-0000-0000-000000000007';

const SAFETY_3   = 's0000000-0000-0000-0000-000000000001';

export async function seed(knex: Knex): Promise<void> {
  // ── Clear tables in reverse FK order ────────────────────────────────────
  await knex('follow_ups').del();
  await knex('gap_questions').del();
  await knex('safety_net_alerts').del();
  await knex('vitals').del();
  await knex('lab_results').del();
  await knex('lab_orders').del();
  await knex('prescriptions').del();
  await knex('diagnoses').del();
  await knex('consultations').del();
  await knex('patients').del();
  await knex('doctors').del();
  await knex('clinics').del();
  await knex('refresh_tokens').del();
  await knex('otp_codes').del();
  await knex('audit_logs').del();

  // ── 1. Clinic ──────────────────────────────────────────────────────────
  await knex('clinics').insert({
    id: CLINIC_1,
    name: 'Cureocity Demo Clinic',
    address: 'MG Road, Ernakulam',
    city: 'Kochi',
    state: 'Kerala',
    type: 'gp',
  });

  // ── 2. Doctor ──────────────────────────────────────────────────────────
  await knex('doctors').insert({
    id: DOCTOR_1,
    name: 'Dr. Priya Nair',
    phone: '+919876543210',
    specialization: 'General Medicine',
    registration_number: 'KMC-12345',
    clinic_id: CLINIC_1,
    subscription_tier: 'professional',
    preferences: JSON.stringify({}),
  });

  // ── 3. Patients ────────────────────────────────────────────────────────
  await knex('patients').insert([
    {
      id: PATIENT_1,
      name: 'Rajesh Kumar',
      age: 45,
      gender: 'male',
      phone: '+919000000001',
      blood_group: 'B+',
      allergies: JSON.stringify(['Penicillin']),
      comorbidities: JSON.stringify(['Type 2 Diabetes', 'Hypertension']),
      doctor_id: DOCTOR_1,
    },
    {
      id: PATIENT_2,
      name: 'Meera Sharma',
      age: 28,
      gender: 'female',
      phone: '+919000000002',
      blood_group: 'O+',
      allergies: JSON.stringify([]),
      comorbidities: JSON.stringify([]),
      doctor_id: DOCTOR_1,
    },
    {
      id: PATIENT_3,
      name: 'Thomas Joseph',
      age: 62,
      gender: 'male',
      phone: '+919000000003',
      blood_group: 'A-',
      allergies: JSON.stringify(['NSAIDs']),
      comorbidities: JSON.stringify(['COPD', 'Chronic Liver Disease']),
      doctor_id: DOCTOR_1,
    },
    {
      id: PATIENT_4,
      name: 'Fatima Hassan',
      age: 35,
      gender: 'female',
      phone: '+919000000004',
      blood_group: 'AB+',
      allergies: JSON.stringify([]),
      comorbidities: JSON.stringify(['Asthma']),
      doctor_id: DOCTOR_1,
    },
    {
      id: PATIENT_5,
      name: 'Arun Nambiar',
      age: 8,
      gender: 'male',
      phone: '+919000000005',
      blood_group: 'O+',
      allergies: JSON.stringify([]),
      comorbidities: JSON.stringify([]),
      doctor_id: DOCTOR_1,
    },
  ]);

  // ── 4. Consultations ───────────────────────────────────────────────────
  const now = new Date();
  const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
  const twoDaysAgo = new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000);
  const twoDaysAgoEnd = new Date(twoDaysAgo.getTime() + 30 * 60 * 1000);

  await knex('consultations').insert([
    {
      id: CONSULT_1,
      patient_id: PATIENT_1,
      doctor_id: DOCTOR_1,
      mode: 'standard',
      status: 'signed',
      started_at: twoDaysAgo.toISOString(),
      ended_at: twoDaysAgoEnd.toISOString(),
      consultation_data: JSON.stringify({}),
    },
    {
      id: CONSULT_2,
      patient_id: PATIENT_2,
      doctor_id: DOCTOR_1,
      mode: 'quick',
      status: 'active',
      started_at: oneHourAgo.toISOString(),
      consultation_data: JSON.stringify({}),
    },
    {
      id: CONSULT_3,
      patient_id: PATIENT_3,
      doctor_id: DOCTOR_1,
      mode: 'comprehensive',
      status: 'signed',
      started_at: twoDaysAgo.toISOString(),
      ended_at: twoDaysAgoEnd.toISOString(),
      consultation_data: JSON.stringify({}),
    },
  ]);

  // ── 5. Vitals ──────────────────────────────────────────────────────────
  await knex('vitals').insert([
    {
      id: VITALS_1,
      consultation_id: CONSULT_1,
      bp_systolic: 140,
      bp_diastolic: 90,
      pulse: 88,
      temperature: 39.2,
      spo2: 97,
      weight: 78,
      height: 172,
      bmi: 26.4,
    },
    {
      id: VITALS_2,
      consultation_id: CONSULT_2,
      bp_systolic: 110,
      bp_diastolic: 70,
      pulse: 72,
      temperature: 36.8,
      spo2: 99,
    },
    {
      id: VITALS_3,
      consultation_id: CONSULT_3,
      bp_systolic: 150,
      bp_diastolic: 95,
      pulse: 92,
      temperature: 38.8,
      spo2: 94,
      weight: 70,
      height: 168,
      bmi: 24.8,
    },
  ]);

  // ── 6. Diagnoses ───────────────────────────────────────────────────────
  await knex('diagnoses').insert([
    {
      id: DIAG_1,
      consultation_id: CONSULT_1,
      condition_name: 'Dengue Fever',
      icd10_code: 'A90',
      tier: 't1',
      kbe_score: 72.5,
      is_primary: true,
      doctor_confirmed: true,
    },
    {
      id: DIAG_3,
      consultation_id: CONSULT_3,
      condition_name: 'Leptospirosis',
      icd10_code: 'A27.9',
      tier: 't1',
      kbe_score: 78.0,
      is_primary: true,
      doctor_confirmed: true,
    },
  ]);

  // ── 7. Prescriptions ──────────────────────────────────────────────────
  await knex('prescriptions').insert([
    {
      id: PRESC_1,
      consultation_id: CONSULT_1,
      status: 'signed',
      signed_at: twoDaysAgoEnd.toISOString(),
      drugs: JSON.stringify([
        {
          name: 'Paracetamol',
          dose: '650mg',
          frequency: '1-1-1',
          route: 'Tab.',
          duration: '5 days',
          instructions: 'After food',
        },
        {
          name: 'ORS',
          dose: '1 sachet',
          frequency: '1-1-1',
          route: 'Syr.',
          duration: '5 days',
          instructions: 'Dissolve in 1L water',
        },
      ]),
      safety_check_result: JSON.stringify(null),
    },
    {
      id: PRESC_3,
      consultation_id: CONSULT_3,
      status: 'signed',
      signed_at: twoDaysAgoEnd.toISOString(),
      drugs: JSON.stringify([
        {
          name: 'Doxycycline',
          dose: '100mg',
          frequency: '1-0-1',
          route: 'Cap.',
          duration: '7 days',
          instructions: 'After food, avoid sun exposure',
        },
      ]),
      safety_check_result: JSON.stringify(null),
    },
  ]);

  // ── 8. Lab Orders ─────────────────────────────────────────────────────
  await knex('lab_orders').insert([
    { id: LAB_1A, consultation_id: CONSULT_1, test_name: 'CBC', urgency: 'urgent' },
    { id: LAB_1B, consultation_id: CONSULT_1, test_name: 'Dengue NS1 Antigen', urgency: 'urgent' },
    { id: LAB_1C, consultation_id: CONSULT_1, test_name: 'LFT', urgency: 'routine' },
    { id: LAB_3A, consultation_id: CONSULT_3, test_name: 'Leptospira IgM', urgency: 'urgent' },
    { id: LAB_3B, consultation_id: CONSULT_3, test_name: 'CBC', urgency: 'urgent' },
    { id: LAB_3C, consultation_id: CONSULT_3, test_name: 'RFT', urgency: 'urgent' },
    { id: LAB_3D, consultation_id: CONSULT_3, test_name: 'LFT', urgency: 'urgent' },
  ]);

  // ── 9. Safety Net Alerts ───────────────────────────────────────────────
  await knex('safety_net_alerts').insert({
    id: SAFETY_3,
    consultation_id: CONSULT_3,
    signal: 'yellow',
    category: 'missing_investigation',
    message:
      'Consider blood culture to rule out concurrent typhoid given overlapping endemic exposure',
    evidence: JSON.stringify({ suggested_test: 'Blood Culture' }),
  });
}
