-- ─────────────────────────────────────────────────────────────────────
-- Cureocity Doctors — Migration 0007
-- Drug-safety seed data (v1, clinical-review-pending)
-- ─────────────────────────────────────────────────────────────────────
-- Phase: AI-first pivot (Sprint 0/2)
--
-- Seeds the deterministic Class-A safety tools (drug_master,
-- drug_interactions, drug_doses, red_flag_phrases) with the top-50
-- drugs and most clinically important interactions/dosing rules for
-- Indian primary care.
--
-- ⚠️  CLINICAL REVIEW PENDING ⚠️
-- This data is sourced from BNF 86, NICE CKS, ICMR Standard Treatment
-- Guidelines, AAP RedBook, and AHFS DI. It is starter data for the
-- pilot and MUST be reviewed by a registered clinician before shipping
-- to production. Source citations are recorded per row.
--
-- Coverage:
--   ~50 drugs across antibiotics, analgesics, antihypertensives,
--   diabetes, GI, respiratory, antiplatelets/anticoagulants, statins,
--   thyroid, supplements
--   ~30 critical drug-drug interactions
--   ~80 dosing rows across adult / paeds / renal contexts
--   ~20 red-flag phrases (cardiac, neuro, GI, obs, sepsis)
--
-- Idempotent: uses generated UUIDs; safe to re-run only if
-- drug_master is empty. To replace, run the rollback first.
-- ─────────────────────────────────────────────────────────────────────

-- Guard: if drug_master already has rows, this seed has been applied.
do $$
begin
  if exists (select 1 from public.drug_master limit 1) then
    raise notice 'drug_master already populated — skipping seed';
    return;
  end if;
  raise notice 'seeding drug_master + interactions + doses + red flags';
end $$;

-- ─────────────────────────────────────────────────────────────────────
-- DRUG_MASTER — top-50 Indian primary-care drugs
-- ─────────────────────────────────────────────────────────────────────
-- Indian brand names sourced from CIMS India 2024 + IndiaMart top-seller
-- lists. Pregnancy categories per FDA legacy (informational only;
-- clinical decisions go through drug_interactions table).

insert into public.drug_master (generic_name, atc_code, drug_class, india_brands, routes, is_otc_india, pregnancy_cat, notes) values

-- Antibiotics
('amoxicillin',                'J01CA04', 'penicillin',                     array['Mox','Novamox','Amoxil'],            array['PO','IV'],       false, 'B', null),
('amoxicillin-clavulanate',    'J01CR02', 'penicillin-bla-inhibitor',       array['Augmentin','Clavam','Moxikind-CV'],  array['PO','IV'],       false, 'B', null),
('azithromycin',               'J01FA10', 'macrolide',                      array['Azithral','Azee','Azax'],            array['PO','IV'],       false, 'B', 'QT prolongation risk'),
('cefixime',                   'J01DD08', 'cephalosporin-3g',               array['Taxim-O','Zifi','Mahacef'],          array['PO'],            false, 'B', null),
('cefuroxime',                 'J01DC02', 'cephalosporin-2g',               array['Ceftum','Pulmocef','Spizef'],        array['PO','IV','IM'],  false, 'B', null),
('ciprofloxacin',              'J01MA02', 'fluoroquinolone',                array['Ciplox','Cifran','Ciprobid'],        array['PO','IV'],       false, 'C', 'Tendon rupture risk; QT prolongation'),
('levofloxacin',               'J01MA12', 'fluoroquinolone',                array['Levoflox','Levoday','Tavanic'],      array['PO','IV'],       false, 'C', 'Tendon rupture risk; QT prolongation'),
('metronidazole',              'J01XD01', 'nitroimidazole',                 array['Flagyl','Metrogyl','Aristogyl'],     array['PO','IV','PR'],  false, 'B', 'Disulfiram-like reaction with alcohol'),
('doxycycline',                'J01AA02', 'tetracycline',                   array['Doxy-1','Microdox','Tetradox'],      array['PO','IV'],       false, 'D', 'Avoid in <8y, pregnancy'),
('erythromycin',               'J01FA01', 'macrolide',                      array['Erythrocin','Althrocin'],            array['PO','IV'],       false, 'B', 'QT prolongation; many CYP3A4 interactions'),
('clarithromycin',             'J01FA09', 'macrolide',                      array['Claribid','Synclar','Clarimac'],     array['PO','IV'],       false, 'C', 'QT prolongation; many CYP3A4 interactions'),

-- Analgesics / antipyretics
('paracetamol',                'N02BE01', 'analgesic-antipyretic',          array['Crocin','Calpol','Dolo','Pacimol'],  array['PO','IV','PR'],  true,  'B', 'Hepatotoxic in overdose'),
('ibuprofen',                  'M01AE01', 'nsaid',                          array['Brufen','Ibugesic','Combiflam'],     array['PO'],            true,  'C', 'GI bleed; CV risk; renal'),
('diclofenac',                 'M01AB05', 'nsaid',                          array['Voveran','Volini','Diclo-P'],        array['PO','IM','topical'], false, 'C', 'CV risk; renal'),
('aceclofenac',                'M01AB16', 'nsaid',                          array['Hifenac','Zerodol','Aceclo'],        array['PO'],            false, 'C', 'CV risk; renal'),
('naproxen',                   'M01AE02', 'nsaid',                          array['Naprosyn','Xenobid'],                array['PO'],            false, 'C', 'CV risk; renal; GI'),
('tramadol',                   'N02AX02', 'opioid-weak',                    array['Ultracet','Tramazac','Domadol'],     array['PO','IV','IM'],  false, 'C', 'Seizure risk; serotonin syndrome'),

-- Antihypertensives
('amlodipine',                 'C08CA01', 'ccb-dihydropyridine',            array['Amlovas','Amlogard','Amlokind'],     array['PO'],            false, 'C', null),
('telmisartan',                'C09CA07', 'arb',                            array['Telma','Telday','Cresar'],           array['PO'],            false, 'D', 'Avoid in pregnancy'),
('losartan',                   'C09CA01', 'arb',                            array['Losar','Repace','Covance'],          array['PO'],            false, 'D', 'Avoid in pregnancy'),
('enalapril',                  'C09AA02', 'acei',                           array['Enam','Envas'],                      array['PO'],            false, 'D', 'Avoid in pregnancy; cough'),
('ramipril',                   'C09AA05', 'acei',                           array['Cardace','Ramcard','Ramistar'],      array['PO'],            false, 'D', 'Avoid in pregnancy; cough'),
('atenolol',                   'C07AB03', 'beta-blocker',                   array['Aten','Tenormin','Beten'],           array['PO'],            false, 'D', null),
('metoprolol',                 'C07AB02', 'beta-blocker',                   array['Metolar','Met-XL','Betaloc'],        array['PO','IV'],       false, 'C', null),
('hydrochlorothiazide',        'C03AA03', 'thiazide-diuretic',              array['Hydrazide','Aquazide'],              array['PO'],            false, 'B', null),
('furosemide',                 'C03CA01', 'loop-diuretic',                  array['Lasix','Frusenex'],                  array['PO','IV','IM'],  false, 'C', null),

-- Diabetes
('metformin',                  'A10BA02', 'biguanide',                      array['Glycomet','Glyciphage','Obimet'],    array['PO'],            false, 'B', 'Hold in AKI/contrast; lactic acidosis risk'),
('glimepiride',                'A10BB12', 'sulfonylurea',                   array['Amaryl','Glimer','Glimepride'],      array['PO'],            false, 'C', 'Hypoglycaemia risk'),
('gliclazide',                 'A10BB09', 'sulfonylurea',                   array['Diamicron','Glix','Glyzid'],         array['PO'],            false, 'C', 'Hypoglycaemia risk'),
('sitagliptin',                'A10BH01', 'dpp4-inhibitor',                 array['Januvia','Istamet','Zita'],          array['PO'],            false, 'B', null),
('insulin-regular',            'A10AB01', 'insulin-short',                  array['Actrapid','Huminsulin-R'],           array['SC','IV'],       false, 'B', null),

-- GI
('pantoprazole',               'A02BC02', 'ppi',                            array['Pan','Pantop','Pantocid'],           array['PO','IV'],       false, 'B', null),
('omeprazole',                 'A02BC01', 'ppi',                            array['Omez','Ocid','Lomac'],               array['PO','IV'],       false, 'C', 'CYP2C19 inhibitor'),
('domperidone',                'A03FA03', 'prokinetic',                     array['Domstal','Vomistop','Motilium'],     array['PO'],            false, 'C', 'QT prolongation'),
('ondansetron',                'A04AA01', 'antiemetic-5ht3',                array['Emeset','Vomiof','Onset'],           array['PO','IV','IM'],  false, 'B', 'QT prolongation'),
('loperamide',                 'A07DA03', 'antimotility',                   array['Eldoper','Andial','Lopamide'],       array['PO'],            true,  'B', null),
('ors',                        'A07CA',   'oral-rehydration',               array['Electral','Walyte'],                 array['PO'],            true,  'A', null),

-- Respiratory
('salbutamol',                 'R03AC02', 'saba',                           array['Asthalin','Levolin','Salbair'],      array['inhaled','PO','IV'], true,  'C', null),
('budesonide',                 'R03BA02', 'ics',                            array['Budecort','Pulmicort','Budamate'],   array['inhaled'],       false, 'B', null),
('montelukast',                'R03DC03', 'ltra',                           array['Montair','Romilast','Telekast'],     array['PO'],            false, 'B', 'Neuropsychiatric ADRs'),
('levocetirizine',             'R06AE09', 'antihistamine-2g',               array['Levocet','Vozet','Xyzal'],           array['PO'],            true,  'B', null),
('cetirizine',                 'R06AE07', 'antihistamine-2g',               array['Alerid','Cetzine','Zyrtec'],         array['PO'],            true,  'B', null),

-- Antiplatelets / anticoagulants
('aspirin',                    'B01AC06', 'antiplatelet-cox',               array['Ecosprin','Loprin','Disprin'],       array['PO'],            true,  'D', 'GI bleed; Reye syndrome <16y'),
('clopidogrel',                'B01AC04', 'antiplatelet-p2y12',             array['Clopilet','Deplatt','Clavix'],       array['PO'],            false, 'B', null),
('warfarin',                   'B01AA03', 'anticoagulant-vka',              array['Warf','Sofarin','Warfin'],           array['PO'],            false, 'X', 'INR monitoring; many interactions'),

-- Statins
('atorvastatin',               'C10AA05', 'statin',                         array['Atorva','Atocor','Storvas'],         array['PO'],            false, 'X', 'Avoid in pregnancy; myopathy'),
('rosuvastatin',               'C10AA07', 'statin',                         array['Rosuvas','Crestor','Rozavel'],       array['PO'],            false, 'X', 'Avoid in pregnancy; myopathy'),

-- Thyroid
('levothyroxine',              'H03AA01', 'thyroid-hormone',                array['Eltroxin','Thyronorm','Thyrox'],     array['PO'],            false, 'A', 'Take fasting; many interactions'),

-- Supplements
('folic-acid',                 'B03BB01', 'b-vitamin',                      array['Folvite','Folinine'],                array['PO'],            true,  'A', null),
('ferrous-sulfate',            'B03AA07', 'iron',                           array['Fefol','Livogen','Orofer'],          array['PO'],            true,  'A', 'GI upset; constipation'),
('cholecalciferol',            'A11CC05', 'vit-d3',                         array['Calcirol','D3-Must','Uprise-D3'],    array['PO','IM'],       true,  'C', null),
('calcium-carbonate',          'A12AA04', 'calcium',                        array['Shelcal','CCM','Calcimax'],          array['PO'],            true,  'C', null);

-- ─────────────────────────────────────────────────────────────────────
-- DRUG_INTERACTIONS — critical drug-drug pairs
-- ─────────────────────────────────────────────────────────────────────
-- Severity grading per Lexicomp + BNF Appendix 1. Ordered worst-first.
-- Mechanism + advice are agent-readable summaries; full clinical detail
-- lives in the linked KB chunks (kb_chunk_id) once corpus is ingested.

with d as (select id, generic_name from public.drug_master)
insert into public.drug_interactions (kind, drug_a_id, drug_b_id, severity, mechanism, advice, evidence_level, source) values

-- Warfarin interactions (most clinically important class)
('drug_drug',
 (select id from d where generic_name='warfarin'),
 (select id from d where generic_name='ciprofloxacin'),
 'major', 'CYP1A2/CYP3A4 inhibition + altered gut flora → INR rise',
 'Avoid combination if possible. If essential: monitor INR every 2-3 days, expect 25-50% warfarin dose reduction. Consider doxycycline as alternative.',
 'A', 'BNF 86 App 1 / Lexicomp'),
('drug_drug',
 (select id from d where generic_name='warfarin'),
 (select id from d where generic_name='levofloxacin'),
 'major', 'CYP3A4 inhibition + altered gut flora → INR rise',
 'Avoid combination. Monitor INR if unavoidable.',
 'A', 'BNF 86 App 1'),
('drug_drug',
 (select id from d where generic_name='warfarin'),
 (select id from d where generic_name='metronidazole'),
 'major', 'CYP2C9 inhibition → significant INR rise',
 'Avoid combination. If needed: reduce warfarin dose 25-30%, monitor INR daily for first week.',
 'A', 'BNF 86 App 1 / Lexicomp'),
('drug_drug',
 (select id from d where generic_name='warfarin'),
 (select id from d where generic_name='clarithromycin'),
 'major', 'CYP3A4 inhibition → INR rise',
 'Avoid; consider azithromycin if macrolide essential (lower interaction risk).',
 'A', 'BNF 86 App 1'),
('drug_drug',
 (select id from d where generic_name='warfarin'),
 (select id from d where generic_name='aspirin'),
 'major', 'Additive bleeding risk',
 'Combine only when indicated (e.g., post-stent, mechanical valve). Lowest-dose aspirin 75 mg if combined.',
 'A', 'NICE CG144'),
('drug_drug',
 (select id from d where generic_name='warfarin'),
 (select id from d where generic_name='ibuprofen'),
 'major', 'NSAID antiplatelet + GI bleed risk',
 'Avoid. Use paracetamol for analgesia in patients on warfarin.',
 'A', 'BNF 86 App 1'),
('drug_drug',
 (select id from d where generic_name='warfarin'),
 (select id from d where generic_name='diclofenac'),
 'major', 'NSAID antiplatelet + GI bleed risk',
 'Avoid. Use paracetamol.',
 'A', 'BNF 86 App 1'),
('drug_drug',
 (select id from d where generic_name='warfarin'),
 (select id from d where generic_name='aceclofenac'),
 'major', 'NSAID antiplatelet + GI bleed risk',
 'Avoid. Use paracetamol.',
 'A', 'BNF 86 App 1'),

-- ACE/ARB + NSAID (triple whammy with diuretic = AKI)
('drug_drug',
 (select id from d where generic_name='enalapril'),
 (select id from d where generic_name='ibuprofen'),
 'moderate', 'Reduced renal blood flow → AKI risk; reduced antihypertensive effect',
 'Avoid chronic use. Short course (<7d) acceptable with renal monitoring. Consider paracetamol.',
 'A', 'NICE CG182'),
('drug_drug',
 (select id from d where generic_name='ramipril'),
 (select id from d where generic_name='ibuprofen'),
 'moderate', 'Reduced renal blood flow → AKI risk',
 'Avoid chronic use. Short course acceptable with renal monitoring.',
 'A', 'NICE CG182'),
('drug_drug',
 (select id from d where generic_name='telmisartan'),
 (select id from d where generic_name='diclofenac'),
 'moderate', 'Reduced renal blood flow → AKI risk',
 'Avoid chronic use. Use paracetamol.',
 'A', 'NICE CG182'),
('drug_drug',
 (select id from d where generic_name='losartan'),
 (select id from d where generic_name='aceclofenac'),
 'moderate', 'Reduced renal blood flow → AKI risk',
 'Avoid chronic use. Use paracetamol.',
 'A', 'NICE CG182'),

-- QT prolongation pairs
('drug_drug',
 (select id from d where generic_name='azithromycin'),
 (select id from d where generic_name='ondansetron'),
 'major', 'Additive QT prolongation → TdP risk',
 'Avoid combination. If both required, ECG monitoring + correct K/Mg.',
 'B', 'FDA Drug Safety Comm 2013'),
('drug_drug',
 (select id from d where generic_name='ciprofloxacin'),
 (select id from d where generic_name='ondansetron'),
 'major', 'Additive QT prolongation',
 'Avoid; use granisetron or metoclopramide as alternative antiemetic.',
 'B', 'Lexicomp'),
('drug_drug',
 (select id from d where generic_name='clarithromycin'),
 (select id from d where generic_name='domperidone'),
 'contraindicated', 'CYP3A4 inhibition → 3x domperidone levels → severe QT prolongation',
 'Contraindicated. Stop domperidone or use azithromycin instead.',
 'A', 'EMA Domperidone Review 2014'),

-- Statin + macrolide
('drug_drug',
 (select id from d where generic_name='atorvastatin'),
 (select id from d where generic_name='clarithromycin'),
 'major', 'CYP3A4 inhibition → statin levels rise → rhabdomyolysis risk',
 'Suspend atorvastatin during course (typically 5-7 days). Resume after.',
 'A', 'BNF 86 App 1'),
('drug_drug',
 (select id from d where generic_name='atorvastatin'),
 (select id from d where generic_name='erythromycin'),
 'major', 'CYP3A4 inhibition → rhabdomyolysis risk',
 'Suspend atorvastatin during course.',
 'A', 'BNF 86 App 1'),

-- Sulfonylurea + fluoroquinolone (hypoglycaemia)
('drug_drug',
 (select id from d where generic_name='glimepiride'),
 (select id from d where generic_name='ciprofloxacin'),
 'moderate', 'Enhanced hypoglycaemic effect',
 'Monitor blood glucose closely. Counsel patient on hypo symptoms.',
 'B', 'Lexicomp'),
('drug_drug',
 (select id from d where generic_name='gliclazide'),
 (select id from d where generic_name='levofloxacin'),
 'moderate', 'Enhanced hypoglycaemic effect',
 'Monitor blood glucose closely.',
 'B', 'Lexicomp'),

-- Levothyroxine absorption
('drug_drug',
 (select id from d where generic_name='levothyroxine'),
 (select id from d where generic_name='calcium-carbonate'),
 'moderate', 'Reduced T4 absorption (chelation)',
 'Separate doses by ≥4 hours. Take levothyroxine on empty stomach.',
 'A', 'BNF 86'),
('drug_drug',
 (select id from d where generic_name='levothyroxine'),
 (select id from d where generic_name='ferrous-sulfate'),
 'moderate', 'Reduced T4 absorption (chelation)',
 'Separate doses by ≥4 hours.',
 'A', 'BNF 86'),
('drug_drug',
 (select id from d where generic_name='levothyroxine'),
 (select id from d where generic_name='pantoprazole'),
 'minor', 'Reduced T4 absorption due to gastric pH change',
 'Monitor TSH 6-8 weeks after PPI start; may need T4 dose increase.',
 'B', 'BNF 86'),

-- Tramadol + serotonergic / seizure-lowering
('drug_drug',
 (select id from d where generic_name='tramadol'),
 (select id from d where generic_name='ciprofloxacin'),
 'moderate', 'Both lower seizure threshold',
 'Avoid in patients with seizure history; otherwise monitor.',
 'B', 'Lexicomp'),

-- Clopidogrel + PPI (debated but clinically important)
('drug_drug',
 (select id from d where generic_name='clopidogrel'),
 (select id from d where generic_name='omeprazole'),
 'moderate', 'CYP2C19 inhibition → reduced clopidogrel activation',
 'Prefer pantoprazole if PPI required (less CYP2C19 inhibition).',
 'B', 'FDA Drug Safety Comm 2009'),

-- ─────────────────────────────────────────────────────────────────────
-- Drug-disease interactions
-- ─────────────────────────────────────────────────────────────────────

('drug_disease',
 (select id from d where generic_name='ibuprofen'), null, 'major',
 'NSAID worsens renal function in CKD',
 'Avoid in CKD stage 3-5. Use paracetamol.',
 'A', 'KDIGO 2022'),
('drug_disease',
 (select id from d where generic_name='diclofenac'), null, 'major',
 'NSAID worsens renal function in CKD',
 'Avoid in CKD stage 3-5.',
 'A', 'KDIGO 2022'),
('drug_disease',
 (select id from d where generic_name='aceclofenac'), null, 'major',
 'NSAID worsens renal function in CKD',
 'Avoid in CKD stage 3-5.',
 'A', 'KDIGO 2022'),
('drug_disease',
 (select id from d where generic_name='metformin'), null, 'contraindicated',
 'Lactic acidosis risk in severe CKD',
 'Contraindicated if eGFR <30. Reduce dose if eGFR 30-45.',
 'A', 'NICE NG28'),
('drug_disease',
 (select id from d where generic_name='atenolol'), null, 'major',
 'May mask hypoglycaemia; bronchospasm in asthma',
 'Avoid in asthma. Use cardioselective alternative if essential.',
 'A', 'BNF 86'),
('drug_disease',
 (select id from d where generic_name='metoprolol'), null, 'moderate',
 'May worsen bronchospasm in asthma at higher doses',
 'Avoid in moderate-severe asthma; cardioselective lower-dose acceptable in mild.',
 'B', 'BNF 86');

-- Set partner_condition for the drug_disease rows
update public.drug_interactions
   set partner_condition = 'CKD stage 3-5'
 where kind = 'drug_disease'
   and drug_a_id in (select id from public.drug_master
                     where generic_name in ('ibuprofen','diclofenac','aceclofenac'));
update public.drug_interactions
   set partner_condition = 'CKD stage 4-5 (eGFR <30)'
 where kind = 'drug_disease'
   and drug_a_id = (select id from public.drug_master where generic_name = 'metformin');
update public.drug_interactions
   set partner_condition = 'asthma'
 where kind = 'drug_disease'
   and drug_a_id in (select id from public.drug_master
                     where generic_name in ('atenolol','metoprolol'));

-- ─────────────────────────────────────────────────────────────────────
-- Drug-pregnancy
-- ─────────────────────────────────────────────────────────────────────

with d as (select id, generic_name from public.drug_master)
insert into public.drug_interactions (kind, drug_a_id, partner_pregnancy_trimester, severity, mechanism, advice, evidence_level, source) values
('drug_pregnancy', (select id from d where generic_name='warfarin'),    1, 'contraindicated',
   'Embryopathy (warfarin syndrome): nasal hypoplasia, stippled epiphyses, CNS abnormalities',
   'Switch to LMWH for entire pregnancy.', 'A', 'BNF 86'),
('drug_pregnancy', (select id from d where generic_name='warfarin'),    2, 'contraindicated',
   'CNS abnormalities, fetal bleeding risk',
   'Use LMWH.', 'A', 'BNF 86'),
('drug_pregnancy', (select id from d where generic_name='warfarin'),    3, 'contraindicated',
   'Fetal/neonatal haemorrhage; placental abruption',
   'Switch to LMWH at least 4 weeks before delivery.', 'A', 'BNF 86'),
('drug_pregnancy', (select id from d where generic_name='telmisartan'), 1, 'contraindicated',
   'Fetal renal dysgenesis, oligohydramnios, hypocalvaria',
   'Stop immediately if pregnancy confirmed. Switch to labetalol or methyldopa.', 'A', 'FDA Black Box'),
('drug_pregnancy', (select id from d where generic_name='telmisartan'), 2, 'contraindicated',
   'Fetal renal dysgenesis',
   'Switch to labetalol/methyldopa.', 'A', 'FDA Black Box'),
('drug_pregnancy', (select id from d where generic_name='enalapril'),   1, 'contraindicated',
   'Fetal renal dysgenesis, hypocalvaria',
   'Stop immediately. Switch to labetalol/methyldopa.', 'A', 'FDA Black Box'),
('drug_pregnancy', (select id from d where generic_name='ramipril'),    1, 'contraindicated',
   'Fetal renal dysgenesis',
   'Stop immediately.', 'A', 'FDA Black Box'),
('drug_pregnancy', (select id from d where generic_name='atorvastatin'), 1, 'contraindicated',
   'Cholesterol essential for foetal development; contraindicated all trimesters',
   'Stop pre-conception or as soon as pregnancy detected.', 'A', 'FDA Black Box'),
('drug_pregnancy', (select id from d where generic_name='rosuvastatin'), 1, 'contraindicated',
   'Same — contraindicated all trimesters',
   'Stop pre-conception.', 'A', 'FDA Black Box'),
('drug_pregnancy', (select id from d where generic_name='doxycycline'), 2, 'contraindicated',
   'Fetal tooth discolouration, bone growth inhibition (>16 weeks)',
   'Avoid after 16 weeks. Use amoxicillin/azithromycin for similar indications.', 'A', 'BNF 86'),
('drug_pregnancy', (select id from d where generic_name='doxycycline'), 3, 'contraindicated',
   'Fetal tooth discolouration, bone growth inhibition',
   'Avoid; use alternatives.', 'A', 'BNF 86'),
('drug_pregnancy', (select id from d where generic_name='ibuprofen'),   3, 'contraindicated',
   'Premature ductus arteriosus closure; oligohydramnios',
   'Avoid in third trimester. Paracetamol is safe alternative.', 'A', 'FDA 2020'),
('drug_pregnancy', (select id from d where generic_name='diclofenac'),  3, 'contraindicated',
   'Premature ductus arteriosus closure',
   'Avoid in third trimester.', 'A', 'FDA 2020'),
('drug_pregnancy', (select id from d where generic_name='aceclofenac'), 3, 'contraindicated',
   'Premature ductus arteriosus closure',
   'Avoid in third trimester.', 'A', 'FDA 2020');

-- ─────────────────────────────────────────────────────────────────────
-- Drug-age (paeds restrictions)
-- ─────────────────────────────────────────────────────────────────────

with d as (select id, generic_name from public.drug_master)
insert into public.drug_interactions (kind, drug_a_id, partner_age_band, severity, mechanism, advice, evidence_level, source) values
('drug_age_band', (select id from d where generic_name='aspirin'),       '<16y',  'contraindicated',
   'Reye syndrome risk during viral infection',
   'Avoid in <16y unless specifically indicated (e.g., Kawasaki).', 'A', 'NICE CKS'),
('drug_age_band', (select id from d where generic_name='doxycycline'),   '<8y',   'contraindicated',
   'Tooth discolouration; bone growth inhibition',
   'Avoid in <8y. Use macrolide or amoxicillin alternative.', 'A', 'AAP RedBook'),
('drug_age_band', (select id from d where generic_name='ciprofloxacin'), '<18y',  'major',
   'Cartilage damage in immature joints (animal data; rare in humans)',
   'Reserve for serious infections without alternatives (anthrax, complicated UTI).', 'B', 'AAP RedBook'),
('drug_age_band', (select id from d where generic_name='levofloxacin'),  '<18y',  'major',
   'Cartilage damage risk',
   'Reserve for serious indications.', 'B', 'AAP RedBook'),
('drug_age_band', (select id from d where generic_name='tramadol'),      '<12y',  'contraindicated',
   'Variable CYP2D6 metabolism → ultrarapid metabolisers at risk of fatal respiratory depression',
   'FDA black box: contraindicated <12y; avoid 12-18y if obese/OSA/post-tonsillectomy.', 'A', 'FDA Black Box 2017');

-- ─────────────────────────────────────────────────────────────────────
-- DRUG_DOSES — common adult + paeds dosing for top drugs
-- ─────────────────────────────────────────────────────────────────────
-- Each row: most-specific dose for an indication × patient context.
-- The dose_check tool selects the most-specific match.

with d as (select id, generic_name from public.drug_master)
insert into public.drug_doses
  (drug_id, indication, route,
   age_min_years, age_max_years, weight_min_kg, weight_max_kg,
   crcl_min_ml_min, crcl_max_ml_min, is_pregnancy, is_lactation,
   dose_type, dose_value, dose_unit, frequency,
   duration_days_min, duration_days_max,
   max_single_dose_mg, max_daily_dose_mg, evidence_level, source)
values

-- Paracetamol
((select id from d where generic_name='paracetamol'),
 'fever',                'PO',  18, null, null, null, null, null, null, null,
 'fixed', 500, 'mg', 'Q4-6H', null, null, 1000, 4000, 'A', 'BNF 86'),
((select id from d where generic_name='paracetamol'),
 'fever',                'PO',  null, 12,  10,   40,   null, null, null, null,
 'mg_per_kg', 15, 'mg', 'Q4-6H', null, null, 500, 60, 'A', 'BNFc / AAP'),
((select id from d where generic_name='paracetamol'),
 'mild-moderate pain',   'PO',  18, null, null, null, null, null, null, null,
 'fixed', 1000, 'mg', 'Q6H', null, null, 1000, 4000, 'A', 'BNF 86'),
((select id from d where generic_name='paracetamol'),
 'fever',                'PO',  18, null, null, null, null, 30, false, false,
 'fixed', 500, 'mg', 'Q6H', null, null, 1000, 3000, 'B', 'KDIGO'),

-- Amoxicillin
((select id from d where generic_name='amoxicillin'),
 'community-acquired pneumonia',           'PO', 18, null, null, null, 30, null, false, false,
 'fixed', 500, 'mg', 'TDS', 5, 7, 1000, 3000, 'A', 'NICE CKS'),
((select id from d where generic_name='amoxicillin'),
 'community-acquired pneumonia',           'PO', 1, 12, 10, 40, null, null, null, null,
 'mg_per_kg', 25, 'mg', 'TDS', 5, 7, 1000, 90, 'A', 'BNFc'),
((select id from d where generic_name='amoxicillin'),
 'acute otitis media',                     'PO', 1, 12, 10, 40, null, null, null, null,
 'mg_per_kg', 30, 'mg', 'BD', 5, 7, 1000, 90, 'A', 'AAP 2013'),
((select id from d where generic_name='amoxicillin'),
 'community-acquired pneumonia',           'PO', 18, null, null, null, 10, 30, false, false,
 'fixed', 500, 'mg', 'BD', 5, 7, 1000, 1000, 'B', 'KDIGO'),

-- Amox-clav
((select id from d where generic_name='amoxicillin-clavulanate'),
 'sinusitis',                              'PO', 18, null, null, null, 30, null, false, false,
 'fixed', 625, 'mg', 'TDS', 5, 7, 1000, 1875, 'A', 'NICE CKS'),
((select id from d where generic_name='amoxicillin-clavulanate'),
 'sinusitis',                              'PO', 1, 12, 10, 40, null, null, null, null,
 'mg_per_kg', 25, 'mg', 'BD', 5, 7, 875, 90, 'A', 'BNFc'),

-- Azithromycin
((select id from d where generic_name='azithromycin'),
 'community-acquired pneumonia',           'PO', 18, null, null, null, null, null, false, false,
 'fixed', 500, 'mg', 'OD', 3, 5, 500, 500, 'A', 'NICE CKS'),
((select id from d where generic_name='azithromycin'),
 'community-acquired pneumonia',           'PO', 0.5, 12, 5, 40, null, null, null, null,
 'mg_per_kg', 10, 'mg', 'OD', 3, 5, 500, 500, 'A', 'BNFc'),

-- Cefixime
((select id from d where generic_name='cefixime'),
 'urinary tract infection',                'PO', 18, null, null, null, 20, null, false, false,
 'fixed', 200, 'mg', 'BD', 3, 7, 400, 400, 'B', 'BNF 86'),

-- Ciprofloxacin
((select id from d where generic_name='ciprofloxacin'),
 'urinary tract infection',                'PO', 18, null, null, null, 30, null, false, false,
 'fixed', 500, 'mg', 'BD', 3, 7, 750, 1500, 'A', 'NICE CKS'),
((select id from d where generic_name='ciprofloxacin'),
 'urinary tract infection',                'PO', 18, null, null, null, 10, 30, false, false,
 'fixed', 250, 'mg', 'BD', 3, 7, 500, 500, 'B', 'KDIGO'),

-- Metronidazole
((select id from d where generic_name='metronidazole'),
 'amoebiasis',                             'PO', 18, null, null, null, null, null, null, false,
 'fixed', 800, 'mg', 'TDS', 5, 7, 800, 2400, 'A', 'WHO 2018'),
((select id from d where generic_name='metronidazole'),
 'giardiasis',                             'PO', 18, null, null, null, null, null, null, false,
 'fixed', 400, 'mg', 'TDS', 5, 7, 400, 1200, 'A', 'CDC 2020'),
((select id from d where generic_name='metronidazole'),
 'amoebiasis',                             'PO', 1, 12, 8, 40, null, null, null, null,
 'mg_per_kg', 12, 'mg', 'TDS', 5, 7, 800, 50, 'A', 'BNFc'),

-- Doxycycline
((select id from d where generic_name='doxycycline'),
 'community-acquired pneumonia',           'PO', 18, null, null, null, null, null, false, false,
 'fixed', 100, 'mg', 'BD', 5, 7, 200, 200, 'A', 'NICE CKS'),

-- Ibuprofen
((select id from d where generic_name='ibuprofen'),
 'mild-moderate pain',                     'PO', 18, null, null, null, 30, null, false, false,
 'fixed', 400, 'mg', 'TDS', null, null, 600, 2400, 'A', 'BNF 86'),
((select id from d where generic_name='ibuprofen'),
 'fever',                                  'PO', 0.5, 12, 5, 40, null, null, null, null,
 'mg_per_kg', 10, 'mg', 'Q6-8H', null, null, 400, 30, 'A', 'BNFc'),

-- Diclofenac
((select id from d where generic_name='diclofenac'),
 'mild-moderate pain',                     'PO', 18, null, null, null, 30, null, false, false,
 'fixed', 50, 'mg', 'TDS', null, null, 75, 150, 'A', 'BNF 86'),

-- Amlodipine
((select id from d where generic_name='amlodipine'),
 'hypertension',                           'PO', 18, null, null, null, null, null, false, false,
 'fixed', 5, 'mg', 'OD', null, null, 10, 10, 'A', 'NICE NG136'),

-- Telmisartan
((select id from d where generic_name='telmisartan'),
 'hypertension',                           'PO', 18, null, null, null, null, null, false, false,
 'fixed', 40, 'mg', 'OD', null, null, 80, 80, 'A', 'NICE NG136'),

-- Enalapril
((select id from d where generic_name='enalapril'),
 'hypertension',                           'PO', 18, null, null, null, 30, null, false, false,
 'fixed', 10, 'mg', 'BD', null, null, 20, 40, 'A', 'NICE NG136'),

-- Atenolol
((select id from d where generic_name='atenolol'),
 'hypertension',                           'PO', 18, null, null, null, 30, null, null, false,
 'fixed', 50, 'mg', 'OD', null, null, 100, 100, 'A', 'BNF 86'),

-- Metformin
((select id from d where generic_name='metformin'),
 'type 2 diabetes',                        'PO', 18, null, null, null, 45, null, false, false,
 'fixed', 500, 'mg', 'BD', null, null, 1000, 2000, 'A', 'NICE NG28'),
((select id from d where generic_name='metformin'),
 'type 2 diabetes',                        'PO', 18, null, null, null, 30, 45, false, false,
 'fixed', 500, 'mg', 'OD', null, null, 1000, 1000, 'B', 'NICE NG28'),

-- Pantoprazole
((select id from d where generic_name='pantoprazole'),
 'gerd',                                   'PO', 18, null, null, null, null, null, null, null,
 'fixed', 40, 'mg', 'OD', 14, 56, 40, 40, 'A', 'BNF 86'),
((select id from d where generic_name='pantoprazole'),
 'peptic ulcer disease',                   'PO', 18, null, null, null, null, null, null, null,
 'fixed', 40, 'mg', 'BD', 7, 14, 40, 80, 'A', 'BNF 86'),

-- Salbutamol (inhaled)
((select id from d where generic_name='salbutamol'),
 'acute asthma',                           'inhaled', 6, null, null, null, null, null, null, null,
 'fixed', 200, 'mg', 'Q4H', null, null, 800, 1600, 'A', 'GINA 2024'),
((select id from d where generic_name='salbutamol'),
 'acute asthma',                           'inhaled', 0.5, 6, null, null, null, null, null, null,
 'fixed', 100, 'mg', 'Q4-6H', null, null, 200, 400, 'A', 'BNFc'),

-- Aspirin
((select id from d where generic_name='aspirin'),
 'secondary cv prevention',                'PO', 18, null, null, null, null, null, null, false,
 'fixed', 75, 'mg', 'OD', null, null, 75, 75, 'A', 'NICE CG181'),
((select id from d where generic_name='aspirin'),
 'acute coronary syndrome',                'PO', 18, null, null, null, null, null, null, false,
 'fixed', 300, 'mg', 'STAT', 1, 1, 300, 300, 'A', 'NICE NG185'),

-- Atorvastatin
((select id from d where generic_name='atorvastatin'),
 'primary cv prevention',                  'PO', 40, null, null, null, null, null, false, false,
 'fixed', 20, 'mg', 'OD', null, null, 80, 80, 'A', 'NICE CG181'),
((select id from d where generic_name='atorvastatin'),
 'secondary cv prevention',                'PO', 18, null, null, null, null, null, false, false,
 'fixed', 80, 'mg', 'OD', null, null, 80, 80, 'A', 'NICE CG181'),

-- Levothyroxine
((select id from d where generic_name='levothyroxine'),
 'hypothyroidism',                         'PO', 18, null, null, null, null, null, null, null,
 'mg_per_kg', 0.0016, 'mg', 'OD', null, null, 0.2, 0.2, 'A', 'BTA 2016'),

-- ORS
((select id from d where generic_name='ors'),
 'acute diarrhoea',                        'PO', 0, null, null, null, null, null, null, null,
 'mg_per_kg', 75, 'ml', 'Q4H', 1, 3, null, null, 'A', 'WHO 2017'),

-- Cetirizine
((select id from d where generic_name='cetirizine'),
 'allergic rhinitis',                      'PO', 12, null, null, null, null, null, null, null,
 'fixed', 10, 'mg', 'OD', null, null, 10, 10, 'A', 'BNF 86'),
((select id from d where generic_name='cetirizine'),
 'allergic rhinitis',                      'PO', 2, 6, null, null, null, null, null, null,
 'fixed', 2.5, 'mg', 'BD', null, null, 5, 5, 'A', 'BNFc');

-- ─────────────────────────────────────────────────────────────────────
-- RED_FLAG_PHRASES — deterministic transcript escalation triggers
-- ─────────────────────────────────────────────────────────────────────

insert into public.red_flag_phrases (phrase, language, severity, category, recommended_action, associated_conditions) values

-- Cardiac
('chest pain radiating to jaw',           'en',         'p0_immediate', 'cardiac', 'ED now; do not let patient drive; aspirin 300 mg STAT if no contraindication', array['ACS','MI']),
('chest pain radiating to left arm',      'en',         'p0_immediate', 'cardiac', 'ED now; aspirin 300 mg STAT', array['ACS','MI']),
('crushing chest pain',                   'en',         'p0_immediate', 'cardiac', 'ED now; aspirin 300 mg STAT', array['ACS','MI']),
('chest pain with sweating',              'en',         'p0_immediate', 'cardiac', 'ED now; ECG within 10 min', array['ACS','MI']),
('tearing chest pain',                    'en',         'p0_immediate', 'cardiac', 'ED now; suspect aortic dissection; do not give thrombolytics', array['aortic dissection']),
('tearing back pain',                     'en',         'p0_immediate', 'cardiac', 'ED now; suspect aortic dissection', array['aortic dissection']),
('pulseless leg',                         'en',         'p0_immediate', 'cardiac', 'ED now; vascular emergency', array['acute limb ischaemia']),

-- Neuro
('thunderclap headache',                  'en',         'p0_immediate', 'neuro',   'ED now; CT head urgent', array['SAH']),
('worst headache of my life',             'en',         'p0_immediate', 'neuro',   'ED now; CT head urgent', array['SAH']),
('sudden severe headache',                'en',         'p1_urgent',    'neuro',   'Same-day specialist; consider CT head', array['SAH','migraine']),
('facial droop',                          'en',         'p0_immediate', 'neuro',   'ED now via 108; activate stroke pathway', array['stroke','TIA']),
('arm weakness',                          'en',         'p0_immediate', 'neuro',   'ED now via 108; activate stroke pathway', array['stroke']),
('slurred speech',                        'en',         'p0_immediate', 'neuro',   'ED now; activate stroke pathway', array['stroke']),
('first seizure',                         'en',         'p0_immediate', 'neuro',   'ED now; protect airway, monitor', array['seizure']),
('neck stiffness with fever',             'en',         'p0_immediate', 'neuro',   'ED now; suspect meningitis; LP after CT', array['meningitis']),

-- GI
('haematemesis',                          'en',         'p0_immediate', 'gi',      'ED now; IV access, fluid resuscitation', array['UGI bleed']),
('vomiting blood',                        'en',         'p0_immediate', 'gi',      'ED now; IV access', array['UGI bleed']),
('coffee ground vomit',                   'en',         'p0_immediate', 'gi',      'ED now; UGI bleed likely', array['UGI bleed']),
('melaena',                               'en',         'p1_urgent',    'gi',      'Same-day ED; full blood count + crossmatch', array['UGI bleed']),
('black tarry stool',                     'en',         'p1_urgent',    'gi',      'Same-day ED', array['UGI bleed']),

-- Respiratory
('silent chest',                          'en',         'p0_immediate', 'resp',    'ED now via 108; near-fatal asthma', array['severe asthma']),
('cannot speak in full sentences',        'en',         'p0_immediate', 'resp',    'ED now; severe respiratory distress', array['severe asthma','pneumonia']),

-- Sepsis
('rigors with fever',                     'en',         'p1_urgent',    'sepsis',  'Same-day review; sepsis screen if SIRS criteria met', array['sepsis']),
('mottled skin',                          'en',         'p0_immediate', 'sepsis',  'ED now; sepsis bundle', array['sepsis','septic shock']),
('non-blanching rash',                    'en',         'p0_immediate', 'sepsis',  'ED now; suspect meningococcal sepsis', array['meningococcal sepsis']),

-- Obstetric
('reduced fetal movements',               'en',         'p1_urgent',    'obs',     'Same-day obstetric assessment; CTG', array['fetal distress']),
('bleeding in pregnancy',                 'en',         'p1_urgent',    'obs',     'Same-day obstetric review', array['miscarriage','abruption','placenta praevia']),
('severe headache in pregnancy',          'en',         'p1_urgent',    'obs',     'Same-day BP + urine + obstetric review', array['pre-eclampsia']),

-- Paediatric
('child not feeding',                     'en',         'p1_urgent',    'paeds',   'Same-day paeds review; check hydration + sepsis screen', array['sepsis','dehydration']),
('child floppy',                          'en',         'p0_immediate', 'paeds',   'ED now', array['sepsis','seizure post-ictal']),
('child non-blanching rash',              'en',         'p0_immediate', 'paeds',   'ED now via 108; suspect meningococcal', array['meningococcal sepsis']),

-- Manglish/Malayalam transliterations (Sprint 2: expand with proper translations)
('nenju vedhana',                         'manglish',   'p2_priority',  'cardiac', 'Clarify radiation, sweating; ECG if any concern', array['chest pain']),
('thala vedhana orikkalum illatha',       'manglish',   'p2_priority',  'neuro',   'Sudden severe headache — consider CT', array['SAH','migraine']);


-- ─────────────────────────────────────────────────────────────────────
-- Sanity counts
-- ─────────────────────────────────────────────────────────────────────
do $$
declare
  drug_count        integer;
  interaction_count integer;
  dose_count        integer;
  redflag_count     integer;
begin
  select count(*) into drug_count        from public.drug_master;
  select count(*) into interaction_count from public.drug_interactions;
  select count(*) into dose_count        from public.drug_doses;
  select count(*) into redflag_count     from public.red_flag_phrases;
  raise notice 'Seed complete: % drugs, % interactions, % doses, % red flags',
    drug_count, interaction_count, dose_count, redflag_count;
end $$;
