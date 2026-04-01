import { describe, it, expect } from 'vitest';
import { checkDrugInteractions, checkAllergyConflicts } from '../src/services/drug-interactions.js';

describe('Drug Interaction Checks', () => {
  it('detects major warfarin + aspirin interaction', () => {
    const interactions = checkDrugInteractions(['Warfarin', 'Aspirin']);
    expect(interactions.length).toBeGreaterThanOrEqual(1);
    const warfarinAspirin = interactions.find(
      (i) => i.description.toLowerCase().includes('bleeding'),
    );
    expect(warfarinAspirin).toBeDefined();
    expect(warfarinAspirin!.severity).toBe('major');
  });

  it('detects clopidogrel + omeprazole interaction', () => {
    const interactions = checkDrugInteractions(['Clopidogrel', 'Omeprazole']);
    expect(interactions.length).toBeGreaterThanOrEqual(1);
    expect(interactions[0].severity).toBe('major');
    expect(interactions[0].description.toLowerCase()).toContain('antiplatelet');
  });

  it('detects NSAID class interactions via ibuprofen', () => {
    const interactions = checkDrugInteractions(['Ibuprofen', 'Warfarin']);
    expect(interactions.length).toBeGreaterThanOrEqual(1);
    const nsaidWarfarin = interactions.find(
      (i) => i.description.toLowerCase().includes('bleeding'),
    );
    expect(nsaidWarfarin).toBeDefined();
  });

  it('detects moderate amlodipine + simvastatin interaction', () => {
    const interactions = checkDrugInteractions(['Amlodipine', 'Simvastatin']);
    expect(interactions.length).toBe(1);
    expect(interactions[0].severity).toBe('moderate');
  });

  it('returns empty for non-interacting drugs', () => {
    const interactions = checkDrugInteractions(['Paracetamol', 'Amoxicillin']);
    expect(interactions.length).toBe(0);
  });

  it('handles single drug with no interactions', () => {
    const interactions = checkDrugInteractions(['Metformin']);
    expect(interactions.length).toBe(0);
  });

  it('handles empty drug list', () => {
    const interactions = checkDrugInteractions([]);
    expect(interactions.length).toBe(0);
  });

  it('detects multiple interactions in a multi-drug prescription', () => {
    const interactions = checkDrugInteractions([
      'Warfarin', 'Aspirin', 'Ibuprofen', 'Fluconazole',
    ]);
    // Should find warfarin+aspirin, warfarin+NSAID(ibuprofen), fluconazole+warfarin, aspirin+ibuprofen
    expect(interactions.length).toBeGreaterThanOrEqual(3);
  });

  it('normalises drug names (strips Tab., Cap. etc)', () => {
    const interactions = checkDrugInteractions(['Tab. Warfarin', 'Cap. Aspirin']);
    expect(interactions.length).toBeGreaterThanOrEqual(1);
  });
});

describe('Allergy Conflict Checks', () => {
  it('detects direct allergy match', () => {
    const conflicts = checkAllergyConflicts(['Penicillin'], ['penicillin']);
    expect(conflicts.length).toBe(1);
    expect(conflicts[0].drug).toBe('Penicillin');
  });

  it('detects NSAID class allergy', () => {
    const conflicts = checkAllergyConflicts(['Ibuprofen', 'Paracetamol'], ['NSAIDs']);
    expect(conflicts.length).toBe(1);
    expect(conflicts[0].drug).toBe('Ibuprofen');
  });

  it('returns empty when no allergy conflict', () => {
    const conflicts = checkAllergyConflicts(['Paracetamol'], ['penicillin']);
    expect(conflicts.length).toBe(0);
  });

  it('handles empty inputs', () => {
    expect(checkAllergyConflicts([], ['penicillin']).length).toBe(0);
    expect(checkAllergyConflicts(['Amoxicillin'], []).length).toBe(0);
  });
});
