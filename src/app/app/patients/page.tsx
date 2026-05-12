import Link from "next/link";
import { requireClinicSession } from "@/lib/auth/session";
import { listPatients } from "@/lib/db/patients";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDate } from "@/lib/utils";

export default async function PatientsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { supabase, clinic } = await requireClinicSession();
  const { q } = await searchParams;
  const patients = await listPatients(supabase, clinic.id, q);

  return (
    <div className="mx-auto max-w-5xl">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">Patients</h1>
        <Link href="/app/patients/new">
          <Button>Add patient</Button>
        </Link>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>
            {patients.length} patient{patients.length === 1 ? "" : "s"}
          </CardTitle>
          <form className="mt-2" method="get">
            <input
              name="q"
              defaultValue={q ?? ""}
              placeholder="Search by name"
              className="h-9 w-full max-w-xs rounded-md border border-slate-300 bg-white px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500"
            />
          </form>
        </CardHeader>
        <CardContent className="p-0">
          {patients.length === 0 ? (
            <div className="px-6 py-12 text-center text-sm text-slate-500">
              No patients yet. Add one to start a consult.
            </div>
          ) : (
            <ul className="divide-y divide-slate-100">
              {patients.map((p) => (
                <li key={p.id} className="flex items-center justify-between px-6 py-4">
                  <div>
                    <p className="text-sm font-medium text-slate-900">{p.full_name}</p>
                    <p className="text-xs text-slate-500">
                      {p.mrn ? `MRN ${p.mrn}` : "No MRN"}
                      {p.phone ? ` · ${p.phone}` : ""}
                      {p.preferred_language ? ` · ${p.preferred_language}` : ""}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-slate-500">
                      Added {formatDate(p.created_at)}
                    </span>
                    <Link href={`/app/consult/new?patient=${p.id}`}>
                      <Button size="sm" variant="secondary">
                        Start consult
                      </Button>
                    </Link>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
