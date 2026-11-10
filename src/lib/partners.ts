import "server-only";
import bcrypt from "bcryptjs";
import crypto from "node:crypto";
import type { PartnerDocument } from "@prisma/client";
import { db } from "./db";
import { saveFile } from "./storage";
import { CONSTITUTIONS, PARTNER_DOCS, PARTNER_DOC_MAX_BYTES, requiredPartnerDocs } from "./constants";
import { fmtBytes, str } from "./format";

const PAN_RE = /^[A-Z]{5}[0-9]{4}[A-Z]$/;
const GSTIN_RE = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][0-9A-Z]Z[0-9A-Z]$/;
const DOC_MIME: Record<string, string> = { pdf: "application/pdf", jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png" };

export function partnerFields(fd: FormData) {
  return {
    name: str(fd, "name"),
    companyName: str(fd, "companyName") || null,
    phone: str(fd, "phone") || null,
    constitution: str(fd, "constitution") || null,
    pan: str(fd, "pan").toUpperCase() || null,
    gstin: str(fd, "gstin").toUpperCase() || null,
    address: str(fd, "address") || null,
    city: str(fd, "city") || null,
    state: str(fd, "state") || null,
    pincode: str(fd, "pincode") || null,
  };
}

/** Returns the first problem with the partner's details, or null when they are complete. */
export function validatePartner(f: ReturnType<typeof partnerFields>, email: string): string | null {
  if (!f.name) return "The partner's name is required.";
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return "A valid email is required.";
  if (!f.phone || f.phone.replace(/\D/g, "").length < 10) return "A valid mobile number is required.";
  if (!f.constitution || !CONSTITUTIONS.includes(f.constitution)) return "Choose the constitution of the firm.";
  if (!f.pan || !PAN_RE.test(f.pan)) return "Enter a valid 10-character PAN (e.g. ABCDE1234F).";
  if (f.gstin && !GSTIN_RE.test(f.gstin)) return "The GSTIN doesn't look right. It has 15 characters (e.g. 27ABCDE1234F1Z5).";
  if (!f.address || !f.city || !f.state) return "Address, city and state are required.";
  if (f.pincode && !/^[1-9][0-9]{5}$/.test(f.pincode)) return "Enter a valid 6-digit PIN code.";
  return null;
}

type Incoming = { type: string; file: File; mimeType: string };

/** Reads the `doc_<TYPE>` file inputs of an onboarding form. Only PDF/JPG/PNG up to 5 MB are accepted. */
export function partnerFiles(fd: FormData): { files: Incoming[]; error: string | null } {
  const files: Incoming[] = [];
  for (const d of PARTNER_DOCS) {
    const f = fd.get(`doc_${d.type}`);
    if (!(f instanceof File) || f.size === 0) continue;
    const mimeType = DOC_MIME[f.name.split(".").pop()?.toLowerCase() ?? ""];
    if (!mimeType) return { files, error: `${d.label}: upload a PDF, JPG or PNG file.` };
    if (f.size > PARTNER_DOC_MAX_BYTES) return { files, error: `${d.label}: the file must be ${fmtBytes(PARTNER_DOC_MAX_BYTES)} or smaller.` };
    files.push({ type: d.type, file: f, mimeType });
  }
  return { files, error: null };
}

export async function savePartnerDocs(
  tenantId: string,
  userId: string,
  files: Incoming[],
  by: { id: string | null; name: string },
  verified = false,
) {
  for (const { type, file, mimeType } of files) {
    await db.partnerDocument.create({
      data: {
        tenantId,
        userId,
        type,
        fileName: file.name,
        storedName: await saveFile(tenantId, Buffer.from(await file.arrayBuffer())),
        mimeType,
        size: file.size,
        uploadedById: by.id,
        uploadedByName: by.name,
        ...(verified ? { status: "VERIFIED", verifiedByName: by.name, verifiedAt: new Date() } : {}),
      },
    });
  }
}

/** Newest upload per document type, plus the full history. */
export async function partnerDocs(userId: string) {
  const all = await db.partnerDocument.findMany({ where: { userId }, orderBy: { createdAt: "desc" } });
  const current = new Map<string, PartnerDocument>();
  for (const d of all) if (!current.has(d.type)) current.set(d.type, d);
  return { all, current };
}

/** What still blocks approval: required documents that are missing or not yet verified. */
export function partnerDocGaps(constitution: string | null, current: Map<string, PartnerDocument>) {
  const required = requiredPartnerDocs(constitution);
  return {
    required,
    missing: required.filter((d) => !current.has(d.type)),
    unverified: required.filter((d) => current.has(d.type) && current.get(d.type)!.status !== "VERIFIED"),
  };
}

async function nextPartnerCode(tenantId: string, slug: string) {
  const prefix = `${slug.replace(/[^a-z0-9]/gi, "").slice(0, 4).toUpperCase()}-P`;
  let n = await db.user.count({ where: { tenantId, partnerCode: { not: null } } });
  for (;;) {
    n += 1;
    const code = `${prefix}${String(n).padStart(4, "0")}`;
    if (!(await db.user.findFirst({ where: { tenantId, partnerCode: code }, select: { id: true } }))) return code;
  }
}

function tempPassword() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
  return Array.from({ length: 10 }, () => alphabet[crypto.randomInt(alphabet.length)]).join("");
}

/**
 * Gives the partner a login: keeps their User ID (issuing one the first time) and sets a fresh temporary
 * password that must be changed at first sign-in. The plain password is returned once so it can be emailed.
 */
export async function issueCredentials(user: { id: string; tenantId: string; partnerCode: string | null }, slug: string) {
  const partnerCode = user.partnerCode ?? (await nextPartnerCode(user.tenantId, slug));
  const password = tempPassword();
  await db.user.update({
    where: { id: user.id },
    data: { partnerCode, passwordHash: await bcrypt.hash(password, 10), mustChangePassword: true, inviteToken: null },
  });
  return { partnerCode, password };
}
