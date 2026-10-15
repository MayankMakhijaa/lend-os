import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { ROLE_LABEL } from "@/lib/constants";
import { fmtDate } from "@/lib/format";
import { appUrl } from "@/lib/notify";
import { Empty, Field, Flash, PageHeader } from "@/components/ui";
import { createUser, resetUserPassword, setUserStatus, updateUser } from "../admin-actions";

export default async function Users({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const u = await requireUser(["ADMIN", "RM"]);
  const sp = await searchParams;
  const isAdmin = u.role === "ADMIN";
  const role = isAdmin ? sp.role : "DSA";
  const users = await db.user.findMany({
    where: { tenantId: u.tenantId, ...(role ? { role } : {}), ...(sp.status ? { status: sp.status } : {}) },
    include: { lender: true, _count: { select: { dsaProposals: true, rmProposals: true } } },
    orderBy: [{ status: "asc" }, { role: "asc" }, { name: "asc" }],
  });
  const lenders = isAdmin ? await db.lender.findMany({ where: { tenantId: u.tenantId, active: true }, orderBy: { name: "asc" } }) : [];
  const pending = users.filter((x) => x.status === "PENDING");
  const tabs = isAdmin ? [["All", ""], ["Admins", "ADMIN"], ["RMs", "RM"], ["DSA / Partners", "DSA"], ["Lenders", "LENDER"]] : [];

  return (
    <div>
      <PageHeader title={isAdmin ? "Users" : "DSA / Partners"} sub={u.tenant.allowDsaSignup ? <>DSA self-signup link: <span className="font-mono text-xs">{appUrl(`/signup/${u.tenant.slug}`)}</span></> : undefined} />
      <Flash sp={sp} />
      {tabs.length > 0 && (
        <div className="mb-4 flex flex-wrap gap-2">
          {tabs.map(([l, r]) => (
            <a key={l} href={r ? `/app/users?role=${r}` : "/app/users"} className={`btn ${role === r || (!role && !r) ? "bg-slate-800 text-white" : "btn-secondary"}`}>{l}</a>
          ))}
          <a href="/app/users?status=PENDING" className={`btn ${sp.status === "PENDING" ? "bg-amber-600 text-white" : "btn-secondary"}`}>Pending approval</a>
        </div>
      )}

      {pending.length > 0 && (
        <div className="card mb-6 border-amber-300">
          <div className="card-h bg-amber-50">Awaiting approval ({pending.length})</div>
          <ul className="divide-y">
            {pending.map((x) => (
              <li key={x.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm">
                <div><span className="font-medium">{x.name}</span> · {x.companyName ?? "—"} · {x.email} · {x.phone ?? "—"} <span className="text-xs text-slate-400">registered {fmtDate(x.createdAt)}</span></div>
                <div className="flex gap-2">
                  <form action={setUserStatus}><input type="hidden" name="userId" value={x.id} /><input type="hidden" name="status" value="ACTIVE" /><button className="btn-success">Approve</button></form>
                  <form action={setUserStatus}><input type="hidden" name="userId" value={x.id} /><input type="hidden" name="status" value="DISABLED" /><button className="btn-secondary">Reject</button></form>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

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
                      <div className="text-xs text-slate-500">{x.role === "LENDER" ? x.lender?.name : x.companyName}</div>
                    </td>
                    <td className="text-xs">{ROLE_LABEL[x.role]}</td>
                    <td className="text-xs">{x.email}<br />{x.phone}</td>
                    <td>{x.role === "DSA" ? x._count.dsaProposals : x.role === "RM" ? x._count.rmProposals : "—"}</td>
                    <td>
                      <span className={`badge ${x.status === "ACTIVE" ? "bg-emerald-100 text-emerald-700" : x.status === "PENDING" ? "bg-amber-100 text-amber-800" : "bg-slate-100 text-slate-500"}`}>{x.status.toLowerCase()}</span>
                      {x.inviteToken && <div className="mt-1 text-[11px] text-slate-400">invite pending</div>}
                    </td>
                    <td>
                      {x.id !== u.id && (isAdmin || x.role === "DSA") && x.status !== "PENDING" && (
                        <details className="text-xs">
                          <summary className="cursor-pointer text-blue-700">Manage</summary>
                          <div className="mt-2 w-56 space-y-2">
                            {isAdmin && (
                              <form action={updateUser} className="space-y-1">
                                <input type="hidden" name="userId" value={x.id} />
                                <input name="name" defaultValue={x.name} className="input py-1 text-xs" />
                                <input name="phone" defaultValue={x.phone ?? ""} placeholder="Mobile" className="input py-1 text-xs" />
                                {x.role === "DSA" && <input name="companyName" defaultValue={x.companyName ?? ""} placeholder="Firm" className="input py-1 text-xs" />}
                                <button className="btn-secondary w-full py-1 text-xs">Save</button>
                              </form>
                            )}
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
          <div className="card-h">{isAdmin ? "Add user" : "Add DSA / Partner"}</div>
          <div className="card-b space-y-3">
            {isAdmin && (
              <Field label="Role">
                <select name="role" className="input" defaultValue={sp.role || "RM"}>
                  {Object.entries(ROLE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </Field>
            )}
            <Field label="Name"><input name="name" className="input" required /></Field>
            <Field label="Email"><input name="email" type="email" className="input" required /></Field>
            <Field label="Mobile (WhatsApp)"><input name="phone" className="input" placeholder="+91…" /></Field>
            <Field label="Firm name (DSA)"><input name="companyName" className="input" /></Field>
            {isAdmin && (
              <Field label="Lender institution (Lender logins)">
                <select name="lenderId" className="input" defaultValue="">
                  <option value="">—</option>
                  {lenders.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
                </select>
              </Field>
            )}
            <Field label="Temporary password (blank = email an invite link)"><input name="password" className="input" minLength={8} /></Field>
            <button className="btn-primary w-full">Create login</button>
          </div>
        </form>
      </div>
    </div>
  );
}
