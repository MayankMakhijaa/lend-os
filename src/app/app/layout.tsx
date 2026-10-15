import Link from "next/link";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/session";
import { db } from "@/lib/db";
import { ROLE_LABEL } from "@/lib/constants";
import { logout } from "../auth-actions";

const NAV: Record<string, [string, string][]> = {
  ADMIN: [
    ["Dashboard", "/app"],
    ["Proposals", "/app/proposals"],
    ["Users", "/app/users"],
    ["Lenders", "/app/lenders"],
    ["Products & checklists", "/app/products"],
    ["TAT & settings", "/app/settings"],
    ["Reports", "/app/reports"],
    ["Audit log", "/app/audit"],
  ],
  RM: [
    ["Dashboard", "/app"],
    ["My proposals", "/app/proposals"],
    ["DSA / Partners", "/app/users"],
  ],
  DSA: [
    ["Dashboard", "/app"],
    ["My proposals", "/app/proposals"],
    ["New proposal", "/app/proposals/new"],
  ],
  LENDER: [
    ["Dashboard", "/app"],
    ["Proposals", "/app/proposals"],
  ],
};

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const u = await requireUser();
  if (u.mustChangePassword && (await headers()).get("x-pathname") !== "/app/account") redirect("/app/account?must=1");
  const unread = await db.notification.count({ where: { userId: u.id, readAt: null } });
  const nav = [...NAV[u.role], ["Notifications", "/app/notifications"] as [string, string], ["My account", "/app/account"] as [string, string]];
  return (
    <div className="flex min-h-screen" style={{ ["--brand" as string]: u.tenant.brandColor }}>
      <aside className="hidden w-60 shrink-0 flex-col border-r border-slate-200 bg-white md:flex">
        <div className="border-b px-5 py-4">
          <div className="text-base font-semibold" style={{ color: u.tenant.brandColor }}>{u.tenant.name}</div>
          <div className="text-xs text-slate-500">{process.env.APP_NAME || "LoanOS"}</div>
        </div>
        <nav className="flex-1 space-y-0.5 p-3">
          {nav.map(([label, href]) => (
            <Link key={href} href={href} className="flex items-center justify-between rounded-md px-3 py-2 text-sm text-slate-700 hover:bg-slate-100">
              {label}
              {href === "/app/notifications" && unread > 0 && (
                <span className="badge bg-red-500 text-white">{unread}</span>
              )}
            </Link>
          ))}
        </nav>
        <div className="border-t p-4 text-sm">
          <div className="font-medium text-slate-800">{u.name}</div>
          <div className="text-xs text-slate-500">{u.role === "LENDER" ? `${ROLE_LABEL.LENDER} · ${u.lender?.name ?? ""}` : ROLE_LABEL[u.role]}</div>
          <form action={logout} className="mt-2"><button className="text-xs text-slate-500 hover:text-slate-800 hover:underline">Sign out</button></form>
        </div>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-between gap-3 border-b bg-white px-4 py-3 md:hidden">
          <span className="font-semibold" style={{ color: u.tenant.brandColor }}>{u.tenant.name}</span>
          <details className="relative">
            <summary className="btn-secondary cursor-pointer list-none">Menu{unread > 0 ? ` (${unread})` : ""}</summary>
            <div className="absolute right-0 z-10 mt-1 w-56 rounded-md border bg-white p-2 shadow">
              {nav.map(([label, href]) => (
                <Link key={href} href={href} className="block rounded px-3 py-2 text-sm hover:bg-slate-100">{label}</Link>
              ))}
              <form action={logout}><button className="w-full rounded px-3 py-2 text-left text-sm hover:bg-slate-100">Sign out</button></form>
            </div>
          </details>
        </header>
        <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 md:px-8">{children}</main>
      </div>
    </div>
  );
}
