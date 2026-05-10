# Data Processing Agreement (DPA) — Template

**Between:**
- **Customer** (Data Fiduciary): the clinic / hospital / solo doctor account
- **Processor**: Cureocity Clinical (registered legal entity TBD)

**Effective on:** the date the Customer creates an account or first records patient data, whichever is earlier.

This DPA forms part of the agreement between the Customer and Cureocity Clinical for use of the Service. It implements the Data Protection requirements of the **Digital Personal Data Protection Act 2023 (DPDP)** and the **Telemedicine Practice Guidelines 2020 (TPG)**.

---

## 1. Roles

- **Customer** is the Data Fiduciary for personal data of patients entered into the Service.
- **Cureocity Clinical** is a Data Processor acting on the Customer's documented instructions.

The Customer's documented instructions are: (a) the activities of the Service as described in the published Privacy Policy and Customer-facing documentation, and (b) any specific written instructions from the Customer.

## 2. Subject matter and duration

- **Subject matter:** processing patient personal data and free-text clinical content in support of the Customer's clinical decision-making.
- **Duration:** for the life of the Customer's account, plus the medical-records retention period required by Indian law (typically 7 years from the last consult).

## 3. Categories of Data Principals

- Patients of the Customer's clinical practice (including minors, pursuant to parental consent captured in `consent_records`).

## 4. Categories of personal data

- Identifiers: phone (E.164), name (optional), date of birth (optional), age, sex
- Contact: phone (mandatory), email (optional)
- Health data: comorbidities, allergies, medications, vital signs, lab values
- Free-text clinical narratives, transcripts, AI-generated reasoning text
- Patient consent records (one per consult)
- Audio recordings (only when the patient has explicitly opted in)

## 5. Cureocity Clinical's obligations

5.1 **Process only on instructions.** We will process patient personal data only as documented in the Privacy Policy or as the Customer otherwise instructs in writing.

5.2 **Confidentiality.** All personnel with access to patient data are bound by written confidentiality obligations.

5.3 **Security.** We will implement and maintain the technical and organisational measures listed in **Annex A**.

5.4 **Sub-processors.** We will engage sub-processors only with the Customer's general authorisation. The list of current sub-processors is in **Annex B** and in the Privacy Policy. We will give 14 days' notice before adding or replacing a sub-processor; the Customer may object in writing.

5.5 **Data Principal rights.** We will assist the Customer in fulfilling Data Principal requests under DPDP (access, correction, erasure, withdrawal of consent, grievance redress) within the statutory deadlines.

5.6 **Breach notification.** We will notify the Customer without undue delay (and in any event within 24 hours) of any personal data breach affecting the Customer's data, with sufficient information for the Customer to comply with DPDP's 72-hour notification to the Data Protection Board.

5.7 **Audits.** Once per calendar year, the Customer may review our security and processing arrangements, either by reviewing our most recent third-party audit report (when available) or by submitting a written questionnaire which we will answer within 30 days.

5.8 **Deletion / return.** On termination, the Customer may export all their patient data via the export endpoint. After 30 days post-termination, we will delete the Customer's account data, except records we are required to retain under Indian law (medical records, accounting).

## 6. Customer's obligations

6.1 **Lawful basis.** The Customer warrants that they have a lawful basis (consent, legitimate clinical care) for inputting patient data into the Service. The consent_records table captures patient consent at consult start; the Customer is responsible for ensuring the consent is genuine and informed.

6.2 **Doctor identification.** The Customer ensures every prescriber on the account has a valid MCI / SMC registration number captured in their profile, in line with TPG 2020.

6.3 **Patient identification.** The Customer ensures the patient is identified at consult start (per TPG 2020), either by ABHA, government ID, or known patient match.

6.4 **No transmission of unconsented data.** The Customer will not enter patient personal data unless the patient has consented to AI-assisted clinical care (recorded in `consent_records.ai_assist_consent`).

## 7. Liability

Each party is liable for damages caused by its own breach of this DPA, subject to the liability cap in the master agreement.

## 8. Indian law

This DPA is governed by Indian law and disputes shall be resolved in the courts of Bangalore (or the seat agreed in the master agreement).

---

## Annex A — Security measures

- Network: TLS 1.2+ for all in-transit; HSTS; secure cookies
- Storage: AES-256 at rest in Supabase ap-south-1
- Access control: SSO via magic link; mandatory 2FA for org_owner and admin roles
- RLS policies on every table; verified by quarterly review
- Application secrets server-side only; rotated quarterly; rotated immediately on staff change
- Daily backups, 30-day retention; tested restore quarterly
- Sentry for error monitoring with PII auto-redaction
- Annual penetration test by a CERT-In empanelled vendor
- Logging: structured audit log retained 7 years; access to admin actions audited
- Sub-processor agreements impose security at least equivalent to ours

## Annex B — Current sub-processors

(Listed in the Privacy Policy section 3. Updated when changed.)
