// Maps the status a proposal is waiting in to the configurable TAT that governs it.
export const STATUS_TAT_KEY: Record<string, string> = {
  SUBMITTED: "assign_rm",
  RM_ASSIGNED: "feasibility",
  FEASIBLE: "docs_upload",
  DOCS_PENDING: "docs_upload",
  DOCS_COMPLETE: "credit_queries",
  QUERY_RAISED: "query_pd",
  QUERY_RESOLVED: "query_pd",
  PD_SCHEDULED: "query_pd",
  PD_COMPLETED: "credit_approval",
  IPA_DONE: "send_lenders",
  SENT_TO_LENDERS: "sanction",
  SANCTIONED: "disbursement",
  DISBURSED: "payout",
};

/** Deadline = end of the day that is `days` days after the step started (0 = same day). */
export function tatDue(startedAt: Date, days: number): Date {
  const d = new Date(startedAt);
  d.setHours(23, 59, 59, 999);
  d.setDate(d.getDate() + days);
  return d;
}

export type TatInfo = { key: string; label: string; days: number; due: Date; breached: boolean; hoursLeft: number };

export function tatFor(
  p: { status: string; statusChangedAt: Date },
  settings: { key: string; label: string; days: number }[],
  now = new Date(),
): TatInfo | null {
  const key = STATUS_TAT_KEY[p.status];
  const s = key && settings.find((x) => x.key === key);
  if (!s) return null;
  const due = tatDue(p.statusChangedAt, s.days);
  return {
    key,
    label: s.label,
    days: s.days,
    due,
    breached: now > due,
    hoursLeft: Math.round((due.getTime() - now.getTime()) / 36e5),
  };
}
