import { useCallback, useEffect, useRef, useState } from 'react';
import { EngineCore, processIntake, updateLab as engineUpdateLab, S } from '../engine/cureocityEngine';
import { logEvent } from '../utils/auditLog';
import { appendCaseEvent, ensureActiveCase, getActiveCaseId } from '../lib/casePersistence';
import { extractIntake, logAiCall, USE_GEMINI } from '../lib/aiClient';

const RESCORE_DEBOUNCE_MS = 700;

// Build the corpus the engine consumes from a Gemini extraction. Concatenating
// normalized_hpi + verbatim red-flag phrases + comorbidities + meds gives the
// regex-based detectors the strongest signal — normalized_hpi alone can lose
// emergency phrasing the doctor used.
function corpusFromExtraction(extracted) {
  const parts = [extracted.normalized_hpi || ''];
  if (extracted.red_flag_phrases?.length) parts.push(extracted.red_flag_phrases.join('. '));
  if (extracted.comorbidities?.length) parts.push('Comorbidities: ' + extracted.comorbidities.join(', '));
  if (extracted.medications?.length) parts.push('Current medications: ' + extracted.medications.join(', '));
  return parts.filter(Boolean).join('\n');
}

export function useEngine(doctorId = null) {
  const [engineState, setEngineState] = useState({
    activeSystems: {},
    redFlags: [],
    differentials: { t1: [], t2: [], t3: [] },
    missingData: [],
    certainty: 0,
    rawInput: '',
    examFindings: {},
    activeExamFindings: {},
    systemsConfig: {},
    drugs: [],
    interactions: [],
    labs: {},
    scored: [],
    nextSteps: [],
  });

  const caseIdRef = useRef(getActiveCaseId());

  useEffect(() => {
    let cancelled = false;
    ensureActiveCase(doctorId).then((id) => {
      if (!cancelled) caseIdRef.current = id;
    });
    return () => { cancelled = true; };
  }, [doctorId]);

  const record = useCallback((type, payload) => {
    logEvent(type, payload);
    if (caseIdRef.current) {
      appendCaseEvent({ caseId: caseIdRef.current, doctorId, type, payload });
    }
  }, [doctorId]);

  const [extraction, setExtraction] = useState(null);
  const [extractionError, setExtractionError] = useState(null);

  // Slice 1 — patient/vitals/allergies state. Engine still owns the truth;
  // React mirrors it. Mutations from outside React (Gemini extraction) push
  // back into these setters explicitly.
  const [patient, setPatientState]   = useState(() => EngineCore.getPatient());
  const [vitals,  setVitalsState]    = useState(() => EngineCore.getVitals());
  const [allergies, setAllergiesState] = useState(() => EngineCore.getAllergies());

  const syncState = () => {
    setEngineState({
      activeSystems: { ...S.activeSystems },
      redFlags: [...S.redFlags],
      differentials: {
        t1: [...S.differential.t1],
        t2: [...S.differential.t2],
        t3: [...S.differential.t3],
      },
      missingData: [...S.gaps],
      certainty: S.certainty || 0,
      rawInput: S.rawInput,
      examFindings: { ...S.examFindings },
      activeExamFindings: { ...S.activeExamFindings },
      systemsConfig: EngineCore.getSystemsConfig(),
      drugs: [...S.drugs],
      interactions: [...(S.interactions || [])],
      labs: { ...S.labs },
      scored: [...(S.scored || [])],
      nextSteps: [...(S.nextSteps || [])],
    });
  };

  const analyzeNarrative = useCallback(async (input) => {
    // Accept either a string (legacy text path) or { text, audio } (voice path).
    const { text = '', audio = null } = typeof input === 'string' ? { text: input } : (input || {});
    setExtractionError(null);

    if (USE_GEMINI && (text || audio)) {
      try {
        const extracted = await extractIntake({ text, audio });
        setExtraction(extracted);

        // Hand structured demographics + comorbidities to the engine state so
        // age/sex-aware scoring (e.g. ACS in a 62yo M) and pregnancy filters work.
        // Treat Gemini as a suggestion: only overwrite when it has a confident
        // value, never clobber user-entered values with empty/unknown.
        const exAge = extracted.demographics?.age;
        const exSex = extracted.demographics?.sex;
        const exCm  = extracted.comorbidities;
        if (typeof exAge === 'number' && exAge > 0) S.patient.age = exAge;
        if (exSex === 'M' || exSex === 'F') S.patient.gender = exSex;
        if (Array.isArray(exCm) && exCm.length > 0) S.patient.comorbid = exCm.join(', ');
        // Mirror into React state so the patient details form reflects what
        // Gemini extracted. (Avoids the antipattern of syncing via useEffect.)
        setPatientState({ ...S.patient });

        const corpus = corpusFromExtraction(extracted);
        EngineCore.setRawInput(corpus);
        processIntake();

        record('intake.analyze', {
          length: text.length,
          inputModality: extracted._meta?.inputModality || (audio ? 'audio' : 'text'),
          provider: 'gemini',
          model: extracted._meta?.model,
          confidence: extracted.confidence,
          tokensIn: extracted._meta?.tokensIn,
          tokensOut: extracted._meta?.tokensOut,
          costInr: extracted._meta?.costInr,
          latencyMs: extracted._meta?.latencyMs,
        });

        logAiCall({
          caseId: caseIdRef.current,
          doctorId,
          task: 'intake.extract',
          meta: extracted._meta,
        });

        syncState();
        return true;
      } catch (err) {
        const msg = err?.message || 'Extraction failed';
        setExtractionError(msg);
        record('intake.analyze.error', { provider: 'gemini', message: msg });
        logAiCall({
          caseId: caseIdRef.current,
          doctorId,
          task: 'intake.extract',
          meta: { provider: 'gemini' },
          error: msg,
        });
        // Fall through to the deterministic regex pipeline so the doctor is
        // never blocked by an LLM outage.
      }
    }

    // Regex fallback only handles text. If we got audio with no transcript
    // (Gemini failed before transcribing), the doctor needs to retype.
    if (!text) {
      const msg = 'Voice intake requires Gemini. Please type the narrative or try again.';
      setExtractionError(msg);
      record('intake.analyze.error', { provider: 'regex', message: msg });
      return false;
    }

    try {
      EngineCore.setRawInput(text);
      processIntake();
      record('intake.analyze', { length: text.length, provider: 'regex' });
      syncState();
      return true;
    } catch (err) {
      record('intake.analyze.error', { provider: 'regex', message: err?.message });
      console.error('Engine failed to process narrative:', err);
      return false;
    }
  }, [record, doctorId]);

  const handleFillGap = useCallback((key, value) => {
    try {
      EngineCore.fillGap(key, value);
      record('gap.fill', { key, hasValue: !!value });
      syncState();
      return true;
    } catch (err) {
      record('gap.fill.error', { key, message: err?.message });
      console.error('Engine failed to fill gap:', err);
      return false;
    }
  }, [record]);

  const handleToggleExamFinding = useCallback((sysId, term) => {
    try {
      EngineCore.toggleExamFinding(sysId, term);
      record('exam.toggleFinding', { sysId, term });
      syncState();
      return true;
    } catch (err) {
      record('exam.toggleFinding.error', { sysId, term, message: err?.message });
      console.error('Engine failed to toggle exam finding:', err);
      return false;
    }
  }, [record]);

  const handleFillExamVital = useCallback((sysId, key, value) => {
    try {
      EngineCore.fillExam(sysId, key, value);
      record('exam.fillVital', { sysId, key, hasValue: !!value });
      syncState();
      return true;
    } catch (err) {
      record('exam.fillVital.error', { sysId, key, message: err?.message });
      console.error('Engine failed to fill exam vital:', err);
      return false;
    }
  }, [record]);

  const handleUpdateLab = useCallback((key, value) => {
    try {
      engineUpdateLab(key, value);
      record('lab.update', { key, hasValue: !!value });
      syncState();
      // Engine debounces re-scoring; sync again after debounce so differentials reflect the lab
      setTimeout(syncState, RESCORE_DEBOUNCE_MS);
      return true;
    } catch (err) {
      record('lab.update.error', { key, message: err?.message });
      console.error('Engine failed to update lab:', err);
      return false;
    }
  }, [record]);

  const handleAddDrug = useCallback((name, dose, duration) => {
    try {
      EngineCore.addDrugDirect(name, dose, duration);
      const added = S.drugs[S.drugs.length - 1];
      if (added && !added.id) {
        added.id = (crypto.randomUUID && crypto.randomUUID()) || `d_${Date.now()}_${Math.random().toString(36).slice(2)}`;
      }
      record('drug.add', { name, hasDose: !!dose, hasDuration: !!duration });
      syncState();
      return true;
    } catch (err) {
      record('drug.add.error', { name, message: err?.message });
      console.error('Engine failed to add drug:', err);
      return false;
    }
  }, [record]);

  const handleRemoveDrug = useCallback((index) => {
    try {
      EngineCore.removeDrug(index);
      record('drug.remove', { index });
      syncState();
      return true;
    } catch (err) {
      record('drug.remove.error', { index, message: err?.message });
      console.error('Engine failed to remove drug:', err);
      return false;
    }
  }, [record]);

  // ── Slice 1: setters that mirror engine mutations into React state ──
  const setPatientField = useCallback((field, value) => {
    EngineCore.setPatient({ [field]: value });
    setPatientState(EngineCore.getPatient());
    record('patient.update', { field, hasValue: !!value });
  }, [record]);

  const setVital = useCallback((key, value) => {
    EngineCore.setVital(key, value);
    setVitalsState({ ...EngineCore.getVitals() });
    record('vital.update', { key, hasValue: !!value });
  }, [record]);

  const clearVital = useCallback((key) => {
    EngineCore.clearVital(key);
    setVitalsState({ ...EngineCore.getVitals() });
  }, []);

  const addAllergyEntry = useCallback((allergen, reaction, severity) => {
    EngineCore.addAllergy(allergen, reaction, severity);
    setAllergiesState([...EngineCore.getAllergies()]);
    record('allergy.add', { allergen, severity });
  }, [record]);

  const removeAllergyEntry = useCallback((idx) => {
    EngineCore.removeAllergy(idx);
    setAllergiesState([...EngineCore.getAllergies()]);
    record('allergy.remove', { idx });
  }, [record]);

  const allergyConflicts = EngineCore.getAllergyConflicts();

  return {
    engineState,
    extraction,
    extractionError,
    analyzeNarrative,
    handleFillGap,
    handleToggleExamFinding,
    handleFillExamVital,
    handleUpdateLab,
    handleAddDrug,
    handleRemoveDrug,
    getLabDefs: EngineCore.getLabDefs,
    getLabStatus: EngineCore.getLabStatus,
    // Slice 1
    patient, setPatientField,
    vitals, setVital, clearVital,
    allergies, addAllergy: addAllergyEntry, removeAllergy: removeAllergyEntry, allergyConflicts,
  };
}
