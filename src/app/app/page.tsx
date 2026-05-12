import Link from "next/link";
import { requireClinicSession } from "@/lib/auth/session";
import { listConsultations } from "@/lib/db/consultations";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatDate } from "@/lib/utils";
import type { ConsultStatus } from "@/lib/db/types";

const STATUS_LABEL: Record<ConsultStatus, { label: string; tone: "default" | "success" | "warning" | "info" }> = {
  draft: { label: "Draft", tone: "default" },
  recording: { label: "Recording", tone: "info" },
  transcribing: { label: "Transcribing", tone: "info" },
  review: { label: "Review", tone: "warning" },
  finalized: { label: "Finalized", tone: "success" },
  cancelled: { label: "Cancelled", tone: "default" },
};

export default async function DashboardPage() {
  const { supabase, clinic } = await requireClinicSession();
  const consults = await listConsultations(supabase, clinic.id, { limit: 20 });

  return (
    <div className="mx-auto max-w-5xl">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Today&apos;s clinic</h1>
          <p className="text-sm text-slate-500">{clinic.name}</p>
        </div>
        <Link href="/app/consult/new">
          <Button>Start a consult</Button>
        </Link>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Recent consultations</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {consults.length === 0 ? (
            <div className="px-6 py-12 text-center">
              <p className="text-sm text-slate-500">
                No consultations yet. Start your first one to see notes here.
              </p>
              <Link href="/app/consult/new" className="mt-4 inline-block">
                <Button>Start a consult</Button>
              </Link>
            </div>
          ) : (
            <ul className="divide-y divide-slate-100">
              {consults.map((c) => {
                const status = STATUS_LABEL[c.status];
                return (
                  <li key={c.id}>
                    <Link
                      href={`/app/consult/${c.id}`}
                      className="flex items-center justify-between px-6 py-4 hover:bg-slate-50"
                    >
                      <div>
                        <p className="text-sm font-medium text-slate-900">
                          {c.patient?.full_name ?? "Unknown patient"}
                        </p>
                        <p className="text-xs text-slate-500">
                          {c.chief_complaint || "No chief complaint recorded"}
                        </p>
                      </div>
                      <div className="flex items-center gap-4">
                        <Badge tone={status.tone}>{status.label}</Badge>
                        <span className="w-40 text-right text-xs text-slate-500">
                          {formatDate(c.finalized_at ?? c.created_at)}
                        </span>
                      </div>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
