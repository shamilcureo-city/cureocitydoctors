import { NextResponse } from "next/server";
import { z } from "zod";
import { requireClinicSession } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { createConsultation, updateConsultation } from "@/lib/db/consultations";
import { getPatient } from "@/lib/db/patients";
import { logAudit } from "@/lib/db/audit";
import { runScribe } from "@/lib/gemini/transcribe";
import type { Prescription, SoapNote } from "@/lib/db/types";

export const runtime = "nodejs";
export const maxDuration = 300;

const InputSchema = z.object({
  patient_id: z.string().uuid(),
  chief_complaint: z.string().max(2000).optional(),
  consent_text: z.string().min(1).max(4000),
  consent_agreed: z.string(),
  duration_seconds: z.string().regex(/^\d+$/),
});

function age(dob: string | null): number | null {
  if (!dob) return null;
  const d = new Date(dob);
  if (Number.isNaN(d.getTime())) return null;
  const diff = Date.now() - d.getTime();
  return Math.floor(diff / (365.25 * 24 * 3600 * 1000));
}

export async function POST(request: Request) {
  const { supabase, clinic, userId } = await requireClinicSession();

  const form = await request.formData();
  const parsed = InputSchema.safeParse({
    patient_id: form.get("patient_id"),
    chief_complaint: form.get("chief_complaint") || undefined,
    consent_text: form.get("consent_text"),
    consent_agreed: form.get("consent_agreed"),
    duration_seconds: form.get("duration_seconds"),
  });
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.message }, { status: 400 });
  }
  if (parsed.data.consent_agreed !== "true") {
    return NextResponse.json({ error: "Patient consent is required" }, { status: 400 });
  }

  const audioField = form.get("audio");
  if (!(audioField instanceof Blob)) {
    return NextResponse.json({ error: "Audio file is required" }, { status: 400 });
  }
  if (audioField.size === 0) {
    return NextResponse.json({ error: "Audio file is empty" }, { status: 400 });
  }
  if (audioField.size > 20 * 1024 * 1024) {
    return NextResponse.json(
      { error: "Recording exceeds 20MB; please shorten the consult or contact support." },
      { status: 413 },
    );
  }

  const patient = await getPatient(supabase, parsed.data.patient_id);
  if (!patient || patient.clinic_id !== clinic.id) {
    return NextResponse.json({ error: "Patient not found" }, { status: 404 });
  }

  // Insert consent record (RLS requires captured_by = auth.uid()).
  const { error: consentErr } = await supabase.from("consent_records").insert({
    clinic_id: clinic.id,
    patient_id: patient.id,
    kind: "recording",
    language: patient.preferred_language ?? null,
    text_shown: parsed.data.consent_text,
    agreed: true,
    captured_by: userId,
  });
  if (consentErr) {
    return NextResponse.json({ error: `Failed to record consent: ${consentErr.message}` }, { status: 500 });
  }

  // Create the consult row up front so we have an ID for storage and the URL.
  const consultId = await createConsultation(supabase, {
    clinicId: clinic.id,
    patientId: patient.id,
    doctorId: userId,
    chiefComplaint: parsed.data.chief_complaint ?? null,
  });

  await updateConsultation(supabase, consultId, {
    status: "transcribing",
    audio_duration_seconds: Number(parsed.data.duration_seconds),
  });

  await logAudit(supabase, {
    clinicId: clinic.id,
    actorId: userId,
    action: "consultation.create",
    targetTable: "consultations",
    targetId: consultId,
  });

  await logAudit(supabase, {
    clinicId: clinic.id,
    actorId: userId,
    action: "consent.capture",
    targetTable: "patients",
    targetId: patient.id,
    metadata: { consult_id: consultId, kind: "recording" },
  });

  // Best-effort upload to private storage. We continue if the bucket isn't configured yet.
  const audioBuffer = Buffer.from(await audioField.arrayBuffer());
  const mimeType = audioField.type || "audio/webm";
  const audioPath = `${clinic.id}/${consultId}.webm`;
  try {
    const admin = createAdminClient();
    const { error: uploadErr } = await admin.storage
      .from("consult-audio")
      .upload(audioPath, audioBuffer, { contentType: mimeType, upsert: true });
    if (uploadErr) {
      console.error("[consult] storage upload failed", uploadErr.message);
    } else {
      await updateConsultation(supabase, consultId, { audio_path: audioPath });
    }
  } catch (err) {
    console.error("[consult] storage upload skipped", (err as Error).message);
  }

  // Run the scribe pipeline.
  try {
    const result = await runScribe({
      audio: { data: audioBuffer, mimeType },
      context: {
        region: clinic.region,
        patientName: patient.full_name,
        patientAge: age(patient.date_of_birth),
        patientSex: patient.sex ?? null,
        chiefComplaint: parsed.data.chief_complaint ?? null,
        preferredLanguage: patient.preferred_language ?? null,
      },
    });

    const soapWithWarnings = {
      ...result.soap,
      warnings: result.warnings,
    } as unknown as SoapNote;

    await updateConsultation(supabase, consultId, {
      status: "review",
      transcript: result.transcript,
      language: result.detectedLanguage,
      soap: soapWithWarnings,
      prescription: result.prescription as Prescription,
    });

    await logAudit(supabase, {
      clinicId: clinic.id,
      actorId: userId,
      action: "consultation.transcribe",
      targetTable: "consultations",
      targetId: consultId,
      metadata: { language: result.detectedLanguage },
    });
  } catch (err) {
    const message = (err as Error).message;
    console.error("[consult] scribe failed", message);
    await updateConsultation(supabase, consultId, { status: "draft" });
    return NextResponse.json(
      { error: `Transcription failed: ${message}`, consultId },
      { status: 502 },
    );
  }

  return NextResponse.json({ consultId });
}
