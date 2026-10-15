import Link from "next/link";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { listProposals } from "@/lib/proposals";
import { STATUS_LABEL, STATUS_ORDER } from "@/lib/constants";
import { fmtDate, fmtINR } from "@/lib/format";
import { Empty, LenderBadge, PageHeader, StatusBadge } from "@/components/ui";
import { TatPill } from "@/components/TatPill";

export default async function Proposals({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const u = await requireUser();
  const sp = await searchParams;
  const rows = await listProposals(u, sp);
  const isAdmin = u.role === "ADMIN";
  const [rms, dsas, lenders, products] = isAdmin
    ? await Promise.all([
        db.user.findMany({ where: { tenantId: u.tenantId, role: "RM" }, orderBy: { name: "asc" } }),
        db.user.findMany({ where: { tenantId: u.tenantId, role: "DSA" }, orderBy: { name: "asc" } }),
        db.lender.findMany({ where: { tenantId: u.tenantId }, orderBy: { name: "asc" } }),
        db.product.findMany({ where: { tenantId: u.tenantId }, orderBy: { name: "asc" } }),
      ])
    : [[], [], [], await db.product.findMany({ where: { tenantId: u.tenantId }, orderBy: { name: "asc" } })];
  const exportQs = new URLSearchParams(sp).toString();

  return (
    <div>
      <PageHeader title={u.role === "DSA" || u.role === "RM" ? "My proposals" : "Proposals"} sub={`${rows.length} shown`}>
        {isAdmin && <a href={`/api/export/proposals?${exportQs}`} className="btn-secondary">Export CSV</a>}
        {u.role !== "LENDER" && <Link href="/app/proposals/new" className="btn-primary">New proposal</Link>}
      </PageHeader>

      <form className="card mb-4 grid gap-3 p-3 sm:grid-cols-3 lg:grid-cols-7">
        <input name="q" defaultValue={sp.q} placeholder="Search company / ref / PAN" className="input lg:col-span-2" />
        <select name="status" defaultValue={sp.status ?? ""} className="input">
          <option value="">All statuses</option>
          <option value="OPEN">Open cases</option>
          {STATUS_ORDER.map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
        </select>
        <select name="productId" defaultValue={sp.productId ?? ""} className="input">
          <option value="">All products</option>
          {products.map((p) => <option key={p.id} value={p.id}>{p.code} · {p.name}</option>)}
        </select>
        {isAdmin && (
          <>
            <select name="rmId" defaultValue={sp.rmId ?? ""} className="input">
              <option value="">All RMs</option>
              <option value="none">Unassigned</option>
              {rms.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
            </select>
            <select name="dsaId" defaultValue={sp.dsaId ?? ""} className="input">
              <option value="">All DSAs</option>
              {dsas.map((r) => <option key={r.id} value={r.id}>{r.companyName || r.name}</option>)}
            </select>
            <select name="lenderId" defaultValue={sp.lenderId ?? ""} className="input">
              <option value="">All lenders</option>
              {lenders.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
            </select>
          </>
        )}
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="tat" value="breached" defaultChecked={sp.tat === "breached"} /> TAT breached only
        </label>
        <div className="flex gap-2">
          <button className="btn-primary">Filter</button>
          <Link href="/app/proposals" className="btn-secondary">Reset</Link>
        </div>
      </form>

      <div className="card overflow-x-auto">
        {rows.length === 0 ? (
          <Empty>No proposals match.</Empty>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Ref</th><th>Company</th><th>Product</th><th>Amount</th><th>Status</th><th>TAT</th>
                {u.role !== "DSA" && <th>DSA</th>}<th>RM</th><th>Lenders</th><th>Updated</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="hover:bg-slate-50">
                  <td><Link href={`/app/proposals/${r.id}`} className="whitespace-nowrap font-mono text-xs text-blue-700 hover:underline">{r.refNo}</Link></td>
                  <td><Link href={`/app/proposals/${r.id}`} className="font-medium hover:underline">{r.companyName}</Link></td>
                  <td>{r.product.code}</td>
                  <td>{fmtINR(r.loanAmount)}</td>
                  <td><StatusBadge status={r.status} /></td>
                  <td><TatPill tat={r.tat} /></td>
                  {u.role !== "DSA" && <td>{r.dsa.companyName || r.dsa.name}</td>}
                  <td>{r.rm?.name ?? <span className="text-amber-700">Unassigned</span>}</td>
                  <td className="space-y-1">
                    {r.assignments.map((a) => (
                      <div key={a.id} className="whitespace-nowrap text-xs">{a.lender.name} <LenderBadge status={a.status} /></div>
                    ))}
                  </td>
                  <td className="whitespace-nowrap text-xs text-slate-500">{fmtDate(r.updatedAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
