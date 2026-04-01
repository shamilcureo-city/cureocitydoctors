import { describe, it, expect, vi } from 'vitest';

// Mock the db module before importing safety-net
vi.mock('../src/db/connection.js', () => ({
  db: vi.fn(),
}));

// Import after mock
import { runSafetyChecks } from '../src/services/safety-net.js';
import type { SafetyAlert } from '../src/services/safety-net.js';

function makeCtx(overrides: Record<string, unknown> = {}) {
  return {
    consultationId: '00000000-0000-0000-0000-000000000001',
    diagnoses: [],
    prescriptionDrugs: [],
    labOrders: [],
    vitals: undefined,
    patientAllergies: [],
    patientComorbidities: [],
    patientAge: 45,
    kbeRedFlags: [],
    kbeScoredConditions: [],
    ...overrides,
  };
}

describe('Safety Net Engine', () => {
  it('returns green all-clear when no issues', async () => {
    const alerts = await runSafetyChecks(makeCtx());
    expect(alerts.length).toBe(1);
    expect(alerts[0].signal).toBe('green');
    expect(alerts[0].category).toBe('guideline_adherence');
  });

  it('detects drug interactions', async () => {
    const alerts = await runSafetyChecks(makeCtx({
      prescriptionDrugs: ['Warfarin', 'Aspirin'],
    }));
    const drugAlerts = alerts.filter((a: SafetyAlert) => a.category === 'drug_interaction');
    expect(drugAlerts.length).toBeGreaterThanOrEqual(1);
    expect(drugAlerts[0].signal).toBe('red');
  });

  it('detects allergy conflicts', async () => {
    const alerts = await runSafetyChecks(makeCtx({
      prescriptionDrugs: ['Ibuprofen'],
      patientAllergies: ['NSAIDs'],
    }));
    const allergyAlerts = alerts.filter((a: SafetyAlert) =>
      a.message.includes('ALLERGY ALERT'),
    );
    expect(allergyAlerts.length).toBe(1);
    expect(allergyAlerts[0].signal).toBe('red');
  });

  it('detects missed diagnoses from KBE', async () => {
    const alerts = await runSafetyChecks(makeCtx({
      diagnoses: [{ condition_name: 'Typhoid Fever', tier: 't1' }],
      kbeScoredConditions: [
        { name: 'Typhoid Fever', tier: 't1', certaintyScore: 70 },
        { name: 'Dengue Fever', tier: 't1', certaintyScore: 55 },
      ],
    }));
    const missed = alerts.filter((a: SafetyAlert) => a.category === 'missed_diagnosis');
    expect(missed.length).toBe(1);
    expect(missed[0].message).toContain('Dengue Fever');
    expect(missed[0].signal).toBe('yellow');
  });

  it('detects missing investigations for dengue', async () => {
    const alerts = await runSafetyChecks(makeCtx({
      diagnoses: [{ condition_name: 'Dengue Fever' }],
      labOrders: ['CBC'],
    }));
    const missing = alerts.filter((a: SafetyAlert) => a.category === 'missing_investigation');
    expect(missing.length).toBe(1);
    expect(missing[0].message).toContain('dengue NS1');
  });

  it('detects red flag KBE alerts', async () => {
    const alerts = await runSafetyChecks(makeCtx({
      kbeRedFlags: ['Bleeding tendency'],
    }));
    const redFlags = alerts.filter((a: SafetyAlert) =>
      a.category === 'red_flag' && a.message.includes('Bleeding tendency'),
    );
    expect(redFlags.length).toBe(1);
    expect(redFlags[0].signal).toBe('red');
  });

  it('detects hypertensive crisis from vitals', async () => {
    const alerts = await runSafetyChecks(makeCtx({
      vitals: { bp_systolic: 190, bp_diastolic: 125 },
    }));
    const vitalAlerts = alerts.filter((a: SafetyAlert) =>
      a.message.includes('Hypertensive crisis'),
    );
    expect(vitalAlerts.length).toBe(1);
    expect(vitalAlerts[0].signal).toBe('red');
  });

  it('detects low SpO2', async () => {
    const alerts = await runSafetyChecks(makeCtx({
      vitals: { spo2: 88 },
    }));
    const spo2Alerts = alerts.filter((a: SafetyAlert) =>
      a.message.includes('SpO2'),
    );
    expect(spo2Alerts.length).toBe(1);
    expect(spo2Alerts[0].signal).toBe('red');
  });

  it('detects NSAID in dengue (guideline)', async () => {
    const alerts = await runSafetyChecks(makeCtx({
      diagnoses: [{ condition_name: 'Dengue Fever' }],
      prescriptionDrugs: ['Ibuprofen'],
      labOrders: ['CBC', 'dengue NS1', 'dengue IgM', 'dengue IgG'],
    }));
    const guidelineAlerts = alerts.filter((a: SafetyAlert) =>
      a.message.includes('NSAID') && a.message.includes('dengue'),
    );
    expect(guidelineAlerts.length).toBe(1);
    expect(guidelineAlerts[0].signal).toBe('red');
  });

  it('detects steroid without PPI cover', async () => {
    const alerts = await runSafetyChecks(makeCtx({
      prescriptionDrugs: ['Prednisolone'],
    }));
    const ppiAlerts = alerts.filter((a: SafetyAlert) =>
      a.message.includes('PPI'),
    );
    expect(ppiAlerts.length).toBe(1);
    expect(ppiAlerts[0].signal).toBe('yellow');
  });

  it('detects NSAID in CKD patient', async () => {
    const alerts = await runSafetyChecks(makeCtx({
      prescriptionDrugs: ['Diclofenac'],
      patientComorbidities: ['CKD Stage 3'],
    }));
    const ckdAlerts = alerts.filter((a: SafetyAlert) =>
      a.message.includes('renal disease'),
    );
    expect(ckdAlerts.length).toBe(1);
    expect(ckdAlerts[0].signal).toBe('red');
  });
});
