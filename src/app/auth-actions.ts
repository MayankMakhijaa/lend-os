"use server";

import bcrypt from "bcryptjs";
import crypto from "node:crypto";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { endSession, startSession, getCurrentUser } from "@/lib/session";
import { q, str } from "@/lib/format";
import { audit } from "@/lib/audit";
import { ensureSchema } from "@/lib/schema-bootstrap";
import { adminIds, appUrl, notify, sendDirectEmail } from "@/lib/notify";
import { partnerFields, partnerFiles, savePartnerDocs, validatePartner } from "@/lib/partners";
import { requiredPartnerDocs } from "@/lib/constants";

function back(path: string, params: Record<string, string>): never {
  redirect(path + q(params));
}

export async function login(fd: FormData) {
  const ws = str(fd, "workspace").toLowerCase();
  // Partners may sign in with either their email or the User ID issued on approval.
  const loginId = str(fd, "email");
  const password = str(fd, "password");
  const tenant = await db.tenant.findUnique({ where: { slug: ws } });
  const user =
    tenant && tenant.active && loginId
      ? await db.user.findFirst({ where: { tenantId: tenant.id, OR: [{ email: loginId.toLowerCase() }, { partnerCode: loginId.toUpperCase() }] } })
      : null;
  if (!user || !user.passwordHash || !(await bcrypt.compare(password, user.passwordHash)))
    back("/login", { err: "Invalid workspace, email / User ID or password.", ws });
  if (user!.status === "PENDING") back("/login", { err: "Your account is awaiting approval.", ws });
  if (user!.status === "REJECTED") back("/login", { err: "Your application was not approved. Contact the admin.", ws });
  if (user!.status !== "ACTIVE") back("/login", { err: "Your account is disabled. Contact your admin.", ws });
  await db.user.update({ where: { id: user!.id }, data: { lastLoginAt: new Date() } });
  await startSession({ sub: user!.id, kind: "user", tid: user!.tenantId, role: user!.role });
  await audit(user!.tenantId, { id: user!.id, name: user!.name, role: user!.role }, "LOGIN");
  redirect(user!.mustChangePassword ? "/app/account?must=1" : "/app");
}

export async function logout() {
  await endSession();
  redirect("/login");
}

export async function requestOtp(fd: FormData) {
  const ws = str(fd, "workspace").toLowerCase();
  const email = str(fd, "email").toLowerCase();
  const tenant = await db.tenant.findUnique({ where: { slug: ws } });
  const user = tenant ? await db.user.findUnique({ where: { tenantId_email: { tenantId: tenant.id, email } } }) : null;
  if (user && user.status !== "DISABLED") {
    const otp = String(crypto.randomInt(100000, 1000000));
    await db.user.update({
      where: { id: user.id },
      data: { otpHash: await bcrypt.hash(otp, 10), otpExpires: new Date(Date.now() + 10 * 60 * 1000) },
    });
    await sendDirectEmail(user.email, "Your password reset code", `Your one-time code is ${otp}. It expires in 10 minutes.`);
  }
  // Same response whether or not the account exists.
  back("/reset", { ws, email, msg: "If the account exists, a 6-digit code has been sent to the email." });
}

export async function resetPassword(fd: FormData) {
  const ws = str(fd, "workspace").toLowerCase();
  const email = str(fd, "email").toLowerCase();
  const otp = str(fd, "otp");
  const password = str(fd, "password");
  if (password.length < 8) back("/reset", { ws, email, err: "Password must be at least 8 characters." });
  const tenant = await db.tenant.findUnique({ where: { slug: ws } });
  const user = tenant ? await db.user.findUnique({ where: { tenantId_email: { tenantId: tenant.id, email } } }) : null;
  const ok = user?.otpHash && user.otpExpires && user.otpExpires > new Date() && (await bcrypt.compare(otp, user.otpHash));
  if (!ok) back("/reset", { ws, email, err: "Invalid or expired code." });
  await db.user.update({
    where: { id: user!.id },
    data: { passwordHash: await bcrypt.hash(password, 10), otpHash: null, otpExpires: null, mustChangePassword: false },
  });
  await audit(user!.tenantId, { id: user!.id, name: user!.name, role: user!.role }, "PASSWORD_RESET", "via OTP");
  back("/login", { ws, msg: "Password updated. Please sign in." });
}

export async function acceptInvite(fd: FormData) {
  const token = str(fd, "token");
  const password = str(fd, "password");
  const user = await db.user.findUnique({ where: { inviteToken: token }, include: { tenant: true } });
  if (!user) redirect("/login?err=Invite+link+is+invalid+or+already+used.");
  if (password.length < 8) back(`/invite/${token}`, { err: "Password must be at least 8 characters." });
  await db.user.update({
    where: { id: user.id },
    data: { passwordHash: await bcrypt.hash(password, 10), inviteToken: null, mustChangePassword: false },
  });
  await audit(user.tenantId, { id: user.id, name: user.name, role: user.role }, "INVITE_ACCEPTED");
  back("/login", { ws: user.tenant.slug, msg: "Password set. Please sign in." });
}

/** Option 1: the partner registers, fills in their details and uploads their documents. Staff then approve or reject. */
export async function signupDsa(fd: FormData) {
  const slug = str(fd, "slug").toLowerCase();
  const tenant = await db.tenant.findUnique({ where: { slug } });
  if (!tenant || !tenant.active || !tenant.allowDsaSignup) redirect("/login?err=Sign-up+is+not+available+for+this+workspace.");
  const path = `/signup/${slug}`;
  const email = str(fd, "email").toLowerCase();
  const fields = partnerFields(fd);
  const problem = validatePartner(fields, email);
  if (problem) back(path, { err: problem });
  const { files, error } = partnerFiles(fd);
  if (error) back(path, { err: error });
  const missing = requiredPartnerDocs(fields.constitution).filter((d) => !files.some((f) => f.type === d.type));
  if (missing.length) back(path, { err: `Please upload: ${missing.map((d) => d.label).join(", ")}.` });

  // A rejected applicant may apply again with the same email; anything else with that email is a duplicate.
  const existing = await db.user.findUnique({ where: { tenantId_email: { tenantId: tenant.id, email } } });
  if (existing && !(existing.role === "DSA" && existing.status === "REJECTED"))
    back(path, { err: existing.status === "PENDING" ? "An application with this email is already under review." : "An account with this email already exists. Please sign in." });
  const data = { ...fields, status: "PENDING", onboardingSource: "SELF", reviewRemark: null, reviewedByName: null, reviewedAt: null };
  const u = existing
    ? await db.user.update({ where: { id: existing.id }, data })
    : await db.user.create({ data: { ...data, tenantId: tenant.id, role: "DSA", email } });
  await savePartnerDocs(tenant.id, u.id, files, { id: u.id, name: u.name });
  const firm = u.companyName ?? "no firm name";
  await audit(tenant.id, { id: u.id, name: u.name, role: "DSA" }, existing ? "PARTNER_REAPPLIED" : "PARTNER_REGISTERED", `${u.email} · ${firm} · ${files.length} documents`);
  const rms = await db.user.findMany({ where: { tenantId: tenant.id, role: "RM", status: "ACTIVE" }, select: { id: true } });
  await notify(
    tenant.id,
    [...(await adminIds(tenant.id)), ...rms.map((r) => r.id)],
    "New partner application awaiting approval",
    `${u.name} (${firm}, ${u.email}) registered as a DSA/Partner and uploaded ${files.length} documents. Review and approve or reject: ${appUrl(`/app/partners/${u.id}`)}`,
  );
  await sendDirectEmail(
    u.email,
    `${tenant.name}: application received`,
    `Hi ${u.name},\n\nThank you for registering as a partner with ${tenant.name}. We have received your details and documents and will review them shortly.\n\nOnce your application is approved you will receive your User ID and password on this email.`,
  );
  back("/login", { ws: slug, msg: "Application submitted. You'll receive your User ID and password by email once it is approved." });
}

export async function changePassword(fd: FormData) {
  const u = await getCurrentUser();
  if (!u) redirect("/login");
  const current = str(fd, "current");
  const next = str(fd, "password");
  if (!u.mustChangePassword && !(u.passwordHash && (await bcrypt.compare(current, u.passwordHash))))
    redirect("/app/account?err=Current+password+is+incorrect.");
  if (next.length < 8) redirect("/app/account?err=Password+must+be+at+least+8+characters.");
  await db.user.update({ where: { id: u.id }, data: { passwordHash: await bcrypt.hash(next, 10), mustChangePassword: false } });
  await audit(u.tenantId, { id: u.id, name: u.name, role: u.role }, "PASSWORD_CHANGED");
  redirect("/app/account?msg=Password+updated.");
}

export async function platformLogin(fd: FormData) {
  const email = str(fd, "email").toLowerCase();
  await ensureSchema();
  // First run on a fresh database (e.g. Hostinger without shell access): create the owner from env.
  const envEmail = process.env.PLATFORM_ADMIN_EMAIL?.toLowerCase();
  const envPw = process.env.PLATFORM_ADMIN_PASSWORD;
  if (envEmail && envPw && envPw.length >= 8 && (await db.platformAdmin.count()) === 0) {
    await db.platformAdmin.create({ data: { email: envEmail, name: "Platform Owner", passwordHash: await bcrypt.hash(envPw, 10) } });
  }
  const a = await db.platformAdmin.findUnique({ where: { email } });
  if (!a || !(await bcrypt.compare(str(fd, "password"), a.passwordHash))) redirect("/platform/login?err=Invalid+credentials.");
  await startSession({ sub: a.id, kind: "platform" });
  redirect("/platform");
}
