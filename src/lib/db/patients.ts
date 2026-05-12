import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./types";

type DB = SupabaseClient<Database>;
type PatientRow = Database["public"]["Tables"]["patients"]["Row"];
type PatientInsert = Database["public"]["Tables"]["patients"]["Insert"];

export async function listPatients(supabase: DB, clinicId: string, search?: string) {
  let query = supabase
    .from("patients")
    .select("id, full_name, mrn, date_of_birth, sex, phone, preferred_language, created_at")
    .eq("clinic_id", clinicId)
    .order("created_at", { ascending: false })
    .limit(100);

  if (search && search.trim()) {
    query = query.ilike("full_name", `%${search.trim()}%`);
  }

  const { data, error } = await query;
  if (error) throw error;
  return data ?? [];
}

export async function getPatient(supabase: DB, id: string): Promise<PatientRow | null> {
  const { data, error } = await supabase
    .from("patients")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function createPatient(supabase: DB, input: PatientInsert) {
  const { data, error } = await supabase
    .from("patients")
    .insert(input)
    .select("id")
    .single();
  if (error) throw error;
  return data.id;
}
