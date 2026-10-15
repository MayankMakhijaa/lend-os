"use server";

import bcrypt from "bcryptjs";
import crypto from "node:crypto";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireUser, type CurrentUser } from "@/lib/session";
import { audit } from "@/lib/audit";
import { appUrl, notify, sendDirectEmail } from "@/lib/notify";
import { DEFAULT_CHECKLIST, ROLE_LABEL } from "@/lib/constants";
import { num, str } from "@/lib/format";

const actor = (u: CurrentUser) => ({ id: u.id, name: u.name, role: u.role });
function go(path: string, msg: string, key: "msg" | "err" = "msg"): never {
  revalidatePath(path);
  redirect(`${path}${path.includes("?") ? "&" : "?"}${key}=${encodeURIComponent(msg)}`);
}

// ---------- Users ----------

/** Admin creates any login; RMs can onboard DSA/Partners. Blank password → invite link. */
export async function createUser(fd: FormData) {
  const u = await requireUser(["ADMIN", "RM"]);
  const role = u.role === "RM" ? "DSA" : str(fd, "role");
  if (!["ADMIN", "RM", "DSA", "LENDER"].includes(role)) go("/app/users", "Choose a role.", "err");
  const email = str(fd, "email").toLowerCase();
  const name = str(fd, "name");
  if (!name || !email.includes("@")) go("/app/users", "Name and a valid email are required.", "err");
  if (await db.user.findUnique({ where: { tenantId_email: { tenantId: u.tenantId, email } } })) go("/app/users", "A user with this email already exists.", "err");
  let lenderId: string | null = null;
  if (role === "LENDER") {
    const l = await db.lender.findFirst({ where: { id: str(fd, "lenderId"), tenantId: u.tenantId } });
    if (!l) go("/app/users", "Pick the lender institution for this login.", "err");
    lenderId = l.id;
  }
  const password = str(fd, "password");
  if (password && password.length < 8) go("/app/users", "Password must be at least 8 characters.", "err");
  const inviteToken = password ? null : crypto.randomBytes(24).toString("hex");
  const created = await db.user.create({
    data: {
      tenantId: u.tenantId,
      role,
      name,
      email,
      phone: str(fd, "phone") || null,
      companyName: str(fd, "companyName") || null,
      lenderId,
      passwordHash: password ? await bcrypt.hash(password, 10) : null,
      mustChangePassword: !!password,
      inviteToken,
      createdById: u.id,
    },
  });
  await audit(u.tenantId, actor(u), "USER_CREATED", `${ROLE_LABEL[role]} ${email}`);
  const loginUrl = appUrl(`/login?ws=${u.tenant.slug}`);
  if (inviteToken) {
    const link = appUrl(`/invite/${inviteToken}`);
    await sendDirectEmail(email, `You're invited to ${u.tenant.name}`, `Hi ${name},\n\nYou've been given a ${ROLE_LABEL[role]} login. Set your password here:\n${link}\n\nWorkspace code: ${u.tenant.slug}`);
    go("/app/users", `Invite sent to ${email}. Link: ${link}`);
  }
  await sendDirectEmail(email, `Your ${u.tenant.name} login`, `Hi ${name},\n\nA ${ROLE_LABEL[role]} login was created for you.\nSign in: ${loginUrl}\nWorkspace code: ${u.tenant.slug}\nYou'll be asked to change the temporary password on first sign-in.`);
  go("/app/users", `${created.name} created. They'll be asked to change the password on first sign-in.`);
}

async function loadManagedUser(u: CurrentUser, id: string) {
  const target = await db.user.findFirst({ where: { id, tenantId: u.tenantId } });
  if (!target || (u.role === "RM" && target.role !== "DSA") || target.id === u.id) go("/app/users", "You can't manage that user.", "err");
  return target!;
}

export async function setUserStatus(fd: FormData) {
  const u = await requireUser(["ADMIN", "RM"]);
  const target = await loadManagedUser(u, str(fd, "userId"));
  const status = str(fd, "status");
  if (!["ACTIVE", "DISABLED"].includes(status)) go("/app/users", "Invalid status.", "err");
  await db.user.update({ where: { id: target.id }, data: { status } });
  const approved = target.status === "PENDING" && status === "ACTIVE";
  await audit(u.tenantId, actor(u), approved ? "DSA_APPROVED" : status === "ACTIVE" ? "USER_ENABLED" : target.status === "PENDING" ? "DSA_REJECTED" : "USER_DISABLED", target.email);
  if (approved) {
    await notify(u.tenantId, [target.id], "Your account is approved", `Your DSA/Partner account with ${u.tenant.name} is active. Sign in at ${appUrl(`/login?ws=${u.tenant.slug}`)}.`);
  }
  go("/app/users", approved ? `${target.name} approved.` : `${target.name} ${status === "ACTIVE" ? "enabled" : "disabled"}.`);
}

export async function resetUserPassword(fd: FormData) {
  const u = await requireUser(["ADMIN", "RM"]);
  const target = await loadManagedUser(u, str(fd, "userId"));
  const inviteToken = crypto.randomBytes(24).toString("hex");
  await db.user.update({ where: { id: target.id }, data: { inviteToken } });
  const link = appUrl(`/invite/${inviteToken}`);
  await sendDirectEmail(target.email, `Set your ${u.tenant.name} password`, `Hi ${target.name},\n\nUse this link to set a new password:\n${link}`);
  await audit(u.tenantId, actor(u), "PASSWORD_LINK_SENT", target.email);
  go("/app/users", `Password link sent to ${target.email}. Link: ${link}`);
}

export async function updateUser(fd: FormData) {
  const u = await requireUser(["ADMIN"]);
  const target = await loadManagedUser(u, str(fd, "userId"));
  await db.user.update({
    where: { id: target.id },
    data: { name: str(fd, "name") || target.name, phone: str(fd, "phone") || null, companyName: str(fd, "companyName") || null },
  });
  await audit(u.tenantId, actor(u), "USER_UPDATED", target.email);
  go("/app/users", "User updated.");
}

export async function updateProfile(fd: FormData) {
  const u = await requireUser();
  await db.user.update({ where: { id: u.id }, data: { name: str(fd, "name") || u.name, phone: str(fd, "phone") || null, companyName: u.role === "DSA" ? str(fd, "companyName") || null : u.companyName } });
  go("/app/account", "Profile updated.");
}

// ---------- Lenders ----------

export async function saveLender(fd: FormData) {
  const u = await requireUser(["ADMIN"]);
  const id = str(fd, "id");
  const data = { name: str(fd, "name"), type: str(fd, "type") || "Bank", contactEmail: str(fd, "contactEmail") || null, active: str(fd, "active") !== "off" };
  if (!data.name) go("/app/lenders", "Lender name is required.", "err");
  const dup = await db.lender.findFirst({ where: { tenantId: u.tenantId, name: data.name, NOT: id ? { id } : undefined } });
  if (dup) go("/app/lenders", "A lender with that name already exists.", "err");
  const productIds = fd.getAll("productId").map(String);
  const valid = await db.product.findMany({ where: { tenantId: u.tenantId, id: { in: productIds } }, select: { id: true } });
  let lenderId = id;
  if (id) {
    const l = await db.lender.findFirst({ where: { id, tenantId: u.tenantId } });
    if (!l) go("/app/lenders", "Lender not found.", "err");
    await db.lender.update({ where: { id }, data });
    await db.lenderProduct.deleteMany({ where: { lenderId: id } });
  } else {
    lenderId = (await db.lender.create({ data: { ...data, tenantId: u.tenantId } })).id;
  }
  if (valid.length) await db.lenderProduct.createMany({ data: valid.map((p) => ({ lenderId, productId: p.id })) });
  await audit(u.tenantId, actor(u), id ? "LENDER_UPDATED" : "LENDER_CREATED", `${data.name} · ${valid.length} products`);
  go("/app/lenders", `${data.name} saved.`);
}

// ---------- Products & checklists ----------

export async function createProduct(fd: FormData) {
  const u = await requireUser(["ADMIN"]);
  const code = str(fd, "code").toUpperCase();
  const name = str(fd, "name");
  if (!code || !name) go("/app/products", "Code and name are required.", "err");
  if (await db.product.findUnique({ where: { tenantId_code: { tenantId: u.tenantId, code } } })) go("/app/products", "That product code exists.", "err");
  const p = await db.product.create({ data: { tenantId: u.tenantId, code, name } });
  const copyFrom = str(fd, "copyFrom");
  if (copyFrom === "__default") {
    await db.checklistItem.createMany({ data: DEFAULT_CHECKLIST.map((c, i) => ({ ...c, tenantId: u.tenantId, productId: p.id, sortOrder: i })) });
  } else if (copyFrom) {
    const src = await db.checklistItem.findMany({ where: { tenantId: u.tenantId, productId: copyFrom, lenderId: null } });
    await db.checklistItem.createMany({
      data: src.map((c) => ({ tenantId: u.tenantId, productId: p.id, category: c.category, title: c.title, description: c.description, mandatory: c.mandatory, sortOrder: c.sortOrder, active: c.active })),
    });
  }
  await audit(u.tenantId, actor(u), "PRODUCT_CREATED", `${code} ${name}`);
  go(`/app/products/${p.id}`, "Product created.");
}

export async function toggleProduct(fd: FormData) {
  const u = await requireUser(["ADMIN"]);
  const p = await db.product.findFirst({ where: { id: str(fd, "id"), tenantId: u.tenantId } });
  if (!p) go("/app/products", "Not found.", "err");
  await db.product.update({ where: { id: p.id }, data: { active: !p.active } });
  await audit(u.tenantId, actor(u), "PRODUCT_UPDATED", `${p.code} ${p.active ? "deactivated" : "activated"}`);
  go("/app/products", `${p.name} ${p.active ? "deactivated" : "activated"}.`);
}

export async function saveChecklistItem(fd: FormData) {
  const u = await requireUser(["ADMIN"]);
  const product = await db.product.findFirst({ where: { id: str(fd, "productId"), tenantId: u.tenantId } });
  if (!product) go("/app/products", "Product not found.", "err");
  const path = `/app/products/${product.id}`;
  const lenderId = str(fd, "lenderId") || null;
  if (lenderId && !(await db.lender.findFirst({ where: { id: lenderId, tenantId: u.tenantId } }))) go(path, "Lender not found.", "err");
  const data = {
    category: str(fd, "category"),
    title: str(fd, "title"),
    description: str(fd, "description") || null,
    mandatory: fd.get("mandatory") === "on",
    sortOrder: num(fd, "sortOrder") ?? 0,
    active: str(fd, "active") !== "off",
    lenderId,
  };
  if (!data.category || !data.title) go(path, "Category and document name are required.", "err");
  const id = str(fd, "id");
  if (id) {
    const it = await db.checklistItem.findFirst({ where: { id, tenantId: u.tenantId, productId: product.id } });
    if (!it) go(path, "Item not found.", "err");
    await db.checklistItem.update({ where: { id }, data });
  } else {
    await db.checklistItem.create({ data: { ...data, tenantId: u.tenantId, productId: product.id } });
  }
  await audit(u.tenantId, actor(u), "CHECKLIST_UPDATED", `${product.code}: ${data.title}`);
  go(path, "Checklist saved. Applies to new cases from now on.");
}

export async function deleteChecklistItem(fd: FormData) {
  const u = await requireUser(["ADMIN"]);
  const it = await db.checklistItem.findFirst({ where: { id: str(fd, "id"), tenantId: u.tenantId }, include: { product: true } });
  if (!it) go("/app/products", "Not found.", "err");
  await db.checklistItem.delete({ where: { id: it.id } });
  await audit(u.tenantId, actor(u), "CHECKLIST_UPDATED", `${it.product.code}: removed ${it.title}`);
  go(`/app/products/${it.productId}`, "Item removed.");
}

// ---------- Settings ----------

export async function saveTats(fd: FormData) {
  const u = await requireUser(["ADMIN"]);
  const tats = await db.tatSetting.findMany({ where: { tenantId: u.tenantId } });
  for (const t of tats) {
    const d = num(fd, `tat_${t.key}`);
    if (d != null && d >= 0 && d !== t.days) await db.tatSetting.update({ where: { id: t.id }, data: { days: Math.round(d) } });
  }
  await audit(u.tenantId, actor(u), "TAT_UPDATED");
  go("/app/settings", "TAT targets saved.");
}

export async function saveWorkspace(fd: FormData) {
  const u = await requireUser(["ADMIN"]);
  await db.tenant.update({
    where: { id: u.tenantId },
    data: {
      name: str(fd, "name") || u.tenant.name,
      brandColor: str(fd, "brandColor") || u.tenant.brandColor,
      supportEmail: str(fd, "supportEmail") || null,
      allowDsaSignup: fd.get("allowDsaSignup") === "on",
    },
  });
  await audit(u.tenantId, actor(u), "SETTINGS_UPDATED", "workspace");
  go("/app/settings", "Workspace settings saved.");
}

// ---------- Notifications ----------

export async function markAllRead() {
  const u = await requireUser();
  await db.notification.updateMany({ where: { userId: u.id, readAt: null }, data: { readAt: new Date() } });
  revalidatePath("/app", "layout");
  redirect("/app/notifications");
}
