import { useCallback, useEffect, useRef, useState } from 'react';
import { EngineCore, processIntake, updateLab as engineUpdateLab, S } from '../engine/cureocityEngine';
import { logEvent } from '../utils/auditLog';
import { appendCaseEvent, ensureActiveCase, getActiveCaseId } from '../lib/casePersistence';

const RESCORE_DEBOUNCE_MS = 700;

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

  const analyzeNarrative = useCallback((text) => {
    try {
      EngineCore.setRawInput(text);
      processIntake();
      record('intake.analyze', { length: text.length });
      syncState();
      return true;
    } catch (err) {
      record('intake.analyze.error', { message: err?.message });
      console.error('Engine failed to process narrative:', err);
      return false;
    }
  }, [record]);

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

  return {
    engineState,
    analyzeNarrative,
    handleFillGap,
    handleToggleExamFinding,
    handleFillExamVital,
    handleUpdateLab,
    handleAddDrug,
    handleRemoveDrug,
    getLabDefs: EngineCore.getLabDefs,
    getLabStatus: EngineCore.getLabStatus,
  };
}
