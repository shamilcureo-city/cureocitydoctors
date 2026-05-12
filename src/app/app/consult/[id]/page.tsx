import { notFound } from "next/navigation";
import Link from "next/link";
import { requireClinicSession } from "@/lib/auth/session";
import { getConsultation } from "@/lib/db/consultations";
import { getPatient } from "@/lib/db/patients";
import { NoteEditor } from "@/components/consult/NoteEditor";
import { Badge } from "@/components/ui/badge";
import { formatDate, formatDuration } from "@/lib/utils";
import type { ConsultStatus } from "@/lib/db/types";

const STATUS_TONE: Record<
  ConsultStatus,
  { label: string; tone: "default" | "success" | "warning" | "info" }
> = {
  draft: { label: "Draft", tone: "default" },
  recording: { label: "Recording", tone: "info" },
  transcribing: { label: "Transcribing", tone: "info" },
  review: { label: "Review needed", tone: "warning" },
  finalized: { label: "Finalized", tone: "success" },
  cancelled: { label: "Cancelled", tone: "default" },
};

export default async function ConsultDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { supabase } = await requireClinicSession();
  const consult = await getConsultation(supabase, id);
  if (!consult) notFound();

  const patient = await getPatient(supabase, consult.patient_id);
  const status = STATUS_TONE[consult.status];

  const warnings = (() => {
    const meta = consult.soap as unknown;
    if (meta && typeof meta === "object" && "warnings" in (meta as Record<string, unknown>)) {
      const w = (meta as { warnings?: unknown }).warnings;
      if (Array.isArray(w)) return w.filter((x): x is string => typeof x === "string");
    }
    return [];
  })();

  return (
    <div className="mx-auto max-w-4xl">
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <Link
            href="/app"
            className="text-sm text-slate-500 hover:text-slate-900"
          >
            ← Back to dashboard
          </Link>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight">
            {patient?.full_name ?? "Consultation"}
          </h1>
          <p className="text-sm text-slate-500">
            {consult.chief_complaint || "No chief complaint"} ·{" "}
            {formatDuration(consult.audio_duration_seconds)} ·{" "}
            {consult.language ?? "language unknown"} · started{" "}
            {formatDate(consult.started_at ?? consult.created_at)}
          </p>
        </div>
        <Badge tone={status.tone}>{status.label}</Badge>
      </div>

      <NoteEditor
        consultId={consult.id}
        status={consult.status}
        transcript={consult.transcript}
        initialSoap={consult.soap}
        initialPrescription={consult.prescription}
        initialDoctorNotes={consult.doctor_notes}
        warnings={warnings}
        finalized={consult.status === "finalized"}
      />
    </div>
  );
}
