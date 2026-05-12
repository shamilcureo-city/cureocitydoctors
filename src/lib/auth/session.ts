import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { listMyClinics, type ClinicWithRole } from "@/lib/db/clinics";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/db/types";

export type ClinicSession = {
  supabase: SupabaseClient<Database>;
  userId: string;
  email: string | null;
  clinic: ClinicWithRole;
};

/**
 * Use in server components / actions under (app). Redirects to /login or /onboarding
 * if the user is unauthenticated or has no clinic.
 */
export async function requireClinicSession(): Promise<ClinicSession> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const clinics = await listMyClinics(supabase, user.id);
  if (clinics.length === 0) redirect("/onboarding");

  return {
    supabase,
    userId: user.id,
    email: user.email ?? null,
    clinic: clinics[0],
  };
}
