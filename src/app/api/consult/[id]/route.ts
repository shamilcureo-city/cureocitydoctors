import { NextResponse } from "next/server";
import { z } from "zod";
import { requireClinicSession } from "@/lib/auth/session";
import { getConsultation, updateConsultation } from "@/lib/db/consultations";
import { logAudit } from "@/lib/db/audit";
import type { Prescription, SoapNote } from "@/lib/db/types";

const SoapSchema = z.object({
  subjective: z.string().default(""),
  objective: z.string().default(""),
  assessment: z.string().default(""),
  plan: z.string().default(""),
});

const RxItemSchema = z.object({
  drug: z.string(),
  strength: z.string().optional(),
  form: z.string().optional(),
  dose: z.string().optional(),
  route: z.string().optional(),
  frequency: z.string().optional(),
  duration: z.string().optional(),
  instructions: z.string().optional(),
});

const PatchSchema = z.object({
  soap: SoapSchema,
  prescription: z.object({
    items: z.array(RxItemSchema),
    advice: z.string().optional(),
    follow_up: z.string().optional(),
  }),
  doctor_notes: z.string().optional(),
  finalize: z.boolean().default(false),
});

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const { supabase, clinic, userId } = await requireClinicSession();

  const consult = await getConsultation(supabase, id);
  if (!consult || consult.clinic_id !== clinic.id) {
    return NextResponse.json({ error: "Consultation not found" }, { status: 404 });
  }
  if (consult.status === "finalized") {
    return NextResponse.json({ error: "Already finalized" }, { status: 409 });
  }

  const json = await request.json().catch(() => null);
  const parsed = PatchSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.message }, { status: 400 });
  }

  // Preserve any warnings on the SOAP blob.
  const existingWarnings = (() => {
    const meta = consult.soap as unknown;
    if (meta && typeof meta === "object" && "warnings" in (meta as Record<string, unknown>)) {
      const w = (meta as { warnings?: unknown }).warnings;
      if (Array.isArray(w)) return w.filter((x): x is string => typeof x === "string");
    }
    return [];
  })();

  const nextSoap = { ...parsed.data.soap, warnings: existingWarnings } as unknown as SoapNote;

  await updateConsultation(supabase, id, {
    soap: nextSoap,
    prescription: parsed.data.prescription as Prescription,
    doctor_notes: parsed.data.doctor_notes ?? null,
    status: parsed.data.finalize ? "finalized" : "review",
    finalized_at: parsed.data.finalize ? new Date().toISOString() : null,
  });

  await logAudit(supabase, {
    clinicId: clinic.id,
    actorId: userId,
    action: parsed.data.finalize ? "consultation.finalize" : "consultation.create",
    targetTable: "consultations",
    targetId: id,
  });

  return NextResponse.json({ ok: true });
}
