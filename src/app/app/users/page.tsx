import Link from "next/link";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { ROLE_LABEL } from "@/lib/constants";
import { Empty, Field, Flash, PageHeader } from "@/components/ui";
import { createUser, resetUserPassword, setUserStatus, updateUser } from "../admin-actions";

// Staff and lender logins. DSA / Partners are onboarded, reviewed and managed at /app/partners.
const STAFF_ROLES = ["ADMIN", "RM", "LENDER"];

export default async function Users({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const u = await requireUser(["ADMIN"]);
  const sp = await searchParams;
  const role = STAFF_ROLES.includes(sp.role) ? sp.role : "";
  const users = await db.user.findMany({
    where: { tenantId: u.tenantId, role: role || { in: STAFF_ROLES } },
    include: { lender: true, _count: { select: { rmProposals: true } } },
    orderBy: [{ status: "asc" }, { role: "asc" }, { name: "asc" }],
  });
  const lenders = await db.lender.findMany({ where: { tenantId: u.tenantId, active: true }, orderBy: { name: "asc" } });
  const tabs = [["All", ""], ["Admins", "ADMIN"], ["RMs", "RM"], ["Lenders", "LENDER"]];

  return (
    <div>
      <PageHeader title="Users" sub="Admin, RM and Lender logins">
        <Link href="/app/partners" className="btn-secondary">DSA / Partners →</Link>
      </PageHeader>
      <Flash sp={sp} />
      <div className="mb-4 flex flex-wrap gap-2">
        {tabs.map(([l, r]) => (
          <a key={l} href={r ? `/app/users?role=${r}` : "/app/users"} className={`btn ${role === r ? "bg-slate-800 text-white" : "btn-secondary"}`}>{l}</a>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="card overflow-x-auto lg:col-span-2">
          {users.length === 0 ? <Empty>No users.</Empty> : (
            <table className="table">
              <thead><tr><th>Name</th><th>Role</th><th>Contact</th><th>Cases</th><th>Status</th><th></th></tr></thead>
              <tbody>
                {users.map((x) => (
                  <tr key={x.id}>
                    <td>
                      <div className="font-medium">{x.name}</div>
                      <div className="text-xs text-slate-500">{x.role === "LENDER" ? x.lender?.name : ""}</div>
                    </td>
                    <td className="text-xs">{ROLE_LABEL[x.role]}</td>
                    <td className="text-xs">{x.email}<br />{x.phone}</td>
                    <td>{x.role === "RM" ? x._count.rmProposals : "—"}</td>
                    <td>
                      <span className={`badge ${x.status === "ACTIVE" ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>{x.status.toLowerCase()}</span>
                      {x.inviteToken && <div className="mt-1 text-[11px] text-slate-400">invite pending</div>}
                    </td>
                    <td>
                      {x.id !== u.id && (
                        <details className="text-xs">
                          <summary className="cursor-pointer text-blue-700">Manage</summary>
                          <div className="mt-2 w-56 space-y-2">
                            <form action={updateUser} className="space-y-1">
                              <input type="hidden" name="userId" value={x.id} />
                              <input name="name" defaultValue={x.name} className="input py-1 text-xs" />
                              <input name="phone" defaultValue={x.phone ?? ""} placeholder="Mobile" className="input py-1 text-xs" />
                              <button className="btn-secondary w-full py-1 text-xs">Save</button>
                            </form>
                            <form action={resetUserPassword}><input type="hidden" name="userId" value={x.id} /><button className="btn-secondary w-full py-1 text-xs">Send password link</button></form>
                            <form action={setUserStatus}>
                              <input type="hidden" name="userId" value={x.id} />
                              <input type="hidden" name="status" value={x.status === "ACTIVE" ? "DISABLED" : "ACTIVE"} />
                              <button className={`${x.status === "ACTIVE" ? "btn-danger" : "btn-success"} w-full py-1 text-xs`}>{x.status === "ACTIVE" ? "Disable" : "Enable"}</button>
                            </form>
                          </div>
                        </details>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        <form action={createUser} className="card h-fit">
          <div className="card-h">Add user</div>
          <div className="card-b space-y-3">
            <Field label="Role">
              <select name="role" className="input" defaultValue={role || "RM"}>
                {STAFF_ROLES.map((k) => <option key={k} value={k}>{ROLE_LABEL[k]}</option>)}
              </select>
            </Field>
            <Field label="Name"><input name="name" className="input" required /></Field>
            <Field label="Email"><input name="email" type="email" className="input" required /></Field>
            <Field label="Mobile (WhatsApp)"><input name="phone" className="input" placeholder="+91…" /></Field>
            <Field label="Lender institution (Lender logins)">
              <select name="lenderId" className="input" defaultValue="">
                <option value="">—</option>
                {lenders.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
              </select>
            </Field>
            <Field label="Temporary password (blank = email an invite link)"><input name="password" className="input" minLength={8} /></Field>
            <button className="btn-primary w-full">Create login</button>
            <p className="text-xs text-slate-500">Adding a DSA / Partner? Use <Link href="/app/partners/new" className="text-blue-700 hover:underline">Add partner</Link> so their documents and approval are captured.</p>
          </div>
        </form>
      </div>
    </div>
  );
}
