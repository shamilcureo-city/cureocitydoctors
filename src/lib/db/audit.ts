import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./types";

type DB = SupabaseClient<Database>;

export type AuditAction =
  | "consultation.create"
  | "consultation.transcribe"
  | "consultation.finalize"
  | "consultation.cancel"
  | "patient.create"
  | "patient.update"
  | "consent.capture"
  | "clinic.create"
  | "clinic.member.invite"
  | "auth.login"
  | "auth.logout";

export async function logAudit(
  supabase: DB,
  args: {
    clinicId: string | null;
    actorId: string;
    action: AuditAction;
    targetTable?: string;
    targetId?: string;
    metadata?: Record<string, unknown>;
  },
) {
  const { error } = await supabase.from("audit_logs").insert({
    clinic_id: args.clinicId,
    actor_id: args.actorId,
    action: args.action,
    target_table: args.targetTable ?? null,
    target_id: args.targetId ?? null,
    metadata: (args.metadata ?? null) as never,
  });
  if (error) {
    // Audit logs are best-effort; log the failure but don't throw on a hot path.
    console.error("[audit] failed to insert", { action: args.action, error: error.message });
  }
}
