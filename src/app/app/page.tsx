import Link from "next/link";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { listProposals } from "@/lib/proposals";
import { CLOSED_STATUSES, STATUS } from "@/lib/constants";
import { fmtINR } from "@/lib/format";
import { PageHeader, Stat } from "@/components/ui";
import { ProposalTable } from "@/components/ProposalTable";

export default async function Dashboard() {
  const u = await requireUser();
  const all = await listProposals(u, {});
  const open = all.filter((p) => !CLOSED_STATUSES.includes(p.status as never) && p.status !== STATUS.DRAFT);
  const breached = open.filter((p) => p.tat?.breached);
  const sum = (xs: typeof all, f: (p: (typeof all)[number]) => number | null | undefined) => xs.reduce((s, p) => s + (f(p) ?? 0), 0);
  const firstName = u.name.split(" ")[0];

  if (u.role === "ADMIN") {
    const pendingDsa = await db.user.count({ where: { tenantId: u.tenantId, role: "DSA", status: "PENDING" } });
    const unassigned = open.filter((p) => !p.rmId);
    const disbursed = all.filter((p) => p.disbursedAmount != null);
    const payoutDue = all.filter((p) => p.status === STATUS.DISBURSED);
    return (
      <div>
        <PageHeader title={`Welcome, ${firstName}`} sub={`${u.tenant.name} · all proposals`} />
        <div className="grid gap-4 sm:grid-cols-3 lg:grid-cols-6">
          <Stat label="Open cases" value={open.length} href="/app/proposals?status=OPEN" />
          <Stat label="Unassigned" value={unassigned.length} href="/app/proposals?rmId=none" tone={unassigned.length ? "text-amber-600" : undefined} />
          <Stat label="TAT breached" value={breached.length} href="/app/proposals?tat=breached" tone={breached.length ? "text-red-600" : undefined} />
          <Stat label="Pending DSA approvals" value={pendingDsa} href="/app/users?status=PENDING" tone={pendingDsa ? "text-amber-600" : undefined} />
          <Stat label="Disbursed (all time)" value={fmtINR(sum(disbursed, (p) => p.disbursedAmount))} href="/app/reports" />
          <Stat label="Payouts due" value={payoutDue.length} href={`/app/proposals?status=${STATUS.DISBURSED}`} />
        </div>
        <div className="mt-6 grid gap-6 lg:grid-cols-2">
          <div className="card"><div className="card-h">Needs an RM</div><ProposalTable rows={unassigned.slice(0, 10)} empty="Every case has an RM." /></div>
          <div className="card"><div className="card-h">TAT breaches</div><ProposalTable rows={breached.slice(0, 10)} empty="No TAT breaches. 🎯" /></div>
        </div>
      </div>
    );
  }

  if (u.role === "RM") {
    const action = open.filter((p) => ([STATUS.RM_ASSIGNED, STATUS.DOCS_COMPLETE, STATUS.QUERY_RESOLVED, STATUS.PD_SCHEDULED, STATUS.PD_COMPLETED, STATUS.IPA_DONE, STATUS.SANCTIONED] as string[]).includes(p.status));
    const withLenders = open.filter((p) => p.status === STATUS.SENT_TO_LENDERS);
    return (
      <div>
        <PageHeader title={`Welcome, ${firstName}`} sub="Your assigned proposals" />
        <div className="grid gap-4 sm:grid-cols-4">
          <Stat label="Open cases" value={open.length} href="/app/proposals?status=OPEN" />
          <Stat label="Needs your action" value={action.length} tone={action.length ? "text-blue-700" : undefined} />
          <Stat label="With lenders" value={withLenders.length} href={`/app/proposals?status=${STATUS.SENT_TO_LENDERS}`} />
          <Stat label="TAT breached" value={breached.length} href="/app/proposals?tat=breached" tone={breached.length ? "text-red-600" : undefined} />
        </div>
        <div className="mt-6 grid gap-6 lg:grid-cols-2">
          <div className="card"><div className="card-h">Needs your action</div><ProposalTable rows={action} empty="Nothing waiting on you." /></div>
          <div className="card"><div className="card-h">With lenders</div><ProposalTable rows={withLenders} empty="No cases with lenders." showLenders /></div>
        </div>
      </div>
    );
  }

  if (u.role === "DSA") {
    const openQ = await db.query.count({ where: { status: "OPEN", proposal: { dsaId: u.id, tenantId: u.tenantId } } });
    const docsPending = open.filter((p) => p.status === STATUS.DOCS_PENDING || p.status === STATUS.QUERY_RAISED);
    const drafts = all.filter((p) => p.status === STATUS.DRAFT);
    const paid = all.filter((p) => p.payoutAmount != null);
    return (
      <div>
        <PageHeader title={`Welcome, ${firstName}`} sub={u.companyName ?? "DSA / Partner"}>
          <Link href="/app/proposals/new" className="btn-primary">New proposal</Link>
        </PageHeader>
        <div className="grid gap-4 sm:grid-cols-4">
          <Stat label="Active proposals" value={open.length} href="/app/proposals?status=OPEN" />
          <Stat label="Open queries" value={openQ} tone={openQ ? "text-amber-600" : undefined} />
          <Stat label="Disbursed" value={fmtINR(sum(all, (p) => p.disbursedAmount))} />
          <Stat label="Payouts received" value={fmtINR(sum(paid, (p) => p.payoutAmount))} tone="text-emerald-700" />
        </div>
        <div className="mt-6 grid gap-6 lg:grid-cols-2">
          <div className="card"><div className="card-h">Documents or queries waiting on you</div><ProposalTable rows={docsPending} empty="You're all caught up." /></div>
          <div className="card"><div className="card-h">Recent proposals</div><ProposalTable rows={[...drafts, ...open].slice(0, 10)} empty="No proposals yet. Create your first one." showLenders /></div>
        </div>
      </div>
    );
  }

  // LENDER
  const newOnes = all.filter((p) => p.assignments.some((a) => a.status === "SENT"));
  const active = all.filter((p) => p.assignments.some((a) => ["UNDER_REVIEW", "QUERY", "CREDIT_ASSESSMENT", "IPA"].includes(a.status)));
  const sanctioned = all.filter((p) => p.assignments.some((a) => a.status === "SANCTIONED"));
  return (
    <div>
      <PageHeader title={`Welcome, ${firstName}`} sub={`${u.lender?.name ?? "Lender"} · proposals shared with you`} />
      <div className="grid gap-4 sm:grid-cols-3">
        <Stat label="New (not yet reviewed)" value={newOnes.length} tone={newOnes.length ? "text-blue-700" : undefined} />
        <Stat label="In review" value={active.length} />
        <Stat label="Sanctioned" value={sanctioned.length} tone="text-emerald-700" />
      </div>
      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <div className="card"><div className="card-h">New proposals</div><ProposalTable rows={newOnes} empty="No new proposals." showLenders /></div>
        <div className="card"><div className="card-h">In review</div><ProposalTable rows={active} empty="Nothing in review." showLenders /></div>
      </div>
    </div>
  );
}
