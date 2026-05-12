"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createClinicWithOwner } from "@/lib/db/clinics";
import { logAudit } from "@/lib/db/audit";
import type { RegionCode } from "@/lib/db/types";

const REGION_CODES: ReadonlyArray<RegionCode> = ["IN", "AE", "SA", "QA", "KW", "BH", "OM"];

export type OnboardingState = { error?: string } | null;

export async function createClinicAction(
  _prev: OnboardingState,
  formData: FormData,
): Promise<OnboardingState> {
  const name = String(formData.get("name") ?? "").trim();
  const region = String(formData.get("region") ?? "IN") as RegionCode;
  const city = String(formData.get("city") ?? "").trim();

  if (!name) return { error: "Clinic name is required" };
  if (!REGION_CODES.includes(region)) return { error: "Pick a valid region" };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect("/login");
  }

  let clinicId: string;
  try {
    clinicId = await createClinicWithOwner(supabase, {
      name,
      region,
      userId: user.id,
      city: city || undefined,
    });
  } catch (err) {
    return { error: (err as Error).message };
  }

  await logAudit(supabase, {
    clinicId,
    actorId: user.id,
    action: "clinic.create",
    targetTable: "clinics",
    targetId: clinicId,
    metadata: { name, region },
  });

  redirect("/app");
}
