import { db } from "@/lib/db";
import { requirePlatformAdmin } from "@/lib/session";
import { Field, Flash, PageHeader } from "@/components/ui";
import { fmtDate, fmtINR } from "@/lib/format";
import { createDemoWorkspace, createTenant, platformLogout, toggleTenant } from "./actions";

export default async function Platform({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const admin = await requirePlatformAdmin();
  const sp = await searchParams;
  const tenants = await db.tenant.findMany({
    orderBy: { createdAt: "desc" },
    include: { _count: { select: { users: true, proposals: true, lenders: true } } },
  });
  const disbursed = await db.proposal.groupBy({ by: ["tenantId"], _sum: { disbursedAmount: true } });
  const dmap = Object.fromEntries(disbursed.map((d) => [d.tenantId, d._sum.disbursedAmount]));
  return (
    <div className="mx-auto max-w-6xl px-6 py-8">
      <PageHeader title="Platform console" sub={`Signed in as ${admin.email}. Each workspace is an isolated customer.`}>
        {!tenants.some((t) => t.slug === "provik") && (
          <form action={createDemoWorkspace}><button className="btn-secondary">Load demo workspace</button></form>
        )}
        <form action={platformLogout}><button className="btn-secondary">Sign out</button></form>
      </PageHeader>
      <Flash sp={sp} />
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="card lg:col-span-2">
          <div className="card-h">Customer workspaces ({tenants.length})</div>
          <table className="table">
            <thead><tr><th>Workspace</th><th>Code</th><th>Users</th><th>Lenders</th><th>Proposals</th><th>Disbursed</th><th>Created</th><th></th></tr></thead>
            <tbody>
              {tenants.map((t) => (
                <tr key={t.id}>
                  <td><span className="mr-2 inline-block h-3 w-3 rounded-full align-middle" style={{ background: t.brandColor }} />{t.name}</td>
                  <td className="font-mono text-xs">{t.slug}</td>
                  <td>{t._count.users}</td>
                  <td>{t._count.lenders}</td>
                  <td>{t._count.proposals}</td>
                  <td>{fmtINR(dmap[t.id])}</td>
                  <td>{fmtDate(t.createdAt)}</td>
                  <td>
                    <form action={toggleTenant}>
                      <input type="hidden" name="id" value={t.id} />
                      <button className={t.active ? "btn-secondary" : "btn-success"}>{t.active ? "Suspend" : "Activate"}</button>
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="card">
          <div className="card-h">New workspace</div>
          <form action={createTenant} className="card-b space-y-3">
            <Field label="Company name"><input name="name" className="input" required /></Field>
            <Field label="Workspace code (used at login)"><input name="slug" className="input" placeholder="acme-finserv" required /></Field>
            <Field label="Brand colour"><input name="brandColor" type="color" defaultValue="#1e40af" className="h-9 w-full rounded border" /></Field>
            <div className="border-t pt-3 text-xs font-semibold uppercase text-slate-500">First admin</div>
            <Field label="Name"><input name="adminName" className="input" required /></Field>
            <Field label="Email"><input name="adminEmail" type="email" className="input" required /></Field>
            <Field label="Mobile"><input name="adminPhone" className="input" /></Field>
            <Field label="Temporary password"><input name="adminPassword" className="input" minLength={8} required /></Field>
            <p className="text-xs text-slate-500">Seeds 9 products, the standard document checklist and default TATs. Everything is editable by the workspace admin.</p>
            <button className="btn-primary w-full">Create workspace</button>
          </form>
        </div>
      </div>
    </div>
  );
}
