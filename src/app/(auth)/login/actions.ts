"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { logAudit } from "@/lib/db/audit";
import { getPrimaryClinicId } from "@/lib/db/clinics";

export type LoginState = { error?: string } | null;

export async function loginAction(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  if (!email || !password) {
    return { error: "Email and password are required" };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    return { error: error.message };
  }

  if (data.user) {
    const clinicId = await getPrimaryClinicId(supabase, data.user.id);
    await logAudit(supabase, {
      clinicId,
      actorId: data.user.id,
      action: "auth.login",
    });
    if (!clinicId) {
      redirect("/onboarding");
    }
  }

  redirect("/app");
}
