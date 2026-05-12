import { requireClinicSession } from "@/lib/auth/session";
import { listPatients } from "@/lib/db/patients";
import { getConsentText } from "@/lib/consent";
import { StartConsult } from "@/components/consult/StartConsult";

export default async function NewConsultPage({
  searchParams,
}: {
  searchParams: Promise<{ patient?: string }>;
}) {
  const { supabase, clinic } = await requireClinicSession();
  const { patient: preselected } = await searchParams;
  const patients = await listPatients(supabase, clinic.id);
  const consentText = getConsentText(clinic.region);

  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="mb-6 text-2xl font-semibold tracking-tight">Start a consult</h1>
      <StartConsult
        patients={patients.map((p) => ({
          id: p.id,
          full_name: p.full_name,
          preferred_language: p.preferred_language,
        }))}
        preselectedPatientId={preselected}
        consentText={consentText}
      />
    </div>
  );
}
