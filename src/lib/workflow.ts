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

const SYSTEM: Actor = { id: null, name: "System", role: "SYSTEM" };

/** True when every mandatory common (non-lender) document has a file and nothing is under query. */
function docsReceived(docs: { mandatory: boolean; lenderId: string | null; status: string }[]) {
  return docs.filter((d) => d.mandatory && !d.lenderId).every((d) => d.status !== "PENDING" && d.status !== "QUERY");
}

/**
 * Step 3: as soon as an RM owns the case, the product's document checklist goes to the DSA.
 * Feasibility is reviewed afterwards, once the documents are in.
 */
export async function shareChecklist(proposalId: string) {
  const p = await db.proposal.findUnique({ where: { id: proposalId }, include: { _count: { select: { documents: true } } } });
  if (!p || p.status !== STATUS.RM_ASSIGNED) return;
  const items = await db.checklistItem.findMany({
    where: { tenantId: p.tenantId, productId: p.productId, lenderId: null, active: true },
    orderBy: { sortOrder: "asc" },
  });
  if (p._count.documents === 0) {
    await db.proposalDocument.createMany({
      data: items.map((i) => ({
        tenantId: p.tenantId,
        proposalId: p.id,
        checklistItemId: i.id,
        category: i.category,
        title: i.title,
        description: i.description,
        mandatory: i.mandatory,
        sortOrder: i.sortOrder,
      })),
    });
  }
  await setStatus(p.id, STATUS.DOCS_PENDING, SYSTEM, `checklist of ${items.length} documents shared`);
  const list = items.map((i) => `• ${i.category}: ${i.title}${i.mandatory ? "" : " (if applicable)"}`).join("\n");
  await notify(
    p.tenantId,
    [p.dsaId],
    `${p.refNo}: documents requested`,
    `Please upload the documents for ${p.companyName}. Feasibility is reviewed once they are received.\n${list}`,
    p.id,
  );
  await recomputeDocs(p.id, SYSTEM); // a product with no mandatory documents goes straight to feasibility
}

/** Docs Pending → Documents Received once every mandatory line has a file and nothing is under query. */
export async function recomputeDocs(proposalId: string, actor: Actor) {
  const p = await db.proposal.findUnique({ where: { id: proposalId }, include: { documents: true } });
  if (!p || p.status !== STATUS.DOCS_PENDING) return;
  if (!docsReceived(p.documents)) return;
  await setStatus(proposalId, STATUS.DOCS_COMPLETE, actor, "all mandatory documents received");
  await notify(
    p.tenantId,
    [p.rmId],
    `${p.refNo}: documents received`,
    p.feasibleAt
      ? `All mandatory documents for ${p.companyName} are uploaded and ready for review.`
      : `All mandatory documents for ${p.companyName} are uploaded. Please review feasibility.`,
    p.id,
  );
}

/**
 * Query Raised → resolved when no internal (non-lender) query is still open. After feasibility that is
 * "Query Resolved"; before it, the case drops back into the document stage it was in.
 */
export async function recomputeQueries(proposalId: string, actor: Actor) {
  const p = await db.proposal.findUnique({ where: { id: proposalId }, include: { documents: true } });
  if (!p || p.status !== STATUS.QUERY_RAISED) return;
  const open = await db.query.count({ where: { proposalId, lenderId: null, status: "OPEN" } });
  if (open > 0) return;
  if (p.feasibleAt) {
    await setStatus(proposalId, STATUS.QUERY_RESOLVED, actor, "all queries answered");
    return;
  }
  await setStatus(proposalId, STATUS.DOCS_PENDING, actor, "all queries answered");
  await recomputeDocs(proposalId, actor);
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
