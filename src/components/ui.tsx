import Link from "next/link";
import { DOC_STATUS_LABEL, LENDER_STATUS_LABEL, STATUS_LABEL, docTone, lenderTone, statusTone } from "@/lib/constants";

export function StatusBadge({ status }: { status: string }) {
  return <span className={`badge ${statusTone(status)}`}>{STATUS_LABEL[status] ?? status}</span>;
}
export function LenderBadge({ status }: { status: string }) {
  return <span className={`badge ${lenderTone(status)}`}>{LENDER_STATUS_LABEL[status] ?? status}</span>;
}
export function DocBadge({ status }: { status: string }) {
  return <span className={`badge ${docTone(status)}`}>{DOC_STATUS_LABEL[status] ?? status}</span>;
}

export function Flash({ sp }: { sp: { msg?: string; err?: string } }) {
  if (sp.err) return <div className="mb-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{sp.err}</div>;
  if (sp.msg) return <div className="mb-4 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{sp.msg}</div>;
  return null;
}

export function PageHeader({ title, sub, children }: { title: string; sub?: React.ReactNode; children?: React.ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="h1">{title}</h1>
        {sub && <div className="muted mt-0.5">{sub}</div>}
      </div>
      <div className="flex flex-wrap gap-2">{children}</div>
    </div>
  );
}

export function Stat({ label, value, href, tone }: { label: string; value: React.ReactNode; href?: string; tone?: string }) {
  const inner = (
    <div className="card p-4">
      <div className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</div>
      <div className={`mt-1 text-2xl font-semibold ${tone ?? "text-slate-900"}`}>{value}</div>
    </div>
  );
  return href ? <Link href={href} className="block hover:opacity-90">{inner}</Link> : inner;
}

export function Empty({ children }: { children: React.ReactNode }) {
  return <div className="px-4 py-8 text-center text-sm text-slate-500">{children}</div>;
}

export function Field({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <label className={`block ${className ?? ""}`}>
      <span className="label">{label}</span>
      {children}
    </label>
  );
}
