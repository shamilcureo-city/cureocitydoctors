# Privacy Policy

**Effective date:** 2026-05-10
**Last updated:** 2026-05-10
**Operator:** Cureocity Clinical (the "Service")

This is a *template* you must adapt with your registered legal entity name, contact details, and grievance officer before distributing to clinics or patients. India's Digital Personal Data Protection Act 2023 (DPDP) requires a *named* Data Fiduciary, not a brand alone.

---

## 1. Who we are

Cureocity Clinical is a clinical decision-support platform for Indian primary-care doctors. The Service is provided to clinic / hospital / solo-doctor accounts ("Customers"), who use it during patient consultations.

Under DPDP terminology:
- The **clinic / doctor account** that uses the Service is the **Data Fiduciary** for patient personal data they enter.
- **Cureocity Clinical** is the **Data Processor**, acting on the doctor's documented instructions.

Patients are **Data Principals**.

---

## 2. What data we process

### From the doctor (Data Fiduciary's user)
- Email or phone (for sign-in)
- Doctor's name, MCI/SMC registration number, specialty, state
- Audit log of every action taken in the Service (events, timestamps)

### From the patient (during a consult)
- Phone number (E.164)
- Optional: name, date of birth, age, sex
- Consultation transcripts, structured findings, lab values, drugs, allergies
- AI-generated clinical reasoning suggestions reviewed by the doctor
- Patient consent records (one row per consult)
- Audio (only when the patient has explicitly opted in to audio retention; default is *not retained*)

### Automatically collected
- Anonymised error events (Sentry; PII auto-redacted)
- Aggregated cost / latency telemetry (no clinical content)
- Browser type, device class (no IP-level fingerprinting)

---

## 3. Sub-processors

We use the following sub-processors. Their access is limited to the data needed for their function:

| Sub-processor | Purpose | Region | Data shared |
|---|---|---|---|
| **Supabase** (Postgres + Auth + Storage) | Application data + auth | ap-south-1 (Mumbai) | All app data |
| **Vercel** | Hosting + serverless functions | Functions pinned to bom1 (Mumbai); CDN global | Bundle, function execution context |
| **Google (Gemini API)** | Audio transcription + intake extraction | Google US (Vertex AI ap-south-1 migration planned) | Audio chunks, narrative text — *no patient identifiers transmitted* |
| **Anthropic (Claude API)** | Clinical reasoning (on-demand) | Anthropic US | Case summary + KB excerpts — *no patient identifiers transmitted* |
| **Sentry** | Error monitoring | Sentry US/EU | Stack traces, breadcrumbs (PII redacted) |
| **Gupshup** *(if enabled)* | WhatsApp Rx delivery | India | Patient phone, prescription text |
| **Google Workspace / Email** | Operational email | Google global | Doctor email |
| **GitHub Actions** | CI/CD | Microsoft global | Source code, no application data |

We do not sell or rent any data. Sub-processors are bound by Data Processing Agreements that require security and confidentiality at least equivalent to ours.

---

## 4. Purposes and lawful bases

| Purpose | DPDP basis |
|---|---|
| Operating the consult workflow (intake → Rx) | Consent (patient) + Contract (doctor) |
| AI-assisted reasoning | Patient explicit consent at consult start |
| Audit trail (medico-legal) | Legal obligation (Telemedicine Practice Guidelines 2020, IMC Regulations) |
| Aggregated analytics | Legitimate interest, no PHI |
| Service-improvement testing on de-identified data | Anonymised, no consent needed |

---

## 5. Patient rights

Under DPDP, patients (Data Principals) have the right to:

- **Access** their data — request a JSON export. The doctor / clinic owner can issue this from the admin dashboard *(planned: ABDM Sandbox export)*.
- **Correction or erasure** — except where retention is required by Indian medical-records law (typically 7 years for clinical records).
- **Withdraw consent** at any time, including during a live consult — the consult record is retained for the medico-legal duration but no further AI calls will be made on the patient's data.
- **Grievance redress** — contact our Grievance Officer (details below). DPDP requires response within 30 days.

To exercise these rights, the patient may speak to the treating doctor / clinic owner first; the clinic forwards the request to us if it cannot be resolved locally.

---

## 6. Data retention

| Data class | Retention | Why |
|---|---|---|
| Consultation records, prescriptions, audit log | **7 years** from consult date | Indian medical-records retention; medico-legal audit |
| Audio recordings (when opted in) | 90 days, then deleted | Quality review; default off |
| Sentry error events | 90 days | Standard error-monitoring retention |
| Aggregated cost / latency telemetry | 12 months | Capacity planning |
| Account / billing records | 8 years from last invoice | Indian Income Tax Act |

Patient erasure requests are honoured for prescriptions, consent records, and free-text notes — but the *fact* of consult occurring is retained for the medico-legal window per the IMC Regulations.

---

## 7. Security

- All data in transit: TLS 1.2+
- All data at rest in Supabase: AES-256
- Row-Level Security policies enforce per-org and per-role visibility
- API keys server-side only; never bundled into the browser
- Daily AI cost cap per organisation prevents runaway access
- Quarterly secrets rotation; immediate rotation on staff change
- Annual penetration test (Phase 4 onward)

If we become aware of a personal-data breach, we will notify affected Data Principals and the Data Protection Board within **72 hours** as required by DPDP.

---

## 8. Children

The Service is for clinical use by adult medical practitioners only. We do process data *about* minor patients (paediatric consults), under their treating doctor's authority and parental consent — captured in the consent_records table.

---

## 9. International transfers

Data is processed in India (Mumbai region) wherever possible. Some sub-processors (Google, Anthropic, Sentry) operate from outside India. By using the Service, the Data Principal consents to such transfers, conducted under the standard contractual clauses agreed with each sub-processor.

A roadmap to fully India-resident inference (Vertex AI on ap-south-1, Anthropic Bedrock when GA in India) is in motion. Customers will be notified in advance of the migration.

---

## 10. Grievance Officer

> **TODO**: insert your appointed Grievance Officer's name, designation, email, and physical address before publication. DPDP requires this to be visible on the public site.

---

## 11. Changes

Material changes will be notified to logged-in users at least 14 days in advance via in-app banner and email. The "Last updated" date at the top reflects the most recent revision.
