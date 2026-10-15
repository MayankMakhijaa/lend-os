import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";

export default async function Home() {
  const s = await getSession();
  if (s?.kind === "user") redirect("/app");
  if (s?.kind === "platform") redirect("/platform");
  const app = process.env.APP_NAME || "LoanOS";
  return (
    <main className="mx-auto flex min-h-screen max-w-4xl flex-col justify-center px-6 py-16">
      <div className="text-sm font-semibold uppercase tracking-widest text-blue-700">{app}</div>
      <h1 className="mt-3 text-4xl font-bold text-slate-900">Loan proposals, from first contact to DSA payout.</h1>
      <p className="mt-4 max-w-2xl text-lg text-slate-600">
        One proposal record shared by your DSAs, relationship managers, credit team and partner lenders. Configurable document
        checklists, parallel lender tracking, TAT monitoring and full audit trail.
      </p>
      <div className="mt-8 flex flex-wrap gap-3">
        <Link href="/login" className="btn-primary px-5 py-2.5 text-base">Sign in to your workspace</Link>
        <Link href="/platform/login" className="btn-secondary px-5 py-2.5 text-base">Platform console</Link>
      </div>
      <div className="mt-14 grid gap-4 sm:grid-cols-4">
        {[
          ["DSA / Partner", "Create proposals, upload documents, answer queries, track lenders."],
          ["Relationship Manager", "Feasibility, queries, PD calls, approvals, lender selection."],
          ["Lender", "Review proposals sent to you, raise queries, issue sanctions."],
          ["Admin", "Users, products, checklists, TATs, reports and exports."],
        ].map(([t, d]) => (
          <div key={t} className="card p-4">
            <div className="font-semibold text-slate-800">{t}</div>
            <div className="mt-1 text-sm text-slate-500">{d}</div>
          </div>
        ))}
      </div>
    </main>
  );
}
