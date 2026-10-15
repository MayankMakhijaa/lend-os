import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { STATUS, STATUS_LABEL } from "@/lib/constants";
import { STATUS_TAT_KEY, tatDue } from "@/lib/tat";
import { fmtINR } from "@/lib/format";
import { PageHeader, Stat } from "@/components/ui";

const pct = (a: number, b: number) => (b ? `${Math.round((a / b) * 100)}%` : "—");
const days = (ms: number) => (ms / 864e5).toFixed(1);

export default async function Reports({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const u = await requireUser(["ADMIN"]);
  const sp = await searchParams;
  const from = sp.from ? new Date(sp.from) : new Date(Date.now() - 180 * 864e5);
  const to = sp.to ? new Date(new Date(sp.to).getTime() + 864e5 - 1) : new Date();
  const [proposals, tats, users] = await Promise.all([
    db.proposal.findMany({
      where: { tenantId: u.tenantId, createdAt: { gte: from, lte: to }, status: { not: STATUS.DRAFT } },
      include: { statusEvents: { orderBy: { at: "asc" } }, assignments: { include: { lender: true } } },
    }),
    db.tatSetting.findMany({ where: { tenantId: u.tenantId }, orderBy: { sortOrder: "asc" } }),
    db.user.findMany({ where: { tenantId: u.tenantId, role: { in: ["RM", "DSA"] } } }),
  ]);
  const now = new Date();
  const reached = (s: string) => proposals.filter((p) => p.statusEvents.some((e) => e.status === s)).length;
  const funnel = [STATUS.SUBMITTED, STATUS.RM_ASSIGNED, STATUS.FEASIBLE, STATUS.DOCS_COMPLETE, STATUS.IPA_DONE, STATUS.SENT_TO_LENDERS, STATUS.SANCTIONED, STATUS.DISBURSED, STATUS.PAYOUT_RELEASED];
  const submitted = reached(STATUS.SUBMITTED);

  // Historical TAT performance: time spent in each status vs the configured target.
  const tatStats = new Map<string, { n: number; breached: number; totalMs: number }>();
  const breachesBy = new Map<string, number>(); // proposalId -> breaches
  for (const p of proposals) {
    p.statusEvents.forEach((e, i) => {
      const key = STATUS_TAT_KEY[e.status];
      const t = key && tats.find((x) => x.key === key);
      if (!t) return;
      const end = p.statusEvents[i + 1]?.at ?? now;
      const s = tatStats.get(key) ?? { n: 0, breached: 0, totalMs: 0 };
      s.n++;
      s.totalMs += end.getTime() - e.at.getTime();
      if (end > tatDue(e.at, t.days)) {
        s.breached++;
        breachesBy.set(p.id, (breachesBy.get(p.id) ?? 0) + 1);
      }
      tatStats.set(key, s);
    });
  }

  const sanctionedAt = (p: (typeof proposals)[number]) => p.statusEvents.find((e) => e.status === STATUS.SANCTIONED)?.at;
  const rmRows = users.filter((x) => x.role === "RM").map((rm) => {
    const ps = proposals.filter((p) => p.rmId === rm.id);
    const sanc = ps.filter((p) => sanctionedAt(p));
    const tt = sanc.map((p) => sanctionedAt(p)!.getTime() - (p.submittedAt ?? p.createdAt).getTime());
    return {
      name: rm.name, total: ps.length,
      open: ps.filter((p) => ![STATUS.NOT_FEASIBLE, STATUS.ALL_REJECTED, STATUS.PAYOUT_RELEASED].includes(p.status as never)).length,
      sanctioned: sanc.length, disbursed: ps.reduce((s, p) => s + (p.disbursedAmount ?? 0), 0),
      breaches: ps.reduce((s, p) => s + (breachesBy.get(p.id) ?? 0), 0),
      avg: tt.length ? days(tt.reduce((a, b) => a + b, 0) / tt.length) : "—",
    };
  }).sort((a, b) => b.total - a.total);

  const dsaRows = users.filter((x) => x.role === "DSA").map((d) => {
    const ps = proposals.filter((p) => p.dsaId === d.id);
    return {
      name: d.companyName ? `${d.companyName} (${d.name})` : d.name, total: ps.length,
      sanctioned: ps.filter((p) => sanctionedAt(p)).length,
      disbursedN: ps.filter((p) => p.disbursedAmount != null).length,
      disbursed: ps.reduce((s, p) => s + (p.disbursedAmount ?? 0), 0),
      payout: ps.reduce((s, p) => s + (p.payoutAmount ?? 0), 0),
    };
  }).filter((r) => r.total > 0).sort((a, b) => b.disbursed - a.disbursed);

  const lenderMap = new Map<string, { name: string; sent: number; sanctioned: number; rejected: number; pending: number; amount: number }>();
  for (const p of proposals) for (const a of p.assignments) {
    const r = lenderMap.get(a.lenderId) ?? { name: a.lender.name, sent: 0, sanctioned: 0, rejected: 0, pending: 0, amount: 0 };
    r.sent++;
    if (a.status === "SANCTIONED") { r.sanctioned++; r.amount += a.sanctionAmount ?? 0; }
    else if (a.status === "REJECTED" || a.status === "WITHDRAWN") r.rejected++;
    else r.pending++;
    lenderMap.set(a.lenderId, r);
  }
  const totalDisbursed = proposals.reduce((s, p) => s + (p.disbursedAmount ?? 0), 0);

  return (
    <div>
      <PageHeader title="Reports" sub="Proposals created in the selected period">
        <form className="flex items-end gap-2">
          <input type="date" name="from" defaultValue={from.toISOString().slice(0, 10)} className="input" />
          <input type="date" name="to" defaultValue={to.toISOString().slice(0, 10)} className="input" />
          <button className="btn-secondary">Apply</button>
        </form>
        <a href="/api/export/proposals" className="btn-secondary">Export all (CSV)</a>
      </PageHeader>
      <div className="grid gap-4 sm:grid-cols-4">
        <Stat label="Submitted" value={submitted} />
        <Stat label="Sanction rate" value={pct(reached(STATUS.SANCTIONED), submitted)} />
        <Stat label="Disbursal rate" value={pct(reached(STATUS.DISBURSED), submitted)} />
        <Stat label="Disbursed" value={fmtINR(totalDisbursed)} tone="text-emerald-700" />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <div className="card">
          <div className="card-h">Conversion funnel</div>
          <div className="card-b space-y-2">
            {funnel.map((s) => {
              const n = reached(s);
              return (
                <div key={s} className="text-sm">
                  <div className="flex justify-between"><span>{STATUS_LABEL[s]}</span><span className="text-slate-500">{n} · {pct(n, submitted)}</span></div>
                  <div className="mt-1 h-2 rounded bg-slate-100"><div className="h-2 rounded" style={{ width: pct(n, submitted) === "—" ? 0 : pct(n, submitted), background: "var(--brand)" }} /></div>
                </div>
              );
            })}
          </div>
        </div>
        <div className="card">
          <div className="card-h">TAT performance by step</div>
          <table className="table">
            <thead><tr><th>Step</th><th>Target</th><th>Avg actual</th><th>Breaches</th></tr></thead>
            <tbody>
              {tats.map((t) => {
                const s = tatStats.get(t.key);
                return (
                  <tr key={t.key}>
                    <td>{t.label}</td>
                    <td>{t.days}d</td>
                    <td>{s ? `${days(s.totalMs / s.n)}d` : "—"}</td>
                    <td className={s?.breached ? "font-medium text-red-600" : ""}>{s ? `${s.breached}/${s.n} (${pct(s.breached, s.n)})` : "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card mt-6 overflow-x-auto">
        <div className="card-h">RM performance</div>
        <table className="table">
          <thead><tr><th>RM</th><th>Cases</th><th>Open</th><th>Sanctioned</th><th>Conversion</th><th>Avg days to sanction</th><th>Disbursed</th><th>TAT breaches</th></tr></thead>
          <tbody>{rmRows.map((r) => (
            <tr key={r.name}><td>{r.name}</td><td>{r.total}</td><td>{r.open}</td><td>{r.sanctioned}</td><td>{pct(r.sanctioned, r.total)}</td><td>{r.avg}</td><td>{fmtINR(r.disbursed)}</td><td className={r.breaches ? "text-red-600" : ""}>{r.breaches}</td></tr>
          ))}</tbody>
        </table>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <div className="card overflow-x-auto">
          <div className="card-h">DSA / Partner performance</div>
          <table className="table">
            <thead><tr><th>DSA</th><th>Cases</th><th>Sanctioned</th><th>Disbursed</th><th>Payout</th></tr></thead>
            <tbody>{dsaRows.map((r) => (
              <tr key={r.name}><td>{r.name}</td><td>{r.total}</td><td>{r.sanctioned}</td><td>{r.disbursedN} · {fmtINR(r.disbursed)}</td><td>{fmtINR(r.payout)}</td></tr>
            ))}</tbody>
          </table>
        </div>
        <div className="card overflow-x-auto">
          <div className="card-h">Lender performance</div>
          <table className="table">
            <thead><tr><th>Lender</th><th>Sent</th><th>Sanctioned</th><th>Rejected</th><th>Pending</th><th>Hit rate</th><th>Sanctioned ₹</th></tr></thead>
            <tbody>{[...lenderMap.values()].sort((a, b) => b.sent - a.sent).map((r) => (
              <tr key={r.name}><td>{r.name}</td><td>{r.sent}</td><td>{r.sanctioned}</td><td>{r.rejected}</td><td>{r.pending}</td><td>{pct(r.sanctioned, r.sent)}</td><td>{fmtINR(r.amount)}</td></tr>
            ))}</tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
