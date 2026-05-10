# Compliance — TPG 2020 + CDSCO SaMD pathway

## Telemedicine Practice Guidelines 2020 (TPG)

### Mandatory fields on every prescription

TPG 2020 §3.7.1 requires:

| Field | Status in app | Source |
|---|---|---|
| Patient identification | ✅ enforced | `patients.phone_e164` + name/age/sex captured at consult start |
| Modality of consult (in-person / video / phone / async) | ✅ enforced | `consultations.modality` (NOT NULL CHECK constraint) |
| Doctor's MCI/SMC registration number | ⚠ captured but not enforced on Rx render | `org_memberships.doctor_registration_number` |
| Drug name + dose + frequency + duration + route | ✅ enforced | `prescriptions.drugs` JSONB |
| Date of issue | ✅ enforced | `prescriptions.created_at` |
| Doctor's signature | ⚠ printed Rx has placeholder; digital sig planned | PrescriptionPanel print template |
| Patient identification on Rx | ✅ enforced | Patient name/age/sex on print |
| Doctor's clinic / facility name | ✅ enforced | `S_RX.clinicName` defaults; doctor edits |
| Advice for use | ✅ enforced | `prescriptions.advice` |

**Action items before paid pilot:**

1. Enforce that `org_memberships.doctor_registration_number` is non-null before the prescription panel allows finalize. Block with an inline message: "Update your MCI/SMC registration number in your profile to comply with TPG 2020."
2. Add the registration number to the printed Rx footer.
3. Decide: digital signature now or in Phase 4.5? For Kerala State Medical Council, a printed signature is acceptable; digital signature (DSC certificate) becomes mandatory only for fully paperless workflows.

### Audit trail for medical council review

The `audit_log` table satisfies TPG audit requirements:
- Every consult has a row (`consult.start`, `consult.finalize`)
- Every action by the doctor (drug add, lab update, gap fill) is logged with timestamp + doctor_id
- The `kb_version` on each `consultations` row pins the exact KB content used

A subpoena from a state medical council can be answered with:
```sql
select c.*, p.phone_e164, p.name as patient_name,
       d.display_name as doctor_name, m.doctor_registration_number
from consultations c
join patients p on p.id = c.patient_id
join doctors d on d.id = c.doctor_id
join org_memberships m on m.user_id = c.doctor_id and m.org_id = c.org_id
where c.id = $1;

select * from audit_log where payload->>'consultation_id' = $1::text order by ts;
```

---

## CDSCO Software-as-Medical-Device (SaMD) pathway

### Classification

The Service is **clinical decision support that influences prescribing decisions**. Under the Medical Device Rules 2017 (as amended) and the Drugs and Cosmetics Act, this is most likely **Class B (low–moderate risk)** under the IMDR risk-class framework, because:

- Output is *advisory*, not autonomous (doctor reviews every suggestion)
- Patient impact is mediated by clinical judgement
- No invasive intervention or direct treatment delivery

A **Class A (low risk)** classification is theoretically possible if we strictly position as a "general-purpose information utility" — but the engine outputs treatment-line recommendations and Rx text, which puts us solidly in B.

### Required steps

1. **Engage a CDSCO regulatory consultant** (~₹2-3 lakh one-time + ~₹50K/yr retainer). Recommended: Freyr, Premier Consulting, or one of the Indian-pharma-adjacent SaMD specialists. Provide them: this doc, our system architecture overview, the KB sourcing list (WHO/NICE/ESC/etc.), the engine's safety primitives (drug interactions, paediatric guards, critical labs).

2. **Quality Management System (QMS) per ISO 13485 / IS 13485:**
   - Document control: every KB change tracked; we have `kb_snapshots.content_hash` + the audit trail.
   - Risk management per ISO 14971: enumerate hazards, severity, probability, mitigations. Drafted in `docs/risk-register.md` (TBD — Phase 4 follow-up).
   - Change control: every code change goes through CI; release notes track every public change.
   - Post-market surveillance: log clinical issues reported by doctors via Sentry tags + a "Report a clinical concern" UI button (Phase 5).

3. **Technical file:**
   - Software architecture overview (ASR + extraction + deterministic engine + LLM layer)
   - KB sourcing methodology and update process
   - Validation methodology (engine test suite from Sprint 1.1; planned WER validation harness from Sprint 2.5; planned clinical-outcome study post-pilot)
   - Risk management file (ISO 14971)
   - Cyber-security plan (per CDSCO 2022 cyber-security guidance)
   - Clinical evaluation plan + report

4. **Manufacturing license** via the State Licensing Authority (SLA) on Form MD-9 (manufacturing) or MD-10 (loan license). Or use **MD-26** (import) if hosting outside India. We host primarily in India (Mumbai region), so MD-9 is the path.

5. **Submit the application:** through CDSCO Online Portal (online.cdsco.gov.in) under the "Software as Medical Device" category. Typical timeline 6–9 months.

### What we can do *now* without certification

- **Pilot use under "investigational use" / "research use only" exemption** — Indian SLAs typically permit non-commercial clinical investigation on consenting subjects without a manufacturing license. We must:
  - Label the Service "For investigational use only — not yet CDSCO-certified"
  - Capture explicit research-participation consent (extension of `consent_records`)
  - Not bill clinics for use during the pilot period (which we're already not — the first 60 days are free)
- **Charge for non-clinical features** (training, KB content licensing, dashboards) without certification, since those aren't medical-device functions.

### Timeline

| Phase | Activity | Calendar |
|---|---|---|
| Now (Week 1) | Engage consultant; share this doc | T+0 |
| Week 4 | Risk-management file (ISO 14971) drafted | T+4w |
| Week 8 | Technical file v1 ready | T+8w |
| Week 12 | Submit to CDSCO | T+12w |
| Week 16-36 | Iterate on CDSCO feedback | T+12-36w |
| Cert obtained | Lift "investigational use" labelling; commercial sales | ~T+9 months |

### Insurance

Carry **professional indemnity (errors and omissions) insurance specifically for SaMD** — quote requested from ICICI Lombard / HDFC Ergo. Typical cost ₹2-3 lakh / year for ₹1 crore cover. Required *before* the first paid clinic.
