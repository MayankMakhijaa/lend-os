import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { redirect, notFound } from "next/navigation";
import { db } from "./db";
import { SESSION_COOKIE, signSession, verifySession, timeoutMinutes, type SessionPayload } from "./jwt";

export async function startSession(p: SessionPayload) {
  const token = await signSession(p);
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: timeoutMinutes() * 60,
  });
}

export async function endSession() {
  (await cookies()).delete(SESSION_COOKIE);
}

export const getSession = cache(async () => {
  return verifySession((await cookies()).get(SESSION_COOKIE)?.value);
});

export const getCurrentUser = cache(async () => {
  const s = await getSession();
  if (!s || s.kind !== "user") return null;
  const user = await db.user.findUnique({ where: { id: s.sub }, include: { tenant: true, lender: true } });
  if (!user || user.tenantId !== s.tid || user.status !== "ACTIVE" || !user.tenant.active) return null;
  return user;
});

export type CurrentUser = NonNullable<Awaited<ReturnType<typeof getCurrentUser>>>;

/** Require a signed-in tenant user, optionally restricted to roles. Enforced on every server page/action. */
export async function requireUser(roles?: string[]): Promise<CurrentUser> {
  const u = await getCurrentUser();
  if (!u) redirect("/login");
  if (roles && !roles.includes(u.role)) notFound();
  return u;
}

export async function requirePlatformAdmin() {
  const s = await getSession();
  if (!s || s.kind !== "platform") redirect("/platform/login");
  const a = await db.platformAdmin.findUnique({ where: { id: s.sub } });
  if (!a) redirect("/platform/login");
  return a;
}
