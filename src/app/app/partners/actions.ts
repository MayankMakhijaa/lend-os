"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireUser, type CurrentUser } from "@/lib/session";
import { audit } from "@/lib/audit";
import { adminIds, appUrl, notify, sendDirectEmail } from "@/lib/notify";
import { issueCredentials, partnerDocGaps, partnerDocs, partnerFields, partnerFiles, savePartnerDocs, validatePartner } from "@/lib/partners";
import { PARTNER_DOCS } from "@/lib/constants";
import { str } from "@/lib/format";

const STAFF = ["ADMIN", "RM"];
const actor = (u: CurrentUser) => ({ id: u.id, name: u.name, role: u.role });
const page = (id: string) => `/app/partners/${id}`;

function go(path: string, msg: string, key: "msg" | "err" = "msg"): never {
  revalidatePath(path);
  redirect(`${path}?${key}=${encodeURIComponent(msg)}`);
}

/** Loads a partner of the caller's own workspace; anything else is "not found". */
async function load(fd: FormData) {
  const u = await requireUser(STAFF);
  const p = await db.user.findFirst({ where: { id: str(fd, "partnerId"), tenantId: u.tenantId, role: "DSA" } });
  if (!p) go("/app/partners", "Partner not found.", "err");
  return { u, p };
}

const label = (type: string) => PARTNER_DOCS.find((d) => d.type === type)?.label ?? type;

/** An RM can't approve a partner account they created themselves; an Admin (or another RM) has to. */
function approvalBlock(u: CurrentUser, p: { createdById: string | null; onboardingSource: string | null }) {
  return u.role !== "ADMIN" && p.onboardingSource === "STAFF" && p.createdById === u.id
    ? "You created this partner account, so an Admin or another RM has to approve it."
    : null;
}

/** Activates the partner, issues the User ID + temporary password and sends them out. */
async function approve(u: CurrentUser, p: { id: string; tenantId: string; partnerCode: string | null; name: string; email: string; createdById: string | null }, remark: string | null) {
  const cred = await issueCredentials(p, u.tenant.slug);
  await db.user.update({ where: { id: p.id }, data: { status: "ACTIVE", reviewRemark: remark, reviewedByName: u.name, reviewedAt: new Date() } });
  await audit(u.tenantId, actor(u), "PARTNER_APPROVED", `${p.email} · User ID ${cred.partnerCode}${remark ? ` · ${remark}` : ""}`);
  const loginUrl = appUrl(`/login?ws=${u.tenant.slug}`);
  const email = await sendDirectEmail(
    p.email,
    `${u.tenant.name}: your partner account is approved`,
    `Hi ${p.name},\n\nYour DSA/Partner account with ${u.tenant.name} has been approved.\n\nSign in: ${loginUrl}\nWorkspace code: ${u.tenant.slug}\nUser ID: ${cred.partnerCode} (your email also works)\nTemporary password: ${cred.password}\n\nYou'll be asked to set your own password the first time you sign in.`,
  );
  await notify(u.tenantId, [p.id], "Your partner account is approved", `Welcome to ${u.tenant.name}. Your User ID is ${cred.partnerCode}. Your login details were sent to ${p.email}.`);
  if (p.createdById && p.createdById !== u.id)
    await notify(u.tenantId, [p.createdById], `Partner approved: ${p.name}`, `${u.name} approved ${p.name} (${p.email}). User ID ${cred.partnerCode}; login details were emailed to the partner.`);
  return { ...cred, emailed: email === "SENT" };
}

/** What the approver sees. If email delivery isn't working, they get the details to pass on themselves. */
function credMsg(lead: string, cred: { partnerCode: string; password: string; emailed: boolean }, email: string) {
  return cred.emailed
    ? `${lead} User ID ${cred.partnerCode}; login details emailed to ${email}.`
    : `${lead} The email could not be delivered (email isn't set up), so share these with the partner: User ID ${cred.partnerCode}, temporary password ${cred.password}`;
}

// ---- Option 2: Admin/RM creates the partner account and uploads the documents on their behalf ----
export async function createPartner(fd: FormData) {
  const u = await requireUser(STAFF);
  const path = "/app/partners/new";
  const email = str(fd, "email").toLowerCase();
  const fields = partnerFields(fd);
  const problem = validatePartner(fields, email);
  if (problem) go(path, problem, "err");
  if (await db.user.findUnique({ where: { tenantId_email: { tenantId: u.tenantId, email } } })) go(path, "A user with this email already exists.", "err");
  const { files, error } = partnerFiles(fd);
  if (error) go(path, error, "err");

  const approveNow = u.role === "ADMIN" && str(fd, "intent") === "approve";
  const p = await db.user.create({ data: { ...fields, tenantId: u.tenantId, role: "DSA", status: "PENDING", email, onboardingSource: "STAFF", createdById: u.id } });
  // An Admin who creates and approves in one go is vouching for the documents they just uploaded.
  await savePartnerDocs(u.tenantId, p.id, files, actor(u), approveNow);
  await audit(u.tenantId, actor(u), "PARTNER_CREATED", `${p.email} · ${p.companyName ?? "no firm name"} · ${files.length} documents`);

  const gaps = partnerDocGaps(p.constitution, (await partnerDocs(p.id)).current);
  if (approveNow && !gaps.missing.length) {
    const cred = await approve(u, p, null);
    go(page(p.id), credMsg(`${p.name} created and approved.`, cred, p.email));
  }
  await sendDirectEmail(
    p.email,
    `${u.tenant.name}: your partner account is being set up`,
    `Hi ${p.name},\n\n${u.name} from ${u.tenant.name} has started a DSA/Partner account for you. Once it is approved you will receive your User ID and password on this email.`,
  );
  const rms = u.role === "RM" ? [] : await db.user.findMany({ where: { tenantId: u.tenantId, role: "RM", status: "ACTIVE" }, select: { id: true } });
  await notify(
    u.tenantId,
    [...(await adminIds(u.tenantId)), ...rms.map((r) => r.id)].filter((id) => id !== u.id),
    "New partner account awaiting approval",
    `${u.name} created a partner account for ${p.name} (${p.companyName ?? "no firm name"}, ${p.email}). Review and approve or reject: ${appUrl(page(p.id))}`,
  );
  go(
    page(p.id),
    gaps.missing.length
      ? `${p.name} saved. Still to upload before approval: ${gaps.missing.map((d) => d.label).join(", ")}.`
      : `${p.name} saved and sent for approval.`,
  );
}

// ---- Edit details (any stage) ----
export async function updatePartner(fd: FormData) {
  const { u, p } = await load(fd);
  const fields = partnerFields(fd);
  // The email is the login and where credentials go; only an Admin may change it.
  const email = u.role === "ADMIN" && str(fd, "email") ? str(fd, "email").toLowerCase() : p.email;
  const problem = validatePartner(fields, email);
  if (problem) go(page(p.id), problem, "err");
  if (email !== p.email && (await db.user.findUnique({ where: { tenantId_email: { tenantId: u.tenantId, email } } }))) go(page(p.id), "Another user already has that email.", "err");
  const before: Record<string, unknown> = p;
  const after: Record<string, unknown> = { ...fields, email };
  const changed = Object.keys(after).filter((k) => (before[k] ?? null) !== (after[k] ?? null));
  if (!changed.length) go(page(p.id), "No changes to save.");
  await db.user.update({ where: { id: p.id }, data: { ...fields, email } });
  await audit(u.tenantId, actor(u), "PARTNER_UPDATED", `${email} · changed ${changed.join(", ")}`);
  go(page(p.id), "Partner details updated.");
}

// ---- Documents ----
export async function uploadPartnerDoc(fd: FormData) {
  const { u, p } = await load(fd);
  const { files, error } = partnerFiles(fd);
  if (error) go(page(p.id), error, "err");
  if (!files.length) go(page(p.id), "Choose a file to upload.", "err");
  await savePartnerDocs(u.tenantId, p.id, files, actor(u));
  await audit(u.tenantId, actor(u), "PARTNER_DOC_UPLOADED", `${p.email} · ${files.map((f) => label(f.type)).join(", ")}`);
  go(page(p.id), `${files.map((f) => label(f.type)).join(", ")} uploaded.`);
}

export async function verifyPartnerDoc(fd: FormData) {
  const { u, p } = await load(fd);
  const doc = await db.partnerDocument.findFirst({ where: { id: str(fd, "docId"), userId: p.id } });
  if (!doc) go(page(p.id), "Document not found.", "err");
  await db.partnerDocument.update({ where: { id: doc.id }, data: { status: "VERIFIED", verifiedByName: u.name, verifiedAt: new Date() } });
  await audit(u.tenantId, actor(u), "PARTNER_DOC_VERIFIED", `${p.email} · ${label(doc.type)}`);
  go(page(p.id), `${label(doc.type)} verified.`);
}

/** The partner replaces one of their own documents from My account; it goes back to staff for verification. */
export async function uploadMyPartnerDoc(fd: FormData) {
  const u = await requireUser(["DSA"]);
  const { files, error } = partnerFiles(fd);
  if (error) go("/app/account", error, "err");
  if (!files.length) go("/app/account", "Choose a file to upload.", "err");
  await savePartnerDocs(u.tenantId, u.id, files, actor(u));
  const names = files.map((f) => label(f.type)).join(", ");
  await audit(u.tenantId, actor(u), "PARTNER_DOC_UPLOADED", `${u.email} · ${names}`);
  await notify(u.tenantId, await adminIds(u.tenantId), `Partner document updated: ${u.name}`, `${u.name} uploaded a new ${names}. Please verify it: ${appUrl(page(u.id))}`);
  go("/app/account", `${names} uploaded. It will be verified by the team.`);
}

// ---- Approval and rejection ----
export async function approvePartner(fd: FormData) {
  const { u, p } = await load(fd);
  if (p.status !== "PENDING") go(page(p.id), "Only a pending application can be approved.", "err");
  const blocked = approvalBlock(u, p);
  if (blocked) go(page(p.id), blocked, "err");
  const gaps = partnerDocGaps(p.constitution, (await partnerDocs(p.id)).current);
  if (gaps.missing.length) go(page(p.id), `Upload these documents before approving: ${gaps.missing.map((d) => d.label).join(", ")}.`, "err");
  if (gaps.unverified.length) go(page(p.id), `Verify these documents before approving: ${gaps.unverified.map((d) => d.label).join(", ")}.`, "err");
  const cred = await approve(u, p, str(fd, "remark") || null);
  go(page(p.id), credMsg(`${p.name} approved.`, cred, p.email));
}

export async function rejectPartner(fd: FormData) {
  const { u, p } = await load(fd);
  if (p.status !== "PENDING") go(page(p.id), "Only a pending application can be rejected.", "err");
  const reason = str(fd, "reason");
  if (!reason) go(page(p.id), "Give the reason for rejecting, so the partner knows what to fix.", "err");
  await db.user.update({ where: { id: p.id }, data: { status: "REJECTED", reviewRemark: reason, reviewedByName: u.name, reviewedAt: new Date() } });
  await audit(u.tenantId, actor(u), "PARTNER_REJECTED", `${p.email} · ${reason}`);
  const reapply = u.tenant.allowDsaSignup && p.onboardingSource === "SELF" ? `\n\nYou can correct this and apply again at ${appUrl(`/signup/${u.tenant.slug}`)}.` : "";
  await sendDirectEmail(
    p.email,
    `${u.tenant.name}: partner application not approved`,
    `Hi ${p.name},\n\nWe could not approve your DSA/Partner application with ${u.tenant.name}.\n\nReason: ${reason}${reapply}${u.tenant.supportEmail ? `\n\nQuestions? Write to ${u.tenant.supportEmail}.` : ""}`,
  );
  if (p.createdById && p.createdById !== u.id)
    await notify(u.tenantId, [p.createdById], `Partner rejected: ${p.name}`, `${u.name} rejected ${p.name} (${p.email}). Reason: ${reason}`);
  go(page(p.id), `${p.name} rejected and informed by email.`);
}

/** Puts a rejected application back in the review queue (e.g. after the partner sent corrected documents). */
export async function reopenPartner(fd: FormData) {
  const { u, p } = await load(fd);
  if (p.status !== "REJECTED") go(page(p.id), "Only a rejected application can be reopened.", "err");
  await db.user.update({ where: { id: p.id }, data: { status: "PENDING" } });
  await audit(u.tenantId, actor(u), "PARTNER_REOPENED", p.email);
  go(page(p.id), "Application reopened for review.");
}

// ---- After approval ----
export async function setPartnerActive(fd: FormData) {
  const { u, p } = await load(fd);
  const enable = str(fd, "active") === "1";
  if (!(enable ? p.status === "DISABLED" : p.status === "ACTIVE")) go(page(p.id), "That action isn't available for this partner.", "err");
  // A partner who was never approved has no credentials yet; they go through approval instead.
  if (enable && !p.partnerCode && !p.passwordHash) {
    await db.user.update({ where: { id: p.id }, data: { status: "PENDING" } });
    await audit(u.tenantId, actor(u), "PARTNER_REOPENED", p.email);
    go(page(p.id), "Application reopened for review.");
  }
  await db.user.update({ where: { id: p.id }, data: { status: enable ? "ACTIVE" : "DISABLED" } });
  await audit(u.tenantId, actor(u), enable ? "PARTNER_ENABLED" : "PARTNER_DISABLED", p.email);
  go(page(p.id), `${p.name} ${enable ? "enabled" : "disabled"}.`);
}

export async function resendPartnerCredentials(fd: FormData) {
  const { u, p } = await load(fd);
  if (p.status !== "ACTIVE") go(page(p.id), "Login details can only be sent to an approved partner.", "err");
  const cred = await issueCredentials(p, u.tenant.slug);
  await audit(u.tenantId, actor(u), "PARTNER_CREDENTIALS_SENT", p.email);
  const sent = await sendDirectEmail(
    p.email,
    `${u.tenant.name}: your login details`,
    `Hi ${p.name},\n\nHere are your login details for ${u.tenant.name}.\n\nSign in: ${appUrl(`/login?ws=${u.tenant.slug}`)}\nWorkspace code: ${u.tenant.slug}\nUser ID: ${cred.partnerCode} (your email also works)\nTemporary password: ${cred.password}\n\nYou'll be asked to set your own password when you sign in. Your previous password no longer works.`,
  );
  go(page(p.id), credMsg("New login details issued.", { ...cred, emailed: sent === "SENT" }, p.email));
}
