import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { logAudit } from "@/lib/db/audit";
import { getPrimaryClinicId } from "@/lib/db/clinics";

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    const clinicId = await getPrimaryClinicId(supabase, user.id);
    await logAudit(supabase, {
      clinicId,
      actorId: user.id,
      action: "auth.logout",
    });
  }

  await supabase.auth.signOut();
  return NextResponse.redirect(new URL("/login", request.url));
}
