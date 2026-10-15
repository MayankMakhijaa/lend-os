import Link from "next/link";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { fmtDate } from "@/lib/format";
import { PageHeader } from "@/components/ui";

export default async function Audit({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const u = await requireUser(["ADMIN"]);
  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page) || 1);
  const where = {
    tenantId: u.tenantId,
    ...(sp.action ? { action: sp.action } : {}),
    ...(sp.q ? { OR: [{ actorName: { contains: sp.q } }, { detail: { contains: sp.q } }] } : {}),
  };
  const [logs, actions, total] = await Promise.all([
    db.auditLog.findMany({ where, orderBy: { createdAt: "desc" }, take: 100, skip: (page - 1) * 100, include: { proposal: { select: { refNo: true } } } }),
    db.auditLog.findMany({ where: { tenantId: u.tenantId }, distinct: ["action"], select: { action: true } }),
    db.auditLog.count({ where }),
  ]);
  return (
    <div>
      <PageHeader title="Audit log" sub={`${total} events · every status change, upload, query, download and login`} />
      <form className="card mb-4 flex flex-wrap gap-2 p-3">
        <input name="q" defaultValue={sp.q} placeholder="Search actor or detail" className="input max-w-xs" />
        <select name="action" defaultValue={sp.action ?? ""} className="input max-w-xs">
          <option value="">All actions</option>
          {actions.map((a) => <option key={a.action} value={a.action}>{a.action.replace(/_/g, " ").toLowerCase()}</option>)}
        </select>
        <button className="btn-secondary">Filter</button>
      </form>
      <div className="card overflow-x-auto">
        <table className="table">
          <thead><tr><th>When</th><th>Actor</th><th>Action</th><th>Proposal</th><th>Detail</th></tr></thead>
          <tbody>
            {logs.map((l) => (
              <tr key={l.id}>
                <td className="whitespace-nowrap text-xs">{fmtDate(l.createdAt, true)}</td>
                <td className="text-xs">{l.actorName}<div className="text-slate-400">{l.actorRole}</div></td>
                <td className="text-xs font-medium">{l.action.replace(/_/g, " ").toLowerCase()}</td>
                <td className="text-xs">{l.proposalId ? <Link className="font-mono text-blue-700 hover:underline" href={`/app/proposals/${l.proposalId}`}>{l.proposal?.refNo}</Link> : "—"}</td>
                <td className="text-xs text-slate-600">{l.detail}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="flex justify-between p-3 text-sm">
          {page > 1 ? <Link href={`?${new URLSearchParams({ ...sp, page: String(page - 1) })}`} className="btn-secondary">← Newer</Link> : <span />}
          {page * 100 < total && <Link href={`?${new URLSearchParams({ ...sp, page: String(page + 1) })}`} className="btn-secondary">Older →</Link>}
        </div>
      </div>
    </div>
  );
}
