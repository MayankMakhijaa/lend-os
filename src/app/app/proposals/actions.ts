"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireUser, type CurrentUser } from "@/lib/session";
import { getScopedProposal } from "@/lib/access";
import { audit } from "@/lib/audit";
import { adminIds, lenderUserIds, notify } from "@/lib/notify";
import { saveFile, MAX_UPLOAD_BYTES } from "@/lib/storage";
import { deriveFromLenders, recomputeDocs, recomputeQueries, setStatus } from "@/lib/workflow";
import { LENDER_STATUS, LENDER_STATUS_LABEL, STATUS } from "@/lib/constants";
import { fmtINR, num, str } from "@/lib/format";

const actor = (u: CurrentUser) => ({ id: u.id, name: u.name, role: u.role });
const page = (id: string) => `/app/proposals/${id}`;

function done(id: string, msg: string): never {
  revalidatePath(page(id));
  redirect(`${page(id)}?msg=${encodeURIComponent(msg)}`);
}
function fail(id: string, err: string): never {
  redirect(`${page(id)}?err=${encodeURIComponent(err)}`);
}

/** Loads the proposal through the caller's access scope; throws 404 for anything outside it. */
async function load(fd: FormData, roles: string[]) {
  const u = await requireUser(roles);
  const p = await getScopedProposal(u, str(fd, "proposalId"));
  return { u, p };
}

function requireStatus(p: { id: string; status: string }, allowed: string[]) {
  if (!allowed.includes(p.status)) fail(p.id, "That action isn't available at this stage.");
}

async function nextRefNo(tenantId: string, slug: string) {
  const n = (await db.proposal.count({ where: { tenantId } })) + 1;
  const d = new Date();
  const yymm = `${String(d.getFullYear()).slice(2)}${String(d.getMonth() + 1).padStart(2, "0")}`;
  return `${slug.slice(0, 4).toUpperCase()}-${yymm}-${String(n).padStart(4, "0")}`;
}

function proposalFields(fd: FormData) {
  return {
    companyName: str(fd, "companyName"),
    constitution: str(fd, "constitution") || null,
    pan: str(fd, "pan").toUpperCase() || null,
    gstin: str(fd, "gstin").toUpperCase() || null,
    contactName: str(fd, "contactName") || null,
    contactPhone: str(fd, "contactPhone") || null,
    contactEmail: str(fd, "contactEmail") || null,
    city: str(fd, "city") || null,
    loanAmount: num(fd, "loanAmount"),
    turnover: num(fd, "turnover"),
    purpose: str(fd, "purpose") || null,
    notes: str(fd, "notes") || null,
  };
}

// ---- Step 1: DSA creates a proposal ----
export async function createProposal(fd: FormData) {
  const u = await requireUser(["DSA", "ADMIN", "RM"]);
  const data = proposalFields(fd);
  const product = await db.product.findFirst({ where: { id: str(fd, "productId"), tenantId: u.tenantId, active: true } });
  if (!data.companyName || !product) redirect("/app/proposals/new?err=Company+name+and+product+are+required.");

  // Admin/RM may log a case on behalf of a DSA; DSAs always own their own cases.
  let dsaId = u.id;
  if (u.role !== "DSA") {
    const dsa = await db.user.findFirst({ where: { id: str(fd, "dsaId"), tenantId: u.tenantId, role: "DSA", status: "ACTIVE" } });
    if (!dsa) redirect("/app/proposals/new?err=Choose+the+DSA%2FPartner+this+case+belongs+to.");
    dsaId = dsa.id;
  }
  const submit = str(fd, "intent") !== "draft";
  const p = await db.proposal.create({
    data: {
      ...data,
      tenantId: u.tenantId,
      refNo: await nextRefNo(u.tenantId, u.tenant.slug),
      dsaId,
      productId: product.id,
      rmId: u.role === "RM" ? u.id : null,
    },
  });
  await db.statusEvent.create({ data: { proposalId: p.id, status: STATUS.DRAFT } });
  await audit(u.tenantId, actor(u), "PROPOSAL_CREATED", `${p.refNo} · ${product.code} · ${p.companyName}`, p.id);
  if (submit) await submitInternal(u, p.id);
  done(p.id, submit ? "Proposal submitted." : "Draft saved.");
}

async function submitInternal(u: CurrentUser, proposalId: string) {
  const p = await setStatus(proposalId, STATUS.SUBMITTED, actor(u));
  await notify(u.tenantId, await adminIds(u.tenantId), `New proposal ${p.refNo}`, `${p.companyName} was submitted and needs an RM assigned.`, p.id);
  if (p.rmId) {
    await setStatus(p.id, STATUS.RM_ASSIGNED, actor(u), "created by RM");
  }
}

export async function updateDraft(fd: FormData) {
  const { u, p } = await load(fd, ["DSA", "ADMIN", "RM"]);
  requireStatus(p, [STATUS.DRAFT]);
  await db.proposal.update({ where: { id: p.id }, data: proposalFields(fd) });
  await audit(u.tenantId, actor(u), "PROPOSAL_EDITED", undefined, p.id);
  if (str(fd, "intent") === "submit") {
    await submitInternal(u, p.id);
    done(p.id, "Proposal submitted.");
  }
  done(p.id, "Draft saved.");
}

// ---- Step 2: Admin assigns an RM ----
export async function assignRm(fd: FormData) {
  const { u, p } = await load(fd, ["ADMIN"]);
  if (p.status === STATUS.DRAFT) fail(p.id, "The proposal hasn't been submitted yet.");
  const rm = await db.user.findFirst({ where: { id: str(fd, "rmId"), tenantId: u.tenantId, role: "RM", status: "ACTIVE" } });
  if (!rm) fail(p.id, "Choose an active RM.");
  await db.proposal.update({ where: { id: p.id }, data: { rmId: rm.id } });
  await audit(u.tenantId, actor(u), "RM_ASSIGNED", rm.name, p.id);
  if (p.status === STATUS.SUBMITTED) await setStatus(p.id, STATUS.RM_ASSIGNED, actor(u));
  await notify(u.tenantId, [rm.id, p.dsaId], `${p.refNo}: RM assigned`, `${rm.name} is the relationship manager for ${p.companyName}.`, p.id);
  done(p.id, `Assigned to ${rm.name}.`);
}

// ---- Steps 3–4: feasibility, then the checklist goes to the DSA ----
export async function decideFeasibility(fd: FormData) {
  const { u, p } = await load(fd, ["RM", "ADMIN"]);
  requireStatus(p, [STATUS.RM_ASSIGNED]);
  const remark = str(fd, "remark") || null;
  await db.proposal.update({ where: { id: p.id }, data: { feasibilityRemark: remark } });

  if (str(fd, "decision") !== "feasible") {
    await db.proposal.update({ where: { id: p.id }, data: { closedReason: remark ?? "Not feasible" } });
    await setStatus(p.id, STATUS.NOT_FEASIBLE, actor(u), remark ?? undefined);
    await notify(u.tenantId, [p.dsaId], `${p.refNo}: not feasible`, `${p.companyName} was found not feasible.${remark ? ` Remark: ${remark}` : ""}`, p.id);
    done(p.id, "Case closed as not feasible.");
  }

  const items = await db.checklistItem.findMany({
    where: { tenantId: u.tenantId, productId: p.productId, lenderId: null, active: true },
    orderBy: { sortOrder: "asc" },
  });
  await db.proposalDocument.createMany({
    data: items.map((i) => ({
      tenantId: u.tenantId,
      proposalId: p.id,
      checklistItemId: i.id,
      category: i.category,
      title: i.title,
      description: i.description,
      mandatory: i.mandatory,
      sortOrder: i.sortOrder,
    })),
  });
  await setStatus(p.id, STATUS.FEASIBLE, actor(u), remark ?? undefined);
  await setStatus(p.id, STATUS.DOCS_PENDING, { id: null, name: "System", role: "SYSTEM" }, `checklist of ${items.length} documents shared`);
  const list = items.map((i) => `• ${i.category}: ${i.title}${i.mandatory ? "" : " (if applicable)"}`).join("\n");
  await notify(u.tenantId, [p.dsaId], `${p.refNo}: feasible, documents requested`, `${p.companyName} is feasible. Please upload:\n${list}`, p.id);
  done(p.id, "Marked feasible and checklist shared with the DSA.");
}

// ---- Steps 5 & 7: DSA uploads / re-uploads ----
export async function uploadDocument(fd: FormData) {
  const { u, p } = await load(fd, ["DSA", "RM", "ADMIN"]);
  const doc = await db.proposalDocument.findFirst({ where: { id: str(fd, "documentId"), proposalId: p.id } });
  if (!doc) fail(p.id, "Document line not found.");
  const files = fd.getAll("file").filter((f): f is File => f instanceof File && f.size > 0);
  if (!files.length) fail(p.id, "Choose a file to upload.");
  if (files.some((f) => f.size > MAX_UPLOAD_BYTES)) fail(p.id, "Each file must be 20 MB or smaller.");

  let version = await db.documentVersion.count({ where: { documentId: doc.id } });
  const hadFile = version > 0;
  for (const f of files) {
    const storedName = await saveFile(u.tenantId, Buffer.from(await f.arrayBuffer()));
    version += 1;
    await db.documentVersion.create({
      data: {
        documentId: doc.id,
        version,
        fileName: f.name,
        storedName,
        mimeType: f.type || "application/octet-stream",
        size: f.size,
        uploadedById: u.id,
        uploadedByName: u.name,
      },
    });
  }
  const reupload = hadFile || doc.status === "QUERY";
  await db.proposalDocument.update({ where: { id: doc.id }, data: { status: reupload ? "REUPLOADED" : "UPLOADED" } });
  await audit(u.tenantId, actor(u), reupload ? "DOCUMENT_REUPLOADED" : "DOCUMENT_UPLOADED", `${doc.title} (${files.map((f) => f.name).join(", ")})`, p.id);

  // A re-upload answers any open query on this line and pings whoever raised it.
  const open = await db.query.findMany({ where: { documentId: doc.id, status: "OPEN" } });
  for (const qq of open) {
    await db.query.update({
      where: { id: qq.id },
      data: { status: "RESPONDED", response: `Document re-uploaded (${files.map((f) => f.name).join(", ")})`, respondedById: u.id, respondedByName: u.name, respondedAt: new Date() },
    });
    const to = qq.lenderId ? [...(await lenderUserIds(u.tenantId, qq.lenderId)), p.rmId] : [qq.raisedById, p.rmId];
    await notify(u.tenantId, to, `${p.refNo}: document re-uploaded`, `"${doc.title}" was re-uploaded for ${p.companyName} in response to your query. It is pending re-verification.`, p.id);
  }
  await recomputeQueries(p.id, actor(u));
  await recomputeDocs(p.id, actor(u));
  done(p.id, reupload ? "Document re-uploaded." : "Document uploaded.");
}

export async function verifyDocument(fd: FormData) {
  const { u, p } = await load(fd, ["RM", "ADMIN"]);
  const doc = await db.proposalDocument.findFirst({ where: { id: str(fd, "documentId"), proposalId: p.id } });
  if (!doc) fail(p.id, "Document line not found.");
  if (doc.status === "PENDING") fail(p.id, "Nothing uploaded yet.");
  await db.proposalDocument.update({ where: { id: doc.id }, data: { status: "VERIFIED" } });
  await audit(u.tenantId, actor(u), "DOCUMENT_VERIFIED", doc.title, p.id);
  await recomputeDocs(p.id, actor(u));
  done(p.id, "Document verified.");
}

// ---- Step 6: queries (RM or lender) ----
export async function raiseQuery(fd: FormData) {
  const { u, p } = await load(fd, ["RM", "ADMIN", "LENDER"]);
  const message = str(fd, "message");
  if (!message) fail(p.id, "Write the query.");
  const docId = str(fd, "documentId") || null;
  const doc = docId ? await db.proposalDocument.findFirst({ where: { id: docId, proposalId: p.id } }) : null;
  if (docId && !doc) fail(p.id, "Document line not found.");

  let lenderId: string | null = null;
  if (u.role === "LENDER") {
    const a = await db.lenderAssignment.findFirst({ where: { proposalId: p.id, lenderId: u.lenderId ?? "" } });
    if (!a) fail(p.id, "Not available.");
    lenderId = a.lenderId;
    await db.lenderAssignment.update({ where: { id: a.id }, data: { status: LENDER_STATUS.QUERY } });
  }
  await db.query.create({
    data: { tenantId: u.tenantId, proposalId: p.id, documentId: doc?.id, lenderId, raisedById: u.id, raisedByName: u.name, raisedByRole: u.role, message },
  });
  if (doc) await db.proposalDocument.update({ where: { id: doc.id }, data: { status: "QUERY" } });
  await audit(u.tenantId, actor(u), "QUERY_RAISED", `${doc ? `[${doc.title}] ` : ""}${message}`, p.id);

  const preIpa: string[] = [STATUS.DOCS_PENDING, STATUS.DOCS_COMPLETE, STATUS.QUERY_RESOLVED];
  if (!lenderId && preIpa.includes(p.status)) await setStatus(p.id, STATUS.QUERY_RAISED, actor(u));
  const who = lenderId ? `${u.lender?.name} (lender)` : u.name;
  await notify(
    u.tenantId,
    lenderId ? [p.dsaId, p.rmId] : [p.dsaId],
    `${p.refNo}: query raised`,
    `${who} raised a query on ${p.companyName}${doc ? ` about "${doc.title}"` : ""}:\n"${message}"\nPlease respond or re-upload on your login.`,
    p.id,
  );
  done(p.id, "Query raised and the DSA notified.");
}

export async function respondQuery(fd: FormData) {
  const { u, p } = await load(fd, ["DSA", "RM", "ADMIN"]);
  const qq = await db.query.findFirst({ where: { id: str(fd, "queryId"), proposalId: p.id } });
  if (!qq || qq.status === "CLOSED") fail(p.id, "Query not found or already closed.");
  const response = str(fd, "response");
  if (!response) fail(p.id, "Write a response.");
  await db.query.update({
    where: { id: qq.id },
    data: { status: "RESPONDED", response, respondedById: u.id, respondedByName: u.name, respondedAt: new Date() },
  });
  await audit(u.tenantId, actor(u), "QUERY_RESPONDED", response, p.id);
  const to = qq.lenderId ? [...(await lenderUserIds(u.tenantId, qq.lenderId)), p.rmId] : [qq.raisedById, p.rmId];
  await notify(u.tenantId, to, `${p.refNo}: query answered`, `${u.name} responded on ${p.companyName}:\n"${response}"`, p.id);
  await recomputeQueries(p.id, actor(u));
  done(p.id, "Response sent.");
}

export async function closeQuery(fd: FormData) {
  const { u, p } = await load(fd, ["RM", "ADMIN", "LENDER"]);
  const qq = await db.query.findFirst({ where: { id: str(fd, "queryId"), proposalId: p.id } });
  if (!qq) fail(p.id, "Query not found.");
  if (u.role === "LENDER" && qq.lenderId !== u.lenderId) fail(p.id, "You can only close your own queries.");
  await db.query.update({ where: { id: qq.id }, data: { status: "CLOSED", closedAt: new Date() } });
  if (qq.documentId) {
    const d = await db.proposalDocument.findUnique({ where: { id: qq.documentId } });
    if (d?.status === "QUERY") await db.proposalDocument.update({ where: { id: d.id }, data: { status: "UPLOADED" } });
  }
  if (qq.lenderId) {
    const stillOpen = await db.query.count({ where: { proposalId: p.id, lenderId: qq.lenderId, status: { not: "CLOSED" } } });
    const a = await db.lenderAssignment.findFirst({ where: { proposalId: p.id, lenderId: qq.lenderId } });
    if (!stillOpen && a?.status === LENDER_STATUS.QUERY)
      await db.lenderAssignment.update({ where: { id: a.id }, data: { status: LENDER_STATUS.UNDER_REVIEW } });
  }
  await audit(u.tenantId, actor(u), "QUERY_CLOSED", qq.message, p.id);
  await recomputeQueries(p.id, actor(u));
  await recomputeDocs(p.id, actor(u));
  done(p.id, "Query closed.");
}

// ---- Step 7: PD call ----
export async function schedulePd(fd: FormData) {
  const { u, p } = await load(fd, ["RM", "ADMIN"]);
  requireStatus(p, [STATUS.DOCS_COMPLETE, STATUS.QUERY_RAISED, STATUS.QUERY_RESOLVED, STATUS.PD_SCHEDULED]);
  const at = new Date(str(fd, "scheduledAt"));
  if (isNaN(at.getTime())) fail(p.id, "Pick a date and time for the PD call.");
  await db.pdCall.create({
    data: { proposalId: p.id, scheduledAt: at, attendees: str(fd, "attendees") || null, loggedById: u.id, loggedByName: u.name },
  });
  await audit(u.tenantId, actor(u), "PD_SCHEDULED", at.toISOString(), p.id);
  if (p.status !== STATUS.QUERY_RAISED) await setStatus(p.id, STATUS.PD_SCHEDULED, actor(u));
  await notify(u.tenantId, [p.dsaId], `${p.refNo}: PD call scheduled`, `A PD call with ${p.companyName} is scheduled for ${at.toLocaleString("en-IN")}.`, p.id);
  done(p.id, "PD call scheduled.");
}

export async function completePd(fd: FormData) {
  const { u, p } = await load(fd, ["RM", "ADMIN"]);
  const call = await db.pdCall.findFirst({ where: { id: str(fd, "pdCallId"), proposalId: p.id } });
  if (!call) fail(p.id, "PD call not found.");
  const open = await db.query.count({ where: { proposalId: p.id, lenderId: null, status: "OPEN" } });
  if (open) fail(p.id, "Resolve open queries before completing the PD call.");
  await db.pdCall.update({ where: { id: call.id }, data: { completedAt: new Date(), notes: str(fd, "notes") || null } });
  await audit(u.tenantId, actor(u), "PD_COMPLETED", str(fd, "notes"), p.id);
  if ([STATUS.PD_SCHEDULED, STATUS.QUERY_RESOLVED, STATUS.DOCS_COMPLETE].includes(p.status as never))
    await setStatus(p.id, STATUS.PD_COMPLETED, actor(u));
  done(p.id, "PD call completed.");
}

// ---- Step 8: credit assessment & in-principle approval ----
export async function approveIpa(fd: FormData) {
  const { u, p } = await load(fd, ["RM", "ADMIN"]);
  requireStatus(p, [STATUS.PD_COMPLETED]);
  const remark = str(fd, "remark");
  await db.proposal.update({ where: { id: p.id }, data: { ipaRemark: remark || null, ipaAt: new Date() } });
  await setStatus(p.id, STATUS.IPA_DONE, actor(u), remark || undefined);
  await notify(u.tenantId, [p.dsaId], `${p.refNo}: approved internally`, `${p.companyName} has in-principle approval and will be sent to lenders.`, p.id);
  done(p.id, "In-principle approval recorded.");
}

export async function closeCase(fd: FormData) {
  const { u, p } = await load(fd, ["RM", "ADMIN"]);
  if ([STATUS.DISBURSED, STATUS.PAYOUT_RELEASED, STATUS.NOT_FEASIBLE].includes(p.status as never)) fail(p.id, "This case can't be closed now.");
  const reason = str(fd, "reason");
  if (!reason) fail(p.id, "Give a reason for closing.");
  await db.proposal.update({ where: { id: p.id }, data: { closedReason: reason } });
  await setStatus(p.id, STATUS.NOT_FEASIBLE, actor(u), reason);
  await notify(u.tenantId, [p.dsaId, p.rmId], `${p.refNo}: case closed`, `${p.companyName} was closed. Reason: ${reason}`, p.id);
  done(p.id, "Case closed.");
}

// ---- Step 9: send to several lenders at once ----
export async function sendToLenders(fd: FormData) {
  const { u, p } = await load(fd, ["RM", "ADMIN"]);
  requireStatus(p, [STATUS.IPA_DONE, STATUS.SENT_TO_LENDERS, STATUS.ALL_REJECTED, STATUS.SANCTIONED]);
  const ids = fd.getAll("lenderId").map(String);
  const lenders = await db.lender.findMany({ where: { id: { in: ids }, tenantId: u.tenantId, active: true } });
  if (!lenders.length) fail(p.id, "Select at least one lender.");
  const existing = new Set((await db.lenderAssignment.findMany({ where: { proposalId: p.id } })).map((a) => a.lenderId));
  const fresh = lenders.filter((l) => !existing.has(l.id));
  if (!fresh.length) fail(p.id, "Those lenders already have this proposal.");

  let extraDocs = 0;
  for (const l of fresh) {
    await db.lenderAssignment.create({ data: { tenantId: u.tenantId, proposalId: p.id, lenderId: l.id } });
    // Lender-specific checklist lines become extra documents for the DSA.
    const extras = await db.checklistItem.findMany({ where: { tenantId: u.tenantId, productId: p.productId, lenderId: l.id, active: true } });
    if (extras.length) {
      extraDocs += extras.length;
      await db.proposalDocument.createMany({
        data: extras.map((i) => ({
          tenantId: u.tenantId, proposalId: p.id, checklistItemId: i.id, lenderId: l.id,
          category: `${l.name} requirement`, title: i.title, description: i.description, mandatory: i.mandatory, sortOrder: 1000 + i.sortOrder,
        })),
      });
    }
    await audit(u.tenantId, actor(u), "SENT_TO_LENDER", l.name, p.id);
    await notify(u.tenantId, [p.dsaId], `${p.refNo}: sent to ${l.name}`, `${p.companyName} has been sent to ${l.name}.${extras.length ? ` ${l.name} needs ${extras.length} additional document(s); please upload them.` : ""}`, p.id);
    await notify(u.tenantId, await lenderUserIds(u.tenantId, l.id), `New proposal ${p.refNo}`, `${p.companyName} (${fmtINR(p.loanAmount)}) has been shared with ${l.name} for review.`, p.id);
  }
  if (p.status === STATUS.IPA_DONE) await setStatus(p.id, STATUS.SENT_TO_LENDERS, actor(u), `${fresh.length} lender(s)`);
  else await deriveFromLenders(p.id, actor(u));
  done(p.id, `Sent to ${fresh.map((l) => l.name).join(", ")}.${extraDocs ? ` ${extraDocs} lender-specific document(s) requested from the DSA.` : ""}`);
}

// ---- Steps 9–10: lender sub-status & sanction letter ----
export async function updateLenderStatus(fd: FormData) {
  const { u, p } = await load(fd, ["RM", "ADMIN", "LENDER"]);
  const a = await db.lenderAssignment.findFirst({ where: { id: str(fd, "assignmentId"), proposalId: p.id }, include: { lender: true } });
  if (!a) fail(p.id, "Lender not found on this proposal.");
  if (u.role === "LENDER" && a.lenderId !== u.lenderId) fail(p.id, "Not available.");
  const status = str(fd, "status");
  const allowed = u.role === "LENDER" ? Object.values(LENDER_STATUS).filter((s) => s !== "WITHDRAWN") : Object.values(LENDER_STATUS);
  if (!allowed.includes(status as never)) fail(p.id, "Invalid status.");

  let sanctionVersionId = a.sanctionVersionId;
  const file = fd.get("sanctionLetter");
  if (file instanceof File && file.size > 0) {
    if (file.size > MAX_UPLOAD_BYTES) fail(p.id, "File must be 20 MB or smaller.");
    let doc = await db.proposalDocument.findFirst({ where: { proposalId: p.id, lenderId: a.lenderId, category: "Sanction Letter" } });
    doc ??= await db.proposalDocument.create({
      data: { tenantId: u.tenantId, proposalId: p.id, lenderId: a.lenderId, category: "Sanction Letter", title: `Sanction letter · ${a.lender.name}`, mandatory: false, sortOrder: 2000, status: "UPLOADED" },
    });
    const v = await db.documentVersion.create({
      data: {
        documentId: doc.id,
        version: (await db.documentVersion.count({ where: { documentId: doc.id } })) + 1,
        fileName: file.name,
        storedName: await saveFile(u.tenantId, Buffer.from(await file.arrayBuffer())),
        mimeType: file.type || "application/octet-stream",
        size: file.size,
        uploadedById: u.id,
        uploadedByName: u.name,
      },
    });
    sanctionVersionId = v.id;
  }
  if (status === LENDER_STATUS.SANCTIONED && !sanctionVersionId) fail(p.id, "Attach the sanction letter to mark this lender as sanctioned.");

  await db.lenderAssignment.update({
    where: { id: a.id },
    data: {
      status,
      remarks: str(fd, "remarks") || a.remarks,
      sanctionAmount: num(fd, "sanctionAmount") ?? a.sanctionAmount,
      sanctionRoi: str(fd, "sanctionRoi") || a.sanctionRoi,
      sanctionVersionId,
    },
  });
  await audit(u.tenantId, actor(u), "LENDER_STATUS", `${a.lender.name}: ${LENDER_STATUS_LABEL[a.status]} → ${LENDER_STATUS_LABEL[status]}`, p.id);
  const subj = status === LENDER_STATUS.SANCTIONED ? `${p.refNo}: sanction letter issued by ${a.lender.name}` : `${p.refNo}: ${a.lender.name} is now ${LENDER_STATUS_LABEL[status]}`;
  await notify(u.tenantId, [p.rmId, p.dsaId], subj, `${a.lender.name} updated ${p.companyName} to "${LENDER_STATUS_LABEL[status]}".${str(fd, "remarks") ? ` Remarks: ${str(fd, "remarks")}` : ""}`, p.id);
  await deriveFromLenders(p.id, actor(u));
  done(p.id, `${a.lender.name} updated.`);
}

// ---- Step 11: disbursement ----
export async function logDisbursement(fd: FormData) {
  const { u, p } = await load(fd, ["RM", "ADMIN"]);
  requireStatus(p, [STATUS.SANCTIONED]);
  const a = await db.lenderAssignment.findFirst({ where: { proposalId: p.id, lenderId: str(fd, "lenderId"), status: LENDER_STATUS.SANCTIONED }, include: { lender: true } });
  if (!a) fail(p.id, "Choose the sanctioning lender.");
  const amount = num(fd, "amount");
  if (!amount) fail(p.id, "Enter the disbursed amount.");
  const date = str(fd, "date") ? new Date(str(fd, "date")) : new Date();
  await db.proposal.update({ where: { id: p.id }, data: { disbursedAmount: amount, disbursedAt: date, disbursedLenderId: a.lenderId } });
  await setStatus(p.id, STATUS.DISBURSED, actor(u), `${fmtINR(amount)} by ${a.lender.name}`);
  await notify(u.tenantId, [p.rmId, p.dsaId], `${p.refNo}: disbursed`, `${fmtINR(amount)} was disbursed to ${p.companyName} by ${a.lender.name}.`, p.id);
  done(p.id, "Disbursement logged.");
}

// ---- Step 12: payout to DSA ----
export async function releasePayout(fd: FormData) {
  const { u, p } = await load(fd, ["ADMIN"]);
  requireStatus(p, [STATUS.DISBURSED]);
  const amount = num(fd, "amount");
  if (amount == null) fail(p.id, "Enter the payout amount.");
  await db.proposal.update({ where: { id: p.id }, data: { payoutAmount: amount, payoutRef: str(fd, "reference") || null, payoutAt: new Date() } });
  await setStatus(p.id, STATUS.PAYOUT_RELEASED, actor(u), `${fmtINR(amount)}${str(fd, "reference") ? ` ref ${str(fd, "reference")}` : ""}`);
  await notify(u.tenantId, [p.dsaId], `${p.refNo}: payout released`, `Your payout of ${fmtINR(amount)} for ${p.companyName} has been released.${str(fd, "reference") ? ` Reference: ${str(fd, "reference")}` : ""}`, p.id);
  done(p.id, "Payout released. Case complete.");
}
