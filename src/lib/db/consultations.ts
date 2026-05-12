import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, ConsultStatus, Prescription, SoapNote } from "./types";

type DB = SupabaseClient<Database>;
type ConsultationRow = Database["public"]["Tables"]["consultations"]["Row"];

export type ConsultationListItem = Pick<
  ConsultationRow,
  "id" | "status" | "chief_complaint" | "created_at" | "finalized_at" | "language"
> & {
  patient: { id: string; full_name: string } | null;
};

export async function listConsultations(
  supabase: DB,
  clinicId: string,
  opts: { limit?: number } = {},
): Promise<ConsultationListItem[]> {
  const { data, error } = await supabase
    .from("consultations")
    .select(
      "id, status, chief_complaint, created_at, finalized_at, language, patient:patients!inner(id, full_name)",
    )
    .eq("clinic_id", clinicId)
    .order("created_at", { ascending: false })
    .limit(opts.limit ?? 25);

  if (error) throw error;
  return (data ?? []).map((row) => ({
    ...row,
    patient: row.patient as unknown as { id: string; full_name: string } | null,
  }));
}

export async function getConsultation(supabase: DB, id: string): Promise<ConsultationRow | null> {
  const { data, error } = await supabase
    .from("consultations")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function createConsultation(
  supabase: DB,
  args: {
    clinicId: string;
    patientId: string;
    doctorId: string;
    chiefComplaint?: string | null;
  },
) {
  const { data, error } = await supabase
    .from("consultations")
    .insert({
      clinic_id: args.clinicId,
      patient_id: args.patientId,
      doctor_id: args.doctorId,
      status: "draft",
      chief_complaint: args.chiefComplaint ?? null,
      started_at: new Date().toISOString(),
    })
    .select("id")
    .single();
  if (error) throw error;
  return data.id;
}

export async function updateConsultation(
  supabase: DB,
  id: string,
  patch: {
    status?: ConsultStatus;
    audio_path?: string | null;
    audio_duration_seconds?: number | null;
    language?: string | null;
    transcript?: string | null;
    soap?: SoapNote | null;
    prescription?: Prescription | null;
    doctor_notes?: string | null;
    finalized_at?: string | null;
  },
) {
  const { error } = await supabase.from("consultations").update(patch).eq("id", id);
  if (error) throw error;
}
