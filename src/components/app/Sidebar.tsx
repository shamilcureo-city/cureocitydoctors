"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

type NavItem = { href: string; label: string };

const NAV: NavItem[] = [
  { href: "/app", label: "Dashboard" },
  { href: "/app/consult/new", label: "Start consult" },
  { href: "/app/patients", label: "Patients" },
  { href: "/app/audit", label: "Audit log" },
];

export function Sidebar({
  clinicName,
  userName,
}: {
  clinicName: string;
  userName: string;
}) {
  const pathname = usePathname();

  return (
    <aside className="flex h-screen w-64 shrink-0 flex-col border-r border-slate-200 bg-white">
      <div className="px-5 pt-5 pb-3">
        <Link href="/app" className="flex items-center gap-2">
          <div className="h-7 w-7 rounded-md bg-teal-600" aria-hidden />
          <span className="text-base font-semibold tracking-tight">Cureocity</span>
        </Link>
        <p className="mt-3 text-xs uppercase tracking-wider text-slate-400">Clinic</p>
        <p className="truncate text-sm font-medium text-slate-700">{clinicName}</p>
      </div>

      <nav className="flex-1 px-3 py-2">
        {NAV.map((item) => {
          const active =
            pathname === item.href || (item.href !== "/app" && pathname.startsWith(item.href));
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "block rounded-md px-3 py-2 text-sm font-medium transition-colors",
                active
                  ? "bg-teal-50 text-teal-700"
                  : "text-slate-600 hover:bg-slate-100 hover:text-slate-900",
              )}
            >
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="border-t border-slate-200 px-5 py-4">
        <p className="text-xs uppercase tracking-wider text-slate-400">Signed in</p>
        <p className="truncate text-sm font-medium text-slate-700">{userName}</p>
        <form action="/auth/logout" method="post" className="mt-3">
          <button
            type="submit"
            className="text-sm font-medium text-slate-500 hover:text-slate-900"
          >
            Sign out
          </button>
        </form>
      </div>
    </aside>
  );
}
