// ──────────────────────────────────────────────────────────────────────────────
// Drug Interaction Database – Common Indian Pharmacy Interactions
// ──────────────────────────────────────────────────────────────────────────────

export type Severity = 'major' | 'moderate' | 'minor';

export interface DrugInteraction {
  drug1: string;
  drug2: string;
  severity: Severity;
  description: string;
  clinicalEffect: string;
}

/** Normalise drug name for matching (lowercase, strip common suffixes). */
function normaliseDrug(name: string): string {
  return name
    .toLowerCase()
    .replace(/\s*(tablet|tab|cap|capsule|syrup|syr|injection|inj)\.?\s*/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// Common interactions relevant to Indian clinical practice
const INTERACTION_DB: DrugInteraction[] = [
  // --- Major ---
  { drug1: 'metformin', drug2: 'contrast dye', severity: 'major', description: 'Risk of lactic acidosis', clinicalEffect: 'Hold metformin 48h before and after contrast' },
  { drug1: 'warfarin', drug2: 'aspirin', severity: 'major', description: 'Increased bleeding risk', clinicalEffect: 'Monitor INR closely, risk of GI bleed' },
  { drug1: 'warfarin', drug2: 'nsaid', severity: 'major', description: 'Increased bleeding risk', clinicalEffect: 'Avoid combination, use paracetamol instead' },
  { drug1: 'methotrexate', drug2: 'nsaid', severity: 'major', description: 'Increased methotrexate toxicity', clinicalEffect: 'Reduced renal clearance of methotrexate' },
  { drug1: 'ciprofloxacin', drug2: 'theophylline', severity: 'major', description: 'Theophylline toxicity risk', clinicalEffect: 'Increased theophylline levels, risk of seizures' },
  { drug1: 'clopidogrel', drug2: 'omeprazole', severity: 'major', description: 'Reduced antiplatelet effect', clinicalEffect: 'CYP2C19 inhibition reduces clopidogrel activation; use pantoprazole instead' },
  { drug1: 'simvastatin', drug2: 'clarithromycin', severity: 'major', description: 'Rhabdomyolysis risk', clinicalEffect: 'CYP3A4 inhibition increases statin levels' },
  { drug1: 'atenolol', drug2: 'verapamil', severity: 'major', description: 'Severe bradycardia/heart block', clinicalEffect: 'Avoid combination, risk of complete heart block' },
  { drug1: 'lithium', drug2: 'nsaid', severity: 'major', description: 'Lithium toxicity', clinicalEffect: 'Reduced renal lithium clearance' },
  { drug1: 'potassium', drug2: 'spironolactone', severity: 'major', description: 'Hyperkalemia risk', clinicalEffect: 'Dangerous potassium elevation' },

  // --- Moderate ---
  { drug1: 'amlodipine', drug2: 'simvastatin', severity: 'moderate', description: 'Increased statin exposure', clinicalEffect: 'Limit simvastatin to 20mg with amlodipine' },
  { drug1: 'metformin', drug2: 'alcohol', severity: 'moderate', description: 'Lactic acidosis risk', clinicalEffect: 'Increased risk with heavy alcohol use' },
  { drug1: 'ace inhibitor', drug2: 'potassium', severity: 'moderate', description: 'Hyperkalemia risk', clinicalEffect: 'Monitor serum potassium' },
  { drug1: 'enalapril', drug2: 'potassium', severity: 'moderate', description: 'Hyperkalemia risk', clinicalEffect: 'Monitor serum potassium' },
  { drug1: 'digoxin', drug2: 'amiodarone', severity: 'moderate', description: 'Digoxin toxicity', clinicalEffect: 'Reduce digoxin dose by 50%' },
  { drug1: 'ciprofloxacin', drug2: 'antacid', severity: 'moderate', description: 'Reduced ciprofloxacin absorption', clinicalEffect: 'Take ciprofloxacin 2h before or 6h after antacids' },
  { drug1: 'levothyroxine', drug2: 'calcium', severity: 'moderate', description: 'Reduced levothyroxine absorption', clinicalEffect: 'Separate doses by 4 hours' },
  { drug1: 'levothyroxine', drug2: 'iron', severity: 'moderate', description: 'Reduced levothyroxine absorption', clinicalEffect: 'Separate doses by 4 hours' },
  { drug1: 'doxycycline', drug2: 'antacid', severity: 'moderate', description: 'Reduced doxycycline absorption', clinicalEffect: 'Chelation reduces antibiotic efficacy' },
  { drug1: 'metronidazole', drug2: 'alcohol', severity: 'moderate', description: 'Disulfiram-like reaction', clinicalEffect: 'Severe nausea, vomiting, flushing' },
  { drug1: 'azithromycin', drug2: 'amiodarone', severity: 'moderate', description: 'QT prolongation', clinicalEffect: 'Monitor ECG, risk of torsades de pointes' },
  { drug1: 'fluconazole', drug2: 'warfarin', severity: 'moderate', description: 'Increased anticoagulant effect', clinicalEffect: 'Monitor INR, reduce warfarin dose' },
  { drug1: 'ibuprofen', drug2: 'aspirin', severity: 'moderate', description: 'Reduced cardioprotective effect of aspirin', clinicalEffect: 'Take aspirin 30min before ibuprofen' },
  { drug1: 'ssri', drug2: 'nsaid', severity: 'moderate', description: 'Increased GI bleeding risk', clinicalEffect: 'Consider PPI co-prescription' },

  // --- Minor ---
  { drug1: 'paracetamol', drug2: 'alcohol', severity: 'minor', description: 'Increased hepatotoxicity risk', clinicalEffect: 'Avoid in chronic alcohol use' },
  { drug1: 'antacid', drug2: 'iron', severity: 'minor', description: 'Reduced iron absorption', clinicalEffect: 'Separate doses by 2 hours' },
];

// NSAID group for matching
const NSAID_NAMES = [
  'ibuprofen', 'diclofenac', 'naproxen', 'piroxicam', 'indomethacin',
  'mefenamic acid', 'aceclofenac', 'etoricoxib', 'celecoxib', 'ketorolac',
  'nimesulide', 'aspirin',
];

const ACE_INHIBITORS = [
  'enalapril', 'ramipril', 'lisinopril', 'perindopril', 'captopril', 'trandolapril',
];

const SSRI_NAMES = [
  'fluoxetine', 'sertraline', 'paroxetine', 'escitalopram', 'citalopram', 'fluvoxamine',
];

function expandDrugClass(normalised: string): string[] {
  const classes: string[] = [normalised];
  if (NSAID_NAMES.includes(normalised)) classes.push('nsaid');
  if (ACE_INHIBITORS.includes(normalised)) classes.push('ace inhibitor');
  if (SSRI_NAMES.includes(normalised)) classes.push('ssri');
  return classes;
}

/**
 * Check a list of drug names for known interactions.
 */
export function checkDrugInteractions(
  drugNames: string[],
): DrugInteraction[] {
  const normalised = drugNames.map(normaliseDrug);
  const expanded = normalised.map(expandDrugClass);

  const found: DrugInteraction[] = [];
  const seen = new Set<string>();

  for (let i = 0; i < expanded.length; i++) {
    for (let j = i + 1; j < expanded.length; j++) {
      for (const alias1 of expanded[i]) {
        for (const alias2 of expanded[j]) {
          for (const interaction of INTERACTION_DB) {
            const match =
              (alias1 === interaction.drug1 && alias2 === interaction.drug2) ||
              (alias1 === interaction.drug2 && alias2 === interaction.drug1);
            if (match) {
              const key = `${normalised[i]}|${normalised[j]}|${interaction.description}`;
              if (!seen.has(key)) {
                seen.add(key);
                found.push({
                  ...interaction,
                  drug1: drugNames[i],
                  drug2: drugNames[j],
                });
              }
            }
          }
        }
      }
    }
  }

  return found;
}

/**
 * Check a drug against patient allergies.
 */
export function checkAllergyConflicts(
  drugNames: string[],
  allergies: string[],
): Array<{ drug: string; allergy: string }> {
  const normAllergies = allergies.map((a) => a.toLowerCase().trim());
  const conflicts: Array<{ drug: string; allergy: string }> = [];

  for (const drug of drugNames) {
    const normDrug = normaliseDrug(drug);
    for (const allergy of normAllergies) {
      if (normDrug.includes(allergy) || allergy.includes(normDrug)) {
        conflicts.push({ drug, allergy });
      }
    }
    // Check NSAID class allergy
    if (normAllergies.includes('nsaid') || normAllergies.includes('nsaids')) {
      if (NSAID_NAMES.includes(normDrug)) {
        conflicts.push({ drug, allergy: 'NSAID class' });
      }
    }
  }

  return conflicts;
}
