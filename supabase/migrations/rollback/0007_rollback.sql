-- ─────────────────────────────────────────────────────────────────────
-- ROLLBACK for migration 0007_drug_safety_seed.sql
-- ─────────────────────────────────────────────────────────────────────
-- Removes seed rows but leaves the table structures intact (those are
-- owned by 0006). Safe to re-run; idempotent.
-- ─────────────────────────────────────────────────────────────────────

delete from public.red_flag_phrases   where source is null or true;
delete from public.drug_doses         where source is not null;
delete from public.drug_interactions  where source is not null;
delete from public.drug_master        where generic_name in (
  'amoxicillin','amoxicillin-clavulanate','azithromycin','cefixime','cefuroxime',
  'ciprofloxacin','levofloxacin','metronidazole','doxycycline','erythromycin','clarithromycin',
  'paracetamol','ibuprofen','diclofenac','aceclofenac','naproxen','tramadol',
  'amlodipine','telmisartan','losartan','enalapril','ramipril','atenolol','metoprolol',
  'hydrochlorothiazide','furosemide',
  'metformin','glimepiride','gliclazide','sitagliptin','insulin-regular',
  'pantoprazole','omeprazole','domperidone','ondansetron','loperamide','ors',
  'salbutamol','budesonide','montelukast','levocetirizine','cetirizine',
  'aspirin','clopidogrel','warfarin',
  'atorvastatin','rosuvastatin',
  'levothyroxine',
  'folic-acid','ferrous-sulfate','cholecalciferol','calcium-carbonate'
);
