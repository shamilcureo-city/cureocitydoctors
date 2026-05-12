import { requireClinicSession } from "@/lib/auth/session";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatDate } from "@/lib/utils";

export default async function AuditPage() {
  const { supabase, clinic } = await requireClinicSession();

  const { data: rows, error } = await supabase
    .from("audit_logs")
    .select("id, actor_id, action, target_table, target_id, metadata, created_at")
    .eq("clinic_id", clinic.id)
    .order("created_at", { ascending: false })
    .limit(200);

  return (
    <div className="mx-auto max-w-5xl">
      <h1 className="mb-6 text-2xl font-semibold tracking-tight">Audit log</h1>

      <Card>
        <CardHeader>
          <CardTitle>Recent activity</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {error ? (
            <p className="px-6 py-8 text-sm text-red-600">{error.message}</p>
          ) : !rows || rows.length === 0 ? (
            <p className="px-6 py-8 text-sm text-slate-500">No audit entries yet.</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {rows.map((r) => (
                <li key={r.id} className="flex items-center justify-between px-6 py-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <Badge>{r.action}</Badge>
                      {r.target_table ? (
                        <span className="text-xs text-slate-500">
                          {r.target_table}
                          {r.target_id ? `/${r.target_id.slice(0, 8)}…` : ""}
                        </span>
                      ) : null}
                    </div>
                    <p className="mt-1 truncate text-xs text-slate-500">
                      actor: {r.actor_id?.slice(0, 8) ?? "system"}…
                    </p>
                  </div>
                  <span className="text-xs text-slate-500">{formatDate(r.created_at)}</span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
