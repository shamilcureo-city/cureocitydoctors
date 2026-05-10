/**
 * Clinical concern reporting — pilot post-market surveillance.
 *
 * The doctor files a structured concern when the AI gets something
 * wrong (missed red flag, hallucinated finding, wrong drug suggestion,
 * etc.). The clinical advisor triages weekly. CDSCO requires a
 * documented post-market surveillance process; this is ours.
 */
import { supabase, supabaseConfigured } from '../supabaseClient';
import { reportError } from '../errorReporting';

export const CONCERN_CATEGORIES = [
  { id: 'missed_red_flag',         label: 'Missed a red flag',                hint: 'AI did not surface an emergency presentation' },
  { id: 'inappropriate_drug',      label: 'Inappropriate drug suggestion',     hint: 'KB recommended something contraindicated for this patient' },
  { id: 'wrong_differential',      label: 'Wrong differential ranking',         hint: 'Top differential is unlikely given the case' },
  { id: 'hallucinated_finding',    label: 'Hallucinated finding',               hint: 'AI claimed a finding that was never said' },
  { id: 'transcription_error',     label: 'Transcription error',                hint: 'Live transcription was wrong in a clinically relevant way' },
  { id: 'timing_grid_wrong',       label: 'Timing grid (1-0-1 etc) wrong',      hint: 'Indian dosing format mapped incorrectly' },
  { id: 'paediatric_safety',       label: 'Paediatric safety issue',            hint: 'Adult dose shown for child / weight-based dosing missed' },
  { id: 'allergy_conflict_missed', label: 'Allergy conflict missed',            hint: 'AI suggested a drug despite documented allergy' },
  { id: 'cost_or_brand_wrong',     label: 'Cost / brand information wrong',     hint: 'Jan Aushadhi flag wrong, or brand name incorrect' },
  { id: 'other',                   label: 'Other',                              hint: 'Anything else — describe in the notes' },
];

export const CONCERN_SEVERITIES = [
  { id: 'low',      label: 'Low',      hint: 'Cosmetic / minor inconvenience' },
  { id: 'medium',   label: 'Medium',   hint: 'Affects clinical workflow' },
  { id: 'high',     label: 'High',     hint: 'Could mislead a junior clinician' },
  { id: 'critical', label: 'Critical', hint: 'Imminent patient-safety risk' },
];

export async function reportClinicalConcern({
  orgId,
  consultationId,
  category,
  severity = 'medium',
  description,
  context = {},
}) {
  if (!supabaseConfigured) throw new Error('Supabase not configured');
  if (!category || !description) throw new Error('category + description required');

  const { data: { user }, error: userErr } = await supabase.auth.getUser();
  if (userErr || !user) throw new Error('not authenticated');

  try {
    const { data, error } = await supabase
      .from('clinical_concerns')
      .insert({
        org_id: orgId || null,
        consultation_id: consultationId || null,
        reporter_user_id: user.id,
        category,
        severity,
        description: description.slice(0, 4000),
        context,
      })
      .select()
      .single();
    if (error) throw error;
    return data;
  } catch (err) {
    reportError(err, { category, severity }, { tags: { area: 'clinical_concerns', op: 'report' } });
    throw err;
  }
}
