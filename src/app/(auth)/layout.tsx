import Link from "next/link";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-slate-50 px-6 py-10">
      <Link href="/" className="mb-8 flex items-center gap-2">
        <div className="h-8 w-8 rounded-md bg-teal-600" aria-hidden />
        <span className="text-lg font-semibold tracking-tight">Cureocity Scribe</span>
      </Link>
      <div className="w-full max-w-md">{children}</div>
    </main>
  );
}
