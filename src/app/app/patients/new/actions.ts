"use server";

import { redirect } from "next/navigation";
import { requireClinicSession } from "@/lib/auth/session";
import { createPatient } from "@/lib/db/patients";
import { logAudit } from "@/lib/db/audit";

export type NewPatientState = { error?: string } | null;

export async function createPatientAction(
  _prev: NewPatientState,
  formData: FormData,
): Promise<NewPatientState> {
  const fullName = String(formData.get("full_name") ?? "").trim();
  if (!fullName) return { error: "Full name is required" };

  const mrn = String(formData.get("mrn") ?? "").trim() || null;
  const sex = (String(formData.get("sex") ?? "") || "unspecified") as
    | "male"
    | "female"
    | "other"
    | "unspecified";
  const dob = String(formData.get("date_of_birth") ?? "").trim() || null;
  const phone = String(formData.get("phone") ?? "").trim() || null;
  const language = String(formData.get("preferred_language") ?? "").trim() || null;

  const { supabase, clinic, userId } = await requireClinicSession();

  let patientId: string;
  try {
    patientId = await createPatient(supabase, {
      clinic_id: clinic.id,
      full_name: fullName,
      mrn,
      sex,
      date_of_birth: dob,
      phone,
      preferred_language: language,
      created_by: userId,
    });
  } catch (err) {
    return { error: (err as Error).message };
  }

  await logAudit(supabase, {
    clinicId: clinic.id,
    actorId: userId,
    action: "patient.create",
    targetTable: "patients",
    targetId: patientId,
  });

  redirect(`/app/consult/new?patient=${patientId}`);
}
