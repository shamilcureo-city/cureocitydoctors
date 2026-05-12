import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { listMyClinics } from "@/lib/db/clinics";
import { Sidebar } from "@/components/app/Sidebar";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const clinics = await listMyClinics(supabase, user.id);
  if (clinics.length === 0) redirect("/onboarding");

  const clinic = clinics[0];
  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name, email")
    .eq("id", user.id)
    .maybeSingle();

  const userName = profile?.full_name?.trim() || profile?.email || user.email || "Clinician";

  return (
    <div className="flex min-h-screen">
      <Sidebar clinicName={clinic.name} userName={userName} />
      <main className="flex-1 overflow-auto bg-slate-50 px-8 py-8">{children}</main>
    </div>
  );
}
