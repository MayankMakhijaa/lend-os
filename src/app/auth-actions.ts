"use server";

import bcrypt from "bcryptjs";
import crypto from "node:crypto";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { endSession, startSession, getCurrentUser } from "@/lib/session";
import { q, str } from "@/lib/format";
import { audit } from "@/lib/audit";
import { adminIds, appUrl, notify, sendDirectEmail } from "@/lib/notify";

function back(path: string, params: Record<string, string>): never {
  redirect(path + q(params));
}

export async function login(fd: FormData) {
  const ws = str(fd, "workspace").toLowerCase();
  const email = str(fd, "email").toLowerCase();
  const password = str(fd, "password");
  const tenant = await db.tenant.findUnique({ where: { slug: ws } });
  const user = tenant && tenant.active ? await db.user.findUnique({ where: { tenantId_email: { tenantId: tenant.id, email } } }) : null;
  if (!user || !user.passwordHash || !(await bcrypt.compare(password, user.passwordHash)))
    back("/login", { err: "Invalid workspace, email or password.", ws });
  if (user!.status === "PENDING") back("/login", { err: "Your account is awaiting approval by the admin.", ws });
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

export async function signupDsa(fd: FormData) {
  const slug = str(fd, "slug").toLowerCase();
  const tenant = await db.tenant.findUnique({ where: { slug } });
  if (!tenant || !tenant.active || !tenant.allowDsaSignup) redirect("/login?err=Sign-up+is+not+available+for+this+workspace.");
  const email = str(fd, "email").toLowerCase();
  const password = str(fd, "password");
  const name = str(fd, "name");
  if (!name || !email.includes("@")) back(`/signup/${slug}`, { err: "Name and a valid email are required." });
  if (password.length < 8) back(`/signup/${slug}`, { err: "Password must be at least 8 characters." });
  const exists = await db.user.findUnique({ where: { tenantId_email: { tenantId: tenant.id, email } } });
  if (exists) back(`/signup/${slug}`, { err: "An account with this email already exists." });
  const u = await db.user.create({
    data: {
      tenantId: tenant.id,
      role: "DSA",
      status: "PENDING",
      name,
      email,
      phone: str(fd, "phone") || null,
      companyName: str(fd, "companyName") || null,
      passwordHash: await bcrypt.hash(password, 10),
    },
  });
  await audit(tenant.id, { id: u.id, name: u.name, role: "DSA" }, "DSA_SIGNUP", `${u.companyName ?? ""} awaiting approval`);
  const rms = await db.user.findMany({ where: { tenantId: tenant.id, role: "RM", status: "ACTIVE" }, select: { id: true } });
  await notify(
    tenant.id,
    [...(await adminIds(tenant.id)), ...rms.map((r) => r.id)],
    "New DSA/Partner sign-up awaiting approval",
    `${u.name} (${u.companyName ?? "no firm name"}, ${u.email}) registered as a DSA/Partner. Approve them at ${appUrl("/app/users?status=PENDING")}.`,
  );
  back("/login", { ws: slug, msg: "Thanks for registering. You can sign in once an admin approves your account." });
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
  const a = await db.platformAdmin.findUnique({ where: { email } });
  if (!a || !(await bcrypt.compare(str(fd, "password"), a.passwordHash))) redirect("/platform/login?err=Invalid+credentials.");
  await startSession({ sub: a.id, kind: "platform" });
  redirect("/platform");
}
