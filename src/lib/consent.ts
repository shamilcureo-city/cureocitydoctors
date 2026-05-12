import type { RegionCode } from "@/lib/db/types";

const TEXT_BY_REGION: Record<RegionCode, string> = {
  IN: `I consent to my consultation being audio-recorded by my clinician for the sole purpose of producing a clinical note and prescription. I understand the recording and the resulting note are stored securely under India's Digital Personal Data Protection Act, 2023, are accessible only to my clinical care team, and that I may withdraw consent or request deletion at any time.`,
  AE: `I consent to my consultation being audio-recorded by my clinician for the sole purpose of producing a clinical note and prescription. Recordings and notes are stored under UAE Federal Decree-Law No. 45 of 2021 on the Protection of Personal Data, accessible only to my clinical care team. I may withdraw consent at any time.`,
  SA: `I consent to my consultation being audio-recorded by my clinician for the sole purpose of producing a clinical note and prescription, in accordance with the Saudi Personal Data Protection Law. Recordings and notes are accessible only to my care team. I may withdraw consent at any time.`,
  QA: `I consent to my consultation being audio-recorded for clinical documentation, in accordance with Qatar Law No. 13 of 2016 concerning Personal Data Privacy Protection. Records are accessible only to my care team.`,
  KW: `I consent to my consultation being audio-recorded for clinical documentation. The recording and resulting note are accessible only to my care team.`,
  BH: `I consent to my consultation being audio-recorded for clinical documentation, in accordance with Bahrain Personal Data Protection Law. Records are accessible only to my care team.`,
  OM: `I consent to my consultation being audio-recorded for clinical documentation, in accordance with Oman Personal Data Protection Law. Records are accessible only to my care team.`,
};

export function getConsentText(region: RegionCode): string {
  return TEXT_BY_REGION[region];
}
