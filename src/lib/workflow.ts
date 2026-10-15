import "server-only";
import { db } from "./db";
import { audit } from "./audit";
import { notify } from "./notify";
import { LENDER_STATUS_RANK, STATUS, STATUS_LABEL } from "./constants";

export type Actor = { id: string | null; name: string; role: string };

export async function setStatus(proposalId: string, status: string, actor: Actor, detail?: string) {
  const p = await db.proposal.update({
    where: { id: proposalId },
    data: { status, statusChangedAt: new Date(), ...(status === STATUS.SUBMITTED ? { submittedAt: new Date() } : {}) },
  });
  await db.statusEvent.create({ data: { proposalId, status } });
  await audit(p.tenantId, actor, "STATUS_CHANGED", `→ ${STATUS_LABEL[status] ?? status}${detail ? ` · ${detail}` : ""}`, proposalId);
  return p;
}

/** Docs Pending → Documents Complete once every mandatory line has a file and nothing is under query. */
export async function recomputeDocs(proposalId: string, actor: Actor) {
  const p = await db.proposal.findUnique({ where: { id: proposalId }, include: { documents: true } });
  if (!p || p.status !== STATUS.DOCS_PENDING) return;
  const done = p.documents.filter((d) => d.mandatory && !d.lenderId).every((d) => d.status !== "PENDING" && d.status !== "QUERY");
  if (!done) return;
  await setStatus(proposalId, STATUS.DOCS_COMPLETE, actor, "all mandatory documents received");
  await notify(p.tenantId, [p.rmId], `${p.refNo}: documents complete`, `All mandatory documents for ${p.companyName} are uploaded and ready for review.`, p.id);
}

/** Query Raised → Query Resolved when no internal (non-lender) query is still open. */
export async function recomputeQueries(proposalId: string, actor: Actor) {
  const p = await db.proposal.findUnique({ where: { id: proposalId } });
  if (!p || p.status !== STATUS.QUERY_RAISED) return;
  const open = await db.query.count({ where: { proposalId, lenderId: null, status: "OPEN" } });
  if (open === 0) await setStatus(proposalId, STATUS.QUERY_RESOLVED, actor, "all queries answered");
}

/**
 * Once a proposal is with lenders, its top-level status is derived from the best lender sub-status,
 * so the RM never updates two places.
 */
export async function deriveFromLenders(proposalId: string, actor: Actor) {
  const p = await db.proposal.findUnique({ where: { id: proposalId }, include: { assignments: true } });
  if (!p) return;
  const derivable: string[] = [STATUS.SENT_TO_LENDERS, STATUS.SANCTIONED, STATUS.ALL_REJECTED];
  if (!derivable.includes(p.status) || p.assignments.length === 0) return;
  const best = Math.max(...p.assignments.map((a) => LENDER_STATUS_RANK[a.status] ?? 0));
  const next = best >= LENDER_STATUS_RANK.SANCTIONED ? STATUS.SANCTIONED : best < 0 ? STATUS.ALL_REJECTED : STATUS.SENT_TO_LENDERS;
  if (next !== p.status) await setStatus(proposalId, next, actor, "derived from lender status");
}
