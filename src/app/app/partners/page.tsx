import Link from "next/link";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { PARTNER_SOURCE_LABEL, PARTNER_STATUS_LABEL, partnerTone } from "@/lib/constants";
import { fmtDate } from "@/lib/format";
import { appUrl } from "@/lib/notify";
import { Empty, Flash, PageHeader } from "@/components/ui";

const TABS: [string, string][] = [["Pending approval", "PENDING"], ["Approved", "ACTIVE"], ["Rejected", "REJECTED"], ["Disabled", "DISABLED"], ["All", "ALL"]];

export default async function Partners({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const u = await requireUser(["ADMIN", "RM"]);
  const sp = await searchParams;
  const all = await db.user.findMany({
    where: { tenantId: u.tenantId, role: "DSA" },
    include: { _count: { select: { dsaProposals: true } } },
    orderBy: [{ createdAt: "desc" }],
  });
  const count = (s: string) => (s === "ALL" ? all.length : all.filter((x) => x.status === s).length);
  const status = sp.status ?? (count("PENDING") ? "PENDING" : "ALL");
  const q = (sp.q ?? "").toLowerCase();
  const rows = all
    .filter((x) => status === "ALL" || x.status === status)
    .filter((x) => !q || [x.name, x.companyName, x.email, x.partnerCode, x.pan, x.phone].some((v) => v?.toLowerCase().includes(q)));

  return (
    <div>
      <PageHeader
        title="DSA / Partners"
        sub={u.tenant.allowDsaSignup ? <>Self-registration link: <span className="font-mono text-xs">{appUrl(`/signup/${u.tenant.slug}`)}</span></> : "Self-registration is switched off; partners are created here."}
      >
        <Link href="/app/partners/new" className="btn-primary">Add partner</Link>
      </PageHeader>
      <Flash sp={sp} />
      <div className="mb-4 flex flex-wrap items-center gap-2">
        {TABS.map(([l, s]) => (
          <Link key={s} href={`/app/partners?status=${s}`} className={`btn ${status === s ? (s === "PENDING" ? "bg-amber-600 text-white" : "bg-slate-800 text-white") : "btn-secondary"}`}>
            {l} ({count(s)})
          </Link>
        ))}
        <form className="ml-auto flex gap-2">
          <input type="hidden" name="status" value={status} />
          <input name="q" defaultValue={sp.q ?? ""} className="input w-56" placeholder="Search name, firm, PAN, User ID" />
          <button className="btn-secondary">Search</button>
        </form>
      </div>
      <div className="card overflow-x-auto">
        {rows.length === 0 ? <Empty>{status === "PENDING" ? "No applications waiting for approval." : "No partners here."}</Empty> : (
          <table className="table">
            <thead><tr><th>Partner</th><th>User ID</th><th>Contact</th><th>Constitution</th><th>Onboarded</th><th>Cases</th><th>Status</th><th></th></tr></thead>
            <tbody>
              {rows.map((x) => (
                <tr key={x.id}>
                  <td>
                    <Link href={`/app/partners/${x.id}`} className="font-medium text-blue-700 hover:underline">{x.name}</Link>
                    <div className="text-xs text-slate-500">{x.companyName ?? "—"}</div>
                  </td>
                  <td className="font-mono text-xs">{x.partnerCode ?? "—"}</td>
                  <td className="text-xs">{x.email}<br />{x.phone}</td>
                  <td className="text-xs">{x.constitution ?? "—"}<br />{x.city}</td>
                  <td className="text-xs">{PARTNER_SOURCE_LABEL[x.onboardingSource ?? ""] ?? "—"}<br />{fmtDate(x.createdAt)}</td>
                  <td>{x._count.dsaProposals}</td>
                  <td><span className={`badge ${partnerTone(x.status)}`}>{PARTNER_STATUS_LABEL[x.status] ?? x.status}</span></td>
                  <td><Link href={`/app/partners/${x.id}`} className="text-xs text-blue-700 hover:underline">{x.status === "PENDING" ? "Review" : "Open"}</Link></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
