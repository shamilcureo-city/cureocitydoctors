import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, ClinicRole, RegionCode } from "./types";

type DB = SupabaseClient<Database>;

export type ClinicWithRole = {
  id: string;
  name: string;
  region: RegionCode;
  role: ClinicRole;
};

export async function listMyClinics(supabase: DB, userId: string): Promise<ClinicWithRole[]> {
  const { data, error } = await supabase
    .from("clinic_members")
    .select("role, clinic:clinics!inner(id, name, region)")
    .eq("user_id", userId);

  if (error) throw error;
  return (data ?? []).map((row) => {
    const clinic = row.clinic as unknown as { id: string; name: string; region: RegionCode };
    return {
      id: clinic.id,
      name: clinic.name,
      region: clinic.region,
      role: row.role,
    };
  });
}

export async function getPrimaryClinicId(supabase: DB, userId: string): Promise<string | null> {
  const { data, error } = await supabase
    .from("clinic_members")
    .select("clinic_id")
    .eq("user_id", userId)
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return data?.clinic_id ?? null;
}

export async function createClinicWithOwner(
  supabase: DB,
  args: { name: string; region: RegionCode; userId: string; country?: string; city?: string },
) {
  const { data: clinic, error: clinicErr } = await supabase
    .from("clinics")
    .insert({
      name: args.name,
      region: args.region,
      country: args.country ?? null,
      city: args.city ?? null,
      created_by: args.userId,
    })
    .select("id")
    .single();

  if (clinicErr) throw clinicErr;

  const { error: memberErr } = await supabase.from("clinic_members").insert({
    clinic_id: clinic.id,
    user_id: args.userId,
    role: "owner",
  });

  if (memberErr) throw memberErr;

  return clinic.id;
}
