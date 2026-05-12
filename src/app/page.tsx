import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function LandingPage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-6xl flex-col px-6 py-10">
      <nav className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="h-8 w-8 rounded-md bg-teal-600" aria-hidden />
          <span className="text-lg font-semibold tracking-tight">Cureocity Scribe</span>
        </div>
        <div className="flex items-center gap-3">
          <Link href="/login">
            <Button variant="ghost" size="sm">
              Sign in
            </Button>
          </Link>
          <Link href="/signup">
            <Button size="sm">Get started</Button>
          </Link>
        </div>
      </nav>

      <section className="mt-24 max-w-3xl">
        <p className="text-sm font-medium uppercase tracking-wider text-teal-700">
          Ambient AI scribe · India &amp; GCC
        </p>
        <h1 className="mt-3 text-4xl font-semibold tracking-tight text-slate-900 sm:text-5xl">
          Spend the visit with your patient. We&apos;ll write the note.
        </h1>
        <p className="mt-5 text-lg leading-relaxed text-slate-600">
          Cureocity Scribe listens to the consultation and produces a structured SOAP note and
          prescription draft you can review in seconds. Built for clinical workflows in India and
          the Gulf, with consent capture and an audit trail by default.
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <Link href="/signup">
            <Button size="lg">Start free trial</Button>
          </Link>
          <Link href="/login">
            <Button size="lg" variant="secondary">
              I already have an account
            </Button>
          </Link>
        </div>
      </section>

      <section className="mt-24 grid gap-6 sm:grid-cols-3">
        <Feature
          title="Multilingual by default"
          body="English, Hindi, Arabic and mixed-code consultations. The note is generated in English regardless of the spoken language."
        />
        <Feature
          title="Region-aware prescriptions"
          body="Generic INN names, metric units, and prescription conventions tuned for India (CDSCO/NMC) and the GCC."
        />
        <Feature
          title="Consent &amp; audit"
          body="Spoken consent is captured before recording starts. Every access to a record is logged for compliance."
        />
      </section>

      <footer className="mt-auto pt-24 text-sm text-slate-500">
        Cureocity Scribe is a documentation aid for licensed clinicians. It does not provide
        medical advice.
      </footer>
    </main>
  );
}

function Feature({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
      <h3 className="text-base font-semibold text-slate-900">{title}</h3>
      <p className="mt-2 text-sm leading-relaxed text-slate-600">{body}</p>
    </div>
  );
}
